# Special Moves Catalog view (design spec, 2026-09-26)

Status: BUILT 2026-09-26 (code on `feature/more-special-moves`). Companion to `docs/special-moves-v2-spec.md`
and GDD §26. Presentation-only feature: adds zero new rates, costs, thresholds or
fighter fields.

## 1. Goal

Players can only discover the moves they do not own by accident (a coach card's
teach chips, or the Library's discipline table with no values or paths). The
Catalog turns the 24-move roster into a legible collection: every move, its full
rarity ladder, whether you own it and at what rarity, and a concrete path to get
it (which coach teaches it and at what rank, and which sessions can drop it).
Gyms are retired: the gym sparring drop path is NOT shown anywhere.

## 2. Where it lives

A segmented sub-tab at the top of the Special Moves tab: **My Moves** (default,
unchanged: equipped slots + owned grid/list) and **Catalog** (new, read-only).
Persist the last chosen mode in `localStorage` the way the Grid/List toggle is.
Functional screen stays compact; the tall card is reserved for the detail modal.

## 3. What the Catalog shows per move

- Name (post-v2.2 display name), Type (Passive / Proc / Signature), Discipline
  (Striking / Wrestling / BJJ / Conditioning, derived from `DOMAIN_TEACH_POOLS`).
- Rarity ladder: the value at every rarity the move exists at, as Rating (x1000,
  existing presentation contract) with the per-bonusType unit word. Signatures
  show empty Common/Uncommon cells (dense from minRarity, never padded).
- Owned state: the player's best-pulled rarity highlighted on the ladder, or a
  "Not owned" tag. Unowned tiles render dimmed / locked using the existing
  `MoveArt` rarity-frame mechanism (no new art).
- "How to get it" block, always shown (upgrading a Common to Legendary is as live
  a goal as the first copy):
  - Teaching line, derived from the move's index `i` in its `DOMAIN_TEACH_POOLS`
    array: minimum coach rarity that can ever teach it = lowest rarity R with
    `TEACH_BREADTH_BY_RARITY[R] > i` (index 0 Common, 1 Uncommon, 2 Rare, 3+
    Legendary); rank at handoff = `TEACH_RANK_BY_SLOT[i]` (slot 0 Rank 2, all
    others Rank 4). Computed once from consts, never hand-authored.
  - Training line: that discipline's coach flagship session (pool-biased) and
    Open Mat Sparring (unbiased fallback). Never a percentage.
- Tapping a tile opens the existing `MoveDetailModal`, extended with the
  discipline chip and the "How to get it" block; equip controls are omitted for
  unowned moves and shown alongside the block for owned ones.

## 4. Player-facing copy (no em dashes)

`{Discipline}` is `COACH_ARCHETYPES[domain].label` verbatim.
- slot 0: "Taught by a {Discipline}: any rarity, at Rank 2."
- slot 1: "Taught by an Uncommon-or-better {Discipline}, at Rank 4."
- slot 2: "Taught by a Rare-or-better {Discipline}, at Rank 4."
- slot 3+: "Legendary {Discipline} only, at Rank 4."
- Training line (every move): "Also drops from the flagship session of any
  {Discipline} who knows it, and from Open Mat Sparring: a chance, more rounds,
  better odds. Your camp's tier decides how rare a drop can be, not how often one
  happens."
  Decision record (architect finding D1, 2026-09-26): the first draft said "drops
  from your {Discipline}'s flagship session", which is false for every move past
  slot 0. A coach flagship rolls only from that coach's own stored `teachPoolMoveIds`
  (`homeCampTrainingService` passes the pool with `FLAGSHIP_POOL_BIAS` 1.0 and
  `rollCampMoveDrop` never leaves a non-empty pool), so a Rare Striking Coach's
  flagship can never drop Overhand Right. Only Open Mat Sparring is catalog-wide.
  The shipped wording is true for every move, coach vintage and flag state.
- If `CAMP_TEACH_CHANNEL` is off: teaching line becomes "Not currently teachable.
  Train for it instead."

Nuance the UI must not blur: the coach-rarity gate on TEACHING is independent of
the catalog `minRarity` on DROPPING (a Rare-min Signature can drop at Rare from
training while its teach slot needs a Legendary coach).

## 5. Filters and sorting (client-side, 24 items)

Discipline (All / Striking / Wrestling / BJJ / Conditioning), Type (All / Passive
/ Proc / Signature), Ownership (All / Owned / Not owned). Default order:
Discipline, then Type (Passive, Proc, Signature), then catalog order, matching the
Library's discipline table.

## 6. Per-move acquisition table (derived, for reference)

| Discipline | Move | Type | Catalog min | Slot | Min coach rarity | Rank |
|---|---|---|---|---|---|---|
| Striking | Heavy Hands | Passive | Common | 0 | Common | 2 |
| Striking | Body Snatcher | Passive | Common | 1 | Uncommon | 4 |
| Striking | Dirty Boxing | Proc | Common | 2 | Rare | 4 |
| Striking | Overhand Right | Signature | Rare | 3 | Legendary | 4 |
| Striking | High Guard | Passive | Common | 4 | Legendary | 4 |
| Striking | Second Gear | Proc | Common | 5 | Legendary | 4 |
| Striking | Superman Punch | Signature | Rare | 6 | Legendary | 4 |
| Wrestling | Sprawl | Proc | Common | 0 | Common | 2 |
| Wrestling | Full Mount | Proc | Common | 1 | Uncommon | 4 |
| Wrestling | Crucifix | Signature | Rare | 2 | Rare | 4 |
| Wrestling | Double-Leg Precision | Passive | Common | 3 | Legendary | 4 |
| Wrestling | Top Control | Proc | Common | 4 | Legendary | 4 |
| Wrestling | Blast Double | Signature | Rare | 5 | Legendary | 4 |
| BJJ | Hip Escape | Proc | Common | 0 | Common | 2 |
| BJJ | Veteran IQ | Passive | Common | 1 | Uncommon | 4 |
| BJJ | Rubber Guard | Signature | Rare | 2 | Rare | 4 |
| BJJ | Frame & Base | Passive | Common | 3 | Legendary | 4 |
| BJJ | Guillotine Choke | Proc | Common | 4 | Legendary | 4 |
| BJJ | Arm Triangle | Signature | Rare | 5 | Legendary | 4 |
| Conditioning | Granite Jaw | Passive | Common | 0 | Common | 2 |
| Conditioning | Second Wind | Proc | Common | 1 | Uncommon | 4 |
| Conditioning | Pace Pusher | Passive | Common | 2 | Rare | 4 |
| Conditioning | Deep Waters | Proc | Common | 3 | Legendary | 4 |
| Conditioning | Fighting Spirit | Proc | Common | 4 | Legendary | 4 |

## 7. Data needs

- `moveId -> domain` reverse lookup and `moveId -> { teachSlotIndex,
  minTeachCoachRarity, teachRank }`, both computed once at module load from
  `DOMAIN_TEACH_POOLS` / `TEACH_BREADTH_BY_RARITY` / `TEACH_RANK_BY_SLOT`.
- The full 24-move list for the player, each entry in the `buildMoveView` shape
  (unowned entries built with a null owned entry) plus the derived fields and the
  rarity ladder. Architect decides: a `catalog` field on `GET /fighters/:id/moves`
  or a separate endpoint.
- Ship the `CAMP_TEACH_CHANNEL` boolean in the response so the client does not
  guess.
- Rating shown is the base value; never persona (Ambush) adjusted, consistent with
  the existing detail modal.

## 8. Gating and impact

Available as soon as the Special Moves tab is (Amateur). Unlocks nothing; a read
layer over already-gated systems. Expected to make coach-market decisions more
purposeful ("only a Legendary Striking coach can ever teach Overhand Right").
PvE-only, no balance effect. Docs: Library `special-moves` article should point
players at the in-game Catalog for per-move values and paths; GDD §26 gets a
pointer; changelog entry. Fast-follow idea (not v1): coach-card teach chips deep
link into the Catalog detail.
