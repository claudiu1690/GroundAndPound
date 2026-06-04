# Ground & Pound — PvP System Spec
## v1 (Beta) — Revised for Implementation

**Status:** Approved for build. Supersedes PvP System Spec v1.0 (draft).
**Scope:** v2 of the game (post-MVP / post-soft-launch), parallel to the PvE career.
**Author note:** This revision bakes in nine approved design decisions. Items deferred to a later update are tagged **[v1.1 — deferred]** throughout. Concrete starting numbers are given everywhere and mapped to code constants for the architect.

---

## 0. Changes from v1.0 draft

| # | Change | Why |
|---|--------|-----|
| 1 | **Defensive camp removed from v1.** A defender is their stats/OVR/health only, vs the attacker's offensive camp. | The v1.0 "auto-firing defensive camp" does not exist in code. `services/campService.js` `getMatchStatus` evaluates a camp against the *opponent's style*, and `resolveFight(player, opponent)` (`utils/fightResolution.js`) is single-sided — it consumes only the player's `sessionBonuses`/`wildcard` and returns only `playerHealthAfter`. Shipping the defensive camp would require a net-new two-sided engine rebuild. Deferred to **[v1.1]** with a defined upgrade path (§14). |
| 2 | **Energy re-priced + daily attack cap.** Attack now costs a real fight's energy (`PROMOTION_TIERS[tier].fightEnergyCost`, 10–20), not a training session (4–8). Added a daily PvP attack cap (5/day base, 7 Premium). | At 4–8E against a 100 cap and a 25-session training batch (`trainingService.MAX_BATCH = 25`), attacking was nearly free and uncapped — it cannibalized nothing and farmed rewards faster than PvE's daily-capped economy allows. |
| 3 | **New loss-cooldown gate replaces the KO/injury gate.** `pvp.attackableAfter: Date` set on *every* loss (KO 12h / Sub 6h / Dec 3h). | The v1.0 "untouchable until injuries cleared at hospital" gate is defeated by auto-heal: `injuryHealService` + `injuryUtils.tickRecoveryForFighter` decrement injuries on a wall-clock timer regardless of login, and the separate `is_untouchable` boolean would either lift silently or stick forever (permanent-invuln bug). The new gate is offline-safe and closes the decision/sub farming hole. |
| 4 | **OVR bracketing (±8) + reward gap-scaling.** | v1.0 let an OVR-90 GCS fighter farm OVR-20 amateurs. PvE offers already bracket to ±5 (`fightService.generateOffers`); PvP now mirrors that discipline. |
| 5 | **Onboarding shield.** Unranked players (0–2 PvP fights) are attack-only — cannot be attacked. | v1.0 let anyone KO a brand-new OVR-14 fighter with an empty camp — a retention killer. |
| 6 | **Belt decay/interim.** Champion inactivity widens the gate (14d) then books an interim (21d). | v1.0 §8.4 endorsed an absentee champion holding the belt forever behind a top-10 gate → ladder stagnation. Reuses the PvE v1.1 stripped-champion pattern. |
| 7 | **Tiebreak = win% then recency**, not total fights. | v1.0's total-fights tiebreak rewarded the exact farming it claimed to prevent. |
| 8 | **Economy down-weighting.** PvP iron 40–50% of PvE purse (was 75%), capped per day; PvP fame contributes a reduced fraction to shared `notoriety.score`. | Shared pools (`fighter.iron`, `fighter.notoriety.score`) feed PvE signing fees (`PROMOTION_TIERS.signingFee`) and sponsor/callout gates (`notorietyConfig`). Uncapped 75% let players buy PvE progression with PvP grind. |
| 9 | **Lazy rank update.** Two-player reposition per fight + nightly full recalc BullMQ job. | v1.0 `recalculateLadderRanks()` re-saved *every* ranked fighter per fight — an O(N) write storm that fights Mongo optimistic concurrency (the codebase already needs `saveWithVersionRetry`). |

---

## 1. Overview

PvP is a fully parallel competitive system running alongside the PvE career. It has its own ladder, record, belt, and (down-weighted) reward flow. PvE and PvP never alter each other's records — a player can ignore PvP entirely and have a complete career.

PvP is **asynchronous and click-resolved**, consistent with the rest of the game. Fights resolve instantly when the attacker presses Fight. The defender need not be online: **in v1, the defender is simulated from their persisted stats, OVR, and current health.** Real HP damage, injuries, and a post-loss attack cooldown create natural anti-farming limits.

The PvP belt is live at all times and held by the **#1 ranked player**. There is no silent vacancy — the belt only changes hands through a fight — but champion inactivity progressively opens the belt to challengers (§8).

---

## 2. Core Design Principles

1. **Fully asynchronous, click-resolved.** No scheduling, no waiting on opponents. Defender resolves from persisted state.
2. **Parallel to PvE.** Separate record, ladder, belt. PvE career W-L-D is never touched by PvP.
3. **Real consequences as limiters, not artificial daily-reset-only caps.** HP, injuries, and a post-loss cooldown gate farming. A soft daily attack cap throttles velocity in the spirit of the PvE daily fight cap.
4. **Energy as the primary attack limiter, priced like a real fight.** Attacking draws from the same energy pool as training/fighting (`ENERGY`, `energyService`). One attack costs one tier-fight's energy.
5. **Fair matchmaking.** Attacks are bracketed by OVR (±8). Punching far down pays ~nothing.
6. **Onboarding-safe.** New players opt into being attackable by completing 3 PvP fights.
7. **Belt always contested, never absentee-locked.** Top-10 challenge gate, but champion inactivity widens it.
8. **Shared economy, down-weighted.** PvP feeds the same iron/fame pools at a reduced rate so it can't shortcut PvE pacing.
9. **No auto-firing defensive camp in v1.** Defender = stats only. Defensive camp is **[v1.1 — deferred]**.

---

## 3. PvP Ladder

### 3.1 Structure
A global leaderboard of all players who have completed **3 or more PvP fights**. No size cap.

| State | PvP Fights | Ladder | Attack? | Be Attacked? |
|---|---|---|---|---|
| **Unranked (new)** | 0 | No | Yes | **No (onboarding shield — §5)** |
| **Unranked** | 1–2 | No | Yes | **No** |
| **Ranked** | 3+ | Yes — sorted by rank points | Yes | Yes |

The onboarding shield (§5) means a player only becomes a *target* once they enter the ladder. Until then they may attack ranked players (only ranked players are attackable; see §5.2 for the edge resolution).

### 3.2 Ladder Sorting — Hybrid Rank Points
Sorted by **rank points** (descending). The point math is identical to the shipped PvE `rankingService.calcDelta` (`services/rankingService.js`), so it reuses verified logic. `opponentRank` is the defender's ladder rank (null if defender is unranked → no upset bonus/penalty, matching the existing PvP null-guard).

| Event | Points | Notes |
|---|---|---|
| Win (any method) | +1 | Base |
| Win by KO or Submission | +2 | Replaces base (finish) |
| Win vs higher-ranked opponent | +2 | Stacks with finish — **max +4** |
| Loss (any method) | −1 | Base |
| Loss vs lower-ranked opponent | −2 | Replaces base (upset loss) |
| Draw | 0 | — |

Entry points on 3rd fight: **0**. Floor: rank points cannot drop below 0 (no negative ladder score).

### 3.3 Tiebreak — REVISED
Equal rank points are broken by, in order:
1. **Win percentage** = `pvp.wins / max(1, pvp.total_fights)` (descending).
2. **Most recent PvP fight** (`pvp.last_pvp_fight_at`, descending) — rewards active, quality play.

> Rationale: the v1.0 "total fights descending" tiebreak rewarded raw volume — the exact farming behavior the economy fixes are meant to suppress.

---

## 4. Attacking — Offensive Flow

### 4.1 Finding Opponents
The PvP tab shows a searchable/browsable ladder. Visible per row: rank, name, PvP record (W-L-D), rank points, OVR, fighter style, belt marker.

**Hidden before attacking:** current HP, injury status. (No defensive camp exists in v1, so nothing to hide there.)

**Attackability filtering on the ladder:**
- Rows outside the attacker's **±8 OVR band** show a disabled Challenge button: *"Outside your matchmaking range (±8 OVR)."*
- Rows in a post-loss cooldown (`attackableAfter > now`) show disabled with: *"This fighter is recovering."*
- Unranked players are not on the ladder and cannot be attacked (§5).
- The champion shows the belt-challenge state (§8).

### 4.2 Initiating an Attack
1. Attacker taps **Challenge** on an eligible ladder row.
2. Attacker is taken to the **offensive camp screen** — the existing PvE fight-camp UI and engine, with slot count by the **attacker's** promotion tier (`CAMP_SLOT_CONFIG`).
3. Attacker reviews the defender's profile (OVR, style, PvP record). A **Fighter Report** is generated from the defender exactly as PvE does (`campService.getFighterReport`), driven by the defender's stats and PvP fight history.
4. Attacker sets the camp, finalises, taps **Fight**.
5. Simulation runs instantly: attacker's offensive camp + stats vs defender's stats/OVR/health. Uses the existing `resolveFight(attacker, defender, options)` with the attacker as `player`.
6. Result shown immediately to the attacker, including rank-point delta and any belt change.
7. Defender sees the result on next login via the Octagon Gazette (§9).

### 4.3 Energy Cost + Daily Attack Cap — REVISED

**Energy cost per attack = `PROMOTION_TIERS[attacker.promotionTier].fightEnergyCost`:**

| Attacker tier | Energy/attack | Constant |
|---|---|---|
| Amateur | 10 | `PROMOTION_TIERS.Amateur.fightEnergyCost` |
| Regional Pro | 15 | `PROMOTION_TIERS["Regional Pro"].fightEnergyCost` |
| National | 18 | `PROMOTION_TIERS.National.fightEnergyCost` |
| GCS Contender | 20 | `PROMOTION_TIERS["GCS Contender"].fightEnergyCost` |
| GCS | 20 | `PROMOTION_TIERS.GCS.fightEnergyCost` |

Energy is deducted via `energyService.deductEnergy(attackerId, cost)` (Redis-atomic). If `current < cost` → `insufficient_energy`.

**Daily PvP attack cap:**
- **Free: 5 attacks / calendar day.**
- **Premium: 7 attacks / calendar day.**
- Reset uses the same calendar-day idiom as `fightService.ensureDailyFightTierState` (`toDateString()`, server local). Tracked in `pvp.attacksToday` + `pvp.attackDayKey`.

> Rationale: At 10–20E an attack is a real opportunity cost vs training (1/min regen, max 100 — `ENERGY`). The daily cap throttles reward velocity to match the PvE philosophy ("daily cap beats cooldown," GDD §6.3) without a real-time timer, and keeps Energy Packs useful for camps/training (Rule 1 preserved — packs never hit a wall).

### 4.4 OVR Bracketing — NEW
- Attacker may only challenge defenders within **|attackerOVR − defenderOVR| ≤ 8**.
- Outside the band: Challenge disabled (validation `out_of_bracket`).
- Band chosen slightly wider than PvE's ±5 offer band (`fightService.generateOffers`) to keep a populated ladder liquid while still blocking gross mismatches.

### 4.5 Attack Restrictions (full table)

| Restriction | Rule | Error code |
|---|---|---|
| Insufficient energy | `current < fightEnergyCost` | `insufficient_energy` |
| Daily cap reached | `attacksToday >= cap` | `daily_pvp_cap_reached` |
| Target in cooldown | `defender.pvp.attackableAfter > now` | `target_recovering` |
| Target unranked | defender has < 3 PvP fights (onboarding shield) | `target_not_attackable` |
| Out of OVR band | `|ovrDiff| > 8` | `out_of_bracket` |
| Self-attack | `attackerId === defenderId` | `cannot_attack_self` |
| Attacker fight-blocked | attacker has a `cannotFight` injury unresolved (`isFightBlocked`) | `attacker_injured` |
| Belt challenge | challenging the champion for the belt requires top-10 (or the widened gate, §8) | belt simply doesn't transfer; fight still allowed |

---

## 5. Onboarding Shield — NEW

### 5.1 Rule
A player with **fewer than 3 completed PvP fights is attack-only**: they may initiate attacks but **cannot be targeted**. They become attackable the moment they complete their 3rd PvP fight (the same threshold that puts them on the ladder).

### 5.2 Edge: who can a new player attack?
Only **ranked, in-bracket, non-cooldown** players are valid targets. A new player therefore attacks established ladder members (subject to ±8 OVR), opting themselves into the ecosystem by throwing the first punch. They take normal consequences (HP, injuries, cooldown) from those fights.

### 5.3 Pairing with beta cohort
The beta cohort (§15) seeds a populated, ranked ladder before public launch so new players always have legal in-bracket targets and are never forced to attack wildly out-of-band opponents.

> Note: Because there is no defensive camp in v1, there is no "empty camp = free KO" problem. The shield exists purely so a returning new player never logs in to a surprise KO + fame loss they couldn't prevent.

---

## 6. Fight Consequences

### 6.1 HP Damage
Both fighters take HP damage, derived from the existing engine. The attacker's post-fight health comes from `result.playerHealthAfter` (already returned). For the defender, v1 applies a **method-based HP loss** to the persisted defender document (the engine does not currently return `opponentHealthAfter`, so we apply a deterministic table rather than rebuilding the engine):

| Result (from winner's perspective) | Winner HP loss | Loser HP loss |
|---|---|---|
| Decision | 5–10% | 15–25% |
| Submission | 5–10% | 20–30% |
| KO/TKO | 0–5% | 30–50% |

Exact rolls within each band are tuned in beta. Health regenerates over time exactly as PvE (`fighter.health`, `healthLastRegenAt`).

> Architect note: applying real damage to the *defender* document is the one consequence that touches a second persisted fighter. This is in-scope for v1 (a simple field write + injury roll), and is far smaller than the two-sided `resolveFight` rebuild that the defensive camp would require.

### 6.2 Injuries
Both fighters roll for injuries using the existing `rollForFightInjury` (`utils/injuryUtils.js`), with the tier injury-risk multiplier (`PROMOTION_TIERS[tier].injuryRiskMult`). Injuries apply real HP/stat penalties and auto-heal on the existing timer (`injuryHealService`). **Injuries are a consequence, not the protection gate** (see 6.3). New-fighter injury grace (`INJURY_GRACE_FIGHTS = 3`) applies to the fighter's own first fights as in PvE.

### 6.3 Post-Loss Attack Cooldown — REPLACES the KO/injury gate
On **every PvP loss**, set `pvp.attackableAfter = now + cooldown` on the **loser**:

| Loss method | Cooldown | Notes |
|---|---|---|
| KO/TKO | 12h | matches concussion `recoveryHoursNeeded: 12` for thematic consistency |
| Submission | 6h | — |
| Decision | 3h | — |

While `attackableAfter > now`, the player **cannot be attacked** (Challenge greyed: *"This fighter is recovering."*). The cooldown is **independent of injuries and login state** — it self-clears on the wall clock and can never stick forever.

A win does **not** set a cooldown on the winner (the winner is free to keep playing, subject to the daily cap).

> Rationale: this is offline-safe, exploit-proof, and — by applying to decision and submission losses too — closes the v1.0 hole where a strong player could repeatedly decision-farm a weaker one (only KO was protected in v1.0).

---

## 7. Rewards — DOWN-WEIGHTED

All rewards flow into the **shared** pools (`fighter.iron`, `fighter.notoriety.score`) — no parallel economy — but at reduced rates so PvP can't shortcut PvE gates.

### 7.1 Iron
PvP purse base = the equivalent PvE purse for the attacker's tier (`PROMOTION_TIERS[tier].signingFee` is the tier base purse, per the existing comment in `gameConstants.js`).

| Outcome | Iron | % of PvE base |
|---|---|---|
| Win | **45%** of PvE base purse | down from 75% |
| Draw | 25% (both fighters) | — |
| Loss | 15% (participation) | — |

**Gap-scaling multiplier** (applies to the iron AND the fame rewards) — punching down pays ~nothing:

```
gapFactor = clamp01( 1 − max(0, attackerOVR − defenderOVR) / 15 )
```

- Beating an equal-or-higher opponent: `gapFactor = 1.0` (full reward).
- Beating someone 8 OVR below (the bracket edge): `gapFactor ≈ 0.47`.
- Beating someone 15+ below: `gapFactor = 0` — but ±8 bracketing already caps the real gap at 8, so within-bracket the floor is ~0.47. The formula is kept general so the bracket can be widened later without re-deriving rewards.

**Daily iron is implicitly capped** by the 5–7 attack/day cap — no separate iron cap needed.

### 7.2 Notoriety (Fame)
- PvP **wins** earn **40%** of the equivalent PvE fight notoriety (down from 75%), then × `gapFactor`. Maps to `BASE_FIGHT_NOTORIETY` × 0.40 × gapFactor (`notorietyConfig`).
- PvP **losses are fame-neutral** (no gain, no loss).
- This reduced fraction is what feeds the shared `notoriety.score` (and therefore PvE sponsor/callout gates), so a PvP grind contributes only weakly to PvE fame progression.

### 7.3 Rank Points
Applied immediately per §3.2. Rank points use the *rank* differential (§3.2), independent of OVR — gap-scaling governs iron/fame only. This keeps the ladder about competition, not OVR farming.

### 7.4 Belt Defense Reward
When the champion is challenged and **wins** (defends), they receive, on next login:
- **Iron:** 50% of a standard PvP win purse at champion's tier (i.e. 50% × 45% of PvE base).
- **Notoriety:** 50% of a standard PvP win notoriety (50% × 40% of PvE notoriety).

Fires automatically in `processPvpResult`; champion need not be online.

---

## 8. The PvP Belt

### 8.1 Holder
The belt is held by the **#1 ranked player** (`pvp.is_champion = true`). Live title — can change while the champion is offline.

### 8.2 Challenging for the Belt — top-10 gate (with decay widening)
| Challenger rank | Can target champion | Belt transfers on win |
|---|---|---|
| Top 10 (1–10) | Yes | **Yes** |
| Outside top 10 | Yes (regular PvP fight) | No |

The champion is also subject to ±8 OVR bracketing like everyone else — a top-10 challenger outside ±8 OVR cannot attack (rare, since the top of the ladder clusters in OVR).

### 8.3 Belt Transfer
A qualifying top-10 challenger who beats the champion **becomes champion instantly** on resolution. The previous champion drops to **rank #2** (keeps rank points, loses the belt). `belt_won_at` / `belt_lost_at` timestamps set.

### 8.4 Belt Anti-Stagnation (Decay/Interim) — NEW
"Inactive" = no PvP fight as attacker or defender (`last_pvp_fight_at`) and no login.

| Champion inactivity | Effect |
|---|---|
| **0–13 days** | Normal — top-10 gate only. |
| **14 days** | **Gate widens to top-20.** Any top-20 player may now challenge for the belt and win it. Gazette notes the champion is "under pressure." |
| **21 days** | **Interim title fight booked:** the system flags an interim challenge between the current **#1 (champion)** and **#2**. The first time #2 (or, if widened, any eligible challenger) beats the champion, the belt transfers as normal. The belt is **never silently vacated** — it always moves via a fight. |

If the champion logs in / fights again, the inactivity clock resets and the gate returns to top-10.

> Implemented as a nightly BullMQ job (`pvp:beltDecay`) that reads `last_pvp_fight_at` + last-login and sets a `pvp.beltChallengeFloor` field (10 → 20) and a `pvp.interimBooked` flag. No real-time enforcement needed.

### 8.5 Visibility
Belt icon at ladder #1, belt badge on profile, and Gazette lead stories on belt change (§9).

---

## 9. Octagon Gazette — PvP Stories

Two new story builders added to `gazetteService.js` + templates in `consts/gazetteTemplates.js`. All other PvP outcomes are not reported in v1.

### 9.1 Belt Won (new champion logs in)
- "YOU'RE THE CHAMPION. You beat {PREVIOUS_CHAMPION} and took the PvP belt. Defend it well."
- "THE BELT IS YOURS. {PREVIOUS_CHAMPION} couldn't hold it. You are the new PvP champion."

### 9.2 Belt Lost (dethroned champion logs in)
- "DETHRONED. {NEW_CHAMPION} took your belt while you were away. Time to take it back."
- "THE BELT IS GONE. {NEW_CHAMPION} beat you and claimed the PvP title. The ladder awaits."

**[v1.1 — deferred]** Defender-result and belt-under-pressure (decay) Gazette stories.

---

## 10. Database Schema — REVISED

### 10.1 Fighter Document — `pvp` subdocument
```
pvp: {
  // Record
  wins: Number,                  // default 0
  losses: Number,                // default 0
  draws: Number,                 // default 0
  total_fights: Number,          // default 0 (wins+losses+draws)

  // Ladder
  rank_points: Number,           // default 0 (floored at 0)
  ladder_rank: Number | null,    // null until 3 fights
  is_champion: Boolean,          // default false

  // Protection gate — REVISED (replaces is_untouchable/untouchable_reason)
  attackable_after: Date | null, // null = attackable now; set on every loss (§6.3)

  // Activity & daily cap — NEW
  last_pvp_fight_at: Date | null,   // tiebreak + belt decay
  attacks_today: Number,            // default 0
  attack_day_key: String | null,    // toDateString() idiom (mirrors fightDayKey)

  // Belt tracking
  belt_defenses: Number,         // default 0
  belt_won_at: Date | null,
  belt_lost_at: Date | null,

  // Belt decay state — NEW (written by nightly job)
  belt_challenge_floor: Number,  // default 10; widens to 20 on champ inactivity
  interim_booked: Boolean,       // default false

  // [v1.1 — deferred] defensive camp — DO NOT IMPLEMENT IN v1
  // defensive_camp: [String]    // up to 3 session IDs; reserved for v1.1
}
```
**Dropped from v1.0:** `is_untouchable`, `untouchable_reason` (replaced by `attackable_after`). `defensive_camp` is reserved/commented for **[v1.1]** — do not build the read/write path.

### 10.2 PvP Fight Document (`pvp_fights` collection)
Stored separately from PvE fights to keep career records clean.
```
{
  _id, attacker_id, defender_id,
  attacker_camp: [String],         // offensive camp session ids used
  defender_camp: [String],         // [v1.1 — deferred] empty/absent in v1
  result: { winner_id, method, round },  // method: KO|Submission|Decision|Draw
  belt_changed: Boolean,
  attacker_points_delta, defender_points_delta,
  attacker_iron_earned, defender_iron_earned,
  attacker_notoriety_earned, defender_notoriety_earned,
  attacker_ovr_at_fight, defender_ovr_at_fight,   // NEW — for gap audit
  gap_factor: Number,                              // NEW — reward scaling applied
  fought_at: Date,
  seen_by_attacker: Boolean,       // true on creation
  seen_by_defender: Boolean,       // false until defender views via Gazette
}
```

### 10.3 Indexes
```
fighters: { 'pvp.rank_points': -1, 'pvp.wins': -1 }   // ladder sort + win% tiebreak support
fighters: { 'pvp.is_champion': 1 }
fighters: { 'pvp.attackable_after': 1 }
fighters: { 'pvp.last_pvp_fight_at': 1 }              // belt decay job
pvp_fights: { attacker_id: 1, fought_at: -1 }
pvp_fights: { defender_id: 1, fought_at: -1 }
pvp_fights: { seen_by_defender: 1 }
```

---

## 11. Backend Logic Sketch

### 11.1 `initiatePvpAttack(attackerId, defenderId, offensiveCampSessions)`
```
attacker = Fighter.findById(attackerId)
defender = Fighter.findById(defenderId)

// Validations (each maps to §4.5 error codes)
if attackerId === defenderId          -> cannot_attack_self
if defender.pvp.total_fights < 3      -> target_not_attackable   // onboarding shield
if defender.pvp.attackable_after > now -> target_recovering       // §6.3
if isFightBlocked(attacker)           -> attacker_injured
ovrDiff = attacker.overallRating - defender.overallRating
if abs(ovrDiff) > 8                   -> out_of_bracket           // §4.4

ensurePvpDailyState(attacker)         // reset attacks_today on new day key
cap = isPremium(attacker) ? 7 : 5
if attacker.pvp.attacks_today >= cap  -> daily_pvp_cap_reached

cost = PROMOTION_TIERS[attacker.promotionTier].fightEnergyCost
await energyService.deductEnergy(attackerId, cost)   // throws insufficient_energy

// Build offensive camp via existing camp flow (attacker = camp owner)
// Run existing single-sided engine: attacker is `player`, defender is `opponent`
result = resolveFight(attackerStats, defenderStats, {
  playerStrategy, sessionBonuses, wildcard, playerName, opponentName, ctx
})

await processPvpResult(attacker, defender, result, gapFactor(ovrDiff))
return result
```

### 11.2 `processPvpResult(attacker, defender, result, gapFactor)`
```
attackerWon = result.winner === attacker
method      = result.method                 // KO|Submission|Decision|Draw
isBeltFight = defender.pvp.is_champion
            && attacker.pvp.ladder_rank != null
            && attacker.pvp.ladder_rank <= defender.pvp.belt_challenge_floor  // 10 or widened 20

// Records
update wins/losses/draws + total_fights for both
both.pvp.last_pvp_fight_at = now

// Rank points (rank-based, NOT OVR-gap scaled)
attackerDelta = calcDelta({isWin, isLoss, isDraw, method}, attacker.rank, defender.rank)
defenderDelta = calcDelta(mirror, defender.rank, attacker.rank)
apply, floor rank_points at 0

// Loss cooldown (§6.3) on the loser only
loser.pvp.attackable_after = now + {KO:12h, Sub:6h, Dec:3h}[method]

// HP + injuries (§6.1/6.2) — apply to BOTH; defender via method HP table
applyPvpDamage(attacker, defender, result)
rollInjuriesForBoth()                       // existing rollForFightInjury + grace

// Rewards (§7) — iron/fame down-weighted × gapFactor; rank already applied
ironWin = round(PROMOTION_TIERS[tier].signingFee * 0.45 * gapFactor)
fameWin = round(baseFightNotoriety(tier, method) * 0.40 * gapFactor)
distribute (winner full, loser 15% iron, draws 25%)

// Belt transfer / defense (§8)
if isBeltFight && attackerWon: transfer belt, defender->rank2 conceptually, reset floor/interim
if isBeltFight && !attackerWon: defender.belt_defenses++, pay defense bonus (§7.4)

// Persist fight doc
PvpFight.create({... seen_by_attacker:true, seen_by_defender:false, gap_factor})

// Daily counter
attacker.pvp.attacks_today += 1

// LAZY rank update (§11.3) — NOT a global recalc
repositionTwo(attacker, defender)

save attacker (saveWithVersionRetry); save defender (saveWithVersionRetry)
```

### 11.3 Lazy rank reposition — REPLACES global recalc
```
repositionTwo(a, b):
  for f in [a, b] that have >= 3 fights:
     // find correct slot vs immediate neighbors by (rank_points, win%, recency)
     // shift only the affected contiguous range, not the whole ladder
  // entry: if total_fights just hit 3, insert at correct sorted position
```
Plus a **nightly BullMQ job `pvp:ladderRecalc`** that does the authoritative full sort (rank_points desc, then win% desc, then last_pvp_fight_at desc) and rewrites `ladder_rank` for all ranked players — catching any drift from the lazy path. Mirrors the codebase's lazy-tick + periodic-reconcile pattern (cf. injury lazy tick + hourly `injuryHealService`).

### 11.4 `pvp:beltDecay` nightly job (§8.4)
```
champ = current champion (single global belt in v1)
inactiveDays = daysSince(max(champ.lastLogin, champ.pvp.last_pvp_fight_at))
if inactiveDays >= 21: champ.pvp.interim_booked = true; champ.pvp.belt_challenge_floor = 20
elif inactiveDays >= 14: champ.pvp.belt_challenge_floor = 20
else: champ.pvp.belt_challenge_floor = 10; champ.pvp.interim_booked = false
```

> Every job handler has an `onFailed` path and per-record try/catch (per project convention — silent failure unacceptable in async gameplay).

---

## 12. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/pvp/ladder` | Paginated ladder (rank_points desc, win% then recency tiebreak). Own row highlighted. Marks belt holder, cooldown, and out-of-bracket rows. |
| GET | `/api/pvp/ladder/:fighterId` | A fighter's PvP profile: record, rank, points, is_champion, attackable_after. |
| POST | `/api/pvp/attack/:defenderId` | Initiate attack. Body `{ offensive_camp: [String] }`. Runs all §4.5 validations. Returns fight result + rank delta + belt change. |
| GET | `/api/pvp/history` | Player's PvP fight history, paginated. |
| GET | `/api/pvp/pending` | Unseen PvP results where player was defender (for Gazette). |

**Dropped from v1:** `GET/PATCH /api/pvp/defensive-camp` → **[v1.1 — deferred]** (§14).

---

## 13. PvP Tab — UI Spec

### 13.1 Structure (v1: two sub-sections)
- **Ladder** — global leaderboard; belt holder at top; own row highlighted; per-row Challenge button with disabled states (out-of-bracket, recovering, unranked). Top-10 rows show a subtle belt-challenge accent.
- **History** — chronological PvP fights (attacker/defender perspective): result, opponent, method, iron, rank delta.

**[v1.1 — deferred]** Defensive Camp sub-section.

### 13.2 Ladder Row States
| State | Treatment |
|---|---|
| Belt holder (#1) | Gold, belt icon, CHAMPION badge |
| Player's own row | Blue highlight, YOU badge |
| In cooldown | Challenge greyed, "Recovering" tooltip |
| Out of ±8 OVR | Challenge greyed, "Outside your range (±8 OVR)" |
| Top 10 (challenge zone) | Subtle gold left border |
| Daily cap reached | Global banner: "PvP attacks used today (X/cap). Resets at midnight." |

### 13.3 Challenge Flow
1. Tap Challenge → offensive camp screen (existing PvE camp UI, attacker-tier slots).
2. Defender profile + Fighter Report shown (HP/injuries hidden).
3. Set camp → Fight.
4. Result screen (existing PvE result screen, PvP labels) with rank-delta line ("+2 rank points").
5. If belt changed: full-screen belt-transfer announcement before the result screen.

---

## 14. [v1.1 — deferred] Defensive Camp Upgrade Path

Documented now so v1 schema/UI leave room for it.

1. **Schema:** activate `pvp.defensive_camp: [String]` (max 3 session ids), persisted indefinitely, editable at any time at no energy cost; default starter camp (e.g. `GAME_PLAN_STUDY`) so a new player is never a free KO.
2. **Engine:** extend `resolveFight` to accept `opponentSessionBonuses` (and `opponentWildcard`) and return `opponentHealthAfter`, making resolution two-sided. This is the net-new work explicitly avoided in v1.
3. **Evaluation:** at fight time, evaluate the **defender's** sessions against the **attacker's style** using the existing `STYLE_SESSION_MAP` (`consts/campConfig.js`) — i.e. a defensive `TAKEDOWN_DEFENCE` is MATCHED if the attacker is Wrestler/Judo/Sambo. Reuses `getMatchStatus` semantics with the attacker as the "opponent style."
4. **API/UI:** re-introduce `GET/PATCH /api/pvp/defensive-camp` and the Defensive Camp sub-section.
5. **Scouting balance:** to offset the blind-defender asymmetry, either show attackers an OVR *band* rather than exact OVR, or let defenders see who last attacked them so they can adapt their preset.

Until then, v1's defender = stats/OVR/health only, which the engine already supports.

---

## 15. Cold Start — Beta Cohort Plan

Recruit **20–30 trusted testers** to populate the ladder and establish a belt holder before public PvP launch.

**Goals:** real records on the ladder; a non-vacant belt on day one; tune HP bands, iron/fame %, cooldown hours, daily cap, and the ±8 bracket; find exploits in cooldown/belt-transfer/decay; verify Gazette delivery.

**Setup:** private Discord with bug-report channel; brief: attack actively, try to break the cooldown and belt-decay logic. Run **2–3 weeks** before public. Beta records/ranks carry over as founding ladder members — which also guarantees new players have legal in-bracket targets at launch (pairs with the onboarding shield, §5.3).

**Feedback priorities:** Is 10–20E/attack + 5–7/day the right velocity? Does 45% iron / 40% fame feel worth it without shortcutting PvE? Do the 3/6/12h cooldowns feel fair? Does the belt change hands at a healthy rate, and does the 14/21-day decay fire correctly?

---

## 16. Edge Cases & Notes

1. **Account deletion while champion:** post-deletion hook assigns the belt to the current #2 via a fight-less transfer **only in this deletion case** (the one allowed exception to "belt moves only via a fight"), and resets `belt_challenge_floor`/`interim_booked`.
2. **Simultaneous mutual attacks (A→B and B→A):** resolve independently; two `pvp_fights` docs; HP/cooldown/rank changes from both stack. Each fighter's `attackable_after` is set by whichever fight they *lost* (if any).
3. **Rank changes between initiation and resolution:** belt eligibility is evaluated at *resolution* against `belt_challenge_floor`; in practice instant resolution makes this a non-issue.
4. **Defender drops below 3 fights?** Impossible — PvP fights never decrement; once attackable, always attackable (subject to cooldown).
5. **Iron/fame go to shared pools** (`fighter.iron`, `fighter.notoriety.score`) at the down-weighted rates (§7). PvP fights do **not** count toward PvE systems: not the 3-win title-shot requirement, not PvE tier movement, not the PvE ranking ladder (`services/rankingService.js` is untouched by PvP). The only cross-over is the (reduced) iron/fame contribution.
6. **0 energy:** cannot attack. (No defensive-camp editing in v1, so nothing else to do in the PvP tab except browse.)
7. **Cooldown vs injuries are decoupled:** a player whose injuries auto-heal in 6h but whose KO cooldown is 12h stays unattackable for the full 12h; conversely an uninjured decision-loser is attackable again after 3h. The cooldown — not the injury — is the gate (§6.3).
8. **Gap-factor floor inside the bracket:** with ±8 bracketing the worst within-band gap yields `gapFactor ≈ 0.47`, so an in-bracket win always pays *something*; the zeroing tail of the formula only matters if a future update widens the bracket.
9. **Lazy reposition correctness:** the nightly `pvp:ladderRecalc` is the source of truth; the per-fight lazy reposition is an optimization. If they ever disagree, the nightly job wins.

---

### Code constants this spec maps to
- `consts/gameConstants.js` — `ENERGY` (1/min, max 100), `PROMOTION_TIERS[tier].fightEnergyCost` (attack cost), `PROMOTION_TIERS[tier].signingFee` (PvP purse base), `PROMOTION_TIERS[tier].injuryRiskMult`.
- `services/energyService.js` — `deductEnergy` (attack spend).
- `services/rankingService.js` — `calcDelta` (rank-point math, reused verbatim).
- `consts/notorietyConfig.js` — `BASE_FIGHT_NOTORIETY` (× 0.40 × gapFactor for PvP fame).
- `consts/injuryDefinitions.js` / `utils/injuryUtils.js` — injury rolls + grace; concussion 12h underpins the KO cooldown choice.
- `services/injuryHealService.js` — pattern for the nightly/lazy reconcile jobs; the reason injuries are **not** used as the gate.
- `utils/fightResolution.js` — `resolveFight(player, opponent, options)` single-sided in v1; two-sided extension is **[v1.1]**.
- `consts/campConfig.js` — `STYLE_SESSION_MAP`, `CAMP_SLOT_CONFIG` (attacker offensive camp; defensive evaluation is **[v1.1]**).
- `services/gazetteService.js` / `consts/gazetteTemplates.js` — belt-change story builders + templates.
