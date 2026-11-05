# Fight replay: Highlights with your cards

Design spec (game-designer step), 2026-11-04. Replaces the presentation of the v2.4 fight reveal
(`docs/first-session-spec.md` §2.2, GDD §10.0a). Approved mockup: `mockups/fight-reveal-highlights.html`
(owner: "the most nicely is A ... we need to highlight also the special cards when they are used.
also camp stuff"). Six alternatives considered: `mockups/fight-reveal-styles.html`.

Why: the v2.4 reveal plays every event as a sentence, 1.6 s each. The owner found it too fast to
read and boring when slowed. Wiki: Sports Management Games (match viewers at several levels,
always skippable), Game Feel and Juice (a heavy MMA hit wants hitstop, thud, camera kick). Inference:
reading pace is about 3.5 words a second, so a sentence needs 0.9 s plus 0.28 s per word.

Unchanged: the fight is resolved on the server before the reveal; this is presentation only.
Skip, 2x, Play fights out, spoiler rules, reload-lands-on-result, reduced motion, PvE only.

---

## 1. Layout (phone first, one column; desktop centres the same column)

Top to bottom:
1. **Top bar** (as v2.4): names, both damage bars, round + clock.
2. **Counters**: Strikes `you | opp` and Takedowns `landed/attempted` for each side, cumulative for the
   fight. They climb live as cards land (revised 2026-11-04; they used to jump to the round's totals at round start).
3. **Your corner**: a strip showing what the player brought.
   - Up to the player's equipped Special Moves as mini cards (painted art, rarity-coloured border),
     dimmed until they fire; when one fires it lights up with a glow and an `x1`, `x2` counter.
   - The camp sessions booked for this fight as chips, dimmed until they fire; a fired chip turns gold.
   - Nothing equipped and no camp: the strip shows one muted line, "No cards or camp for this fight".
4. **Round label** ("ROUND 2").
5. **Stage**: one highlight at a time.
6. **Skip to result** and **2x** as today.

## 2. Which moments play

Per round, in fight order, at most **4 highlights**:

| Moment | Source | Shown as | Hold (1x) |
|---|---|---|---|
| Special move fires (PROC or SIGNATURE), first time this fight | new `move_fired` event | **Card slam**: painted card (signature 168x250, proc 140x208 at phone width) with rarity border and glow, rarity tag, name, "Signature card" / "Proc card", then the trigger in words ("When they shoot a takedown") and one short line. Signature adds a flash + shake. | signature 2.6 s, proc 2.1 s, or reading time if longer |
| Same move fires again | `move_fired` | No slam: its corner card counter ticks and pulses | 0 (rides the next highlight) |
| Passive move (ALWAYS) | loadout | A pill near the top, "Heavy Hands · always on", once, with the round-1 counters; its corner card lights | 0 |
| Camp session fires | existing `camp_*_fired` | **Gold camp card**: "Camp paid off", session name, what it did, short line | 2.0 s or reading time |
| Opponent wildcard fires | existing `wildcard_fired` | **Red striped card**: "Their wildcard", short line | 2.0 s or reading time |
| Knockdown | `knockdown` | Highlight card + flash + shake | reading time |
| Takedown landed, submission attempt, big strike | existing events | Highlight card (blue for you, red for them): small "Name · 2:20", big word, short line | reading time |
| Finish | `finish` events | Highlight card + flash, then the finish card | 1.6 s |

Priority when a round has more than 4 candidates: finish, move first-fire, camp, wildcard,
knockdown, submission attempt, takedown, big strike. A camp and a move firing on the same exchange
(Takedown Defence + Sprawl) play back to back as a combo, camp first.

**Quiet round** (no candidates): one line, "A careful round. Nobody takes a risk." (or a variant),
1.6 s. Routine strikes never get a card: they only move the counters and the bars.

**Round end**: "Round 2: Tarek 10-9" / "Round 3: Even", 1.0 s.

Reading time = 900 ms + 280 ms per word. 2x halves every duration.

## 3. Finish card and "What fired"

The finish card (method, VICTORY / DEFEAT / DRAW, finish time or round tally) gains **What fired**:
one row per equipped move (art thumbnail, name, "Signature · the knockdown"-style sub line from its
type, `x2` or "didn't fire" dimmed) and one row per booked camp session ("paid off" or "didn't fire").
Skip goes to this finish card (not straight to the result) with the true totals; the card has
**See result** and moves on by itself after 4 s at 1x. Watching to the end does the same.

## 4. Short lines

Highlight cards use new short commentary (8 to 10 words), one set per template key that can become a
highlight (knockdown, takedown_secured, submission_attempt, submission_finish, ko/tko finishes,
strike_hurt as the big strike, ground_pound, camp_*_fired, wildcard_fired, move_fired by bonus type).
Two or three variants each, chosen by the existing seeded picker. The full report keeps the long
lines. Move lines name the card's effect in plain words ("Hips back. Stuffed flat." for Sprawl,
"He's hurt. The overhand lands." for Overhand Right).

## 5. Engine data needed

- `move_fired` events in the fight log: emitted when a PROC or SIGNATURE move entry's
  `triggerCount` rises during a round, with `vars.moveId` (every moveId of a merged entry), the round
  and a timestamp next to the exchange it affected where known, else spread inside the round.
  PASSIVE (ALWAYS) entries never emit events. Fight maths do not change.
- The reveal payload carries the **loadout snapshot**: equipped moves (id, name, rarity, effect type,
  trigger in words, art) and booked camp sessions (type, label, fired), plus per-move fired counts.
- The full report renders `move_fired` with a long line; PvP renders it or skips it gracefully.

## 6. Edge cases

- No moves equipped: no mini cards; camp only. Neither: the one-line corner.
- A move that fires 8 times: one slam, counter shows `x8`.
- A legacy fight without `move_fired` events: corner lights from the per-move fired counts at the
  finish card only; no slams.
- Reduced motion: no slam, glow pulse, shake or flash; cards fade in; pacing unchanged.
- Opponent cards (PvP later): out of scope for PvE.

## 6b. Revision after the owner's first play (2026-11-04)

"There's no text other than camp procs, no shots." Striking Accuracy fired every round, camp was a
highlight every time, and routine strikes never played. Now: every logged exchange of a round plays
as a smaller card (strike lines name the logged strike), up to 5 items per round with big moments
first; a camp session gets its gold card only on its first fire in the fight, later fires tick its
corner chip; a quiet line only when a round logged nothing showable.

## 7. Accuracy and one source of truth (owner requirement, 2026-11-04)

"Make sure that they are accurate and what we can see in that animation we can also see later on the
detailed fight description." Rules:

1. **One event list.** The replay and the detailed fight description (FightDescription / the
   breakdown, also opened later from the Career Feed) read the **same persisted `eventLog`**. The
   replay is a filtered, paced view of it; it never creates a moment the log does not contain.
2. **Everything shown is in the report.** Every highlight card, every move slam, every camp card and
   the wildcard card correspond to an event that also renders in the full report, in the same round,
   with the same time and the same actor. The report renders `move_fired` events (with the card's
   name and a CARD chip, like the existing CAMP chip) and the "What fired" summary also appears in the
   report (a "Your corner" block: each equipped move with its fired count, each camp session fired or
   not). Counters and round results come from the persisted `roundStats`, which the report also shows.
3. **Times are real or absent.** A `move_fired` event is attached to the logged exchange it modified
   (Sprawl to the opponent's takedown attempt, Overhand Right to the strike that landed, Full Mount to
   the ground-and-pound beat) and shares its timestamp. If the engine cannot tie it to a logged
   exchange, the event carries the round only and both views show it without a clock time. Never an
   invented time.
4. **Lines claim only what happened.** Short lines are written per outcome, not per type: a Sprawl
   line says "stuffed" only when the takedown failed; an Overhand Right line says "down" only when the
   same exchange was a knockdown. When the outcome is not known, the line names the card and its
   trigger ("Sprawl fires on his takedown attempt"). The wildcard line names the opponent's real
   wildcard area from the fight data, never an invented habit.
5. **Counts match.** Corner counters, "What fired" (replay finish card) and the report's "Your corner"
   block all use the engine's per-move `triggerCount` and the camp `triggered` flags. A move that fired
   without a logged moment (rule 3 fallback) still counts.
6. **Passive pill only if real.** The "always on" pill shows only when that passive's `triggered` is
   true for this fight.
7. **Tests.** A test resolves seeded fights and asserts that every replay item maps to an `eventLog`
   entry that FightDescription renders, and that the three counts in rule 5 are equal.

## 8. Docs on build

GDD §10.0a (replace layout/beats), Library "The Fight Summary" (replay paragraph), changelog: append
to the unreleased 2.4 entry (not a new version).

## 6c. Hits, finish moment and decision scorecard (owner, 2026-11-04)

Owner asked for "hits that land", the finish moment, and on decisions "the score cards per round and
show who won under it" instead of an announcer. No sound (owner: "NO SOUNDS"). Built as GDD §10.0a
"Hits that land", "Finish moment" and "Decision scorecard". Accuracy rules kept: health still lands on
the saved per-round values; the stoppage names no winner; the scorecard uses the same round scores
as the report (the only card the engine saves).

Found while building: debut opponents (STR/SPD/LEG 7) deal zero striking damage to a starting fighter
(their attack minus the player's chin is below zero), so a debut decision ends at full health, and
low-level fights lose about 2 to 4 health per round (one exchange per round). Balance decision
pending with the owner.
