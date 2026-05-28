const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/register",        authController.register);
router.post("/login",           authController.login);
router.post("/logout",          authController.logout);

// Account recovery — same-shape response as /login on success (token + fighterId)
// so the client can hand off seamlessly. Only works inside the 30-day grace
// window; see authController.recoverAccount.
router.post("/recover",         authController.recoverAccount);

// Forgot-password flow — unauthenticated. The endpoints intentionally don't
// confirm or deny account existence (see authController).
router.post("/forgot-password", authController.forgotPassword);
router.get("/reset-password",   authController.checkResetToken);   // ?token=...
router.post("/reset-password",  authController.resetPassword);

module.exports = router;
