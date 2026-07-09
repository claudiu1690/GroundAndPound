/**
 * Special Moves v1 — thin controllers. Validate body presence, load the fighter, delegate
 * to specialMovesService, map errors. No business logic here; no internal error detail is
 * ever surfaced to the client. All routes are mounted under /fighters/:id and guarded by
 * ownFighter.
 */

const Fighter = require("../models/fighterModel");
const specialMovesService = require("../services/specialMovesService");

// Client-fixable equip/unequip errors → 400.
const EQUIP_400 = new Set([
    "Unknown move",
    "You don't own that move",
    "Slot not unlocked yet",
    "Move already equipped",
    "Only 2 always-on passives can be equipped — that slot needs a Proc or Signature move",
    "Cannot change moves during an active fight camp",
    "No move in that slot",
]);

async function getFighterOr404(req, res) {
    const fighter = await Fighter.findById(req.params.id);
    if (!fighter) {
        res.status(404).json({ message: "Fighter not found" });
        return null;
    }
    return fighter;
}

async function listMoves(req, res) {
    try {
        const fighter = await getFighterOr404(req, res);
        if (!fighter) return;
        res.json(specialMovesService.listMoves(fighter));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getMoveDetail(req, res) {
    try {
        const fighter = await getFighterOr404(req, res);
        if (!fighter) return;
        const view = specialMovesService.getMoveDetail(fighter, req.params.moveId);
        res.json(view);
    } catch (err) {
        if (err.notFound || err.message === "Unknown move") {
            return res.status(404).json({ message: "Unknown move" });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function equipMove(req, res) {
    try {
        const { moveId, slotIndex } = req.body || {};
        if (moveId === undefined || moveId === null || moveId === "" || slotIndex === undefined || slotIndex === null) {
            return res.status(400).json({ message: "moveId and slotIndex are required" });
        }
        const fighter = await getFighterOr404(req, res);
        if (!fighter) return;
        const result = await specialMovesService.equipMove(fighter, moveId, slotIndex);
        res.json(result);
    } catch (err) {
        if (EQUIP_400.has(err.message)) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function unequipMove(req, res) {
    try {
        const { slotIndex } = req.body || {};
        if (slotIndex === undefined || slotIndex === null) {
            return res.status(400).json({ message: "slotIndex is required" });
        }
        const fighter = await getFighterOr404(req, res);
        if (!fighter) return;
        const result = await specialMovesService.unequipMove(fighter, slotIndex);
        res.json(result);
    } catch (err) {
        if (EQUIP_400.has(err.message)) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = {
    listMoves,
    getMoveDetail,
    equipMove,
    unequipMove,
};
