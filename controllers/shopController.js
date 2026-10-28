const shopService = require("../services/shopService");

// Service-thrown messages that map to HTTP 400 (client error). Anything else that
// isn't a known 404 is treated as an internal error and the detail is not leaked.
const BAD_REQUEST_MESSAGES = new Set([
    "Not enough cash",
    "Booster already active",
    "That item must be bought with premium",
    "You already own the maximum of this item",
    "Unknown item",
    "Invalid quantity",
    "Energy already full",
    "You don't own any of that item",
]);

function handleError(err, res) {
    const msg = err && err.message;
    if (msg === "Fighter not found") {
        return res.status(404).json({ message: msg });
    }
    if (BAD_REQUEST_MESSAGES.has(msg)) {
        return res.status(400).json({ message: msg });
    }
    console.error("[ShopController]", err);
    return res.status(500).json({ message: "Internal server error" });
}

async function getCatalog(req, res) {
    try {
        const catalog = await shopService.getCatalog(req.params.id);
        res.json(catalog);
    } catch (err) {
        handleError(err, res);
    }
}

async function buy(req, res) {
    try {
        const { itemId, quantity } = req.body || {};
        if (!itemId || typeof itemId !== "string") {
            return res.status(400).json({ message: "Unknown item" });
        }
        if (quantity !== undefined && quantity !== null && !Number.isInteger(quantity)) {
            return res.status(400).json({ message: "Invalid quantity" });
        }
        const result = await shopService.buyItem(req.params.id, itemId, quantity);
        res.json(result);
    } catch (err) {
        handleError(err, res);
    }
}

async function useEnergy(req, res) {
    try {
        const { itemId } = req.body || {};
        if (itemId !== "energy-shot" && itemId !== "energy-drink") {
            return res.status(400).json({ message: "Unknown item" });
        }
        const result = await shopService.useEnergyItem(req.params.id, itemId);
        res.json(result);
    } catch (err) {
        handleError(err, res);
    }
}

/**
 * POST /fighters/:id/shop/premium-seen. Body ignored; idempotent.
 * 200 { acknowledged } | 404 Fighter not found | 500.
 */
async function premiumSeen(req, res) {
    try {
        const userId = req.user && req.user.id;
        const result = await shopService.markPremiumPanelSeen(req.params.id, userId);
        res.json({ acknowledged: result.acknowledged === true });
    } catch (err) {
        handleError(err, res);
    }
}

module.exports = { getCatalog, buy, useEnergy, premiumSeen };
