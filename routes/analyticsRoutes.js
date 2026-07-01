const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");

/**
 * @swagger
 * /admin/analytics/retention:
 *   get:
 *     summary: Internal retention / funnel report (admin only).
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: from
 *         required: false
 *         schema: { type: string, format: date-time }
 *         description: ISO date; defaults to earliest signup.
 *       - in: query
 *         name: to
 *         required: false
 *         schema: { type: string, format: date-time }
 *         description: ISO date; defaults to now.
 *     responses:
 *       200:
 *         description: Retention cohorts and funnel metrics.
 *       400:
 *         description: Invalid date range.
 *       403:
 *         description: Forbidden — caller not in the analytics admin allowlist.
 */
router.get("/retention", analyticsController.getRetention);

module.exports = router;
