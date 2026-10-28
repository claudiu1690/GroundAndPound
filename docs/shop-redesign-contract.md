# Shop redesign (A1/A2/A3): implementation contract

Build-feature step 2 (architect), 2026-10-28. Design of record: `docs/shop-redesign-spec.md`; mockup
`mockups/shop-redesigns.html` section A. This contract is the source of truth for backend-dev and
frontend-dev.

## Decisions taken

1. **"Buy and use one" = client sequence**: `api.buyItem(id, "energy-shot", 1)` then
   `api.useEnergyItem(id, "energy-shot")`. Both endpoints exist with full guards; two calls give the
   spec's failure semantics for free (shot stays owned if the use step fails).
2. **`claimAccount`**: users and fighters are separate collections and the codebase has no
   transactions. The fighter flag is set by one atomic `updateOne` immediately after `user.save()`
   succeeds; best effort, logged on failure, never before the save.
3. **Both flags true** (guest claims before ever opening the Shop): `reason = "first_visit"`; the
   seen call clears both.
4. **Analytics**: three of four events are client-side and the frontend has no analytics channel, so
   one small whitelisted beacon endpoint is added (1.4). `premium_panel_shown` is tracked server-side
   inside the premium-seen write.
5. Fight Camp's error is already `{ message, code: "CAMP_NOT_ENOUGH_ENERGY" }` 400
   (`controllers/campController.js:37`). Code kept.
6. `getCatalog` stays read-only; `freeEarn` and `premiumPanel` are derived at read time.

---

## 1. API contract

All routes under `app.use("/fighters", authMiddleware, fighterRoutes)` with `ownFighter` (403 when
`:id` is not the token's fighter). Internal errors: `500 { message: "Internal server error" }`, real
error logged.

### 1.1 `GET /fighters/:id/shop/catalog` (additive)

Existing fields unchanged (`iron, activeBooster, energyFull, energyItems, boosters, buffs,
premiumBundles, paymentsEnabled, drinkSoftCap`). Additions:

```jsonc
{
  "premiumBundles": [ { "id": "drinks-6", "name": "6 Energy Drinks", "priceLabel": "$4.99", "drinks": 6,
                        "amountCents": 499, "popular"?: true } ],   // amountCents NEW, display math only
  "premiumPanel": { "mode": "full" | "collapsed", "reason": "first_visit" | "account_secured" | null },
  "freeEarn": {
    "streak":    { "current": 3, "next": 5, "drinks": 1 } | null,          // null at streak >= 20
    "promotion": { "drinks": 3, "kind": "promotion" | "gcs_belt" } | null, // null when GCS and gcsTitleWins >= 1
    "sponsor":   { "active": true, "drinks": 5 } | { "active": false, "min": 2, "max": 4 },
    "overCap":   false                                                     // inventory.energyDrinks >= drinkSoftCap
  }
}
```

Rules (`shopService`):
- `premiumPanel`: `!premiumPanelSeen` -> `{ full, first_visit }`; else `premiumPanelReshowPending` ->
  `{ full, account_secured }`; else `{ collapsed, null }`.
- `streak`: `current = fighter.winStreak || 0`; `next` = smallest key of `FREE_DRINK_GRANTS.streak`
  strictly greater than `current`; `drinks` = its value; `null` if none.
- `promotion`: `promotionTier !== TOP_TIER` -> `{ 3, "promotion" }`; `TOP_TIER && (gcsTitleWins ?? 0)
  === 0` -> `{ 3, "gcs_belt" }`; else `null`.
- `sponsor`: `Sponsorship.find({ fighterId, status: "active" }).select("rewardDrinks").lean()`; sum
  > 0 -> `{ active: true, drinks: sum }`; else `{ active: false, min, max }` over
  `SPONSOR_OFFERS.filter(o => o.rewardDrinks > 0)`. Always present.
- `overCap = (inventory.energyDrinks || 0) >= SOFT_CAP` (client shows the cap line instead).
- `boosters`: filter out `price == null` (`DOC_TECHNICIAN`).

Errors unchanged: 404 `{ message: "Fighter not found" }`.

### 1.2 `POST /fighters/:id/shop/premium-seen` (new)

- `ownFighter`; body ignored; idempotent.
- `Fighter.findOneAndUpdate({ _id: id }, { $set: { premiumPanelSeen: true, premiumPanelReshowPending:
  false } }, { new: false, projection: "premiumPanelSeen premiumPanelReshowPending" })`. Pre-image null
  -> 404. Else `reason` from the same precedence helper; `acknowledged = reason !== null`; if
  acknowledged, `analyticsService.track(userId, "premium_panel_shown", { reason }, { fighterId })`
  (fire-and-forget).
- 200 `{ "acknowledged": true | false }`; 404 `{ "message": "Fighter not found" }`.
- Atomic single write, not `fighter.save()`.

### 1.3 Not-enough-energy errors: `need` / `have` added, codes and statuses unchanged

| Action | Route | Today | After |
|---|---|---|---|
| Proving Ground attack | `POST /pvp/fight` | 402 `{ message, code: "insufficient_energy" }` | + `need: 15, have: <live>` |
| Accept fight offer | `POST /fights/accept/:fighterId/:fightId` | 400 `{ message: "Not enough energy", code: "FIGHT_NOT_ENOUGH_ENERGY" }` | + `need: <tier cost>, have: <live>` |
| My Camp drill batch | `POST /home-camp/:fighterId/train` | 400 `{ message: "Not enough energy", code: "not_enough_energy" }` (zero funded only) | + `need: <drill.energy after trait>, have: <live>` |
| Fight Camp session | `POST /fights/camp/:fightId/session` | 400 `{ message: "Not enough energy", code: "CAMP_NOT_ENOUGH_ENERGY" }` | + `need: <sessionCfg.energy>, have: <live>` |

`need`/`have` are non-negative integers, `have` = live Redis value at refusal; included only when both
are integers on the error object. Other codes untouched. `POST /fights/resolve/:fighterId` unchanged.

### 1.4 `POST /fighters/:id/analytics/events` (new, client beacon)

- `ownFighter`; body `{ type: string, meta: object }`.
- Whitelist `analyticsService.CLIENT_EVENT_TYPES`, per-type meta validation (extra keys dropped,
  missing/invalid required keys reject):
  - `premium_panel_expanded`: `{ from: "bar" | "chip" | "offer" | "purchase_return" }`
  - `energy_offer_shown`: `{ source: "pvp" | "fight" | "camp" | "fightcamp", need: int 1..100, have: int 0..100 }`
  - `energy_offer_choice`: `{ source: <same>, choice: "wait" | "use_shot" | "buy_use_shot" | "use_drink" | "see_bundles" | "dismiss" }`
- 204 when accepted (write through `analyticsService.track`, never fails the request); 400 `{ message:
  "Invalid event", code: "invalid_event" }` otherwise. Global rate limit only.
- `premium_panel_shown` is NOT accepted here (server-only).

### 1.5 Unchanged endpoints consumed

`POST /fighters/:id/shop/buy` (`{ itemId: "energy-shot", quantity: 1 }`), `POST
/fighters/:id/inventory/use-energy`, `POST /fighters/:id/shop/checkout`, `GET
/fighters/:id/shop/purchases/:sessionId`. Guest `account_required` at checkout untouched.

---

## 2. Data

- `models/fighterModel.js` next to `inventory` (~line 498): `premiumPanelSeen: { type: Boolean,
  default: false }`, `premiumPanelReshowPending: { type: Boolean, default: false }`. No index,
  migration or backfill. Owner payload (`toPublicFighter`) ships them; do NOT add them to
  `PUBLIC_FIGHTER_KEYS` (`services/fighterService.js:290`). No `select: false`.
- `services/accountService.js` `claimAccount`: after the successful `await user.save()` (~line 650),
  before the verify-email send:
  `try { await Fighter.updateOne({ _id: user.fighterId }, { $set: { premiumPanelReshowPending: true } }); } catch (e) { console.error("[claimAccount] reshow flag failed:", e.message); }`
- `consts/shopConfig.js`: export `FREE_DRINK_GRANTS = { streak: { 5: 1, 10: 2, 15: 2, 20: 3 },
  promotion: 3 }`; `services/fightService.js` ~1295 and ~1493 read from it (no behaviour change).
- `models/analyticsEventModel.js`: enum values `premium_panel_shown`, `premium_panel_expanded`,
  `energy_offer_shown`, `energy_offer_choice` (`tests/models/activityLogModel.enum.test.js` enforces).
- Redis / BullMQ: none.

## 3. Shared logic (one home each)

- **`services/shopService.js`**: `premiumPanelState(fighter)` (pure), `buildFreeEarn({ winStreak,
  promotionTier, gcsTitleWins, energyDrinks, activeRewardDrinks })` (pure, exported),
  `markPremiumPanelSeen(fighterId, userId)`. `TOP_TIER` via lazy `require("./fightService").TOP_TIER`
  (fightService lazy-requires shopService).
- **`utils/energyShortfall.js`** (new): `markShortfall(err, need, have) -> err` (sets only for
  non-negative integers), `shortfallFields(err) -> { need, have } | {}`.
  - Producers: `energyService.deductEnergy` (~60) `throw markShortfall(new Error("Not enough
    energy"), amount, current)` (covers fight accept and Fight Camp); `pvpFightService` (~216) on the
    402; `homeCampTrainingService` (~222) `campError("not_enough_energy", "Not enough energy", 400, {
    need: drill.energy, have: current })`.
  - Consumers: `fightController.acceptOffer` (~101), `campController` (~37), `pvpController.handleError`
    (~65, only for `insufficient_energy`), `homeCampController` `CODE_EXTRAS` add `not_enough_energy:
    ["need", "have"]`. Leave `resolveFight`, `trainingService`, media hub, hospital alone.
- **`services/analyticsService.js`**: `CLIENT_EVENT_TYPES`, `sanitizeClientEvent(type, meta)` (pure),
  `trackClientEvent(userId, fighterId, type, meta)` (throws `invalid_event`). The client `track` call
  must live in this file (enum scanner). `controllers/analyticsController.js` `trackClientEvent`:
  204 / 400 / 500.
- No BullMQ job is involved; grants stay where they are.

## 4. Backend files

`consts/shopConfig.js`, `utils/energyShortfall.js` (new), `models/fighterModel.js`,
`models/analyticsEventModel.js`, `services/energyService.js`, `services/pvpFightService.js`,
`services/homeCampTrainingService.js`, `services/fightService.js`, `services/shopService.js`,
`services/accountService.js`, `services/analyticsService.js`, `controllers/shopController.js`
(`premiumSeen`), `controllers/analyticsController.js`, `controllers/fightController.js`,
`controllers/campController.js`, `controllers/pvpController.js`, `controllers/homeCampController.js`,
`routes/fighterRoutes.js` (`router.post("/:id/shop/premium-seen", ownFighter,
shopController.premiumSeen)`, `router.post("/:id/analytics/events", ownFighter,
analyticsController.trackClientEvent)`). `premiumSeen` goes through `shopService` (do not copy
`fighterController.markBadgesSeen`, which requires models inside the controller).

---

## 5. Frontend

| File | Role |
|---|---|
| `frontend/src/api.js` | `markPremiumPanelSeen(id)` POST premium-seen; `trackClientEvent(id, type, meta)` POST analytics/events (callers `.catch(() => {})`) |
| `components/shop/shopConstants.js` | pure: `shopArtSrc(id)`, `bundlePricing(bundles)` (perDrink, savingsPct vs the smallest bundle: 20/40/52, null for 6), `freeEarnChips(freeEarn, cap)` (max 3, or the cap chip), `freeEarnHint(freeEarn, cap)` (priority streak > promotion > sponsor; cap line when overCap), `boosterEffect(booster)`. Delete ShopTab's `parsePrice`. |
| `components/shop/energyOfferModel.js` (new) | pure: `ENERGY_SHORTFALL_CODES`, `isEnergyShortfall(err)` (code or status 402), `shortfallFromError(err, fallback)` (prefers integer `err.body.need/have`), `waitMinutes(need, have)` (>= 0), `shotRow({ owned, cash, price })` -> `use` / `buy_use` / `no_cash`, `drinkRow({ owned })` -> `use` / `none`, `actionNounKey(source)` |
| `hooks/useEnergyOffer.js` (new) | `{ open, source, need, have }`; `open(...)`, `openFromError(err, source, fallback)` (false when not a shortfall), `close()`; fires `energy_offer_shown` |
| `components/shop/EnergyOffer.jsx` (new) | A3 dialog, `createPortal` to body, `role="dialog" aria-modal`, Escape/backdrop close, global `.energy-offer-overlay` / `.energy-offer` classes (NOT under `.your-camp`), bottom sheet at `max-width: 640px` |
| `components/shop/PremiumPanel.jsx` (new) | A1 panel and A2 bar (`expanded` prop), `BundleCard`, free-earn line, notices, trust line, Hide |
| `components/shop/ShopTab.jsx` | wallet strip, two tabs, PremiumPanel, seen call, expand requests, product art; remove `PremiumStore` and the premium `EnergyCard` branch |
| `App.jsx` | one `useEnergyOffer()` + one `<EnergyOffer>` next to `FightLimitPopup` (~1511); `shopExpand` state |
| `pvp/PvpHub.jsx`, `pvp/tabs/FightTab.jsx`, `pvp/PreFight.jsx` | thread `onEnergyShort`; low-energy buttons clickable |
| `camp/CampTab.jsx` | `onEnergyShort`; server-error branch |
| `fights/FightCamp.jsx` | `onEnergyShort`; low-energy session buttons clickable |
| `App.css` | `.shop-wallet*`, `.shop-panel*`, `.shop-bar*`, `.shop-art`, `.energy-offer*`, `.pvp-chal-btn--low`, `.pvp-fight-btn--low`, `.camp-add-btn--low` |
| `locales/en.json` | section 6 |
| `frontend/public/assets/shop/*.webp` | 5.7 |

### 5.2 ShopTab

- `tab`: `"cash" | "inventory"`. Remove the `purchaseReturn ? "premium"` initial and `setTab("premium")`
  effect (~288, ~324).
- Wallet: `Cash {fighter.iron}`, `Energy Drinks {fighter.inventory.energyDrinks}`; drinks chip ->
  `expand("chip")`.
- Panel: `initialPanelRef` captures `catalog.premiumPanel` from the FIRST successful load of this
  mount; `expanded` initialises to `initialPanel.mode === "full" || !!purchaseReturn ||
  !!expandRequest`. Silent reloads (after buy/use/delivery) must not touch `expanded` or the eyebrow.
- Seen call: on the first loaded catalog, if `mode === "full"`, `api.markPremiumPanelSeen(fighterId)
  .catch(() => {})` once (ref guard). No reload afterwards.
- `expand(from)`: `expanded = true`, `hideable = true`, fires `premium_panel_expanded { from }`. "Hide"
  only when `hideable`. `expandRequest` prop `{ from, nonce }` -> effect on `nonce`.
- Stripe return: `purchaseReturn` flow (App.jsx ~734-752) unchanged; banner above the panel; expanded
  with `from: "purchase_return"`; the `fulfilled` silent reload must not reset `expanded`.
- Buy modes/notices unchanged (`premiumBuyMode`, `bundlesCrossSoftCap`, `checkoutErrorKey`,
  `handleBuyPremium`); "Our pick" on `popular: true`; no "Best Value" / "Most Popular".
- Shelves: Energy (`energyItems.filter(i => !i.premium)`), boosters, supplements; `<img
  className="shop-art" src={shopArtSrc(id)} alt="" />` on every card. Keep loading / error+Retry /
  success.

### 5.3 App.jsx

- `const energyOffer = useEnergyOffer({ fighterId: fighter?._id })`; `<EnergyOffer
  {...energyOffer.state} fighter={fighter} onClose={energyOffer.close} onRefreshFighter={loadFighter}
  onMessage={setMessage} onSeeBundles={() => { energyOffer.close(); openShopBundles("offer"); }} />`.
- `openShopBundles(from)`: `setShopExpand({ from, nonce: Date.now() }); setActiveTab("shop")`; clear
  when `activeTab !== "shop"` (like `purchaseReturn`, ~756); pass `expandRequest={shopExpand}`.
- `handleAcceptOffer` catch (~1179): `if (!energyOffer.openFromError(e, "fight", { need:
  FIGHT_ENERGY_COST[fighter.promotionTier] ?? 10, have: fighter.energy?.current ?? 0 }))
  maybeShowBlockPopup(errMsg, e.code);` keep the return shape; skip `setMessage` when the offer
  opened. Do not change `maybeShowBlockPopup`'s code set.
- `handleAddCampSession` catch (~1208): `if (!energyOffer.openFromError(e, "fightcamp", { need:
  CAMP_SESSIONS[sessionType]?.energy, have: fighter.energy?.current ?? 0 })) setMessage(...)`.
- Props: `PvpHub onEnergyShort={energyOffer.open}` -> `FightTab` -> `PreFight`; `CampTab
  onEnergyShort`; `FightCamp onEnergyShort`.

### 5.4 Per-screen detection

| Screen | Client pre-check | Server error |
|---|---|---|
| `pvp/tabs/FightTab.jsx` challenge buttons (~218) | `energyCur < 15` and not protected/recovering: enabled, `pvp-chal-btn--low`, click -> `onEnergyShort({ source: "pvp", need: 15, have: energyCur })`; remove the `pvp-energy-warn` block (~240) | n/a |
| `pvp/PreFight.jsx` | `lowEnergy = energyCur < 15 && !isInjuryBlocked`; enabled with `pvp-fight-btn--low`, click -> `onEnergyShort`; `energyNoteLow` branch removed | catch: `isEnergyShortfall(e)` -> `onEnergyShort({ source: "pvp", ...shortfallFromError(e, { need: 15, have: energyCur }) })` before the existing ladder; `errNotEnoughEnergy` removed |
| Offer board (`DashboardTab`, `FightOffers`) | unchanged | App `handleAcceptOffer` |
| `camp/CampTab.jsx` `handleTrainDrill` (~284) | none | `err?.code === "not_enough_energy"` -> `onEnergyShort({ source: "camp", ...shortfallFromError(err, { need: drill.energy, have: fighter.energy?.current ?? 0 }) })`, else `setActionError(...)` |
| `fights/FightCamp.jsx` `CampSessionCard` (~44) | `notEnoughEnergy && !isInjuredPending && !loading`: enabled, `camp-add-btn--low`, click -> `onEnergyShort({ source: "fightcamp", need: session.energy, have: energyAvailable })` | App `handleAddCampSession` |

### 5.5 EnergyOffer internals

- Header from props: eyebrow; `shop.offer.title` with `{ action: t(actionNounKey(source)), need, have }`.
- On open: `api.getShopCatalog(fighterId)` once; states loading (rows 2-3 `shop.offer.loading`),
  error (`shop.offer.loadError` + Retry), ready. Row 1 always: `waitMinutes`, singular at 1, sub, "OK"
  (choice `wait`, close).
- Row 2 from `catalog.energyItems` (`energy-shot` owned/price) and `catalog.iron` via `shotRow`. Use:
  `api.useEnergyItem` -> `onMessage(res.message)`, `onRefreshFighter`, choice `use_shot`, close. Buy and
  use: `buyItem` then `useEnergyItem`; if use throws: `onMessage`, reload catalog + refresh fighter,
  stay open; choice `buy_use_shot` at click. "Not enough cash" -> message, reload catalog. "Energy
  already full" -> message, refresh, close.
- Row 3 from `energy-drink.owned`: "Use one" (choice `use_drink`) or `shop.offer.drinkZero` with
  `freeEarnHint(...)` and "See bundles" (choice `see_bundles`; hidden when `paymentsEnabled ===
  false`; guests see it).
- One in-flight action; close/backdrop/Escape -> choice `dismiss`. No auto-retry, no timers.

### 5.6 Analytics

`api.trackClientEvent(fighterId, type, meta).catch(() => {})`: `premium_panel_expanded` in ShopTab
`expand`; `energy_offer_shown` in `useEnergyOffer.open`; `energy_offer_choice` in EnergyOffer.
`premium_panel_shown` server-side only.

### 5.7 Assets

Output `frontend/public/assets/shop/<product-id>.webp`, 320 px wide (`energy-drink.webp` 320x610
portrait, others 320x320). Do not copy `mockups/assets/shop/*`.

```bash
mkdir -p frontend/public/assets/shop
magick art/shop/energy-drink-can_test1.png -crop 420x800+302+130 +repage -resize 320x -strip -quality 82 -define webp:method=6 frontend/public/assets/shop/energy-drink.webp
for f in energy-shot focus-amino strength-formula ground-protocol strike-blend leg-press-formula iq-boost full-camp-stack whey-protein-shake creatine-stack focus-stack pre-workout leg-day-formula grappling-rub collagen-recovery; do
  magick "art/shop/$f.png" -resize 320x320 -strip -quality 82 -define webp:method=6 "frontend/public/assets/shop/$f.webp"
done
```

`alt=""` on every shop image. Add a derivatives line to `art/shop/PROVENANCE.md`.

---

## 6. i18n (`frontend/src/locales/en.json`, `shop.*`)

No em or en dashes in new strings.

**Change:** `shop.tabs.cash` "Cash store"; `shop.tabs.inventory` "My inventory"; `shop.bundle.save`
"save {pct}% vs the 6 pack"; replace `shop.bundle.perDrinkSuffix` with `shop.bundle.perDrink` "${price}
per drink".

**Add:** `shop.wallet.cash` "Cash", `shop.wallet.drinks` "Energy Drinks"; `shop.shelves.energy`
"Energy", `shop.shelves.boosters` "XP boosters, one at a time", `shop.shelves.supplements` "Pre-fight
supplements, next fight only"; `shop.product.shotEffect` "+30 energy, instant",
`shop.product.boosterXp` "+{pct}% XP", `shop.product.boosterAllStats` "all stats",
`shop.product.boosterSessions` "{n} sessions", `shop.product.collagenEffect` "Injury risk x0.8 next
fight"; `shop.panel.eye` "Premium. Energy Drinks", `shop.panel.eyeSecured` "Account secured. Bundles
are available now.", `shop.panel.title` "Skip the wait when it matters", `shop.panel.body` "Each drink
is +50 energy, one time. Real money, paid securely through Stripe.", `shop.panel.earnedPrefix` "Earned
free by playing", `shop.panel.trust` "Secure checkout by Stripe. Your card never touches the game.",
`shop.panel.hide` "Hide", `shop.panel.seeBundles` "See bundles", `shop.panel.barLine` "{owned} owned.
+50 energy each. {hint}"; `shop.freeEarn.streak` "Win streak {current}/{next} earns {drinks}",
`shop.freeEarn.promotion` "Next promotion earns 3", `shop.freeEarn.gcsBelt` "The GCS belt earns 3",
`shop.freeEarn.sponsorActive` "Sponsor deal pays {drinks} on completion", `shop.freeEarn.sponsorNone`
"Some sponsor deals pay {min} to {max}", `shop.freeEarn.capLine` "You hold {owned} drinks. Free drinks
land again below {cap}."; `shop.bundle.ourPick` "Our pick"; `shop.offer.eye` "Not enough energy",
`shop.offer.title` "This {action} needs {need} energy. You have {have}.", `shop.offer.action.attack`
"attack", `.fight` "fight", `.session` "session", `.drill` "drill", `shop.offer.wait` "Wait {n}
minutes", `shop.offer.waitOne` "Wait 1 minute", `shop.offer.waitSub` "Free. Energy refills 1 per
minute.", `shop.offer.ok` "OK", `shop.offer.shotTitle` "Energy Shot. +30", `shop.offer.shotOwned` "You
own {owned}. More cost {price} Cash.", `shop.offer.shotZero` "You own 0. One costs {price} Cash.",
`shop.offer.shotZeroNoCash` "You own 0. One costs {price} Cash. You have {cash}.",
`shop.offer.useOne` "Use one", `shop.offer.buyAndUse` "Buy and use one", `shop.offer.notEnoughCash`
"Not enough Cash", `shop.offer.drinkTitle` "Energy Drink. +50", `shop.offer.drinkOwned` "You own
{owned}.", `shop.offer.drinkZero` "You own 0. {hint}.", `shop.offer.seeBundles` "See bundles",
`shop.offer.close` "Close", `shop.offer.loading` "Checking your inventory...", `shop.offer.loadError`
"Could not load your inventory."

**Remove** (grep `frontend/src` first, incl. `libraryContent.js`): `shop.tabs.premium`,
`shop.tabs.premiumBadge`, `shop.energy.getMore`, `shop.energy.realMoneyLabel`,
`shop.energy.premiumTag`, `shop.bundle.mostPopular`, `shop.bundle.perDrinkSuffix`,
`shop.booster.bestValue`, `shop.premium.eye`, `shop.premium.title`, `shop.premium.desc`,
`shop.premium.earnNote`, `shop.premium.drinksInInventory`, `shop.sections.xpBoostersSub`,
`shop.sections.preFightBuffsSub`, `pvp.preFight.errNotEnoughEnergy`, `pvp.preFight.energyNoteLow`,
`pvp.fight.energyWarnLow`. **Keep** `shop.premium.guestNotice / disabled / redirecting / overCap`,
`shop.sections.*` inventory headings, `fights.fightLimit.*`, `fights.camp.sessionNeedEnergy`,
`yourCamp.errors.notEnoughEnergy`.

---

## 7. Tests (`node:test`, stubbed statics, no DB)

Backend: `tests/services/shopService.freeEarn.test.js` (streak 0 -> {0,5,1}, 7 -> {7,10,2}, 15 ->
{15,20,3}, 20/25 -> null; promotion/gcs_belt/null; sponsor [2,3] -> {active,5}, [] -> {false,2,4};
overCap at 99; panel precedence; `FREE_DRINK_GRANTS` values and a source scan that `fightService.js`
no longer contains `{ 5: 1, 10: 2`); `tests/services/shopService.premiumSeen.test.js`;
`tests/services/shopService.catalog.test.js` (no Fighter write, no `DOC_TECHNICIAN`, `amountCents`);
`tests/utils/energyShortfall.test.js`; extend `tests/controllers/fightController.offers.test.js` and
`tests/controllers/campController.ownership.test.js`; `tests/controllers/pvpController.energy.test.js`;
`tests/controllers/homeCampController.extras.test.js`;
`tests/services/homeCampTrainingService.notEnoughEnergy.test.js` (funded 0 rejects with need/have;
funded 1 resolves); `tests/services/accountService.claimReshow.test.js` (flag after save only; 11000
-> email_taken and no update; update failure does not fail the claim);
`tests/services/analyticsService.clientEvents.test.js`;
`tests/controllers/analyticsController.clientEvent.test.js`; add both new routes to `OWNER_WRITES` in
`tests/routes/fighterRoutes.ownership.test.js`; `tests/models/activityLogModel.enum.test.js` must pass.

Frontend (`tests/frontend`, native ESM): `energyOfferModel.test.js` (codes, 402, not
`FIGHT_BLOCKED_INJURY`; shortfall preference/fallback; `waitMinutes(15,4) === 11`, `(15,14) === 1`,
`(15,15) === 0`; shotRow incl. `cash === price`; drinkRow; actionNounKey); `shopConstants.test.js`
(`bundlePricing` 20/40/52 and null; hint priority and cap line; chips omit nulls, max 3;
`shopArtSrc`; `premiumBuyMode` unchanged).

## 8. Order

backend-dev: (1) `FREE_DRINK_GRANTS` + fightService reads; (2) `energyShortfall` producers and the four
consumers + existing controller tests; (3) fighter fields, shopService, `premiumSeen` + route; (4)
`claimAccount` flag; (5) analytics enum, service, controller, route; (6) section 7 backend tests.

frontend-dev (after backend): (1) assets + api.js; (2) shopConstants + energyOfferModel + tests; (3)
useEnergyOffer, EnergyOffer, CSS; (4) PremiumPanel, ShopTab rewrite, en.json; (5) App.jsx wiring, then
PvpHub -> FightTab -> PreFight, CampTab, FightCamp; (6) remove dead i18n keys, grep leftovers.

## 9. Risks

Panel collapsing mid-visit (freeze first-load state); `FightLimitPopup` still owns five other codes and
resolve-time energy; PvP 402 branch must run before the existing ladder and respect
protected/recovering; EnergyOffer portals to body, so its styles must be global (not `.your-camp`);
guest checkout rules unchanged; Stripe return flow unchanged; claim write is not transactional (benign);
partial My Camp batch is a 200 (no client pre-check in CoachPanel); stale client energy (server
need/have win); client `track` call must live in `analyticsService.js`; flags safe only via
`PUBLIC_FIGHTER_KEYS`; `amountCents` is display-only and never sent; grep removed i18n keys.
