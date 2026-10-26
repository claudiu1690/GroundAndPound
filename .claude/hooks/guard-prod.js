/**
 * PreToolUse hook (Bash / PowerShell): forces a permission prompt for any command that could
 * reach PRODUCTION, whatever the session's permission mode or allow rules say.
 *
 * Why: on 2026-10-22 a `node -e "require('./scripts/seedOpponents.js')"` ran unprompted and
 * wrote 200 opponents into the prod database. The owner's rule since then: nothing runs
 * against production without their explicit approval.
 *
 * It only ever answers "ask" (never "deny"), so the owner can still approve a deliberate prod
 * step. Anything it cannot parse is let through untouched; config.js is the second guard.
 */
const RULES = [
    [/CONFIRM_PROD/, "sets CONFIRM_PROD (opts a script into the PRODUCTION database)"],
    [/bpkycdn|MONGODB_URI_ATLAS/, "names the PRODUCTION Mongo cluster"],
    [/\bmongo(sh|dump|restore|import|export)?\b[^\n]*mongodb(\+srv)?:\/\//, "opens a Mongo shell/tool on a remote URI"],
    [/\brailway\b/, "uses the Railway CLI (production and staging services)"],
    [/\bvercel\b[^\n]*(--prod|promote|rollback|env\b)/, "touches a Vercel production deployment or env"],
    [/\bgit\b[^\n]*\bpush\b[^\n]*(\bmain\b|--tags|\bv\d+\.\d+\.\d+\b|--mirror|--all)/, "pushes to main or pushes tags (production deploy / release)"],
    [/\bgit\b[^\n]*\bpush\b[^\n]*(-f\b|--force)/, "force-pushes"],
];

let raw = "";
process.stdin.on("data", (c) => { raw += c; });
process.stdin.on("end", () => {
    let command = "";
    try {
        command = String(JSON.parse(raw)?.tool_input?.command || "");
    } catch {
        return; // not our payload: stay out of the way
    }
    const hits = RULES.filter(([re]) => re.test(command)).map(([, why]) => why);
    if (!hits.length) return;
    process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason: `PRODUCTION GUARD: this command ${hits.join("; ")}. Approve only if you meant to touch production.`,
        },
    }));
});
