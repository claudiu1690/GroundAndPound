const sponsorshipService = require("../services/sponsorshipService");

async function getOverview(req, res) {
    try {
        const { fighterId } = req.params;
        const [available, active, history] = await Promise.all([
            sponsorshipService.listAvailableOffers(fighterId),
            sponsorshipService.listActive(fighterId),
            sponsorshipService.listHistory(fighterId, 20),
        ]);
        res.json({ available, active, history });
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function acceptOffer(req, res) {
    try {
        const { fighterId } = req.params;
        const { sponsorId } = req.body || {};
        if (!sponsorId) return res.status(400).json({ message: "sponsorId is required" });
        const contract = await sponsorshipService.acceptOffer(fighterId, sponsorId);
        res.status(201).json({ contract });
    } catch (err) {
        if (err.message === "Fighter not found" || err.message === "Sponsor not found") {
            return res.status(404).json({ message: err.message });
        }
        const clientErrors = [
            "Fame tier too low for this sponsor",
            "No sponsor slots available — drop a contract or raise your fame tier",
            "Already have this sponsor",
            "Recently broken — this sponsor won't re-sign until next rotation",
            "Already fulfilled this week — this sponsor won't re-sign until next rotation",
        ];
        if (clientErrors.includes(err.message)) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function dropContract(req, res) {
    try {
        const { fighterId, sponsorshipId } = req.params;
        const contract = await sponsorshipService.dropContract(fighterId, sponsorshipId);
        res.json({ contract });
    } catch (err) {
        if (err.message === "Contract not found") return res.status(404).json({ message: err.message });
        if (err.message === "Contract is not active") return res.status(400).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { getOverview, acceptOffer, dropContract };
