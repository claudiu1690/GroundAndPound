const mongoose = require("mongoose");

/**
 * Player-submitted bug report. Public endpoint — works logged-out; identity is
 * attached (accountId / fighterId / reporterEmail) when a valid JWT is present.
 *
 * On save the service best-effort emails a notification to the ops inbox; a
 * failed email never fails the request — the report is persisted first.
 */
const bugReportSchema = new mongoose.Schema(
    {
        // Report category. IMPORTANT: this enum is mirrored by the frontend
        // "Report a Bug" <select>. Keep the two in sync — adding/renaming a
        // category here means updating the frontend options too.
        category: {
            type: String,
            enum: ["gameplay", "ui_display", "account_payments", "other"],
            required: true,
        },
        description:   { type: String, required: true, trim: true, maxlength: 2000 },
        reporterEmail: { type: String, default: null },
        fighterId:     { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", default: null, index: true },
        accountId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        pageUrl:       { type: String, default: null, maxlength: 500 },
        userAgent:     { type: String, default: null, maxlength: 500 },
        status: {
            type: String,
            enum: ["new", "reviewed", "resolved"],
            default: "new",
            index: true,
        },
    },
    { timestamps: true }
);

bugReportSchema.index({ createdAt: -1 });
bugReportSchema.index({ status: 1, createdAt: -1 });

const BugReport = mongoose.model("BugReport", bugReportSchema);
module.exports = BugReport;
