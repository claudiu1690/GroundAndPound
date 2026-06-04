# Implementation Contract — PvP "Fight Night" Camp + Summary (Phase 1 + Phase 2 / Tier 1 + Tier 2)

UX source: `docs/PvP_FightNight_Screens_Design.md`. Extends `docs/PvP_v1_implementation_contract.md` §3.2/§3.3. Cites verified develop line numbers.

## Key verified facts
- §3.3 response is built in `initiatePvpAttack` (pvpService ~325-365), reading audit fields from `processPvpResult` (return ~578-587). New fields captured inside `processPvpResult` (where both docs are mutated) and surfaced there.
- `resolveFight` does NOT return a camp grade. It returns `{ outcome, rounds, winner, playerHealthAfter, playerStaminaAfter, commentary, sessionBonuses, wildcard }`. `sessionBonuses[]` are mutated with `triggered`/`triggerCount` by the engine. PvE's grade comes from `campService.computeCampRating` (campService:81-110, NOT exported), assembled at `fightService.js:1207-1221`.
- `isPvpBot` defenders keep `health=100` and take no injuries (processPvpResult:432-451); record/rank still move.

## 1. Backend payload additions

### §3.3 attack response — ADD
**`defender` block (Tier 1)** — `{ name, nickname, ovr, style, record_after, ladder_rank_after, is_champion_after, rank_points_after }`. All captured inside `processPvpResult` AFTER mutation, returned via the audit object: name via `ladderRowName(defender)`; record via `recordString(defender.pvp)` (after records ~408); ladder_rank_after after `repositionTwoOnLadder` (560, `?? null`); is_champion_after after belt block (531); rank_points_after after rank calc (417). Pure exposure, no new compute.

**`health` block (Tier 1)** — `{ attacker:{before,after}, defender:{before,after} }`. attacker.before = `freshAttacker.health` captured pre-engine (~294, `?? 100`); attacker.after = `result.playerHealthAfter` (clamp ≤100); defender.before = `defenderStats.health` (298, `?? 100`); defender.after = `defender.health` after applyHpLoss (444) — **GUARD: bot defender → stays = before (100) since applyHpLoss skipped**.

**`campBreakdown` block (Tier 2)** — `{ rating, sessions:[{label,matchStatus,triggered,triggerCount,description}], wildcard }`.
- `sessions`/`wildcard`: from `result.sessionBonuses` / `result.wildcard` (engine output; map exactly like fightService:1209-1216). **`wildcard` is always `null` in PvP v1** (attack passes `wildcard:null` to resolveFight) — wire it, FightSummary null-guards.
- `rating`: **NEW shared helper** `campService.gradeOffensiveCamp(sessionIds, defenderStyle, maxSlots)` (Option A): rebuild the `sessions` array `buildOffensiveBonuses` builds (matchStatus + diminishing), compute `pointsEarned = round(modifierContribution * diminishingFactor * MATCH_STATUS_MULTIPLIERS[matchStatus])` (mirror addCampSession:462-464), then call existing `computeCampRating(sessions, maxSlots)`. `maxSlots` = attacker-tier `CAMP_SLOT_CONFIG[tier].normalSlots`. Keeps the grade formula SHARED with PvE (no PvE behavior change; additive export). Call in `initiatePvpAttack` after `buildOffensiveBonuses`. Empty camp → "F".

**`rank.attacker_ladder_rank_before` (Tier 2)** — capture `freshAttacker.pvp.ladder_rank` BEFORE processPvpResult mutates it (~288, `?? null`).

### §3.2 profile response — ADD (built in `getPvpProfile` ~754-779)
- `nickname` (top level): `f.nickname || null` (already selected).
- `pvp.belt_challenge_floor`: `?? PVP_BELT_FLOOR_DEFAULT` (already on subdoc).
- `pvp.current_streak` (signed int): NEW — query `PvpFight.find({$or:[{attacker_id:fighterId},{defender_id:fighterId}]}).sort({fought_at:-1}).limit(20).select("attacker_id defender_id result.winner_id").lean()`; walk from newest counting the leading run (win = winner_id===fighterId; draw = winner_id==null → break; else loss). +N wins / −N losses / 0 none. Uses existing indexes.
- `rank_points_preview` (top level): NEW — thread `viewerId` into `getPvpProfile(targetId, viewerId)` (controller passes `req.user.fighterId`); load viewer `pvp.ladder_rank`; `{ on_win: calcDelta({isWin:true,method:"DEC"}, viewerRank, targetRank), on_loss: calcDelta({isLoss:true,method:"DEC"}, viewerRank, targetRank) }`. **Verify `calcDelta` tolerates a null SELF (first) rank; if not, fall back to `{on_win:null,on_loss:null}` → frontend "—".**

## 2. Frontend plan (all new files in `frontend/src/components/pvp/`)

### New components
- `PvpTaleOfTheTape.jsx` `mode="preview"|"result"` — two mirrored columns + center VS/odds medallion (plain OVR-gap: "FAVORED +6"/"Underdog −4"/"Pick'em"). Result mode: crown winner, dim loser, "UPSET" badge if lower-ranked won. Props `{mode, attacker, defender, winner, isBeltFight}`, fighters normalized `{name,nickname,ovr,style,record,ladderRank,isChampion,streak}`. Also renders the **Aftermath** (both-fighter HP before→after) in result mode.
- `PvpStakeChips.jsx` — `{rankPreview:{on_win,on_loss}, isBeltFight, isRevenge, energyCost, gapFactor}`. Chips: rank-on-line, BELT FIGHT, REVENGE (dark/hidden until Tier-3), Energy, punch-down note. Bounty = hidden Tier-4 slot.
- `PvpRankLadderMove.jsx` — `{rankBefore, rankAfter, pointsDelta}` animated `#N→#M` + "+delta rank points"; challenge-zone kicker.
- `PvpBeltOverlay.jsx` — `mode="won"|"lost"` (extract from inline `BeltTransferOverlay`); won=gold, lost=red ("YOU LOST THE BELT") wired dark until Tier-3 `belt.lost`.

### Reuse (verified)
- **Feed the real `FightSummary`** (takes `{summary, description}`) — its `result-hero`, `notices`, `campBreakdown` (consumer at 252-293, EXACT shape match) render the hero/notices/camp. Render `PvpTaleOfTheTape` + `PvpRankLadderMove` ABOVE it.
- Import from `frontend/src/constants/campConfig.js`: `getRatingConfig`, `MATCH_STATUS_LABELS/COLORS`, `CAMP_RATING_CONFIG`, `CAMP_SESSIONS`, `CAMP_SLOT_CONFIG`.
- `STYLE_COLORS` is NOT exported (FighterReport:5) → **add `export`** (additive). `CampSlotDots` NOT exported (FightCamp:23) → **reimplement inline** in PvP camp. Reuse class names `fr-ovr-block`/`fr-nickname`/`camp-session-card` (global CSS).
- `BeltWonOverlay` styling (`tier-up-overlay`/`tier-up-modal`) for the belt overlay; clone red for lost.

### Client style-match cue + projected grade (Phase 1, no backend)
`frontend/src/constants/campConfig.js` LACKS `STYLE_SESSION_MAP`, `getMatchStatus`, multipliers. **Add (additive, mirror backend `consts/campConfig.js`)**: `STYLE_SESSION_MAP`, `MATCH_STATUS_MULTIPLIERS`, `getMatchStatus(sessionType, defenderStyle)` (port campService:46-60; honor `partialContributor`→PARTIAL, `alwaysMatched`→MATCHED — flags already present), `projectCampGrade(sessionIds, defenderStyle, maxSlots)` (port computeCampRating using `modifierContribution` × multiplier × diminishing → grade). Label it **"projected"**; the Phase-2 `campBreakdown.rating` is authoritative on the summary.

### `buildPvpSummary` → `FightSummary` props map (replace the "leave them out" version)
`outcome`←result.outcome; `recordChange`←result.winner→W/L/D; `recordAfter`←attacker `fighter.pvp`; `opponentName`←`defender.name`; `ironEarned`←rewards.iron_earned; `notorietyGained`←rewards.notoriety_earned; `healthStart/End/Lost`←`health.attacker`; `campBreakdown`←passthrough; `beltWon`←belt.changed&&newChampion; **OMIT `xpGained`/`xpMultiplier`**. Defender HP rendered in `PvpTaleOfTheTape` Aftermath, not FightSummary.
- **FightSummary XP tile (90-93) hard-renders ×1.** Add an additive prop (`hideXpTile`/`rightRailMode="pvp"`) defaulting to current behavior (no PvE regression) so PvP swaps the XP-mult tile for Rank Δ.

### `PvpChallengeFlow.jsx` restructure
Two screens: **Camp** (header → `PvpTaleOfTheTape preview` from §3.2 profile + attacker `fighter` → `PvpStakeChips` → upgraded session picker w/ `camp-session-card` + inline slot dots + client match cue + projected grade → Cancel/FIGHT CTA) and **Summary** (belt overlay gate → `PvpTaleOfTheTape result` → `PvpRankLadderMove` → real `FightSummary` → Continue / Rematch [disabled-with-timer on cooldown/cap] / View Ladder).

### Net-new CSS
`.pvp-tape-grid/-col/-col--winner/-col--dimmed/-crown/-vs/-odds/-upset`, `.pvp-stake-row/-chip/-chip--belt/-chip--revenge`, `.pvp-rank-move/-arrow`, `.pvp-belt-overlay--lost`.

## 3. Task split + order
**Backend-dev (server only):** B1 `campService.gradeOffensiveCamp` (export; reuse computeCampRating). B2 `getPvpProfile` adds nickname/belt_challenge_floor/current_streak/rank_points_preview (+ controller passes viewerId). B3 `processPvpResult` audit-return additions (defender block, both HP before/after). B4 `initiatePvpAttack` capture before-values + call gradeOffensiveCamp + assemble campBreakdown + add defender/health/campBreakdown/rank_before to payload. B5 update contract doc §3.2/§3.3.
**Frontend-dev (`frontend/` only):** F1 add STYLE_SESSION_MAP/getMatchStatus/projectCampGrade to campConfig + export STYLE_COLORS. F2 build the 4 new components (preview mode runs on existing data). F3 wire rankPreview/streak/belt_floor/nickname (needs B2). F4 result mode + Aftermath + replace buildPvpSummary feeding real FightSummary (needs B3/B4). F5 restructure flow + actions + CSS.
**Order:** B1→B3→B4 and B2 parallel; F1/F2 start immediately (Phase 1); F3 after B2; F4 after B3/B4; F5 integrates last.

## 4. Risks
4.1 `gradeOffensiveCamp` must match PvE `pointsEarned` math + diminishing order (buildOffensiveBonuses already uses DIMINISHING_RETURNS in submission order) — single shared path keeps it aligned.
4.2 `campBreakdown.wildcard` always null in v1 — don't render an empty wildcard row.
4.3 **Bot defender reads 100 HP + full record** ("you KO'd them but they're at 100 HP"). Frontend guard: in result mode, suppress the defender HP bar (show "—") when `health.defender.before===after===100 && defender lost`. (Exposing `is_bot` is out of scope.)
4.4 Client projected grade vs server rating can drift — label client one "projected"; summary uses authoritative `campBreakdown.rating`; keep campConfig annotated "mirror of backend".
4.5 FightSummary XP tile renders ×1 unless the additive prop is added (recommend the prop; preserve PvE default).
4.6 STYLE_COLORS/CampSlotDots not exported — export the former, reimplement the latter.
4.7 `rank_points_preview` with null viewer rank — verify calcDelta first-arg null handling; fall back to nulls → "—".
4.8 Tier-3 slots (REVENGE chip, belt-lost overlay, nemesis/streak/cooldown notices) wired dark, keyed on fields that arrive later. UPSET badge can light now (ranks available).
