# PvP Screens Redesign — "Fight Night" Camp & Summary

Design spec for the PvP pre-fight **Fight Camp** and post-fight **Fight Summary** (`frontend/src/components/pvp/PvpChallengeFlow.jsx`). Goal: make PvP feel like a headline bout — rich on BOTH fighters, dramatic on payoff. Matches/exceeds the PvE `FightSummary`.

## Constraints (buildable reality)
- PvP v1 is a **stateless single POST** (no persisted camp draft; in-memory selection submitted with the attack).
- Defender is **simulated from stats** (no defensive camp in v1).
- `resolveFight` currently returns only the **attacker's** health + single-sided log → a two-fighter summary needs the backend to RETURN MORE (the §B.9 additions).

---

## A) PvP FIGHT CAMP screen (the walkout + staredown)

```
EYEBROW: "FIGHT NIGHT" / "TITLE FIGHT" / "GRUDGE"          ← context band
┌ ATTACKER (you) ─┬─ VS / ODDS ─┬─ DEFENDER (them) ─┐       ← TALE OF THE TAPE
│ name+nickname   │  +6 OVR     │ name+nickname     │
│ OVR (big)       │  FAVORED    │ OVR (big)         │
│ record · streak │  pill       │ record · streak   │
│ style · rank #N │             │ style · rank #M   │
│ belt? CHAMP     │             │ belt? CHAMP       │
└─────────────────┴─────────────┴───────────────────┘
WHAT'S AT STAKE  [+4/−3 rank] [BELT FIGHT] [REVENGE] [Bounty] [−15E] [punch-down ×0.8]
YOUR GAME PLAN   slots ●●○ · "They're a Wrestler" · projected grade
  [session card: effect · energy · MATCHED/PARTIAL/UNMATCHED] …
[Cancel]                                   [ ⚔ FIGHT ]
```

- **Context band:** TITLE FIGHT (gold) > GRUDGE/REVENGE (red) > FIGHT NIGHT (default).
- **Tale of the tape:** two mirrored columns + center VS/odds medallion. Per fighter: name + "nickname", **big OVR** (reuse `fr-ovr-block`), PvP record + win%, streak heat dot, style pill (`STYLE_COLORS`), ladder rank #, CHAMPION tag. Odds pill from OVR gap ("FAVORED +6" / "Underdog −4" / "Pick'em").
- **Stake chips:** rank-points on the line (+win/−loss), BELT FIGHT, REVENGE/GRUDGE, Bounty (v1.2), Energy cost, gap-reward note.
- **Game plan (offensive camp):** upgrade session cards to the PvE `camp-session-card` treatment (colored stripe, effect, energy) PLUS a **style-match cue vs THIS opponent** (MATCHED/PARTIAL/UNMATCHED via `STYLE_SESSION_MAP` against the defender's style — pure client-side function, no backend). Slot dots (`CampSlotDots`), style read, and a **live projected camp grade** (S–F). Empty camp allowed but warn "walking in cold."
- **FIGHT CTA:** big/weighty `⚔ FIGHT` (gold "FIGHT FOR THE BELT" on title, "SETTLE IT" on grudge). Loading → "FIGHTING…".
- **States:** loading = full tale-of-the-tape skeleton ("Scouting opponent…"), not a tiny spinner. Errors map `err.code`: inline + disabled CTA for recovering/out_of_bracket/etc.; **banner** for insufficient_energy/daily_pvp_cap_reached/attacker_injured.

---

## B) PvP FIGHT SUMMARY screen (PvE polish + more)

```
[ FULL-SCREEN BELT OVERLAY ] (if belt changed — won gold / lost red, before summary)
RESULT HERO (result-hero--win/loss/draw): VICTORY/DEFEAT/DRAW · KO/TKO · Round 2
  "vs Jane — Record now 9-4-1"      right rail: +Cash · +Fame · Rank Δ
TALE OF THE TAPE — RESULT (BOTH fighters AFTER, winner crowned)
RANK LADDER MOVE  (#14 → #9, +4 pts, animated)
NOTICES (belt, revenge, streak, nemesis, injury, cooldown)
┌ LEFT COL ───────────────┬ ROUND-BY-ROUND / COMMENTARY ┐
│ Aftermath (both HP)     │ (PvP fight description)      │
│ Camp Performance grade  │                             │
│ Rewards & stakes payoff │                             │
└─────────────────────────┴─────────────────────────────┘
[Continue]   [↻ Rematch]   [View Ladder]
```

- **Belt overlay:** reuse `TierUpOverlay`/`BeltTransferOverlay` for belt-won; clone RED for belt-LOST ("YOU LOST THE BELT"). Loudest moment in the game.
- **Result hero:** reuse PvE `result-hero--{win|loss|draw}` + method badge + round (big on finishes). Right rail tiles tuned for PvP: **+Cash / +Fame / Rank Δ** (replace PvE's XP-mult tile).
- **Tale of the Tape — RESULT (the headline ask):** mirror of the camp tape, post-fight, **winner crowned** (gold crown + glow, loser dimmed). Both: OVR, style, **record AFTER**, **rank AFTER**, belt AFTER. "UPSET" badge if the lower-ranked fighter won. **Requires the defender block (B.9 Tier 1).**
- **Rank ladder move:** dramatized `#N → #M` with animated arrow + "+4 rank points"; kicker if entering the top-10 challenge zone.
- **Notices:** belt won/lost/defended, revenge taken (★), win-streak milestone (⚡), PvP nemesis set/cleared, injury (🩹), loss-cooldown ("recovering 12h"), upset/punch-down note. Wire the slots now; light up as Tier-3 fields land.
- **Body grid:** commentary/round log (right); left column = Aftermath (BOTH fighters' HP before→after + injuries), **Camp Performance** (reuse PvE `campBreakdown`: grade S–F, per-session MATCHED/triggered rows, wildcard — "how your game plan graded vs Jane's Wrestler style"), and Rewards (iron, fame, gap note). **Omit the XP card** (no PvP stat XP).
- **Actions:** Continue (primary); **↻ Rematch** (re-challenge same defender; disabled-with-timer if they're on cooldown / you're capped); View Ladder.

---

## B.9 Backend payload additions (for the architect)

**Tier 1 — the two-fighter result (the core ask):**
1. `defender` block: `{ name, nickname, ovr, style, record_after, ladder_rank_after, is_champion_after, rank_points_after }`.
2. `health`: `{ attacker: {before, after}, defender: {before, after} }` (attacker after = engine `playerHealthAfter`; defender after = method-table §4.4.6 — both computed server-side, just expose).
3. ensure `result.method`/`outcome`/`round` distinguish KO/TKO/Sub/Decision (already present).

**Tier 2 — PvE parity (Camp Performance):**
4. `campBreakdown`: `{ rating ("S".."F"), sessions: [{label, matchStatus, triggered, triggerCount, description}], wildcard }` — SAME shape PvE feeds `FightSummary`; assemble from `buildOffensiveBonuses` + engine output.
5. `rank.attacker_ladder_rank_before` (or pass from profile client-side).

**§3.2 profile additions (for the camp tale-of-the-tape):** `nickname`, `pvp.current_streak` (signed), `pvp.belt_challenge_floor` (to know if it's a belt fight), `head_to_head {my_wins, their_wins, last_result}` (Tier-3, optional now). Rank-points preview: expose a small `calcDelta`-based estimate (rec) or fall back to qualitative.

**Tier 3 (hub drama — defer, wire slots):** `streak {attacker_current, milestone}`, `head_to_head`+`revenge`, `nemesis {set, cleared, name}`, `belt {lost, defenses_after}`.
**Tier 4 (fidelity — defer):** populated `result.rounds[]`, `rewards.notoriety_breakdown[]`, bounty fields.

---

## C) Prioritization
- **Phase 1 (no backend):** tale-of-the-tape camp from existing §3.2 fields + client win%/odds; rich session cards + client MATCHED/PARTIAL/UNMATCHED cues + projected grade; stake chips; upgraded summary hero + rank-move strip; Continue/Rematch/View-Ladder.
- **Phase 2 (Tier 1+2 payload):** defender block → crowned tale-of-the-tape RESULT; both-fighter health → Aftermath; campBreakdown → Camp Performance; loss-cooldown notice.
- **Phase 3 (Tier 3, with hub):** streaks, revenge, nemesis, head-to-head, belt-lost overlay/defense counter.
- **Phase 4 (Tier 4):** true per-round playback, fame breakdown, bounties.

## D) Reuse map
- **As-is:** `result-hero` + `notices` + `campBreakdown` rendering from `FightSummary.jsx`; `TierUpOverlay`/`BeltTransferOverlay` (clone red for belt-lost); `CampSlotDots` + `camp-session-card` from `FightCamp.jsx`; `STYLE_COLORS` + `fr-ovr-block` + `fr-nickname` from `FighterReport.jsx`; `CAMP_SESSIONS/SLOT_CONFIG/RATING_CONFIG/MATCH_STATUS_*/getRatingConfig` from `constants/campConfig.js`.
- **Net-new:** `PvpTaleOfTheTape` (mode="preview"|"result"), `PvpStakeChips`, `PvpRankLadderMove`, belt-overlay won/lost `mode`.
- **Stop using:** `buildPvpSummary`'s "leave them out" — feed `FightSummary` (or a PvP wrapper) the full object once the payload lands.

## E) Stakeholder decisions — taken (recommended defaults)
1. **Omit** the XP card in PvP. 2. **Expose** a pre-fight rank-points preview (backend has `calcDelta`). 3. **Reveal** defender HP post-fight (past fact, not scouting). 4. **Rematch** shown disabled-with-timer on cooldown. 5. **Belt-lost** gets a full-screen overlay (equal to belt-won). 6. **Wire Tier-3 notice slots** now, light up as fields land. 7. **Plain OVR-gap odds** framing (no betting lines).
