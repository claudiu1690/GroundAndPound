/**
 * Read-only retention cohort report.
 *
 * Usage:
 *   node scripts/retention.js              # targets whatever .env points at (prod Atlas by default)
 *   LOCAL_MODE=true node scripts/retention.js   # local DB
 *
 * Connects via ../config, so it honours the same LOCAL_MODE / USE_ATLAS switch
 * as the app and stats.js. NEVER writes — pure aggregation, safe on production.
 *
 * Method:
 *   - Cohort = accounts grouped by their CREATION day (from the _id ObjectId
 *     timestamp), so every account is counted (not just ones with a signup event).
 *   - "Active on day D" = the user has ANY analytics event bucketed to day D.
 *   - Retention DN = of a cohort, the share still active N days after signup.
 *     Only shown for windows that have actually elapsed.
 *
 * Caveat: event `day` buckets and ObjectId timestamps are both ~UTC; a player
 * active near midnight UTC can land one bucket off. Fine at this scale as a trend.
 */
const mongoose = require("mongoose");
const config = require("../config");

const dayOf = (d) => new Date(d).toISOString().slice(0, 10);
function addDays(dayStr, n) {
  const d = new Date(dayStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);

async function main() {
  await mongoose.connect(config.database.url, config.database.options);
  const db = mongoose.connection;
  const users = db.collection("users");
  const ev = db.collection("analyticsevents");

  // 1. Every non-deleted account → creation day + guest flag.
  const allUsers = await users.find({ deleted: { $ne: true } }, { projection: { _id: 1, isGuest: 1 } }).toArray();
  const createdDay = {};
  const isGuest = {};
  for (const u of allUsers) {
    const id = String(u._id);
    createdDay[id] = dayOf(u._id.getTimestamp());
    isGuest[id] = !!u.isGuest;
  }

  // 2. Distinct active days per user (any event).
  const rows = await ev.aggregate([
    { $match: { day: { $ne: null } } },
    { $group: { _id: { u: "$userId", d: "$day" } } },
    { $group: { _id: "$_id.u", days: { $addToSet: "$_id.d" } } },
  ]).toArray();
  const activeDays = {};
  for (const r of rows) activeDays[String(r._id)] = new Set(r.days);

  const today = dayOf(new Date());

  // 3. Cohorts by creation day.
  const cohorts = {};
  for (const [id, day] of Object.entries(createdDay)) (cohorts[day] = cohorts[day] || []).push(id);
  const cohortDays = Object.keys(cohorts).sort();

  // Max N we could ever show = span from earliest cohort to today.
  const maxN = cohortDays.length ? Math.min(7, Math.round((new Date(today) - new Date(cohortDays[0])) / 86400000)) : 0;
  const Ns = [];
  for (let n = 1; n <= maxN; n++) Ns.push(n);

  const active = (id, day) => activeDays[id] && activeDays[id].has(day);

  console.log("");
  console.log(`  GROUND & POUND — retention @ ${new Date().toISOString()}  [${config.database.url.startsWith("mongodb+srv://") ? "PROD/Atlas" : "LOCAL"}]`);
  console.log("  " + "=".repeat(64));
  console.log("  COHORT RETENTION (by signup day)");
  console.log("    " + "day".padEnd(12) + "size".padEnd(6) + Ns.map((n) => ("D" + n).padEnd(9)).join(""));
  for (const day of cohortDays) {
    const ids = cohorts[day];
    const cells = Ns.map((n) => {
      const target = addDays(day, n);
      if (target > today) return "—".padEnd(9);
      const ret = ids.filter((id) => active(id, target)).length;
      return `${pct(ret, ids.length)}% (${ret})`.padEnd(9);
    });
    console.log("    " + day.padEnd(12) + String(ids.length).padEnd(6) + cells.join(""));
  }

  // 4. Blended D1 (across cohorts old enough to have a D1).
  let d1r = 0, d1e = 0;
  for (const day of cohortDays) {
    if (addDays(day, 1) > today) continue;
    for (const id of cohorts[day]) { d1e++; if (active(id, addDays(day, 1))) d1r++; }
  }

  // 5. One-and-done + active-days distribution.
  let oneAndDone = 0, returned = 0;
  const dist = {};
  for (const [id, signup] of Object.entries(createdDay)) {
    const days = activeDays[id] || new Set();
    const cameBack = [...days].some((d) => d > signup);
    if (cameBack) returned++; else oneAndDone++;
    const n = days.size;
    const bucket = n >= 3 ? "3+" : String(n);
    dist[bucket] = (dist[bucket] || 0) + 1;
  }

  // 6. Guest vs email D1.
  function d1For(filter) {
    let r = 0, e = 0;
    for (const day of cohortDays) {
      if (addDays(day, 1) > today) continue;
      for (const id of cohorts[day]) { if (!filter(id)) continue; e++; if (active(id, addDays(day, 1))) r++; }
    }
    return { r, e };
  }
  const g = d1For((id) => isGuest[id]);
  const em = d1For((id) => !isGuest[id]);

  console.log("");
  console.log("  HEADLINE");
  console.log("    blended D1 return .... " + pct(d1r, d1e) + "%  (" + d1r + " of " + d1e + " eligible)");
  console.log("    one-and-done ......... " + pct(oneAndDone, allUsers.length) + "%  (" + oneAndDone + " of " + allUsers.length + " never returned after signup day)");
  console.log("    ever returned ........ " + pct(returned, allUsers.length) + "%  (" + returned + ")");
  console.log("");
  console.log("  D1 BY ACCOUNT TYPE");
  console.log("    guests ............... " + pct(g.r, g.e) + "%  (" + g.r + " of " + g.e + ")");
  console.log("    email ................ " + pct(em.r, em.e) + "%  (" + em.r + " of " + em.e + ")");
  console.log("");
  console.log("  DAYS PLAYED (distinct active days per account)");
  ["0", "1", "2", "3+"].forEach((k) => { if (dist[k]) console.log("    " + (k === "0" ? "0 (signed up, no activity)" : k + " day" + (k === "1" ? "" : "s")).padEnd(30) + dist[k]); });
  console.log("");
  console.log("  Note: read-only. 'Active' = any analytics event that day. Windows that");
  console.log("  haven't elapsed yet show as '—'. Tiny sample — read as a trend, not gospel.");
  console.log("");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("retention.js failed:", err.message);
  process.exit(1);
});
