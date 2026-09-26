/**
 * Fight offer board config (see services/offerBoardService.js).
 *   OFFER_BOARD_TTL_HOURS   how long a generated board stays live before a read rolls a new set
 *   OFFER_REROLL_COST_FRAC  one reroll per board costs this fraction of the tier signingFee
 *
 * Per-bout purse (GDD 7, "Purse by slot"). The tier signingFee is the Even baseline;
 * each slot scales it, and a tougher opponent inside the slot's OVR window adds up to
 * OFFER_PURSE_GAP_BONUS_MAX on top. Deterministic, so the number on the card is the
 * number a clean win pays. Windows mirror pickOfferSlots: Easy [O-6, O-2], Even
 * [O-1, O+1], Hard [O+2, O+6]. TitleShot is one fixed champion, so no gap bonus.
 */
module.exports = {
    OFFER_BOARD_TTL_HOURS: 24,
    OFFER_REROLL_COST_FRAC: 0.2,
    OFFER_PURSE_MULT: { Easy: 0.7, Even: 1.0, Hard: 1.4, TitleShot: 1.75 },
    OFFER_PURSE_GAP_BONUS_MAX: 0.05,
    OFFER_PURSE_GAP_WINDOW: { Easy: [-6, -2], Even: [-1, 1], Hard: [2, 6] },
    OFFER_PURSE_ROUND_TO: 10,
};
