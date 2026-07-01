import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { api, authStorage } from "../../api";

// Category enum — must match backend model enum exactly.
// Values: "gameplay" | "ui_display" | "account_payments" | "other"
const CATEGORIES = [
  { value: "gameplay",          label: "Gameplay" },
  { value: "ui_display",        label: "UI & Display" },
  { value: "account_payments",  label: "Account & Payments" },
  { value: "other",             label: "Other" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY_FIELDS = { category: "", description: "", email: "" };

/**
 * Self-contained "Report a Bug" modal.
 *
 * Open it from anywhere in the tree with:
 *   window.dispatchEvent(new CustomEvent("open-bug-report"))
 *
 * Mirrors the subscribe/cleanup pattern from LegalModals.jsx.
 * Renders once per tree via createPortal to document.body.
 */
export function ReportBugModal() {
  const [open, setOpen]       = useState(false);
  const [fields, setFields]   = useState(EMPTY_FIELDS);
  // status: "idle" | "submitting" | "success" | "error"
  const [status, setStatus]   = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [reportId, setReportId] = useState(null);
  // Force-show the email field even when a token exists. A 30-day token can be
  // expired-but-present in localStorage; the server then treats the submit as
  // anonymous and requires an email. Without this the user would be stuck with
  // a "email required" error and no field to fill.
  const [forceEmail, setForceEmail] = useState(false);

  const loggedIn = authStorage.isLoggedIn();
  const showEmail = !loggedIn || forceEmail;

  // Always reset on close so the next open starts fresh.
  const close = useCallback(() => {
    setOpen(false);
    setFields(EMPTY_FIELDS);
    setStatus("idle");
    setErrorMsg("");
    setReportId(null);
    setForceEmail(false);
  }, []);

  // Subscribe to the open-bug-report custom event.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-bug-report", handler);
    return () => window.removeEventListener("open-bug-report", handler);
  }, []);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  // Auto-dismiss 3 s after a successful submission.
  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(close, 3000);
    return () => clearTimeout(timer);
  }, [status, close]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFields((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Lightweight client-side validation — server messages are authoritative.
    if (!fields.category) {
      setErrorMsg("Please select a category.");
      setStatus("error");
      return;
    }
    const desc = fields.description.trim();
    if (desc.length < 10) {
      setErrorMsg("Description must be at least 10 characters.");
      setStatus("error");
      return;
    }
    if (desc.length > 2000) {
      setErrorMsg("Description must be 2000 characters or fewer.");
      setStatus("error");
      return;
    }
    if (showEmail && !EMAIL_RE.test(fields.email.trim())) {
      setErrorMsg("Please enter a valid email address.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    const body = {
      category: fields.category,
      description: desc,
      pageUrl: window.location.href,
    };
    // Include email whenever the field is shown. When a valid JWT is present the
    // server uses the account email and ignores this; when the token is missing
    // or stale it's treated as anonymous and the email is required.
    if (showEmail) body.email = fields.email.trim();

    try {
      const data = await api.reportBug(body);
      setReportId(data.reportId || null);
      setStatus("success");
    } catch (err) {
      // Stale/expired token → server treats us as anonymous and needs an email.
      // Reveal the field so the user can recover without a page refresh.
      if (err.code === "bad_email") setForceEmail(true);
      // Keep entered values so the user can retry without re-typing.
      setErrorMsg(err.message || "Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  if (!open) return null;

  const descLen      = fields.description.length;
  const isSubmitting = status === "submitting";

  const node = (
    <div className="account-modal-backdrop" onClick={close}>
      <div
        className="account-modal bug-report-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Report a Bug"
      >
        <header className="account-modal-head">
          <h3 className="account-modal-title">Report a Bug</h3>
          <button
            type="button"
            className="account-modal-x"
            onClick={close}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {status === "success" ? (
          <>
            <div className="account-modal-body">
              <p className="bug-report-success-text">
                Bug report submitted
                {reportId ? ` (#${String(reportId).slice(-6)})` : ""}
                . Thanks for helping improve Ground &amp; Pound!
              </p>
            </div>
            <footer className="account-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={close}>
                Close
              </button>
            </footer>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="account-modal-body bug-report-form">
              {status === "error" && errorMsg && (
                <p className="bug-report-error" role="alert">{errorMsg}</p>
              )}

              <div className="bug-report-field">
                <label className="bug-report-label" htmlFor="br-category">
                  Category
                </label>
                <select
                  id="br-category"
                  name="category"
                  className="bug-report-control"
                  value={fields.category}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  required
                >
                  <option value="">— Select a category —</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bug-report-field">
                <label className="bug-report-label" htmlFor="br-description">
                  Description
                </label>
                <textarea
                  id="br-description"
                  name="description"
                  className="bug-report-control bug-report-textarea"
                  value={fields.description}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  placeholder="Describe what happened and how to reproduce it…"
                  rows={5}
                  required
                  minLength={10}
                  maxLength={2000}
                />
                <span
                  className={
                    "bug-report-charcount" +
                    (descLen > 1900 ? " bug-report-charcount--warn" : "")
                  }
                >
                  {descLen} / 2000
                </span>
              </div>

              {showEmail && (
                <div className="bug-report-field">
                  <label className="bug-report-label" htmlFor="br-email">
                    Your Email
                  </label>
                  <input
                    id="br-email"
                    type="email"
                    name="email"
                    className="bug-report-control"
                    value={fields.email}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    placeholder="so we can follow up if needed"
                    required
                  />
                </div>
              )}
            </div>

            <footer className="account-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={close}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Sending…" : "Submit Report"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
