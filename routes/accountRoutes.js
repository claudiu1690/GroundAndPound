const express = require("express");
const router = express.Router();
const accountController = require("../controllers/accountController");

// All routes here are mounted under /account in app.js, BEHIND the auth
// middleware — except the email-confirm GET which is mounted separately
// because it's hit from an email link without a JWT.

router.get("/:id",                       accountController.getProfile);
router.patch("/:id/nickname",            accountController.patchNickname);
router.patch("/:id/notifications",       accountController.patchNotifications);
router.post("/:id/email/request",        accountController.requestEmailChange);
router.post("/:id/email/resend",         accountController.resendEmailChange);
router.delete("/:id/email/pending",      accountController.cancelEmailChange);
router.post("/:id/email/verify-resend",  accountController.resendVerifyEmail);
router.post("/:id/password",             accountController.changePassword);
router.delete("/:id",                    accountController.deleteAccount);

module.exports = router;
