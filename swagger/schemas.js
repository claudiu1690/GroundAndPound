/**
 * Swagger/OpenAPI schema definitions for Ground & Pound API.
 * These are merged with route JSDoc by swagger-jsdoc.
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Fighter:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           format: objectId
 *           description: MongoDB ID
 *         firstName:
 *           type: string
 *           example: Alex
 *         lastName:
 *           type: string
 *           example: Stone
 *         nickname:
 *           type: string
 *           nullable: true
 *         weightClass:
 *           type: string
 *           enum: [Bantamweight, Featherweight, Lightweight, Welterweight]
 *         style:
 *           type: string
 *           enum: [Boxer, Kickboxer, Wrestler, Brazilian Jiu-Jitsu, Muay Thai, Judo, Sambo, Capoeira]
 *         backstory:
 *           type: string
 *           nullable: true
 *           enum: [Street Fighter, College Wrestler, Kickboxing Champion, Army Veteran, MMA Prodigy, Late Bloomer]
 *         str: { type: number, minimum: 1, maximum: 100, description: Striking }
 *         spd: { type: number, minimum: 1, maximum: 100, description: Speed }
 *         leg: { type: number, minimum: 1, maximum: 100, description: Leg power }
 *         wre: { type: number, minimum: 1, maximum: 100, description: Wrestling }
 *         gnd: { type: number, minimum: 1, maximum: 100, description: Ground & Pound }
 *         sub: { type: number, minimum: 1, maximum: 100, description: Submissions }
 *         chn: { type: number, minimum: 1, maximum: 100, description: Chin/durability }
 *         fiq: { type: number, minimum: 1, maximum: 100, description: Fight IQ }
 *         overallRating:
 *           type: number
 *           description: Single progression number (weighted average of 8 stats)
 *         stamina: { type: number }
 *         maxStamina: { type: number }
 *         health: { type: number }
 *         energy: { type: number, minimum: 0, maximum: 100 }
 *         energyUpdatedAt: { type: string, format: date-time, description: Last time energy was updated (regen 1/min since) }
 *         iron: { type: number, description: In-game currency }
 *         notoriety: { type: number }
 *         promotionTier:
 *           type: string
 *           enum: [Amateur, Regional Pro, National, GCS Contender, GCS]
 *         gymId: { type: string, format: objectId, nullable: true }
 *         record:
 *           type: object
 *           properties:
 *             wins: { type: number }
 *             losses: { type: number }
 *             draws: { type: number }
 *             koWins: { type: number }
 *             subWins: { type: number }
 *             decisionWins: { type: number }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *       required: [firstName, lastName, weightClass, style]
 *
 *     FighterCreate:
 *       type: object
 *       required: [firstName, lastName, weightClass, style]
 *       properties:
 *         firstName: { type: string }
 *         lastName: { type: string }
 *         nickname: { type: string }
 *         weightClass:
 *           type: string
 *           enum: [Bantamweight, Featherweight, Lightweight, Welterweight]
 *         style:
 *           type: string
 *           enum: [Boxer, Kickboxer, Wrestler, Brazilian Jiu-Jitsu, Muay Thai, Judo, Sambo, Capoeira]
 *         backstory:
 *           type: string
 *           nullable: true
 *           enum: [Street Fighter, College Wrestler, Kickboxing Champion, Army Veteran, MMA Prodigy, Late Bloomer]
 *
 *     TrainRequest:
 *       type: object
 *       required: [gymId, sessionType]
 *       properties:
 *         gymId: { type: string, format: objectId }
 *         sessionType:
 *           type: string
 *           enum: [bag_work, footwork, kick_drills, pad_work, wrestling, clinch, bjj, submission, sparring, film_study, strength_conditioning, recovery]
 *
 *     Gym:
 *       type: object
 *       properties:
 *         _id: { type: string, format: objectId }
 *         name: { type: string }
 *         tier: { type: string, enum: [T1, T2, T3, T4, T5] }
 *         specialtyStats: { type: array, items: { type: string } }
 *         monthlyIron: { type: number }
 *         tierInfo: { type: object, description: Resolved from gameConstants (statCap, xpMultiplier, etc.) }
 *
 *     Opponent:
 *       type: object
 *       properties:
 *         _id: { type: string, format: objectId }
 *         name: { type: string }
 *         nickname: { type: string, nullable: true }
 *         weightClass: { type: string }
 *         style: { type: string }
 *         promotionTier: { type: string }
 *         overallRating: { type: number }
 *         str: { type: number }
 *         spd: { type: number }
 *         leg: { type: number }
 *         wre: { type: number }
 *         gnd: { type: number }
 *         sub: { type: number }
 *         chn: { type: number }
 *         fiq: { type: number }
 *         record: { type: object, properties: { wins: { type: number }, losses: { type: number }, draws: { type: number } } }
 *
 *     FightOffer:
 *       type: object
 *       properties:
 *         type: { type: string, enum: [Easy, Even, Hard] }
 *         opponent: { $ref: '#/components/schemas/Opponent' }
 *
 *     CreateOfferRequest:
 *       type: object
 *       required: [opponentId]
 *       properties:
 *         opponentId: { type: string, format: objectId }
 *         offerType: { type: string, enum: [Easy, Even, Hard], default: Even }
 *
 *     Fight:
 *       type: object
 *       properties:
 *         _id: { type: string, format: objectId }
 *         fighterId: { type: string, format: objectId }
 *         opponentId: { type: string, format: objectId }
 *         offerType: { type: string }
 *         promotionTier: { type: string }
 *         status: { type: string, enum: [offered, accepted, completed, cancelled] }
 *         outcome: { type: string, nullable: true }
 *         ironEarned: { type: number }
 *         xpMultiplier: { type: number }
 *         rounds: { type: array, items: { type: string } }
 *         completedAt: { type: string, format: date-time, nullable: true }
 *
 *     ResolveFightResult:
 *       type: object
 *       properties:
 *         fight: { $ref: '#/components/schemas/Fight' }
 *         fighter: { $ref: '#/components/schemas/Fighter' }
 *         result: { type: object, properties: { outcome: { type: string }, rounds: { type: array } } }
 */
