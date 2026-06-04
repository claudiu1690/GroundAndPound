# PvP Hub Redesign — "The Circuit" (v1.1+ design spec)

**Status:** Design proposal (ideation). Builds ON the shipped PvP v1 (`docs/PvP_System_Spec_v1_revised.md`), does not replace it.

**Goal:** Turn PvP from a leaderboard into a destination a player opens every day for *who's coming for me, who do I owe, and what am I chasing this week* — built on top of the shipped v1 data.

**Guardrails preserved (non-negotiable):** v1 down-weights PvP into the shared economy (iron 45/25/15%, fame 40% × gapFactor), gates velocity (5 attacks/day, tier energy cost), and brackets matchmaking (±8 OVR). Everything here is additive flair / redistribution — PvP stays emotionally rich but economically weak relative to PvE.

---

## 1. PvP Hub information architecture

A persistent **identity header** + four sub-sections (tabs underneath).

### Identity header — "Your Fight Card" (always on screen)
Reads like a tale-of-the-tape, drawn almost entirely from data v1 already stores:
- Name + earned **PvP title/alias** + **division badge**.
- **Record** `W-L-D` and **win%**.
- **Rank + division standing**.
- **Belt status** (CHAMPION + defenses, or "X ranks from the challenge zone").
- **Current streak** with a cold→on-fire heat indicator.
- **KO% / finish rate** (from PvP fight history methods).
- **Fame from PvP** (lifetime).
- **Bounty on your head** (iron currently posted against you — the tense hook).
- **Rivals: N active**.

### Sub-section 1 — "The Yard" (home / feed, default view)
- **Revenge board**: "These people hit you. Hit back." — up to 3 one-tap Challenge cards.
- **PvP ticker**: scrolling feed of recent ladder events relevant to you.
- **This week's contracts**: 2–3 PvP objectives with progress bars.

### Sub-section 2 — "Ladder"
The existing v1 ladder, intact, + a **division toggle** (My Division / Global) and a **rivals filter**.

### Sub-section 3 — "Bounties"
The hit-list board: collectable bounties + "post a bounty" on a rival.

### Sub-section 4 — "History"
The v1 history list, enriched with rivalry/bounty/streak tags per row.

The *first* thing you see is people and grudges (The Yard), not a sorted table.

---

## 2. Headline mechanics (6, ranked by excitement-per-effort)

### A — Rivalries & Revenge feed *(the spine)*
Every PvP fight auto-creates/escalates a **rivalry** (head-to-head record, last-fought, **heat**). Being attacked surfaces a revenge card on next login ("Jane KO'd you 6h ago. Settle it."). Beating a rival you're losing to = **revenge win** flourish (Gazette story + small fame kicker).
- Heat +1/fight, +2 if it flips the head-to-head leader, −1/week decay. Heat ≥ 4 = **Grudge** (named, Gazette-eligible).
- **Revenge window:** 72h after a loss, a win vs that opponent pays **+15% fame** (below the PvE callout +30% — PvP stays under PvE). No extra iron.
- **Nemesis tie-in:** a PvP rival you keep losing to (head-to-head deficit ≥ 2) becomes your **PvP nemesis** — the player mirror of the existing `fighter.nemesis` NPC pattern.
- **Async fit:** perfect — it's the `/pvp/pending` "you were attacked" feed, dramatized. Gives the v1 passive defender a reason + one-tap path to act.
- **Data/UI:** a `rivalries` collection (or lazy-compute from `pvp_fights` first). Revenge cards, rivals filter, head-to-head on history rows. **Cheap.**

### B — Bounties / Hit-list *(iron-fueled drama + the missing iron SINK)*
Post an **iron bounty** on a ranked fighter; anyone who beats them in-bracket collects.
- **Escrow up front** (iron leaves your balance now). Min 250; **max ≤ 1× target tier `signingFee`**.
- **10% burn on posting** (sink) → 90% escrow. **7-day expiry**, 80% refund / 20% burn.
- Can't post on yourself / collect your own. Collusion guards in §3.
- **Async fit:** post + collect are clicks; target simulated. Collecting still costs an attack (energy + cap) — so it *raises the value* of capped attacks.
- **Economy:** no iron created (escrowed transfer minus burns) → net **sink**, healthy for an endless game. Doesn't shortcut PvE.
- **Data/UI:** a `bounties` collection + escrow logic (follow `mainEventService` stake/settle pattern). Bounties tab, post modal, head tags. **Heaviest lift → v1.2.**

### C — Seasons & Divisions *(everyone gets a goal)*
Wrap the persistent global ladder in **4-week seasons**, slice players into **Bronze→Silver→Gold→Diamond→Champion's Circle** by rank_points band.
- Promotion/relegation at season end (top third up, bottom quarter down).
- **Soft reset:** `points = floor(old × 0.6)` (not a wipe). Belt does **not** reset (stays a live fight-only title); a separate **Season Champion** honor to whoever holds it at rollover.
- **End-of-season rewards** by division: down-weighted fame + a flair/title + modest iron (≤ Diamond = 1× tier `signingFee`); Champion's Circle gets a unique banner piece.
- **Async fit:** wall-clock seasons; a nightly rollover job (same shape as v1's `pvp-ladder-recalc`/`pvp-belt-decay`).
- **Why:** fixes "only top 10 have anything to chase" and prevents the ladder solidifying.
- **Data/UI:** a `pvp_seasons` doc + per-fighter season fields. Division badge, toggle, countdown, results modal. **v1.2.**

### D — Win streaks, titles & flair *(highest excitement-per-effort)*
- **Streaks:** PvP win-streak milestones at 3/5/10/15 → escalating fame kickers + Gazette stories (reuse PvE `winStreak`/`buildWinStreakStory`).
- **Earned titles (display-only, zero stat effect):** "The Hunter" (10 attack wins), "Giant Slayer" (5 wins vs higher-ranked), "Iron Collector" (5 bounties), "Untouchable" (10-win streak), "Gatekeeper" (defend top-10 5×), "Old Money" (former champ).
- Tiny one-time unlock payouts (≤ 0.5× `signingFee`).
- **Data/UI:** a PvP streak field + unlocked-titles array (or compute at read-time). Header alias/title, chips, streak heat. **Almost entirely UI over existing data → v1.1.**

### E — PvP ticker *(makes the hub feel alive, ~free)*
Scrolling feed of recent ladder events filtered to you (your bracket/division/rivals, belt changes, big bounties, streak-breaks) with one-tap actions. Read-only aggregation over `pvp_fights` + bounty/season events. The async, live-feeling companion to the once-daily Gazette. **v1.1.**

### F — Daily/Weekly PvP contracts *(directed engagement, respects the cap)*
Rotating objectives ("Win 1," "Finish someone," "Beat someone ranked above you," weekly "Collect a bounty"/"Win 4"). Down-weighted, capped rewards (all dailies ≈ one extra win's fame). **Consumes** the 5-attack budget, doesn't inflate it; nudges toward finishes/punching-up over decision-farming. Reuses the `attack_day_key` reset idiom. **v1.1.**

---

## 3. Economy & anti-abuse guardrails
- **Preserved:** iron 45/25/15%, fame 40% × gapFactor, ±8 bracket, gap-scaling, 5/day cap, tier energy. All new awards flow through `applyNotorietyDelta` / the iron path (logged), and every new reward counts against an explicit daily cap.
- **Bounties:** no iron created (escrow transfer − burns = sink); collection capped ≤ 1× tier `signingFee`, requires an in-bracket legit win, doesn't count toward PvE gates.
- **Alt/collusion defense:** can't collect your own bounty; a (poster,target,collector) triangle pays out at most once per N days; **diminishing head-to-head rewards** (Nth win vs the same opponent in a window pays ×1.0/0.6/0.3/→0) kills streak/rivalry/bounty alt-farming; the v1 post-loss `attackable_after` cooldown already throttles repeat-hits; season relegation + soft reset re-mixes the ladder.

---

## 4. Prioritized roadmap
**v1.1 — quick wins (high impact, mostly UI over data PvP already stores, zero economy risk):**
1. Hub IA + identity header.
2. Win streaks, titles & flair (D).
3. Revenge feed + rivalries (A).
4. PvP ticker (E).
5. Daily/weekly contracts (F).

**v1.2 — medium (new persistence + one nightly job each, real economy touch):**
6. Seasons & divisions (C).
7. Bounties / hit-list (B) — marquee drama, heaviest economy lift; ship after the cheap wins prove the hub.

**Bigger bets (later, only if PvP retention justifies):**
8. Gym/faction or weight-class **team rivalries** (aggregate divisions by gym; needs a team model + collusion design).
9. Two-sided **defensive camps** (already v1.1-deferred in the spec; the biggest engine lift).

---

## 5. Open questions for the stakeholder
1. **Season length:** 4 weeks (rec) vs 2 / 6?
2. **Divisions vs global ladder:** view-layer on one global ladder (rec) vs separate per-division ladders?
3. **Bounties use real iron** (rec — the missing sink) vs fame-only (zero economy risk)?
4. **Soft-reset aggressiveness:** ×0.6 vs wipe vs none?
5. **Revenge/streak bonus size:** confirm PvP stays strictly under PvE on every reward (revenge +15% vs callout +30%)?
6. **Title flair:** cosmetic-only (strongly rec) vs ever a tiny perk?
7. **Belt + seasons:** belt stays a live fight-only title that does NOT reset, + a separate Season Champion honor — confirm?
