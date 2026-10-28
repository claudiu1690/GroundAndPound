# Shop redesign: "Premium up front, then quiet" (A1 / A2 / A3)

Design spec, build-feature step 1 (game-designer), 2026-10-28. Approved design:
`mockups/shop-redesigns.html`, section A, screens A1 to A3 (B and C ignored). Checked against GDD §4,
§5, §6.12, §9.2, §15, §16, §17 to §18, §22, §24 and the shop, energy, fight, sponsorship, PvP, camp
and account services.

House rules respected: §15.3.2 untouched, server sets the price, nothing that alters a fight result
is sold for money, the Hospital stays free of any sell. No em or en dashes in any player string.

Two owner-confirmable defaults taken so the pipeline can proceed: existing players see the full
panel once at release (no backfill), and "Use one" in the offer restores energy without auto-retrying
the failed action.

---

## 1. Goal

Today the Premium tab is a permanent, equally weighted destination with a gold "Most Popular" flag.
Players who will never pay see a sales floor every visit; players who would pay are never asked at the
one moment it would help them (when an action fails for lack of energy).

1. **Show premium fully once, then make it quiet.** Full bundle panel on the fighter's first Shop
   visit (and once more after a guest secures the account, the moment buying becomes possible). Every
   later visit it is one line with "See bundles".
2. **Put the free path inside the paid panel.** The panel shows the player's real progress toward the
   next free drink (§15.2: drinks are the "earn it through achievement" channel).
3. **Offer at the moment of need, free and Cash first.** When an in-scope action fails for lack of
   energy, an inline offer where it failed lists: wait (free), Energy Shot (Cash), Energy Drink (owned,
   or bundles). Nothing on login, nothing counts down.

Pacing unchanged: no cost, grant, regen rate or price moves.

---

## 2. Mechanics

### 2.1 Shop layout (all visits)

- Header (Store / Shop) plus a wallet strip: **Cash N** and **Energy Drinks N** (the drinks chip is a
  button that expands the bundle panel).
- **Bundle area** above the tabs, in mode `full` (A1) or `collapsed` (A2), decided by the server
  (2.2) and sent in the catalog payload.
- **Tabs: "Cash store" and "My inventory".** The old Premium tab is removed.
- **Cash store shelves:** "Energy" (Energy Shot only; the Energy Drink card with "Get More" is
  removed), "XP boosters, one at a time" (7), "Pre-fight supplements, next fight only" (7). Every card
  gets its painted art (6). Prices, effects and the "Not enough cash" / "Locked" states unchanged.
- **My inventory** and `InventorySidebar.jsx` unchanged.

### 2.2 A1 / A2 state

**Per fighter, stored on the server** (the purchase target and drinks are the fighter's; one-time UI
flags already live on the fighter; works across devices and survives cleared storage).

- `premiumPanelSeen` (boolean, default false): the full panel has been shown.
- `premiumPanelReshowPending` (boolean, default false): a one-time reshow is owed.

**First Shop visit** = the first time the Shop renders a loaded catalog while `premiumPanelSeen` is
false. The client marks it seen with a fire-and-forget idempotent call once the full panel has
rendered. If the call fails, the panel shows in full again next visit.

**Reshow after a guest secures the account:** `claimAccount` sets `premiumPanelReshowPending = true`
on the account's fighter(s). Next Shop visit shows the full panel with the eyebrow "Account secured.
Bundles are available now."; the same seen call clears the flag. At most once per claim.

**Existing fighters at release:** flags default false, so every current player sees A1 once. No
backfill.

**Mode (server, catalog payload):** `full` / `first_visit` when not seen; `full` / `account_secured`
when reshow pending; otherwise `collapsed`.

**Transient expansions (client only, never change the flags):** "See bundles" or the Energy Drinks
chip; returning from Stripe (`?purchase=success|cancelled`, today this switches to the Premium tab);
"See bundles" from the A3 offer. **A2 does not remember being expanded.**

### 2.3 The full panel (A1) and the collapsed bar (A2)

A1, top to bottom:
1. Eyebrow "Premium. Energy Drinks" (plus "Account secured. Bundles are available now." on reshow).
2. Title "Skip the wait when it matters". Body "Each drink is +50 energy, one time. Real money, paid
   securely through Stripe."
3. Free-earn progress line (2.5).
4. The four `PREMIUM_BUNDLES` with per-drink price; savings **vs the 6 pack** on the three larger
   ones (20%, 40%, 52%, from `amountCents` as `BundleCard` does today). One neutral flag **"Our pick"**
   on the 15 pack (existing `popular: true`). No gold "Best value" anywhere (the booster "Best Value"
   tag on Full Camp Stack is dropped too).
5. Buy buttons keep the three modes `buy` / `guest` ("Secure your account to buy") / `disabled`.
   Existing notices (guest, disabled, redirecting, over-cap, checkout error) stay, under the free-earn
   line.
6. Trust line "Secure checkout by Stripe. Your card never touches the game."
7. When the player expanded it from the bar, a small "Hide" folds it back.

A2 bar: one line; small can art, "Energy Drinks" plus muted "N owned. +50 energy each. <hint>" (the
single highest-priority free-earn hint, 2.5); right: "See bundles" (expands in place).

### 2.4 A3: the out-of-energy offer

**Trigger:** an in-scope action fails because energy is below the cost of one unit.
- The client already knows energy is short: buttons that today are disabled with a tooltip (Fight
  Camp "Need 6E (have 2E)", PvP "Not enough energy (need 15)") become clickable in a dimmed "low
  energy" style and open the offer.
- The server rejects with its not-enough-energy error: the payload carries `need` and `have` and the
  offer uses those.
- My Camp batches: a partial batch is not a failure ("Stopped early (out of energy)." stands); the
  offer appears only when zero sessions could be funded.

**Placement:** inline where the action failed (dialog on desktop, bottom sheet on narrow screens). One
at a time. Never on login, screen load, or energy reaching zero on its own.

**Header:** eyebrow "Not enough energy", title "This {action} needs {need} energy. You have {have}."
(action nouns: attack, fight, session, drill).

**Options, fixed order:**
1. **Wait {n} minutes** (`n = need - have`; "Wait 1 minute" singular). Sub "Free. Energy refills 1
   per minute." Button "OK" closes. Static, no countdown.
2. **Energy Shot. +30**
   - owns >= 1: "You own {owned}. More cost 600 Cash." / **"Use one"**
   - owns 0, Cash >= 600: "You own 0. One costs 600 Cash." / **"Buy and use one"** (if the use step
     fails after the buy, the shot stays owned and the row re-renders as "You own 1" / "Use one")
   - owns 0, Cash < 600: "You own 0. One costs 600 Cash. You have {cash}." / disabled "Not enough
     Cash"
3. **Energy Drink. +50**
   - owns >= 1: "You own {owned}." / **"Use one"**
   - owns 0: "You own 0. {free-earn hint}." / link **"See bundles"** (opens the Shop expanded; hidden
     when payments are disabled; guests see it too)

**"Use one"** consumes one owned item via the existing `use-energy` endpoint, refreshes the fighter,
shows the existing success message and closes the offer. **The original action is not auto-retried**
(every commit is the player's own click). One Shot (+30) or Drink (+50) always covers one unit of any
in-scope action (max 20).

**In scope (four actions):**

| Action | Cost | Screen | Server error today |
|---|---|---|---|
| Proving Ground attack | 15 | PvP, Fight tab / PreFight | `insufficient_energy` 402 |
| Accept a fight offer | 10 / 15 / 18 / 20 / 20 by tier | Fights, offer board and callouts | `FIGHT_NOT_ENOUGH_ENERGY` 400 (opens FightLimitPopup today) |
| My Camp drill batch | 3 to 10 per session (Open Mat 6) | Camp tab | `not_enough_energy` 400 (only when zero funded) |
| Fight Camp session | 4 to 8 | Fight Camp screen | plain "Not enough energy" 400 (client pre-disables) |

The offer replaces `FightLimitPopup` for the energy code only, the PvP energy error strings, the Camp
not-enough-energy toast and the Fight Camp disabled tooltip.

**Out of scope:** Podcast / Magazine Cover / Guest on a Podcast (tiny; waiting is the answer);
Hospital (GDD §17.1: never a payment gate); fight resolve (paid at accept); Gym training (retired);
zero-energy actions.

### 2.5 The free-earn progress line

Computed **server-side** into the catalog payload. Each source is applicable with real numbers or
omitted:

- **Win streak** (career `fighter.winStreak`; PvP grants no drinks). Milestones 5 / 10 / 15 / 20 give
  1 / 2 / 2 / 3 (`fightService`). Next milestone = smallest strictly greater than the current streak.
  Chip "Win streak {current}/{next} earns {drinks}"; streak 0 shows "0/5 earns 1"; omitted at 20+.
- **Promotion**: 3 drinks per tier promotion and on the first GCS belt win. Not GCS: "Next promotion
  earns 3". GCS with `gcsTitleWins == 0`: "The GCS belt earns 3". GCS with the belt won: omitted.
- **Sponsor deals**: active contracts with `rewardDrinks > 0`: "Sponsor deal pays {sum} on
  completion". None active: "Some sponsor deals pay {min} to {max}" (catalog min/max from
  `sponsorCatalog.js`). Keeps the line non-empty.

A1 shows every applicable chip (max three), prefixed "Earned free by playing". A2 and A3 show one hint
by priority: streak, promotion, sponsor.

**Soft cap:** at `inventory.energyDrinks >= 99` free grants pay 0; the line becomes "You hold {owned}
drinks. Free drinks land again below 99."

---

## 3. Numbers

Nothing tuned; all read from config: regen +1/min (max 100); Energy Shot +30 for 600 Cash; Energy
Drink +50, never for Cash; bundles 6/$4.99, 15/$9.99, 40/$19.99, 100/$39.99 (server `amountCents`);
savings 20/40/52% vs the 6 pack; streak grants 5/10/15/20 -> 1/2/2/3; promotion 3 (also first GCS
belt); sponsor grants 2, 2, 3, 4; free-grant soft cap 99; in-scope costs PvP 15, fight 10 to 20, My
Camp 3 to 10, Fight Camp 4 to 8.

Expected effect: fewer premium impressions for non-payers; the Energy Shot gets a sell surface at the
moment §5 intends.

## 4. Gating

Shop and panel available from fighter creation. Guests see everything, buy Cash items, bundle buttons
in guest mode until secured (§15.3.4); securing triggers the reshow. Payments disabled: panel shows
with disabled buttons and notice; A3 hides "See bundles".

## 5. Copy (new or changed strings)

Shop: "Premium. Energy Drinks" / "Account secured. Bundles are available now." / "Skip the wait when it
matters" / "Each drink is +50 energy, one time. Real money, paid securely through Stripe." / "Earned
free by playing" / "Win streak {current}/{next} earns {drinks}" / "Next promotion earns 3" / "The GCS
belt earns 3" / "Sponsor deal pays {drinks} on completion" / "Some sponsor deals pay {min} to {max}" /
"You hold {owned} drinks. Free drinks land again below {cap}." / "Energy Drinks" / "${price} per drink"
/ "save {pct}% vs the 6 pack" / "Our pick" / "Buy" / "Secure your account to buy" / "Opening secure
checkout..." / "Secure checkout by Stripe. Your card never touches the game." / "Hide" / A2 "{owned}
owned. +50 energy each. {hint}" / "See bundles" / chips "Cash", "Energy Drinks" / tabs "Cash store",
"My inventory" / shelves "Energy", "XP boosters, one at a time", "Pre-fight supplements, next fight
only" / "+30 energy, instant" / "+{pct}% XP, all stats. {n} sessions" or "+{pct}% XP {STAT tags}. {n}
sessions" / "Injury risk x0.8 next fight".

A3: "Not enough energy" / "This {action} needs {need} energy. You have {have}." / "Wait {n} minutes"
("Wait 1 minute") / "Free. Energy refills 1 per minute." / "OK" / "Energy Shot. +30" / "You own
{owned}. More cost 600 Cash." / "You own 0. One costs 600 Cash." / "You own 0. One costs 600 Cash. You
have {cash}." / "Use one" / "Buy and use one" / "Not enough Cash" / "Energy Drink. +50" / "You own
{owned}." / "You own 0. {hint}." / "See bundles" / close aria "Close".

Removed: shop.tabs.premium / premiumBadge, shop.energy.getMore / realMoneyLabel / premiumTag,
shop.bundle.mostPopular, shop.booster.bestValue, shop.premium.eye / title / desc / earnNote; the
energy-code uses of fights.fightLimit, pvp.preFight.errNotEnoughEnergy, pvp.preFight.energyNoteLow,
pvp.fight.energyWarnLow, fights.camp.sessionNeedEnergy, yourCamp.errors.notEnoughEnergy (may stay as
fallbacks for non-offer paths).

## 6. Product art

Masters `art/shop/*.png` (provenance `art/shop/PROVENANCE.md`), not shipped. Shipped:
`frontend/public/assets/shop/<product-id>.webp` (320 px; the can is portrait, from the 420x800 crop).

| Product id | File | Used in |
|---|---|---|
| energy-drink | energy-drink.webp | A1 hero and bundle cards (1/2/3/4 cans for 6/15/40/100), A2 bar, A3 option 3, wallet chip |
| energy-shot | energy-shot.webp | Energy shelf, A3 option 2 |
| 7 boosters | <id>.webp | Booster shelf |
| 7 supplements | <id>.webp | Supplement shelf |

`alt=""` on every shop image (name and effect are always adjacent text). `DOC_TECHNICIAN` has no art
and never renders in the Shop.

## 7. Edge cases

Seen call fails: full again next visit. Catalog fails: existing error + Retry, no bundle area. Claim
while the Shop is open: applies on next load. Payments disabled: panel renders, buttons disabled, A3
link hidden. Guest: can buy and use Shots. Energy full on "Use one": endpoint refuses before touching
inventory; show message, refresh, close. Buy succeeds, use fails: shot stays owned. Cash drops below 600
between render and click: server "Not enough cash", row re-renders disabled. Stale energy: server
`need`/`have` win. My Camp partial batch: no offer. Drinks >= 99: cap line. Stripe return: panel
expanded with the delivery banner, polling unchanged.

**Must not change:** §15.3.2 and §15.3.5 (server price, webhook-only fulfilment, exactly-once grant,
refunds, chargebacks); guests refused at checkout (`account_required`); only Energy Drinks sold for
money; no Hospital sell; no login popup, no timers, no gold "best value".

## 8. Data needs (design level)

- Fighter: `premiumPanelSeen`, `premiumPanelReshowPending` (booleans, default false, owner-only).
- `GET` shop catalog adds `premiumPanel: { mode, reason }` and `freeEarn: { streak: { current, next,
  drinks } | null, promotion: { drinks: 3, kind: "promotion" | "gcs_belt" } | null, sponsor: { active:
  true, drinks } | { active: false, min, max }, overCap }`. GET never mutates.
- New idempotent `POST /fighters/:id/shop/premium-seen` (owner only; modelled on badges/seen).
- `claimAccount` sets `premiumPanelReshowPending = true` in the same operation that flips `isGuest`.
- Not-enough-energy errors for the four in-scope actions add `need` and `have` (live energy). Codes
  unchanged.
- "Buy and use one": a combined owner-only operation or buy then use in sequence (architect's call).
- Analytics: `premium_panel_shown { reason }`, `premium_panel_expanded { from }`, `energy_offer_shown
  { source, need, have }`, `energy_offer_choice { source, choice }`.

Docs at step 6: GDD §15 (new §15.4 "Shop presentation and the out-of-energy offer"), Library shop
article, changelog 2.3.
