const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/register",        authController.register);
router.post("/login",           authController.login);
router.post("/logout",          authController.logout);

// Guest lane — public. `POST /guest` carries an extra per-IP guestCreateLimiter
// applied at mount time in app.js (on top of the /auth authLimiter). `POST
// /guest/resume` is throttled per-IP via a Redis limiter inside the controller.
router.post("/guest",           authController.createGuest);
router.post("/guest/resume",    authController.resumeGuest);

// Account recovery — same-shape response as /login on success (token + fighterId)
// so the client can hand off seamlessly. Only works inside the 30-day grace
// window; see authController.recoverAccount.
router.post("/recover",         authController.recoverAccount);

// Forgot-password flow — unauthenticated. The endpoints intentionally don't
// confirm or deny account existence (see authController).
router.post("/forgot-password", authController.forgotPassword);
router.get("/reset-password",   authController.checkResetToken);   // ?token=...
router.post("/reset-password",  authController.resetPassword);

// Email verification — public link from the verification email. Redirects
// back to the frontend with ?email_verified=true or ?email_verify_error=...
router.get("/verify-email",     authController.verifyEmail);

module.exports = router;
