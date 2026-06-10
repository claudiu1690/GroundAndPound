/**
 * Generate GAME_GUIDE.md from the in-game Library.
 *
 * The Library (`frontend/src/components/library/libraryContent.js`) is the single
 * source of truth for player-facing system descriptions. GAME_GUIDE.md is a
 * read-only Markdown export of it for out-of-game reading (wiki seed, onboarding).
 *
 * Run:  node scripts/generateGameGuide.mjs
 * (Re-run after any Library change so the guide never drifts.)
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
    LIBRARY_CATEGORIES,
    LIBRARY_ARTICLES,
} from "../frontend/src/components/library/libraryContent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "GAME_GUIDE.md");

const escapeCell = (c) => String(c ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");

function renderTable(block) {
    const headers = block.headers || [];
    const head = `| ${headers.map(escapeCell).join(" | ")} |`;
    const sep = `| ${headers.map(() => "---").join(" | ")} |`;
    const rows = (block.rows || []).map(
        (r) => `| ${r.map(escapeCell).join(" | ")} |`
    );
    return [head, sep, ...rows].join("\n");
}

function renderBody(body) {
    return (body || [])
        .map((block) => {
            if (typeof block === "string") return block;
            if (block && block.type === "table") return renderTable(block);
            return "";
        })
        .filter(Boolean)
        .join("\n\n");
}

const out = [];
out.push("# Ground & Pound — Game Guide");
out.push("");
out.push(
    "> **Auto-generated** from the in-game Library " +
    "(`frontend/src/components/library/libraryContent.js`). " +
    "**Do not edit by hand** — run `node scripts/generateGameGuide.mjs` to regenerate. " +
    "The Library is the source of truth for player-facing system descriptions; this file " +
    "is a read-only export for out-of-game reading."
);
out.push("");

// Table of contents
out.push("## Contents");
out.push("");
for (const cat of LIBRARY_CATEGORIES) {
    const arts = LIBRARY_ARTICLES.filter((a) => a.category === cat);
    if (!arts.length) continue;
    out.push(`**${cat}**`);
    for (const a of arts) out.push(`- ${a.title}`);
    out.push("");
}
out.push("---");
out.push("");

// Articles grouped by category
for (const cat of LIBRARY_CATEGORIES) {
    const arts = LIBRARY_ARTICLES.filter((a) => a.category === cat);
    if (!arts.length) continue;
    out.push(`## ${cat}`);
    out.push("");
    for (const a of arts) {
        out.push(`### ${a.title}`);
        out.push("");
        if (a.summary) {
            out.push(`*${a.summary}*`);
            out.push("");
        }
        out.push(renderBody(a.body));
        out.push("");
        if (a.keyTakeaway) {
            out.push(`> **Key takeaway:** ${a.keyTakeaway}`);
            out.push("");
        }
    }
    out.push("---");
    out.push("");
}

const text = out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
writeFileSync(OUT, text, "utf8");
console.log(
    `Wrote ${OUT} — ${LIBRARY_ARTICLES.length} articles across ` +
    `${LIBRARY_CATEGORIES.filter((c) => LIBRARY_ARTICLES.some((a) => a.category === c)).length} categories.`
);
