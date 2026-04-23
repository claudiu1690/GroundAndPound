const express = require("express");
const router = express.Router();
const mainEventController = require("../controllers/mainEventController");

router.get("/current", mainEventController.getCurrent);
router.get("/history", mainEventController.getHistory);
router.post("/:eventId/predict", mainEventController.postPrediction);

module.exports = router;
