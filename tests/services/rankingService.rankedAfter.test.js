/**
 * RANKED_AFTER_FIGHTS is the single home of "fights in a tier before a rank is
 * assigned". The dashboard title-shot strip reads it, so updatePlayerRank must keep
 * assigning the entry rank on exactly that fight.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const rankingService = require("../../services/rankingService");

const WIN = { isWin: true, isLoss: false, isDraw: false, method: "DEC", opponentRank: null };

test("RANKED_AFTER_FIGHTS is 3", () => {
    assert.equal(rankingService.RANKED_AFTER_FIGHTS, 3);
});

test("updatePlayerRank leaves the fighter unranked until fight 3, then assigns a rank", () => {
    const fighter = {
        promotionTier: "Regional Pro",
        winsInCurrentTier: 0,
        ranking: { rank: null, fightsInTier: 0, entryRecordAtFight3: null },
    };
    for (let fight = 1; fight < rankingService.RANKED_AFTER_FIGHTS; fight++) {
        fighter.winsInCurrentTier = fight;
        rankingService.updatePlayerRank(fighter, WIN);
        assert.equal(fighter.ranking.fightsInTier, fight);
        assert.equal(fighter.ranking.rank, null, `still unranked after fight ${fight}`);
    }
    fighter.winsInCurrentTier = 3;
    rankingService.updatePlayerRank(fighter, WIN);
    assert.equal(fighter.ranking.fightsInTier, 3);
    assert.equal(fighter.ranking.rank, rankingService.getEntryRank("Regional Pro", 3));
    assert.equal(typeof fighter.ranking.rank, "number");
    assert.equal(fighter.ranking.entryRecordAtFight3, "3-0");
});
