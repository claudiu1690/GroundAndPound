# Special moves: the ready glow

Design spec (game-designer step), 2026-11-04. Owner asked for it after seeing moves fire in the
replay ("i hope they will appear on the screen when they trigger"). Builds on the Highlights replay
(`docs/fight-replay-highlights-spec.md`, GDD §10.0a). BUILT on develop 2026-11-04 (v2.4, uncommitted); GDD §26.5a.

## 1. Goal

Today a move card in Your corner sits dim until the moment it fires, then slams in. The player
cannot tell a move that is about to matter from one that never will. The ready glow lights a card
the moment its condition is met, so the player watches it through the fight and waits for it to
go off.

Wiki applied: 2D Animation Principles (anticipation: a long wind-up telegraphs, which is what a
wait-for-it card wants), Feedback and Microinteractions (scale feedback to importance times rarity;
persist important feedback so a player who looked away can still read it), Game Feel and Juice
(redundant feedback that repeats what is already true). Inference: the glow turns "what fired" from
a surprise into a payoff the player saw coming, and the "never ready" reasons teach loadout choice,
which is the decision Special Moves are about.

Unchanged: fight maths, the engine, what fires and when. This is presentation of numbers the fight
already saves. PvE only (PvP has no moves).

## 2. Which moves can glow (v1)

A move glows only when its trigger is a **state the saved fight data shows exactly**. The engine
reads health and stamina gates at **round start**, before that round's stamina drain, so round n's
gate uses the values the fighters ended round n-1 with (`roundStats` health and stamina), or
`healthStart` / `staminaStart` for round 1.

| Move | Trigger | Ready when (exact engine gate) | Window | Fires |
|---|---|---|---|---|
| Overhand Right (signature) | OPPONENT_HEALTH_BELOW_75 | he starts a round under 75 health | from that round until it fires | once, on the first striking exchange after |
| Crossface (signature) | OPPONENT_HEALTH_BELOW_50 | he starts a round under 50 health | from that round to the end | each time it changes an escape roll while you are on top |
| Superman Punch (signature) | ROUND_ONE | round 1 | round 1 only | once, round 1 striking exchange |
| Fighting Spirit (proc) | PLAYER_HEALTH_BELOW_75 | you start a round under 75 health | that round only, re-checked each round | on a striking exchange, or a ground hit you take from the bottom, while open |
| Second Wind (proc) | PLAYER_STAMINA_BELOW_70 | you start a round under 70 stamina | that round only | same round (it always fires when open) |
| Second Gear (proc) | OPPONENT_STAMINA_BELOW_70 | he starts a round under 70 stamina | that round only | in that round's striking exchange |
| Deep Waters (proc) | LATE_ROUNDS | rounds 4 and 5 of 5 (back half of the scheduled fight) | those rounds | in their striking exchanges |

**Not in v1:**
- **Reactive triggers** fire on the event itself, so there is no "about to" state to show: Sprawl,
  Hip Escape, Dirty Boxing, Guillotine Choke, Blast Double, Arm Triangle. They stay as today: dim
  until they fire.
- **Position triggers** (Full Mount, Top Control, Rubber Guard): the fight log does not save who
  was on top at each round start, so a glow could be wrong. Phase 2 (§8).
- **Passives**: always on; they keep the existing "always on" pill.

## 3. Card states in Your corner

| State | Look | When |
|---|---|---|
| Idle | dim (as today) | not ready, not fired |
| Ready | full brightness, gold ring pulsing (1.2 s loop), a small **READY** tab above the card | the window is open and the move has not fired in it |
| Fired | lit with `x{n}` (as today) | after a fire. A per-round proc that is open and has fired this round shows lit plus a still ring |
| Spent | lit, no ring | a one-shot signature after it fired |
| Missed | ring fades out over 0.4 s, back to idle | a window closed without a fire (Superman Punch after a round 1 with no striking exchange; a per-round proc whose round ended unfired) |

When a ready card fires, the ring bursts outward (0.3 s) as the existing slam plays, so the slam
reads as the payoff of the glow.

## 4. The moment it turns on

- At the **round start** item of the round its window opens (the engine checked it then too), the
  card's ring sweeps in over 0.5 s.
- One feed row under the stage, with a gold **READY** chip: "Overhand Right is ready: he started
  round 3 on 68 health." The row is derived from saved numbers, not an `eventLog` moment, so the
  report shows the same line (§6). This extends accuracy rule 1 of the replay spec: derived states
  are allowed when both views compute them from the same saved data with one shared function.
- Your fighter panel shows a small gold chip under the stats, "READY: Overhand Right", while any
  move is ready. On phones the corner cards are small; the chip carries the name where it can be
  read. Several ready at once: "READY: Overhand Right, Second Gear".
- No hold time is added to the replay: the turn-on rides the round start item. Skip and 2x behave
  as today.

**Stamina display note.** During a round the stamina bar shows that round's value after the drain.
A gate reads the value before it, so the bar can show 66 while Second Gear is not ready (he started
the round on 72). The READY line always names the number the engine used ("he started round 3 on
68"), so the two never contradict each other in words.

## 5. Copy (player-facing, no em dashes)

Ready lines (feed row and report):

| Trigger | Line |
|---|---|
| OPPONENT_HEALTH_BELOW_75 | "{move} is ready: he started round {n} on {hp} health." |
| OPPONENT_HEALTH_BELOW_50 | "{move} is ready: he started round {n} on {hp} health." |
| PLAYER_HEALTH_BELOW_75 | "{move} is ready: you started round {n} on {hp} health." |
| PLAYER_STAMINA_BELOW_70 | "{move} is ready: you started round {n} on {sta} stamina." |
| OPPONENT_STAMINA_BELOW_70 | "{move} is ready: he started round {n} on {sta} stamina." |
| LATE_ROUNDS | "{move} is ready: the late rounds." |
| ROUND_ONE | "{move} is ready: round 1." |

"Didn't fire" reasons (finish card What fired, report Your corner):

| Case | Line |
|---|---|
| Never ready, health trigger | "Never ready: he never started a round under {75/50} health." / "you never started a round under 75." |
| Never ready, stamina trigger | "Never ready: {he/you} never started a round under 70 stamina." |
| Never ready, late rounds | "Never ready: the fight ended in round {n}." |
| Ready, never fired (Overhand Right, Second Gear, Deep Waters, Superman Punch) | "Ready from round {n}, but no striking exchange came after." |
| Ready, never fired (Crossface) | "Ready from round {n}, but you never held top position after." |
| Ready, never fired (Fighting Spirit) | "Ready in round {n}, but no striking exchange or ground shot on you came while it was open." (engine: it counts as fired on any striking exchange, and on any ground hit you take from the bottom, while open; checked 2026-11-04) |

Reasons that need a fact the log does not hold are not shown; the row keeps today's "didn't fire".

## 6. Same in the report (owner rule)

The detailed fight description's **Your corner** block gains the same lines: under each move, its
ready line ("Ready from round 3: he started it on 68 health") and, if it never fired, the reason.
The replay finish card's What fired rows show the same reason under "didn't fire". One shared pure
function produces every line for both views.

## 7. Data and build notes

- **No engine change in v1.** Inputs, all already on the breakdown view: `healthStart`,
  `rounds[].health`, `staminaStart`, `rounds[].stamina`, `loadout.moves[]` (`triggerCondition`,
  `effectType`, `firedCount`), and the `move_fired` events (fired round and time).
- **Scheduled rounds.** LATE_ROUNDS depends on the scheduled length, not rounds fought. PvE always
  schedules 5 today (`FIGHT_CFG.defaults.maxRounds`); add `breakdown.scheduledRounds` at resolve
  (additive, display-only) so a future 3-round fight cannot be shown wrong, falling back to 5.
- **Shared helper** `frontend/src/components/fights/moveReadiness.js`, pure:
  `moveReadiness(view) -> { [moveId]: { windows: [{ fromRound, toRound, value, who }], firstReadyRound, firedRounds, reasonKey, vars } }`.
  Used by `revealModel.js` (adds `ready: [moveId]` to each item's corner state), the report's
  `YourCorner.jsx`, and `FinishCard.jsx`.
- **Older fights** without saved health or stamina: health and stamina triggers show no glow and no
  reason; ROUND_ONE and LATE_ROUNDS still work (round numbers are always known).
- **Reduced motion:** ring is static, no pulse, sweep or burst; the READY tab, chip and lines stay.
- **Phone:** the READY tab sits above the 30 px mini card; the panel chip carries the name.

## 8. Phase 2 (needs a small engine-side save)

Save each round's starting position in the breakdown (`roundStats.positionStart`: top, bottom or
standing; the engine already carries `groundPosition` between rounds as a pure value, display only,
no RNG). Then Full Mount and Top Control can glow while you start a round on top, and Rubber Guard
the first time you start one on your back. Mid-round position changes (a takedown landing) would
still only show when the card fires. Golden fixture must stay byte-identical.

## 9. Tests

- Unit: `moveReadiness` per trigger with fixtures for ready, never ready, ready-not-fired, older
  fights with no health or stamina.
- Accuracy sweep (extends `tests/integration/fightReplayConsistency.test.js`): resolve seeded fights
  with each v1 move equipped. Every fire of a state-gated move must fall inside a window the helper
  reports (a fire outside a window means the helper is wrong); a move the helper calls "never
  ready" must have `firedCount` 0; replay and report produce identical lines.
- e2e: a fight with Overhand Right equipped shows the READY tab and the feed line before its slam,
  and the report shows the same ready line.

## 10. Metrics to watch

- Share of fights with a move that was ready but did not fire (if very high, players will read the
  glow as a tease; see §11).
- Special Moves screen visits and equip changes within a day after a fight with a "Never ready"
  reason (does the reason teach loadout choice?).
- Replay watched to the end rate before and after (the glow should hold attention).

## 11. Ethics check

Moves are earned through camp and coaches, never bought, so a "ready but didn't fire" line is not a
near miss pushing a purchase (Reward Schedules flags near-miss presentation tied to spending). Rule
for the build: no ready or reason line ever links to the Shop or to anything paid.

## 12. Decisions (owner left all three to the designer, 2026-11-04)

1. The READY feed row: **shown**, alongside the glow and the panel chip.
2. "Didn't fire" reasons: **in v1**, on the finish card and in the report.
3. Position moves (Full Mount, Top Control, Rubber Guard): **after v1**, as phase 2 (§8).
