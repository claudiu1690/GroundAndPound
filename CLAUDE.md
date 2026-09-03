# Ground and Pound — Project Memory

## What this is

A browser-based, text-driven MMA RPG. Backend: Node.js + Express + MongoDB +
Redis + BullMQ. Frontend: Vite React SPA. Gameplay is async and click-resolved —
no real-time coordination between players.

\---

## Stack \& folder layout

```
/
│   ├── routes/        # Express route handlers

&#x09;controllers/

&#x09;middleware/

&#x09;modules/

&#x09;scripts/
│   ├── models/        # Mongoose models
│   ├── jobs/          # BullMQ job definitions
│   ├── workers/       # BullMQ worker processes
│   ├── services/      # Business logic (no HTTP concerns)
│   └── utils/
├── frontend/               #  Vite React SPA app directory
│   ├── components/
│   ├── utils
│   └── lib/           # Client-side API helpers
├── docs/
│   ├── Ground-And-Pound-GDD.docx         # Game Design Document

&#x09;GAME\_GUIDE
```



\---

## Conventions

### Backend

* Route handlers are thin — validate input, call a service, return response.
Business logic lives in `server/services/`, never in route files.
* All Mongo writes go through Mongoose models. No raw driver calls unless
there's a documented performance reason.
* BullMQ jobs are defined in `server/jobs/`, processed in `server/workers/`.
Every job handler must have an `onFailed` path — silent failures are not
acceptable in async gameplay.
* Redis keys follow the pattern: `entity:id:property`
e.g. `player:abc123:session`, `fight:xyz:state`
* Validate all request bodies. Assume hostile input.
* Never expose internal error details to the client. Log them server-side.

### Frontend

* Pages in `app/`, shared components in `app/components/`.
* Every backend call must handle three states: loading, success, error.
Async gameplay means requests can be slow or fail — empty/error states
are not optional.
* Text-RPG output must be readable on click-resolve: clear state
transitions, no flicker.
* No business logic in components. Data fetching goes through hooks in
`app/hooks/`, API calls through helpers in `app/lib/`.

### General

* TypeScript throughout. No `any` unless explicitly justified in a comment.
* Tests live in `tests/` mirroring the source structure.
* Do not commit. Only the user does the commits.

\---

## Game design principles

* Async, click-resolved gameplay — no real-time player coordination.
* No end state or retirement — the game continues indefinitely.
* Take game features from the GDD. Also as a reference check Torn , legends of the green dragon games
* Also search the internet about game design rules

\---

## Design documents

* Full GDD: `docs/GDD.md`
* The game-designer and architect agents read these before any proposal.
Keep them current.

\---

## Documentation upkeep — MANDATORY after every major change

After **every major change**, update ALL THREE of these before considering the
work done:

1. **The GDD** (`docs/GDD.md`) — reflect any new/changed mechanic, numbers,
progression, economy, or system so the design doc never drifts from the code.
2. **The in-game Library** (`frontend/src/components/library/libraryContent.js`)
— add or update the player-facing article so players can learn the feature
in-game. If no article exists for the system, create one.
3. **The changelog** (`frontend/src/components/changelog/changelogContent.js`)
— add a new entry (newest first) with a bumped `version`; the first entry's
version IS the app version. 3–5 highlights in player language; balance lines
include a short "why". Set `major: true` only for releases worth auto-opening
the What's New modal. Never edit a shipped entry without bumping the version.

A "major change" = any new feature or mechanic, any balance/numbers change, any
new system or screen, or any change to player-facing behavior. Bug fixes,
refactors, and internal-only changes do **not** require doc updates (but update
the GDD if the fix changes documented behavior).

This is not optional cleanup — it is part of "done". When the work was a
**build-feature** run, this is pipeline step 6 (below). For any other major
change, do it before reporting completion. State explicitly what you updated (or
why no update was needed).

\---

## Git, releases and environments

Full playbook (audit, three workflow options, runbooks):
https://claude.ai/code/artifact/78577865-0a15-45ec-a871-794d4ad7ac75

### Branches (git-flow lite, chosen 2026-09-03)

* `main` = what production runs. `develop` = the next release, what staging runs.
* `release/X.Y` is cut from `develop` about a week before a drop; only fixes land
  on it, staging tracks it, it merges into `main` on release day.
* `feat/*`, `fix/*`, `hotfix/*` are short-lived (days). Name carries the issue:
  `feat/42-coach-market`. Commit prefix stays `[Area] message`.
* MERGE between long-lived branches, never cherry-pick. `git merge --no-ff` into
  `main`. After every release or hotfix, merge `main` back into `develop` the
  same day. Skipping that back-merge is how the landing page got forked twice.
* Delete a branch once merged. Old branches that only exist because their commits
  were cherry-picked are noise; `git cherry main <branch>` tells the truth.

### Versions and tags

* The top entry of `changelogContent.js` IS the version. Nothing else is.
* Tag = `v` + that version, always three parts (`v2.0.0`), annotated, on `main`
  only. Pushing a tag is the act of releasing.
* MAJOR = season number (Season 2 = `v2.0.0`), MINOR = feature release inside a
  season, PATCH = fixes only.
* `package.json` versions are not a source of truth; sync them on release or
  ignore them.

### Checks (no GitHub Actions)

* GitHub Actions is off: the account is billing-locked and will not be paid.
  Do not add workflow files.
* `.githooks/pre-push` runs `npm test` and the frontend build before every push.
  `npm install` enables it (the `prepare` script sets `core.hooksPath`).
  One-off skip: `SKIP_CHECKS=1 git push`.
* Known red test: the shop premium bundle check fails on `develop` until
  `stripe-integration` merges (the test was written for that branch's config).
* PR template: `.github/pull_request_template.md` (GDD, Library, changelog,
  tests, balance "why").

### Environments

| | Local | Staging | Production |
|---|---|---|---|
| Branch | any | `develop` (or `release/X.Y`) | `main` |
| API | localhost:4001 | Railway env `staging`, https://groundandpound-staging.up.railway.app | Railway env `production` |
| Web | localhost:5173 | Vercel project `ground-and-pound-staging`, https://ground-and-pound-staging.vercel.app | Vercel prod project |
| Mongo | docker compose | Atlas project "GroundAndPound Staging", cluster0, db `mmaGameStaging`, user `gp_staging` | Atlas prod project (M0), db `mmaGame` |
| Redis | docker compose | Railway Redis in the staging env (`redis.railway.internal`) | Railway Redis in prod env |

* Every push to `develop` redeploys both staging services. Staging has
  `NODE_ENV=staging`, its own `FRONTEND_URL` / `APP_URL` / `BACKEND_URL`, and
  `VITE_API_URL` baked into the Vercel build (change it, then redeploy).
* Staging test login: `pvp@test.com` / `pvptest123` (from `seedTestAccount.js`).
* Staging is seeded (2026-09-03) with 11 gyms, 201 opponents, Season 1 active
  with 25 ladder bots. Reseed order: `seedGyms`, `seedOpponents`,
  `seedPvpSeason1`, `seedPvpBots`, `seedTestAccount`. `scripts/seed.js` is stale
  (Gym now requires `slug`) and should be deleted with the gyms.
* Never point staging at the production database, not even to look.

### Running scripts against a database (READ BEFORE `node scripts/...`)

* The local `.env` has `LOCAL_MODE=false` and `USE_ATLAS=true`, so any script run
  from this folder with no override talks to PRODUCTION.
* Staging runs use the gitignored `.env.staging` (one line: `MONGODB_URI=...`):

  ```
  set -a; . ./.env.staging; set +a; USE_ATLAS=false LOCAL_MODE=false node scripts/<x>.js
  ```

  Check the `[config] Mongo:` boot line shows `cluster0.vcecey2` and
  `mmaGameStaging` before anything that deletes.
* Scripts that go through services (`seedTestAccount`, anything touching energy
  or PvP) open a Redis connection from `REDIS_URL_LOCAL`; local Redis must be
  running (docker compose) or the script hangs after "Done".

### Season cutover order (gyms to Training Camp)

1. Set `GYMS_RETIRED=true` on the API (gym endpoints answer 410, the frontend
   drops the Gym tab on its boot call). Nothing can write gym data from here.
2. `node scripts/grantGymRetirementCompensation.js`
3. `node scripts/wipeGymData.js`

Never wipe first. Take a `mongodump` right before step 3; that plus
`restoreGymData.js` is the rollback. Rehearse the whole sequence on staging
before doing it on production.

### Release runbook (Season 2 = v2.0.0 on 2026-09-20)

1. ~1 week out: `git checkout -b release/2.0 develop`, push, point staging at it.
2. Fixes only on `fix/*` into `release/2.0`; merge it into `develop` every day
   or two. Finalise the changelog entry, `major: true`.
3. Release day: `git checkout main && git merge --no-ff release/2.0`,
   `git tag -a v2.0.0`, `git push origin main --tags`. Prod deploys with
   `GYMS_RETIRED` still false.
4. Season open: cutover order above, on prod.
5. Same day: `git checkout develop && git merge main && git push`, delete
   `release/2.0`, close the milestone, open the next one.
6. Hotfix: `hotfix/*` from `main`, merge `--no-ff`, tag `v2.0.x`, then merge
   `main` into `develop`. The last step is not optional.

\---

## Workflows

### build-feature

When asked to **"build a feature"** (or "implement", "add", "create" a
feature), always run this full pipeline automatically in order:

**1. game-designer agent**
Spec the feature. Read the GDD and existing design docs first.
Produce: mechanic description, numbers, progression gating, data needs,
open questions. Resolve ambiguities from the GDD — only stop if a
decision genuinely cannot be inferred.

**2. architect agent**
Take the game-designer's spec. Read the codebase.
Produce: exact API contract (method, path, request/response shapes,
errors), Mongo/Redis/BullMQ changes, file placement, task ordering,
risks. This contract is the source of truth for both dev agents.

**3. backend-dev agent**
Implement strictly against the architect's contract.
Touch only `/server` and `/api`. Never touch `/app` or `/components`.
Return a summary: files changed, deviations from contract (with reason).

**4. frontend-dev agent**
Implement strictly against the same architect contract.
Touch only `/app` and `/components`. Never touch `/server` or `/api`.
Return a summary: files changed, endpoints consumed, contract mismatches.

**5. qa agent**
Write and run tests. Focus on: async/job logic, request isolation,
contract conformance, edge/error paths in the UI.
Return a pass/fail report with prioritised issues.

**6. Documentation upkeep (mandatory — see "Documentation upkeep" above)**
After qa passes, update the **GDD** (`docs/GDD.md`) and the **in-game Library**
(`frontend/src/components/library/libraryContent.js`) to reflect the feature.
Do not report the feature done until both are updated (or you've stated why one
needs no change).

**Pipeline rules:**

* Run steps 1 → 2 → 3 → 4 → 5 → 6 in order. Do not skip steps.
* Steps 3 and 4 both receive the same architect contract.
* Stop only if a step surfaces genuine blocking ambiguity that cannot
be resolved from this file, the GDD, or the existing code.
* After step 6, remind the user to commit.

**Usage:**

```
Build a feature: \[describe it in plain language]
```

\---

### fix-bug

When asked to **"fix a bug"**:

1. Use the **architect agent** to read the relevant code and identify
the root cause and the correct fix.
2. Use the appropriate **dev agent** (backend or frontend) to apply it.
3. Use the **qa agent** to confirm the fix and check for regressions.

\---

### review

When asked to **"review"** code or a feature:

1. Use the **qa agent** to audit and return a prioritised issue list.
No code changes — report only.

\---

### design advice

When asked to "design": 

1. search the internet about game design in general, priciples, rules
2. give advice on how to implement the feature
3. give impact on players or on game
4. give impact on integration with other features

## Architectural principles (enforced by architect at design time, devs at build time, qa at review)

- Routes/controllers stay thin; game logic lives in services; data access through Mongoose models.
- No duplicated game logic between API handlers and BullMQ job processors — shared logic gets one home.
- Every BullMQ job states its idempotency and retry behavior; every handler has an onFailed path.
- Shared request/response types are defined once (state where) and imported, not re-described.
- YAGNI: no abstraction layers for hypothetical needs. Simplest structure that satisfies the contract wins.

