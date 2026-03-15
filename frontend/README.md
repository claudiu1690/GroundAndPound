# Ground & Pound — Frontend

Basic web UI to play the game with your fighter (e.g. the demo fighter from seed).

## Run

1. **Backend** (from project root): ensure MongoDB is running, then:
   - `npm run seed` (if you haven’t already)
   - `npm run dev`
2. **Frontend** (from this folder):
   - `npm install`
   - `npm run dev`
3. Open the URL Vite prints (e.g. http://localhost:5173).

## What you can do

- **Select fighter** — Use the dropdown (first fighter is auto-selected if you seeded).
- **Train** — Pick a gym and session type, click Train (costs energy).
- **Fights** — Click “Get offers”, then “Accept fight” on an offer. Optionally “Add camp action”, then “Resolve fight” to run the fight and see the outcome.

Energy is reconciled on every request and ticks in the backend every minute; the page refetches the fighter every 60s so the number updates.

## API URL

The app calls `http://localhost:3000` by default. To use another backend:

```bash
VITE_API_URL=http://localhost:4000 npm run dev
```
