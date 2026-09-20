# Special Moves — Design Spec (v1, Trimmed Scope)

**Status:** design only, no code written yet.
**Scope:** the trimmed, shippable version — equip slots + random rarity drops from
sparring, gym-tier-weighted rarity, painted TCG card art. Deliberately excludes
pity timers, synergy moves, duplicate→XP conversion, PvP scouting, and destructive
style-locks (all cut from the original heavy spec).

---

## 1. Overview & Fantasy

Right now a fighter's identity is entirely emergent from stat allocation and gym choice — two Wrestlers with the same OVR play out almost identically. **Special Moves** give a fighter a small set of collectible, named techniques — *Check Hook*, *Guillotine Reflex*, *Iron Chin Instinct* — that are visually a fighter's own trading card (painted splash-art, same treatment as the sponsor cards) and mechanically a small, legible edge in a fight.

The fantasy: your fighter has *learned something in the gym that nobody else has*. It's a highlight-reel identity layer on top of stats — collectible, brag-worthy on the profile, and something a "better gym" makes more likely to pull, so gym progression pays off in a way players can *see* (a card, not just a number). It is explicitly a flavor-and-light-power system, not a build-around meta — consistent with the game's existing small-swing philosophy (PvP gameplans are tuned to 51–57%, not deciders; §22.4).

This slots next to, not on top of, the existing camp-bonus system (§9): camp bonuses are *temporary, per-fight, opponent-reactive* prep; Special Moves are *permanent, always-equipped* identity. They share the same underlying "conditional bonus that fires during resolution" plumbing precedent (`SESSION_BONUSES` / `sessionBonuses` array in `consts/campConfig.js` and `utils/fightResolution.js`), which is exactly why this doc treats fight-integration cost as the headline risk.

## 2. Slots

- **3 equip slots**, unlocked progressively — tight enough to force real choices (per the brief's 2–4 range), wide enough that a full set feels like a build.
- **Unlock gate: promotion tier**, not fame — moves are earned through gym training, so their equip capacity should track the same "climb the tiers" spine as gyms/camp slots (§5, §9.1), not the parallel fame economy which already gates sponsors/callouts (§12, §13).

| Slot | Unlocks at |
|---|---|
| Slot 1 | Amateur (from account/fighter creation — available immediately) |
| Slot 2 | Regional Pro (mirrors gym-tier and camp-slot step-ups at this tier) |
| Slot 3 | National (mirrors the camp-slot bump to 3 at National, GDD §9.1) |

GCS Contender/GCS do **not** add a 4th slot — camp slots also plateau/step back down at GCS (§9.1: GCS has only 3 normal camp slots despite being the top tier), so 3 is consistent with "more tier ≠ always more slots" and keeps the ceiling tight per the brief.

**Equip/unequip rules:**
- Equipping/unequipping is **free** (no cost, no cooldown) and available any time outside an in-progress fight camp — consistent with how gameplan selection works in PvP (freely reselected per fight, §22.4) and unlike the explicitly-cut "switch style and lose your moves" idea.
- A move locked into an **active camp** (already accepted a fight) stays as equipped at accept-time for that fight's resolution — no swapping mid-camp to react to scouting, mirroring how camp sessions themselves lock in at finalize.
- Unequipping a move never destroys it — it returns to the owned pool. No destructive actions anywhere in this system.
- Slots are **build-agnostic**: any owned move can go in any slot (no "slot type" restriction) — keeps the UI and rules simple, per YAGNI.

## UI: Equip & Collection Screens

Decided via mockups; this is the layout the frontend should build against.

**Card art format.** Move art is a **portrait card** (2:3), painted TCG / splash-art (same style bible as the sponsor cards, composed tight and iconic for small display). Rarity is shown by a **colored frame + glow** (Common gray, Uncommon green, Rare blue, Legendary gold) — a CSS treatment around the art — never baked into the image. The move name is UI text, never in the art (garbled-text rule, same as sponsors).

**The tall card appears in only two places** — the moments you're admiring one move:
- The **drop reveal** (the flip/present moment when a move drops from training).
- The **detail view** (tap any move anywhere to bring up the full card + full effect text).

**Equipped slots** render as up to 3 **compact horizontal tiles** (small square art thumbnail + name + effect + an unequip ×). You see your active loadout and what each move does at a glance, without big cards eating the top of the screen.

**"Your Moves" collection** uses a **grid / list view toggle** that remembers the player's choice:
- **Grid (default)** — small square art icons, rarity by frame + corner dot, name underneath. Art-forward and dense (~6–7 per row), so a 20+ collection is a few rows, not endless scroll. Tap an icon → detail card.
- **List** — one row each: thumbnail + name + effect + rarity + Equip. For comparing effects at a glance, and the natural home for **sort/filter** (by rarity / type / equipped) once the collection grows.

Rationale: the tall painted card is the collectible payoff, so it's reserved for the reveal and detail; the functional screens stay compact so a growing collection never becomes a wall of posters to scroll through.

## 3. Move Taxonomy

Three effect types only, matching the brief's ask for "a small set": a passive modifier, a conditional proc, and one higher-impact signature type. This taxonomy is deliberately shaped to match what the engine can already express via the `sessionBonuses`-style pattern (see §7), so each type is a small, boundable addition rather than a new resolution paradigm.

### 3.1 Passive (flat, always-on modifier)
Fires every fight, no condition. Cheapest to implement (same shape as `GAME_PLAN_STUDY`'s "ALWAYS" trigger or the `SPARRING_GENERAL` all-stats bonus already in the engine).

- **Example — "Granite Jaw"** (defensive passive): flat chin-damage reduction. Common: −2% incoming strike damage. Legendary: −8%.
- **Example — "Heavy Hands"** (offensive passive): flat strike damage boost. Common: +2% strike damage. Legendary: +8%.

### 3.2 Conditional Proc (fires on a specific fight situation)
Reuses the existing trigger-condition vocabulary the engine already has (`OPPONENT_SHOOTS_TAKEDOWN`, `PLAYER_STAMINA_BELOW_70`, `PLAYER_TOP_POSITION`, `STRIKING_EXCHANGE`) rather than inventing new hooks — this is the single biggest cost-control lever in this spec (see §7).

- **Example — "Sprawl Instinct"**: when the opponent shoots a takedown, +X% sprawl success (same trigger as camp's Takedown Defence). Common: +5%. Legendary: +18%.
- **Example — "Guillotine Reflex"**: when caught in a takedown, +X% chance the round instead becomes a submission attempt *for you* (a bottom-guard escalation, reusing the ground-hold guard-sub math already in `resolveRound`'s `groundHold` branch). Common: +4%. Legendary: +15%.

### 3.3 Signature (one higher-impact effect, capped frequency)
Every fighter can have at most one *equipped* Signature move meaningfully change a fight, and only Rare+ moves are ever Signature-type (see §5) — this keeps the "big swing" contained to rarer drops without creating a stackable snowball.

- **Example — "The Finisher"**: once per fight, the first time the opponent's health drops below 25%, your strike damage against them for that round only is boosted by a flat, rarity-scaled amount (a bounded, one-shot version of the existing flash-KO check — it nudges the finish check, it doesn't guarantee a KO). Rare: +10% that round. Legendary: +20% that round.
- **Example — "Iron Recovery"**: once per fight, the first time your own health drops below 25%, your stamina drain is reduced by a rarity-scaled amount for the rest of the fight (a bounded version of Cardio Push, but self-triggered off a health threshold instead of a stamina one, and permanent-for-fight rather than per-round).

**Explicitly not included** (per the trimmed scope): no synergy moves that buff other equipped moves, no per-move state machines that persist across multiple fights, no moves that alter energy/cash/fame directly (that's the Shop/sponsor lane's job) — Special Moves only touch in-fight resolution math.

## 4. Acquisition & Drops

**Drop sources:** training sessions only — specifically **Sparring** (`sparring` in `consts/gameConstants.js` TRAINING_SESSIONS, and the gym-unique Rank-2 "sparring family" sessions: `strategic_sparring`, `championship_rounds`) — the sessions already flagged as the higher-stakes, all-stats, injury-risk training type. Bag work / footwork / kick drills / wrestling / clinch / BJJ / submission / film study do **not** drop moves — this keeps drops tied to the session type the game already treats as "the big one," and avoids turning every single training click into a loot roll (spam-click into a slot machine).

- **Base drop rate:** **4% per sparring-family session completed.** Reasoning: sparring already costs the most energy (8, vs 3–6 for others) and carries injury risk, so it's already the "expensive/risky" session — a low, non-guaranteed rate keeps a drop feeling like a genuine event without needing pity timers. At 4%, a player training a couple of sparring sessions a day will see roughly one move every 1–2 weeks early on, tapering as they rely on it less once slots fill — acceptable pacing for a small, flavor-forward system, not a grind requirement.
- **No pity timer, no guaranteed-after-N.** Per explicit scope cut. The 4% rate is deliberately visible in the Library (below) so players understand it's a bonus, not an expected reward path — avoids the "why hasn't it dropped yet" frustration a hidden low rate would cause.
- **Gym tier weights rarity, not the drop chance.** The 4% chance of *a drop happening* is constant regardless of gym; what changes is the rarity distribution *given* a drop occurs. This directly satisfies "better gyms give a higher chance of rarer moves" without a second layer of tunable variables (single knob = simpler to balance).
- **Which "gym tier" gates the table:** the GDD's existing specialty-gym ladder by `availableFrom` (Amateur / Regional Pro / National / GCS Contender, per `data/gyms.json`) plus the Community gym as its own free-tier floor — **not** the separate numeric `GYM_TIERS` (T1–T5) in `consts/gameConstants.js`, which is currently unused by the live gym system (`gymModel.js`/`gyms.json` key off `availableFrom` tier names, not T1-T5). Rarity weighting rides the same tier axis training already uses, so there's one mental model, not two.

> **AMENDMENT (2026-07-27) — My Camp drops are per-drill, not flat.** Everything above still describes the **gym** path, which is unchanged. The player-owned camp (GDD §6.8) shipped with a graded menu of drills instead of one sparring family, so the drop chance became a property of the drill rather than a global constant:
>
> | Camp session | Drop chance |
> |---|---|
> | Rank-1 / Rank-3 coach drills (pad work, drilling, film study, …) | **0%** |
> | Coach flagships (Live Championship Rounds, Grind-It-Out Rounds, Live Rolling) | **5%** |
> | Conditioning flagship (ships with the Conditioning coach) | **3%** |
> | Open Mat Sparring (coachless fallback) | **4%** — retained as the control, matching the gym rate |
>
> Reasoning: the flat 4% existed because the gym exposed exactly one "big" session. In the camp the flagship is already the expensive, injury-risky, facility-wearing click, so the loot roll rides it and the cheap safe drills are worth 0% — the drop rewards taking the hard session rather than spamming the cheapest one. Open Mat keeps 4% so camp and gym drop economies stay directly comparable while both systems coexist. Rarity weighting is unchanged and rides the camp's tier (Tier 1–2 → Amateur, Tier 3 → Regional Pro, Tier 4 → National) against the same §4.1 tables; ~~camp drops apply no pool bias~~ *(pool bias for coach flagships was introduced by the Camp Phase 1 amendment below)*.
>
> The "4% is visible in the Library" stance above was **superseded on 2026-07-08** — exact drop percentages are internal-only on every surface, gym and camp alike; the UI says *"a chance — more rounds, better odds"*. See GDD §26.3, the current source of truth.

> **AMENDMENT (2026-07-27, Camp Phase 1) — coach-flagship drops prefer the coach's own pool.** Supersedes the "no pool bias" clause of the amendment above (owner decision P1-C, Camp Phase 1 contract). When a **coach flagship** drill (Live Championship Rounds / Grind-It-Out Rounds / Live Rolling / Grueling Fitness Test) rolls a drop:
>
> 1. The **rarity is rolled first**, against the camp-tier table exactly as before — the bias never touches this step, so it can never grant a rarity the roll didn't earn.
> 2. The concrete move is then drawn from **that coach's own teach pool** — the exact moves listed on his card, already breadth-limited by his rarity (a Common coach knows one move), so the bias never pushes the player toward moves this coach can never teach — whenever the pool has at least one move available at the rolled rarity (`FLAGSHIP_POOL_BIAS = 1.0` in `consts/homeCampConfig.js` — "always prefer the pool when the rarity fits"). A legacy coach document with an empty stored pool falls back to his discipline's full pool.
> 3. When the rolled rarity has **no match in the coach's pool**, the draw **falls back to the whole catalog** — the drop is never swallowed.
>
> **Open Mat Sparring keeps bias 0** — whole catalog at 4%, the deliberate unbiased control that stays directly comparable to the gym path. **Gym drops are completely untouched.** Rationale: a drop from your striking coach's hardest session should feel authored by him, and the narrowed pool previews the Phase-2 teaching fantasy without changing drop *frequency* or *rarity* mathematics at all. Implemented as a `poolBias` parameter on `specialMovesService.rollCampMoveDrop` (rarity filtered first, biased set consulted second, catalog fallback) — no change to the drop-rate or rarity tables in this spec. GDD §26.3 carries the same rule.

> **AMENDMENT (2026-07-28, Camp Phase 2) — coach teaching is a second, DETERMINISTIC acquisition source.** Everything above governs *drops*, which are rolled. Teaching is not rolled at all: promoting a camp coach grants moves from his own frozen `teachPoolMoveIds` outright.
>
> | Coach rank reached | Pool slots granted (`TEACH_RANK_BY_SLOT`) |
> |---|---|
> | 2 | slot 0 |
> | 3 | *none* — Rank 3 is the permanent +5% XP node |
> | 4 | slots 1…n−1, **all at once** |
>
> Pool breadth is the rarity gate and is applied once at generation (`DOMAIN_TEACH_POOLS[domain].slice(0, TEACH_BREADTH_BY_RARITY[rarity])`), so no rarity check is needed at grant time: Common 1 move, Uncommon 2, Rare 3, Legendary the full domain pool. A **Common coach's Rank 4 therefore teaches nothing** — his single move arrived at Rank 2 — and pays out in the archetype perk instead.
>
> **Copy rarity** is `teachRarityFor(coachRarity, move.minRarity)`: the coach's own rarity, floored by the move's catalogue minimum. Never above him, never below the move's floor. This is the only channel where a player can *target* a Legendary copy rather than wait for one to roll, which is the point of paying a Legendary's wage.
>
> **Idempotency.** `resolveTeachGrants` filters against the coach's stored `taughtMoveIds` before anything is written, and `grantOrUpgrade` remains the single writer of `fighter.specialMovesOwned` — so a taught move and a dropped move produce the identical NEW / UPGRADE / DUPLICATE outcomes (§4.2), including the duplicate cash payout. Re-promoting a coach whose slots are already recorded grants nothing and moves no cash.
>
> **A coach migrated in at Rank 4 teaches nothing, permanently.** The gym→camp conversion writes nothing to the fighter by design, so a converted veteran arrives at max rank with an empty `taughtMoveIds` and no promotions left to spend. `buildTeachList` derives state from the coach's **rank** against each slot's requirement — not from pool position — and reports those slots as `unavailable`, so the UI says "missed" rather than advertising a rank he already holds. His Rank-4 archetype perk is settled separately by `POST …/claim-perk`.
>
> Gated by `CAMP_TEACH_CHANNEL` (default on). Gym drops and camp drops are untouched by this amendment. GDD §6.21 and §26.3 carry the same rules.

### 4.1 Example drop table by gym tier (weights sum to 100)

| Gym tier (by `availableFrom`) | Common | Uncommon | Rare | Legendary |
|---|---|---|---|---|
| Community (free gym) | 70 | 25 | 5 | 0 |
| Amateur specialty gyms | 60 | 30 | 9 | 1 |
| Regional Pro gyms | 45 | 35 | 17 | 3 |
| National gyms | 30 | 35 | 27 | 8 |
| GCS Contender (Elite Fight Academy) | 15 | 30 | 40 | 15 |

Reasoning: Legendary is unreachable at the free gym and vanishingly rare even at early paid gyms — it should feel like a genuine "my Elite Fight Academy membership paid off" moment, mirroring how the gym system already reserves its best XP multiplier (1.5×) and priciest membership (10,000/week) for the top tier. The curve is smooth (each tier roughly halves Common's share and doubles Rare+Legendary's share), consistent with the gym XP-multiplier progression's own smoothness (§6.3).

### 4.2 Duplicates

**Simplest sensible rule per the brief (explicitly not XP-conversion): a duplicate drop of a move you already own is discarded and converted to a small flat cash amount**, scaled by rarity, shown as a one-line toast ("Duplicate Check Hook — sold to the gym for $150"). This:
- Needs no new currency or conversion economy (unlike the cut XP-to-move-leveling idea).
- Gives the drop *some* value even on a dupe, so a bad-luck streak of dupes doesn't feel like a wasted roll.
- Reuses cash, an existing sink/reward already in every other system (fight purses, shop, gym fees) — no new balance surface.

| Rarity | Duplicate cash value |
|---|---|
| Common | 100 |
| Uncommon | 250 |
| Rare | 600 |
| Legendary | 1,500 |

(Reasoning for magnitudes: Common duplicate cash is trivial next to even an Amateur purse of 500 — it's a courtesy, not a grind path. Legendary duplicate cash (1,500) is a meaningful bonus roughly in line with a mid-tier Regional Pro purse (750) plus change, rewarding a player who already has bad luck twice on the rarest tier.)

## 5. Rarity

Four tiers — Common, Uncommon, Rare, Legendary. (The brief said "reuse a Common → Legendary ladder"; confirmed via search that **no rarity system currently exists anywhere in the codebase** — this is net-new, so the ladder below is the full definition, not a reuse of something pre-existing.)

| Rarity | Power meaning | Effect-type eligibility |
|---|---|---|
| Common | Small passive or small proc value (low end of each range in §3) | Passive, Conditional Proc only |
| Uncommon | ~1.75× a Common's value | Passive, Conditional Proc only |
| Rare | ~3× a Common's value; unlocks Signature-type drops | Passive, Conditional Proc, Signature |
| Legendary | ~4–5× a Common's value (high end of each range in §3) | Passive, Conditional Proc, Signature |

Gating Signature-type effects to Rare+ (rather than letting a Common roll be a Signature) is the key balance lever: it guarantees the "big" effect type can never flood the drop table at low gyms, and pairs naturally with §4.1's table (Community/Amateur gyms roll Signature-eligible rarities only 5–10% of the time).

**Gym-tier → rarity-ceiling mapping:** every tier can in principle roll any rarity (no hard ceiling/floor cutoffs, which would need extra "reroll if disallowed" logic) — the weighting in §4.1 alone is sufficient to make Legendary feel gym-gated without adding a second gating rule. This keeps the drop resolver a single weighted-random call.

## 6. Leveling

**Recommend cutting entirely for v1.** A move's rarity fixes its power for its lifetime; there is no per-move XP, no upgrade currency, no "level 1→5" track. Reasoning:
- The brief already cut duplicate→XP conversion, which was leveling's main feed mechanism — without it, a leveling system would need an entirely separate resource, which is exactly the kind of new economy YAGNI warns against.
- Keeping rarity as the *only* power axis means the drop table (§4.1) is the entire balancing surface — one lever, one place to tune, easy for the architect/dev to reason about and easy for `balanceSweep.js`-style tooling to sweep exhaustively.
- If a future pass wants progression-through-play here, the natural next step is re-introducing dupe→shard conversion (deferred, not designed here).

## 7. Fight Integration

This is the section the brief flagged as the biggest cost driver, and the grounding in `utils/fightResolution.js` / `consts/fightResolutionConfig.js` confirms it: **there is no generic hook/effect registry.** Camp session bonuses already work by building a `sessionBonuses` array of `{ bonusType, effectiveValue, triggerCondition, ... }` objects, but every consumer of that array is a **hand-written call site** inside `resolveRound()` — e.g. `triggerBonus(sessionBonuses, 'SPRAWL_SUCCESS')` is manually invoked at the exact line where a takedown-defense roll happens, `getBonusValue(sessionBonuses, 'OPPONENT_DAMAGE_REDUCTION')` is manually read before the striking-exchange damage calc, and so on. Adding a new `bonusType` today means writing a new conditional branch in `resolveRound`, not registering a plugin.

**Implication for Special Moves:** because §3's taxonomy was deliberately designed to reuse the *same* trigger vocabulary camp sessions already use (`OPPONENT_SHOOTS_TAKEDOWN`, `PLAYER_STAMINA_BELOW_70`, `PLAYER_TOP_POSITION`, `STRIKING_EXCHANGE`, `ALWAYS`), the cheapest honest path is:

1. **Build a second array, `moveBonuses`, shaped identically to `sessionBonuses`**, populated from the fighter's 3 equipped moves at fight-resolve time (both PvE fight resolve and, if in scope, PvP resolve — see §8).
2. **Extend the existing hand-written trigger call sites** in `resolveRound()` to also check `moveBonuses` alongside `sessionBonuses` wherever a matching `bonusType` already has a branch (e.g. the `SPRAWL_SUCCESS` branch already reads camp bonuses; it would also read move bonuses that declare the same `bonusType`). This is additive, bounded, line-level work per effect type — **not** a rewrite of `resolveRound`.
3. **Signature effects (§3.3) are the exception** — "first time health crosses 25%" is a *new* trigger condition the engine doesn't have today (existing triggers are per-round state checks, not crossed-threshold events). This requires a small amount of new state threaded through `resolveFight`'s per-round loop (a `hasFiredSignature` flag per fighter, checked once at the top of `resolveRound`) — still hand-wired, but it is new code, not a reuse of an existing branch.

**Effort framing (not a full refactor recommendation — see §12 phasing):** Passive effects (§3.1) are cheapest — most can be applied once, pre-fight, the same way `SPARRING_GENERAL`'s all-stats bonus is applied once before the round loop starts, needing zero new per-round branches. Conditional Procs (§3.2) each cost one new "also check moveBonuses here" line at an existing branch. Signature (§3.3) costs a genuinely new state flag and a new call site. None of this requires generalizing the bonus pattern into a full hook registry — that generalization (Phase-0 refactor option the brief raised) is **not recommended for v1**: it's strictly more work up front for a payoff (arbitrary future effect types) this trimmed scope doesn't need. Revisit the registry idea only if a future Special Moves expansion needs effect types that don't map onto any existing trigger.

## 8. PvE vs PvP

**Recommendation: PvE-only for v1.** Special Moves do not apply to Proving Ground (PvP) fights — neither as attacker nor defender, and are not part of the defense-gameplan configuration.

Reasoning, directly from the brief's flagged concern: PvP is explicitly tuned so a *correct gameplan* only moves win rate to ~51–57% against a Balanced mirror (§22.4, `consts/pvpConfig.js` comment: "gameplan is tuned to a modest swing, not a decider"). A Legendary Signature move stacked on top of that tuning — especially since Special Moves are **permanent and free to reroll-equip** while gameplans are already the PvP lane's one build lever — risks:
- **Pay-to-win-adjacent optics**: moves come from gym training, and better (paid) gyms roll better rarities (§4.1) — so a player who spends more real cash on gym membership gets a permanent PvP edge on top of the gameplan system, which the PvP design was explicitly built to avoid (small, skill/prep-based swings only).
- **Balance-surface multiplication**: every move effect that touches PvP-relevant math (strike damage, sprawl, sub chance) would need to be swept through `balanceSweep.js`/`stressTestBalance.js` **against every gameplan combination**, multiplying the existing style × gameplan matrix by up to 3 equipped-move slots × 4 rarities × N move types — a combinatorial balance burden the trimmed "keep it simple and shippable" scope shouldn't take on for v1.

**Tradeoff being made explicit:** this means Special Moves give zero benefit in the Proving Ground, which slightly undercuts the "fighter identity" fantasy in the one place players fight each other directly. If that's judged unacceptable later, the safer expansion path (not v1) is a flat, small, non-rarity-scaled PvP variant — e.g. every equipped move contributes a fixed +1% regardless of rarity in PvP only, decoupling "how good your gym is" from "how much PvP edge you get." That is an explicit **open question for the user** (§13), not a decision made here.

Because moves are PvE-only, the fight-resolution work in §7 only touches the PvE resolve path (`utils/fightResolution.js` as called from the PvE fight service) — the PvP fight service continues calling the same shared engine but simply never builds/passes a `moveBonuses` array (or passes an empty one), so the engine's core logic doesn't fork by mode.

## 9. Data Model

(High-level shape for the architect to formalize — not a schema.)

**New catalog (consts, not DB)** — `consts/specialMovesCatalog.js`, following the same pattern as `consts/sponsorCatalog.js`: a flat array/object of move definitions, each with an id, display name, rarity, effect type, effect payload (bonusType + value per rarity, or a rarity-keyed value table), flavor text, and art asset reference (painted card art, same asset convention as sponsor cards). This is static content, versioned in code, not player data.

**On the Fighter (`models/fighterModel.js`):**
- **Owned moves** — a list of move instances the fighter has drop-acquired, each referencing a catalog id (need an instance identity if any future feature wants to distinguish "which drop," but for v1 a simple `{ moveId, acquiredAt }` per owned copy is sufficient since duplicates are cashed out, not stacked — so ownership is really just a Set of catalog ids the fighter has ever kept).
- **Equipped moves** — an ordered list of up to 3 catalog ids (or slot-indexed), distinct from the owned list, validated against the fighter's slot-unlock tier (§2) at equip time.
- **Slot unlock state** — derivable from `promotionTier` (already on the fighter) exactly like camp slots and gym-tier gates already are — no new persisted "slots unlocked" field needed, mirroring how `CAMP_SLOT_CONFIG` keys off `promotionTier` live rather than a stored counter.

**No new top-level collection needed for the moves themselves** — the catalog is code (consts), and per-fighter ownership/equip state is a small addition to the existing fighter document, consistent with how `gymPerks`, `badgesEarned`, `inventory` etc. already live directly on `fighterModel.js` rather than in separate collections.

**Fight-resolve time:** the PvE fight-resolve call site needs to fetch the fighter's equipped move ids, look them up in the catalog, and build the `moveBonuses` array (§7) — this is service-layer work (likely alongside where `campService.buildSessionBonuses` is currently invoked), not a data model concern, but the architect should decide the exact function/file placement.

**Drop resolution:** training-session drop roll (§4) needs no new persisted state beyond "did this session drop a move" — it's a stateless weighted-random roll at training-resolve time in `services/trainingService.js`'s sparring-family branch, mirroring how the sparring injury roll already works in the same function (`rollForSparringInjury`) — same call-site pattern, new function.

## 10. Content Load

For the drop table and profile-collection fantasy to feel non-repetitive at launch:

- **~24–30 moves for v1**, distributed roughly: 10 Common, 8 Uncommon, 8 Rare, 4–6 Legendary — enough that a player who fills all 3 slots across a full career sees meaningful variety, but small enough to hand-author with real flavor text and painted art in one content pass (compare: the sponsor catalog currently ships with a modest, hand-authored offer count per tier — this should be similarly scoped, not procedurally generated).
- **Effect-type spread, not per-style/per-discipline exclusivity.** Do **not** gate moves by fighting style (e.g. "only Wrestlers can equip takedown-defense moves") — that would reintroduce a build-lock-in flavor close to the cut "switch style and lose your moves" idea, and the game's own stat/style system (primary/secondary weighting) already handles style identity. Instead, spread the 24–30 moves across the taxonomy: roughly 40% Passive, 40% Conditional Proc, 20% Signature (Signature only exists at Rare/Legendary per §5, so this ratio naturally follows from rarity distribution, not a separate quota).
- **Proc-trigger coverage**: since Conditional Procs reuse existing trigger conditions (§7), aim for at least one move per existing trigger type (`OPPONENT_SHOOTS_TAKEDOWN`, `OPPONENT_ATTEMPTS_SUBMISSION`, `STRIKING_EXCHANGE`, `PLAYER_STAMINA_BELOW_70`, `PLAYER_TOP_POSITION`) at 2–3 rarity tiers each — this reuses camp's existing trigger surface fully rather than picking a narrow subset, giving strikers, grapplers, and all-rounders each something relevant without inventing new triggers.

## 11. Balance Guardrails

- **PvE-only (§8) already removes the highest-risk surface** (PvP win-rate tuning) from this feature's blast radius.
- **Reuse `scripts/balanceSweep.js` and `scripts/stressTestBalance.js`**: both already drive the real fight engine (`utils/fightResolution.js`) across styles/gameplans via Monte-Carlo. Extend the sweep to also equip a synthetic `moveBonuses` array (one move at a time, then a full 3-slot Legendary loadout) and compare win-rate deltas the same way the existing sweep compares style/gameplan deltas — this is additive to the existing tooling, not a new tool.
- **Guardrail target**: a full 3-slot Legendary loadout should move a same-OVR mirror matchup win rate by a **similarly small margin to a PvP gameplan** (roughly 5–10 points, i.e. comparable order of magnitude to the ~51–57% PvP gameplan swing) — even though this is PvE where the stakes are lower (no ladder economy on the line), keeping the swing modest preserves "stats and camp prep are what wins fights," with moves as a flavorful edge, not a replacement power system.
- **Passive stat-modifier moves must be capped low enough that they can't out-value a full camp** — camp's own biggest single bonus is Body Shot Focus at +30% (conditional, single-session), and Sparring's unconditional +3% all-stats is the ceiling for "always-on, no condition." A Legendary passive move should stay well under camp's best conditional bonus (§3.1 proposes 8% ceiling for passives — well below Body Shot Focus's 30% and Striking Accuracy's 15%, since it's *always on* with no matching/diminishing-returns cost the way camp sessions have).
- **No stacking multiplication risk**: because only 3 moves are ever equipped and duplicates are cashed out rather than stacked (§4.2), there is a hard ceiling on total move power per fighter — the sweep only ever needs to test "worst-case 3-Legendary-Signature-and-Proc loadout," a bounded, enumerable worst case rather than an open-ended one.

## 12. Phased Rollout

**Phase 1 (v1 / MVP) — ships the whole trimmed feature as scoped above:**
- Catalog authoring (24–30 moves, art, flavor) — **L** (content-heavy, painted art per move is the long pole, not code)
- Fighter data model additions (owned/equipped moves, slot-unlock-by-tier) — **S**
- Drop roll wired into sparring-family training sessions (`services/trainingService.js`) + duplicate-cashout — **S**
- Equip/unequip UI + slot gating + move-collection/profile display (reusing sponsor-card visual treatment) — **M**
- Fight-engine integration: Passive + Conditional Proc types wired into `resolveRound` via `moveBonuses` (extends existing hand-written branches) — **M**
- Signature-type engine work (new "first threshold crossed" state) — **M** (isolated from the above, but genuinely new engine state, not a reuse)
- Balance sweep extension (§11) — **S**
- GDD + Library + changelog updates — **S** (mandatory per project process, not optional)

Overall: this is a **realistic multi-week, multi-PR build**, not a single pass — the content authoring (art + flavor for ~30 moves) and the engine integration (touching `resolveRound`'s hand-written branches across ~5 trigger types plus new Signature state) are the two genuine cost centers, independent of each other and parallelizable.

**Deferred (explicitly out of v1, no design owed yet):**
- PvP applicability (flagged as an open question, §8/§13)
- Any leveling/upgrade path for owned moves (§6)
- Dupe-to-shard/crafting economy
- Style-gated or synergy moves (cut per brief)
- ~~Expanding drop sources beyond sparring-family sessions~~ — **shipped 2026-07-27/28**: the camp's per-drill drop odds and the coach teach channel (§4 amendments). Note the teach channel is not a *drop* source at all: it is deterministic, which is what makes a Legendary coach's wage worth paying.
- A generalized effect/hook registry refactor of the fight engine (only worth it if a future expansion needs effect types this taxonomy can't express)

## 13. Open Questions

1. **PvP stance confirmation** — this doc recommends PvE-only (§8). If the user wants *some* PvP presence, the flat-small-bonus-regardless-of-rarity variant sketched in §8 needs its own numeric pass and its own balance-sweep extension before it can ship — that's a real decision point, not an inference.
2. **Where exactly does the drop-roll toast surface?** Training already returns a rich per-session result payload (`services/trainingService.js`'s `doTraining` return shape) — does a move drop piggyback on that response, or does it need its own notification channel (like the existing Training toast stack mentioned in the GDD's app-layout section, §1)? This is a frontend/architect UX call, not a design call, but flagging it since it affects the contract shape.
3. **Card art production pipeline** — the brief locks the art *style* (painted splash-art, sponsor-card treatment) but doesn't specify who produces ~24–30 pieces of bespoke art or the timeline; that's a production/scheduling question outside this doc's scope but it gates Phase 1 completion in practice.
4. **Exact move roster (which 24–30 moves, exact names/flavor)** — this doc specifies the taxonomy, rarity scaling, and trigger-coverage requirements (§10) but not the literal content list. Recommend a follow-up content pass (could be a second, focused design doc) once this mechanical spec is approved, so naming/flavor doesn't block the architect from starting on data model + engine work now.
5. **Duplicate cash values (§4.2) and drop rate (4%, §4)** are reasoned estimates grounded in existing purse/session-cost scales, not values pulled from an existing balance table (none exists for this system) — worth a sanity check against actual early-game econ pacing once implemented, via the same balance-sweep-style validation used elsewhere, before considering them final.

---

## Files grounded against (for the architect)

- `docs/GDD.md` (§5 tiers, §6 gyms, §9 camp, §22.4 PvP gameplans)
- `consts/gameConstants.js` (GYM_TIERS T1–T5 — confirmed unused by live gym flow; TRAINING_SESSIONS; PROMOTION_TIERS)
- `models/gymModel.js`, `data/gyms.json` (live gym tier axis is `availableFrom`, not T1–T5)
- `services/trainingService.js` (sparring injury-roll call site as the drop-roll precedent)
- `consts/campConfig.js`, `services/campService.js` (`SESSION_BONUSES`/`sessionBonuses` array pattern — the closest existing proc precedent)
- `utils/fightResolution.js`, `consts/fightResolutionConfig.js` (hardcoded if-branch reality: `triggerBonus`/`getBonusValue` called per `bonusType` at specific lines in `resolveRound`)
- `models/fighterModel.js` (where owned/equipped moves would live, alongside `gymPerks`, `inventory`, `badgesEarned`)
- `consts/pvpConfig.js` (GAMEPLAN_WEIGHTS, 51–57% balance tuning)
- `consts/sponsorCatalog.js` (catalog-as-consts pattern to mirror for the move catalog)
- `scripts/balanceSweep.js`, `scripts/stressTestBalance.js` (existing Monte-Carlo sweep tooling to extend, not replace)
- Confirmed via grep for `rarity`: **no existing rarity system in the codebase** — this spec's rarity ladder is net-new.
