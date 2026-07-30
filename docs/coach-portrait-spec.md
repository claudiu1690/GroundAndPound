# Coach portrait spec

Production spec for the camp coach avatars. Locked 2026-07-29 after three test generations.

Read this before generating **any** further coach portraits — including a later top-up batch.
Consistency across the set is the whole problem; the pool only works if every face looks like
the same painter made it on the same day.

---

## 1. Why the pool exists at all

Coaches are procedurally generated. The name pool is 32 first × 32 last = **1,024 possible
names**, and the Trainer Market rolls fresh candidates every Monday forever, so a portrait per
coach is impossible. Instead: a fixed pool, assigned once per coach and frozen.

**Size: 10 per archetype, 40 total.** At Tier 4 the market shows 6 candidates across 4
disciplines capped at 2 per discipline, so **at least two disciplines are always doubled** —
that is where a repeated face gets noticed, side by side. Collision chance on a Tier-4 board:

| Portraits per archetype | Total | Repeat on a board |
|---|---|---|
| 4 | 16 | 44% |
| 6 | 24 | 31% |
| 8 | 32 | 23% |
| **10** | **40** | **19%** ← chosen |
| 16 | 64 | 12% |

10 is the knee of the curve. 8→10 buys 4 points; 10→16 buys 7 more for 24 extra images.

**Per-archetype pools, NOT one shared pool of 40.** Counterintuitive but the maths is clear:
per-archetype, a striking and a wrestling coach can never collide, so only the two doubled
disciplines can repeat (~19%). One shared pool of 40 lets any of the 15 pairs on a 6-card board
collide (~37%). Same image count, double the collision rate.

---

## 2. The locked prompt

Vary **only** the bracketed parts. Everything else is fixed.

```
Dark moody oil painting portrait, square. The head FILLS the frame — cropped close at the
temples, top of the skull near the upper edge, chin near the lower edge, almost no background
visible. A weathered [AGE] [ETHNICITY] MMA [DISCIPLINE] coach, [FEATURES], hard steady stare
straight at the viewer, facing square-on, both eyes clearly visible. The face is BRIGHTLY and
generously lit — a strong warm key light washing across the forehead, cheekbones and jaw so the
skin reads pale and luminous, with only the deepest creases left in shadow. Pure black
background, no haze, no fog. Thick expressive painterly brushstrokes, faint [RIM] rim light
tracing the jaw and ear. Gritty, cinematic, trading-card character art. No text, no letters, no
logos, no watermark.
```

Model `nano_banana_pro`, `aspect_ratio: "1:1"`, 1K. **No post-processing** — no crop, no gamma,
no levels. Resize to 512×512 and encode webp q85, nothing else.

### Variable axes

| Slot | Values |
|---|---|
| `[AGE]` | late-twenties / mid-thirties / early-forties / late-forties / mid-fifties / sixty-year-old |
| `[ETHNICITY]` | match the breadth of `data/coachNames.json` — Latin American, Slavic, West African, Japanese, Nordic, Italian, Irish, Central Asian, Anglo |
| `[DISCIPLINE]` | striking / wrestling / jiu-jitsu / strength-and-conditioning |
| `[FEATURES]` | pick 2–3: shaved head, greying stubble, full beard, broken nose, cauliflower ear, scar through the eyebrow, deep crow's feet, thick neck, close-cropped grey hair |
| `[RIM]` | **crimson** STRIKING · **cobalt blue** WRESTLING · **teal** BJJ · **amber gold** CONDITIONING |

**Age and ethnicity must NOT correlate with rarity or archetype.** Rarity is already carried by
the frame colour and the tag; if old faces skewed Legendary the portrait becomes a second,
redundant tell and players would misread a grizzled Common as a good hire. Pure flavour only.

**Do not try to match faces to names.** First and last names are drawn independently, so the
generator already produces "Kenji Brennan" and "Emeka Lindqvist". Matching a face to a name is
meaningless when the name is itself a random pairing. Assign portraits independently.

---

## 3. What the three test generations taught us

Kept here because each failure is easy to repeat.

**v1 — "three-quarter angle" + "stare slightly off-camera".** Compounded into a near-profile.
At 48px a turned head loses one eye and the far cheek falls into shadow, so it collapses into a
dark blob. **Always specify square-on and both eyes visible.**

**v2 — square-on but the head sat small in frame with heavy black around it.** Whole-image
median 20, *darker than the `#1a1a1a` tile it sits in* — it read as an empty bordered box at
48px. The face itself was fine (median 52). The problem was framing, not lighting.

**Post-processing was a dead end.** Every curve that lifted the face also lifted the background
(gamma 1.6 → face target met, but background 21→51, milky against the deep-black cards), and
every curve that protected the black crushed the face with it (the shadow side of the jaw lives
in the same tonal range as the backdrop). Brightness has to come from the *lighting
description*, not from exposure.

**Do not target the move cards' whole-image luminance (69/53).** That was a bad metric: a
splash-art card of a white-wrapped fist is inherently brighter than any portrait, and chasing it
is what pushed toward washing out the background. **The metrics that matter are face brightness
and fill ratio.** v3 measures face 106 / background corner 1 — bright subject, true black — and
needs no correction at all.

---

## 4. Files and wiring

Assets: `frontend/public/assets/camp/coaches/<archetype>-01..10.webp`, e.g.
`striking-01.webp`. Lowercase archetype.

**`portraitKey` is STAMPED AT GENERATION and stored on the coach subdoc.** Never derive it by
hashing `_id` at render time: that means `id % poolSize`, so adding an 11th portrait silently
reshuffles every existing coach's face. The schema already settles this principle for `name`
("computed once and STORED — a coach's name must never change under the player") and for
`hireFee` ("stored so a later rebalance can never rewrite history"). A portrait is identity;
it gets the same treatment.

Touch points:
- `models/homeCampModel.js` — add `portraitKey: { type: String, default: null }` to `coachSchema`.
- `services/homeCampCoachService.js` — stamp it in `createStarterCoach`.
- `services/homeCampMarketService.js` — stamp it in `generateCandidate` (both the market-roll and
  hire paths, same as `joinedAtRank`).
- `buildCoachView` — expose it.
- `StaffRow.jsx` / `CandidateCard.jsx` / `CoachPanel.jsx` — render the image, **keep initials as
  the fallback** when `portraitKey` is null or the asset 404s.

**Legacy coaches have no key.** Same conservative pattern as `joinedAtRank`: fall back to
initials rather than assigning one at read time, or backfill once with a script. Do not derive
on the fly.
