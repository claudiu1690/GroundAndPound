# Ground & Pound: Chronicles of the Cage — Backend

MMA career RPG API aligned with the GDD (no levels; **Overall Rating** only; Energy, Iron, training, fights).

## Requirements

- **Node.js 18+** (required for Mongoose 8)
- **MongoDB** running locally (e.g. `localhost:27017`)

## Setup

```bash
npm install
```

Set `MONGODB_URI` if needed (default: `mongodb://localhost:27017/mmaGame`).

## Run

```bash
npm run dev
```

Server: `http://localhost:3000`.  
API docs: `http://localhost:3000/api-docs`.

## Seed data (optional)

Create a T1 gym and Amateur opponents so you can get fight offers and train:

```bash
npm run seed
```

## Main endpoints (game mechanics)

| Area | Method | Path | Notes |
|------|--------|------|--------|
| **Fighters** | POST | `/fighters` | Create fighter (firstName, lastName, weightClass, style, backstory?) |
| | GET | `/fighters/:id` | Get fighter (with gym populated) |
| | PUT | `/fighters/:id` | Update fighter |
| | PATCH | `/fighters/:id/energy` | Deduct energy (body: `{ amount }`) |
| | POST | `/fighters/:id/train` | Training session (body: `{ gymId, sessionType }`) |
| **Gyms** | GET | `/gyms` | List gyms (?tier=T1) |
| | GET | `/gyms/:id` | Get gym |
| **Fights** | GET | `/fights/offers/:fighterId` | Get 3 suggested offers (Easy/Even/Hard) |
| | POST | `/fights/offers/:fighterId` | Create offer (body: `{ opponentId, offerType }`) |
| | POST | `/fights/accept/:fighterId/:fightId` | Accept offer (deducts energy) |
| | POST | `/fights/camp/:fighterId` | Add training camp action |
| | POST | `/fights/resolve/:fighterId` | Resolve accepted fight (deducts energy, applies outcome) |

Legacy routes are still available: `/players`, `/quests`.

## Training session types

Use `sessionType` in `POST /fighters/:id/train`:  
`bag_work`, `footwork`, `kick_drills`, `pad_work`, `wrestling`, `clinch`, `bjj`, `submission`, `sparring`, `film_study` (T3+ gym), `strength_conditioning`, `recovery`.

## Constants and design

- **Overall Rating**: weighted average of 8 stats by style (primary ×1.2, secondary ×1.0, off-style ×0.85).
- **Stat progression**: XP per stat with GDD curve; gym tier caps (T1=35 … T5=95); stats 96–100 are fight XP only.
- **Energy**: max 100, regen 1/min (server-side, time-based). Reconciles on read/use via `energyUpdatedAt` + `date-fns`; no background scheduler.
- **Fights**: offer types Easy/Even/Hard; accept → camp (TCAs) → resolve; outcomes KO/TKO, Submission, Decision, Draw, Loss; Iron and Fight XP by outcome.

See `consts/gameConstants.js` for weights, tiers, and session definitions.
