const express = require("express");
const router = express.Router();
const gymController = require("../controllers/gymController");

/**
 * @swagger
 * /gyms:
 *   get:
 *     summary: List all gyms (optionally filter by tier)
 *     tags: [Gyms]
 *     parameters:
 *       - in: query
 *         name: tier
 *         schema: { type: string, enum: [T1, T2, T3, T4, T5] }
 *         description: Filter by gym tier
 *     responses:
 *       200:
 *         description: List of gyms (each includes tierInfo from game constants)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Gym' }
 *       500:
 *         description: Internal server error
 */
router.get("/", gymController.list);
router.get("/for-fighter/:fighterId", gymController.listWithProgress);

/**
 * @swagger
 * /gyms/{id}:
 *   get:
 *     summary: Get a gym by ID
 *     tags: [Gyms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Gym found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Gym' }
 *       404:
 *         description: Gym not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id", gymController.getById);
router.get("/:id/progress/:fighterId", gymController.getProgress);

module.exports = router;
