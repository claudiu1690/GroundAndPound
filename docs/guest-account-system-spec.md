# Guest Account System — Technical Spec

**Status:** design only, no code written yet.
**Scope:** Add an anonymous "guest" lane alongside the existing email-first lane. Guests get a real `User` + `Fighter`, play with zero restrictions, and can later claim an email+password. Email-first flow is untouched.

## Product decisions (fixed requirements)

1. **Guest resume = BOTH mechanisms** — a long-lived device token (the JWT in `localStorage`, silent auto-resume) **plus** an optional one-time recovery code shown once at creation (cross-device / data-loss recovery).
2. **Guest limits = NONE** — a guest can do everything a registered user can. Claiming an email is optional-but-nudged (in-app banner), never forced.
3. **Cleanup = PURGE** — a daily sweep hard-deletes unclaimed guest accounts (no email ever attached) inactive for 30 days.

## Assumptions

1. **Guests pick a fighter at creation** — reuse the existing register step-2 fighter form, skip email/password. No auto-generated random fighter.
2. **The JWT is the device token** — guests get the same `gnp_token`, minted with a longer expiry. The recovery code is the second (cross-device) mechanism.
3. **"Reveal recovery code" = regenerate** — only the SHA-256 hash is stored, so any "reveal" mints a fresh code and invalidates the old one.
4. **Recovery codes are guest-only** — cleared at claim; claimed accounts use the normal email + password-reset path.
5. **Claim password rules follow `accountService.validateNewPassword`** (min 8, ≥1 number). See Risks §8 for the register/claim discrepancy.
6. **Purge N = 30 days of inactivity.**

---

## 1. Data model changes

All changes to `models/userModel.js`.

### 1.1 Make credentials optional

```js
// BEFORE
email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
passwordHash: { type: String, required: true },

// AFTER
email:        { type: String, default: null, lowercase: true, trim: true },   // no inline unique
passwordHash: { type: String, default: null },
```

Removing inline `unique: true` is required — a partial unique index replaces it (below). Keeping both produces conflicting `email_1` index definitions.

### 1.2 New fields (append to schema)

```js
// ── Guest lane ────────────────────────────────────────────────
/** True while this is an unclaimed guest (no email attached). Flipped to
 *  false at claim time. Purge and UI both key off this. */
isGuest: { type: Boolean, default: false },

/** SHA-256 hex of the raw recovery code (never stored plaintext). Null for
 *  email-first accounts and cleared at claim. */
recoveryCodeHash:      { type: String, default: null },
recoveryCodeCreatedAt: { type: Date,   default: null },

/** Last authenticated activity. Stamped (throttled) by auth middleware for
 *  guests only; drives the inactivity purge. */
lastActiveAt: { type: Date, default: Date.now },
```

### 1.3 Indexes

```js
// Partial unique index — uniqueness enforced only on real email strings
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } }, name: "email_unique_partial" }
);

// Purge query support
userSchema.index({ isGuest: 1, lastActiveAt: 1 });

// Recovery-code lookup (sparse — only guests have one)
userSchema.index({ recoveryCodeHash: 1 }, { sparse: true });
```

Existing sparse token indexes are unchanged.

### 1.4 Migration / back-compat

- **Existing accounts** all have string `email` + `passwordHash`, `isGuest` defaults `false`, `recoveryCodeHash` null → never match purge, behave identically. No backfill needed.
- **Index swap must be explicit** (prod likely runs `autoIndex` off). Add `scripts/migrateGuestIndexes.js` that:
  1. `dropIndex('email_1')` (ignore `IndexNotFound`).
  2. Creates `email_unique_partial`, `{isGuest:1,lastActiveAt:1}`, sparse `recoveryCodeHash`.
  3. Is idempotent.
- **Run the migration BEFORE deploying** code that writes `email: null`, else the old non-partial unique index rejects a second null-email insert.

---

## 2. API contract

Controllers stay thin (validate → call service → respond). New logic lands in `services/accountService.js` except JWT minting (stays in `authController.signToken`).

### 2.1 `POST /auth/guest` — create guest (public)

- **Auth:** none. Under `/auth` (`authLimiter`) + new `guestCreateLimiter` (§6/§7).
- **Request:**
  ```json
  { "fighter": { "firstName": "string", "lastName": "string",
                 "nickname": "string|null", "weightClass": "string",
                 "style": "string", "backstory": "string|null" } }
  ```
- **Success 201:**
  ```json
  { "token": "<jwt>", "fighterId": "<id>", "accountId": "<id>",
    "recoveryCode": "XXXX-XXXX-XXXX-XXXX" }
  ```
  `recoveryCode` is returned here only, never again.
- **Errors:** `400` invalid/missing fighter fields or profanity rejection; `429` rate limited; `500`.
- **Service:** `accountService.createGuestAccount({ fighter })` → creates `User { isGuest:true, email:null, passwordHash:null, emailConfirmed:true }`, calls `fighterService.createFighter`, sets `fighterId`, generates recovery code, returns `{ user, fighter, recoveryCode }`. Controller mints token via `signToken(user, { guest:true })`.

### 2.2 `POST /account/:id/claim` — attach email+password (protected)

- **Auth:** `authMiddleware` + `requireSelf`.
- **Request:** `{ "email": "string", "password": "string" }`
- **Success 200:**
  ```json
  { "success": true, "token": "<fresh jwt>", "email": "user@x.com", "emailConfirmed": false }
  ```
  Fresh token because claim bumps `sessionEpoch` (mirrors existing `changePassword`).
- **Errors:**
  - `400 { code: "not_guest" }` — already has an email.
  - `400 { code: "invalid_email" }` / `400 { code: "weak_password" }`.
  - `409 { code: "email_taken" }` — pre-check **and** duplicate-key catch.
  - `404`; `500`.
- **Service:** `accountService.claimAccount(accountId, email, password)` → validate; `bcrypt.hash`; set `email`, `passwordHash`, `emailConfirmed=false`, `isGuest=false`, `recoveryCodeHash=null`, `recoveryCodeCreatedAt=null`, `sessionEpoch += 1`; save; fire-and-forget `sendVerifyEmail(user)`.

### 2.3 `POST /auth/guest/resume` — resume via recovery code (public)

- **Auth:** none. Under `/auth` (`authLimiter`) + per-IP Redis limiter.
- **Request:** `{ "recoveryCode": "XXXX-XXXX-XXXX-XXXX" }`
- **Success 200:** `{ "token": "<jwt>", "fighterId": "<id>", "accountId": "<id>" }`
- **Errors:** `400` missing code; `401 { code: "invalid_code" }` (generic — never reveals existence); `429`; `500`.
- **Service:** `accountService.resumeByRecoveryCode(rawCode)` → normalize + `hashToken` → `User.findOne({ recoveryCodeHash, isGuest:true, deleted:{$ne:true} })` → stamp `lastActiveAt = now` → return user. Controller mints fresh long-lived guest token. **No** `sessionEpoch` bump (multi-device intentional).

### 2.4 `POST /account/:id/recovery-code` — regenerate/reveal (protected)

- **Auth:** `authMiddleware` + `requireSelf`.
- **Request:** none.
- **Success 200:** `{ "recoveryCode": "XXXX-XXXX-XXXX-XXXX" }` (shown once).
- **Errors:** `400 { code: "not_guest" }`; `404`; `500`. Optional 60s cooldown via `recoveryCodeCreatedAt` → `429 { code:"cooldown_active", retryAfter }`.
- **Service:** `accountService.regenerateRecoveryCode(accountId)` → guard `isGuest`, generate raw, store hash + timestamp, return raw.

### 2.5 `GET /account/:id` — profile (extended, existing)

`getAccountProfile` adds to `.select(...)` and response:
```json
{ "isGuest": true, "hasRecoveryCode": true, "email": null }
```
`emailConfirmed`/`emailVerifyCooldown` unchanged. Frontend uses `isGuest` for banner precedence, `hasRecoveryCode` for "code already saved" state.

---

## 3. Session / identity

**`signToken(user, opts = {})`** — extend without breaking callers:
```js
function signToken(user, opts = {}) {
  return jwt.sign(
    { id: user._id, email: user.email || null, fighterId: user.fighterId,
      epoch: user.sessionEpoch || 1, guest: !!opts.guest },
    config.jwtSecret,
    { expiresIn: opts.guest ? config.guestJwtExpiresIn : config.jwtExpiresIn }
  );
}
```
- Add `config.guestJwtExpiresIn` (recommend `"365d"`). A guest with no saved recovery code has no other credential — a short expiry would silently lock them out. The long JWT is the "device token"; the recovery code covers loss/other-device.
- `email: null` in the payload is harmless — both middlewares override `req.user.email` with the live DB value.

**`authMiddleware` / `optionalAuthMiddleware`:**
- Extend `.select(...)` to also fetch `isGuest lastActiveAt`.
- Add `isGuest` to `req.user`.
- **Activity stamping (throttled):** after successful guest auth, if `Date.now() - lastActiveAt > 6h`, fire-and-forget `User.updateOne({_id}, {$set:{lastActiveAt:new Date()}})`. Guests only. Keeps an active guest's `lastActiveAt` ≤ ~6h stale — far inside the 30-day purge window. The lean read in `authMiddleware` is unaffected (separate un-awaited write).

**`sessionEpoch` interactions:**
- **Claim** → bump epoch + return fresh token (logs out other devices holding the old guest JWT — desirable).
- **Resume via recovery code** → no bump (device A stays logged in when resuming on device B).
- **Regenerate recovery code** → no change.

---

## 4. Recovery code

- **Generation:** `crypto.randomBytes(10)` → Crockford base32 (exclude I/L/O/U), 16 chars, `XXXX-XXXX-XXXX-XXXX` (80 bits). Helper `generateRecoveryCode()` in `accountService.js`.
- **Storage:** normalize (uppercase, strip dashes/whitespace) → `hashToken` (SHA-256 hex) → `recoveryCodeHash`. Never plaintext.
- **Single-view:** returned only from `POST /auth/guest` and `POST /account/:id/recovery-code`. `GET /account/:id` exposes `hasRecoveryCode` only.
- **Validation on resume:** normalize → `hashToken` → indexed lookup. No per-account guessing oracle; 80-bit brute force infeasible.
- **Rate limiting:** Redis per-IP (`guestresume:rate:<ip>`, ~10/hour), reusing `checkAndIncrementRateLimit` pattern. Falls open on Redis outage. Generic `401` on miss.
- **After claim:** `recoveryCodeHash` + `recoveryCodeCreatedAt` set null (no lingering passwordless backdoor).

---

## 5. Purge job

Reuse the existing hard-delete machinery pattern (`runHardDeleteSweep` + a queue/worker in `modules/scheduler.js`). Keep separate from the soft-delete sweep.

- **Service:** `accountService.runGuestPurgeSweep()`, modeled on `runHardDeleteSweep`:
  ```js
  const GUEST_PURGE_INACTIVE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  const cutoff = new Date(Date.now() - GUEST_PURGE_INACTIVE_MS);
  const candidates = await User.find({
    isGuest: true,
    email: null,
    deleted: { $ne: true },
    lastActiveAt: { $lte: cutoff },
  }).select("_id fighterId");
  // per-candidate: delete Fighter then User, try/catch each, count purged
  ```
  Returns `{ purged }`.
- **Queue/worker:** new `guestPurgeQueue` + `guestPurgeWorker` in `modules/scheduler.js`, alongside `hardDeleteQueue`.
- **Schedule:** daily — `repeat: { every: 86_400_000 }`, `jobId: "guest-purge-sweep"`, `removeOnComplete: true`, registered in `startEnergyIncrementScheduler`.
- **Idempotency:** deletes are naturally idempotent; safe to retry.
- **onFailed:** attach **both** `worker.on("error")` and `worker.on("failed", ...)`. Per-candidate failures caught/logged so one bad doc can't abort the batch.
- **N = 30 days**, "inactive" = `lastActiveAt` older than 30 days. Reuses the codebase's existing 30-day grace mental model. Active guests stamp `lastActiveAt` so they never qualify.

---

## 6. Frontend

Device token = existing `gnp_token` JWT. `authStorage.save(token, fighterId)` + boot-time `authStorage.isLoggedIn()` in `App.jsx` already give silent auto-resume with no change (the long JWT is picked up on load like a registered session).

### 6.1 `frontend/src/api.js` — new methods
```js
createGuest: (fighter) =>
  request("/auth/guest", { method:"POST", body: JSON.stringify({ fighter }) }),
resumeGuest: (recoveryCode) =>
  request("/auth/guest/resume", { method:"POST", body: JSON.stringify({ recoveryCode }) }),
claimAccount: (accountId, email, password) =>
  request(`/account/${accountId}/claim`, { method:"POST", body: JSON.stringify({ email, password }) }),
regenerateRecoveryCode: (accountId) =>
  request(`/account/${accountId}/recovery-code`, { method:"POST" }),
```

### 6.2 New components
- **`components/auth/GuestStart.jsx`** — "Play as guest": reuse register step-2 fighter fields, no email/password. Submit → `api.createGuest(fighter)` → `authStorage.save` → open `RecoveryCodeModal`, then `onAuthenticated(fighterId)` after confirm. States: loading / success (modal) / error.
- **`components/auth/RecoveryCodeModal.jsx`** — one-time reveal: show code, copy button, "I've saved it" confirm. Used by GuestStart and account-tab regenerate. Copy must be clear that it cannot be re-fetched.
- **`components/auth/ResumeWithCode.jsx`** — code input → `api.resumeGuest(code)` → save + `onAuthenticated`. States: loading / success / error (`invalid_code` generic, `429`). Entry link on `LandingPage` + `AuthPage`.
- **`components/account/GuestClaimPanel.jsx`** — "Secure your account": email + password → `api.claimAccount(...)` → on success `authStorage.save(freshToken, fighterId)` + refresh status (verify banner takes over). Handles `email_taken` (409), `weak_password`, `invalid_email`. Lives in `AccountTab`.
- **`components/account/GuestBanner.jsx`** — top-of-app nudge (styled like `EmailVerifyBanner`), CTA jumps to the claim panel. Never forced.

### 6.3 Wiring (`App.jsx`)
- Extend `accountStatus` with `isGuest` + `hasRecoveryCode`.
- **Banner precedence** where `EmailVerifyBanner` sits:
  - `accountStatus.isGuest` → `<GuestBanner/>` (guest has no email; verify banner must not show).
  - else `!emailConfirmed` → existing `<EmailVerifyBanner/>` (also covers the just-claimed unverified guest).
- `handleAuthenticated(fighterId)` reused unchanged by all guest entry points.

### 6.4 Landing / AuthPage entry points
- Add a **"Play as guest — no email needed"** button (opens `GuestStart`) + a small **"Resume with a recovery code"** link (opens `ResumeWithCode`), beside login/register.

### 6.5 Endpoints consumed
`POST /auth/guest`, `POST /auth/guest/resume`, `POST /account/:id/claim`, `POST /account/:id/recovery-code`, `GET /account/:id` (extended). All via existing `request()` (surfaces `err.code`, `err.retryAfter`, `err.status`).

---

## 7. Security & abuse

- **Guest-creation spam:** dedicated `guestCreateLimiter` (express-rate-limit, per-IP, ~5/hour, env-overridable) on `POST /auth/guest` in `app.js`, on top of `authLimiter`. The purge job bounds long-term accumulation.
- **Recovery-code brute force:** 80-bit code + indexed-hash lookup (no per-account oracle) + per-IP Redis limiter + generic `401`.
- **Claim race:** partial unique index + service pre-check + duplicate-key catch → `409 email_taken`.
- **PII / GDPR:** guests carry no PII until claim. Recovery code is a credential — hashed like passwords, never logged, only returned at creation/regenerate. The inactivity purge is data-minimization. The guest JWT in `localStorage` is functionally necessary storage; fold into existing cookie/consent copy.

---

## 8. File placement & task ordering

**Contract source of truth:** frontend is `.jsx` (no shared TS types dir). §2 response shapes are the contract both dev agents build against.

### Backend-only (build first)
1. `models/userModel.js` — optional email/passwordHash, new fields, indexes (§1).
2. `scripts/migrateGuestIndexes.js` — drop `email_1`, create partial + new indexes (§1.4). **Run before deploy.**
3. `config.js` — add `guestJwtExpiresIn`.
4. `services/accountService.js` — `createGuestAccount`, `claimAccount`, `generateRecoveryCode`, `regenerateRecoveryCode`, `resumeByRecoveryCode`, `runGuestPurgeSweep`, `getAccountProfile` extension.
5. `controllers/authController.js` — `createGuest`, `resumeGuest`, `signToken(user, opts)`.
6. `controllers/accountController.js` — `claim`, `regenerateRecoveryCode`, `getProfile` extension.
7. `routes/authRoutes.js` — `POST /guest`, `POST /guest/resume`.
8. `routes/accountRoutes.js` — `POST /:id/claim`, `POST /:id/recovery-code`.
9. `app.js` — `guestCreateLimiter` on `POST /auth/guest`.
10. `middleware/authMiddleware.js` + `optionalAuthMiddleware.js` — select `isGuest lastActiveAt`, expose `isGuest`, throttled activity stamp.
11. `modules/scheduler.js` — `guestPurgeQueue` + worker (`error` **and** `failed`) + daily registration.

### Frontend-only (build second, same contract)
12. `frontend/src/api.js` — 4 new methods.
13. `frontend/src/components/auth/GuestStart.jsx`, `RecoveryCodeModal.jsx`, `ResumeWithCode.jsx`.
14. `frontend/src/components/account/GuestClaimPanel.jsx`, `GuestBanner.jsx`.
15. `frontend/src/App.jsx` — `accountStatus.isGuest`, banner precedence.
16. `frontend/src/components/landing/LandingPage.jsx` + `components/auth/AuthPage.jsx` — guest CTA + resume link.
17. i18n strings.

### Docs (mandatory per CLAUDE.md)
18. `docs/GDD.md` — document the guest lane, recovery code, 30-day purge.
19. `frontend/src/components/library/libraryContent.js` — player-facing "Guest accounts & securing your account" article.

---

## 9. Risks & open questions

1. **Index migration ordering (highest risk).** Code that inserts `email: null` before `email_1` is dropped → old non-partial unique index rejects the second guest. **Resolution:** run `migrateGuestIndexes.js` before app boot.
2. **`autoIndex` in prod.** If off, new indexes won't self-create. Migration script creates them explicitly.
3. **Guest JWT expiry vs. no fallback credential.** A guest who saved neither the code nor stayed logged in is unrecoverable. **Resolution:** 365-day JWT + prominent one-time modal. Accept the by-design loss if both are ignored.
4. **Password-rule discrepancy (existing).** `register` = min-6; `validateNewPassword` (claim) = min-8 + number. Claimed guests face a stricter rule than direct registrants. Pre-existing; flagged, not fixed.
5. **`hardDeleteWorker` missing a `failed` handler (existing).** Only has `.on("error")`. New `guestPurgeWorker` gets both; existing gap flagged, not fixed unless asked.
6. **Orphaned related data on purge.** Existing hard-delete and this purge delete only `User` + `Fighter`, potentially orphaning PvP records etc. Same as today; flagged.
7. **Activity-stamp write amplification.** Mitigated by 6h throttle + guest-only. Could move to a Redis `lastActiveAt` key later (energy-sync pattern); deferred under YAGNI.
8. **Open question — should claim bump `sessionEpoch`?** Recommend yes (securing = take control). If product wants "claim silently, keep all devices," drop the bump + fresh-token return.
9. **Open question — recovery codes for claimed accounts?** Restricted to guests here, cleared at claim. Backup codes for registered users would be a separate feature.
