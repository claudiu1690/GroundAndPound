/**
 * Enum drift guard for fire-and-forget event writers.
 *
 * activityLogService.log and analyticsService.track both swallow write errors by design, so
 * an event type missing from its Mongoose `type` enum is dropped silently: the player never
 * sees the career-feed entry and the funnel never sees the event. That already happened with
 * PERSONA_SIGNATURE / PERSONA_CROWNED (feed) and guest_signup (analytics).
 *
 * This test statically scans the backend source for every type string written through:
 *   - activityLogService.log(fighterId, TYPE, ...) in any receiver shape actually used
 *     (module binding, lazy getter `activityLog().log`, inline `require(...).log`, or a
 *     destructured `log` import),
 *   - ActivityLog.create / insertMany / insertOne / collection.insertMany / new ActivityLog,
 *   - analyticsService.track(userId, TYPE, ...) and AnalyticsEvent.create / insertMany,
 * and asserts each one is in the model enum.
 *
 * When TYPE is not a string literal, the call site must be registered in DYNAMIC_SOURCES
 * below with a resolver that finds the literals feeding it. An unregistered dynamic call
 * fails loudly, so a new call shape cannot slip past the guard unchecked.
 *
 * Mongo-free: only the schemas are loaded, nothing connects.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ActivityLog = require("../../models/activityLogModel");
const AnalyticsEvent = require("../../models/analyticsEventModel");

const ROOT = path.resolve(__dirname, "..", "..");
const SCAN_DIRS = [
    "services", "controllers", "jobs", "workers", "scripts", "utils",
    "modules", "lib", "routes", "middleware", "consts",
];
const SCAN_FILES = ["app.js", "config.js", "instrument.js"];

// ── Source loading ──────────────────────────────────────────────────────────

function listJsFiles(dir) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return [];
    const out = [];
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
        if (ent.name === "node_modules") continue;
        const rel = path.posix.join(dir, ent.name);
        if (ent.isDirectory()) out.push(...listJsFiles(rel));
        else if (ent.isFile() && ent.name.endsWith(".js")) out.push(rel);
    }
    return out;
}

function allSourceFiles() {
    const files = [];
    for (const d of SCAN_DIRS) files.push(...listJsFiles(d));
    for (const f of SCAN_FILES) if (fs.existsSync(path.join(ROOT, f))) files.push(f);
    return files;
}

/**
 * Length-preserving lexer pass. Returns:
 *   code: source with comments blanked (strings intact), for reading literal values;
 *   mask: code with string, template and regex literal CONTENTS blanked too (delimiters
 *         kept), for structural scanning (brackets, commas, property names).
 * Both have the same length as the input, so an index in one is valid in all three.
 */
function lex(src) {
    const n = src.length;
    const code = new Array(n);
    const mask = new Array(n);
    let i = 0;

    const put = (ch, masked) => {
        code[i] = ch;
        mask[i] = masked ? (ch === "\n" ? "\n" : " ") : ch;
        i += 1;
    };
    const blank = () => {
        const ch = src[i] === "\n" ? "\n" : " ";
        code[i] = ch;
        mask[i] = ch;
        i += 1;
    };

    // A "/" starts a regex literal when the previous significant code char cannot end an
    // operand, or the previous word is a keyword that precedes an expression.
    const REGEX_AFTER_WORD = /(?:^|[^\w$])(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/;
    function regexAllowed() {
        let k = i - 1;
        while (k >= 0 && /\s/.test(mask[k])) k -= 1;
        if (k < 0) return true;
        const ch = mask[k];
        if ("(,=:[!&|?{};+-*%<>~^".includes(ch)) return true;
        if (/[\w$]/.test(ch)) {
            let s = k;
            while (s >= 0 && /[\w$]/.test(mask[s])) s -= 1;
            return REGEX_AFTER_WORD.test(" " + mask.slice(s + 1, k + 1).join(""));
        }
        return false;
    }

    function quoted(q) {
        put(q, false);
        while (i < n && src[i] !== q && src[i] !== "\n") {
            if (src[i] === "\\" && i + 1 < n) put(src[i], true);
            put(src[i], true);
        }
        if (i < n && src[i] === q) put(q, false);
    }

    function regex() {
        put("/", false);
        let inClass = false;
        while (i < n && src[i] !== "\n") {
            const ch = src[i];
            if (ch === "\\" && i + 1 < n) { put(ch, true); put(src[i], true); continue; }
            if (ch === "[") inClass = true;
            else if (ch === "]") inClass = false;
            else if (ch === "/" && !inClass) break;
            put(ch, true);
        }
        if (i < n && src[i] === "/") put("/", false);
        while (i < n && /[a-z]/i.test(src[i])) put(src[i], false);
    }

    function template() {
        put("`", false);
        while (i < n) {
            const ch = src[i];
            if (ch === "\\" && i + 1 < n) { put(ch, true); put(src[i], true); continue; }
            if (ch === "`") { put("`", false); return; }
            if (ch === "$" && src[i + 1] === "{") {
                put("$", true);
                put("{", true);
                codeUntilBrace();
                if (i < n) put("}", true);
                continue;
            }
            put(ch, true);
        }
    }

    // Template ${...} bodies are code, but they are masked: no call site we care about
    // lives inside a template expression, and masking keeps the outer structure simple.
    function codeUntilBrace() {
        let depth = 0;
        while (i < n) {
            const ch = src[i];
            if (ch === "`") {
                const before = i;
                template();
                for (let k = before; k < i; k += 1) if (mask[k] !== "\n") mask[k] = " ";
                continue;
            }
            if (ch === '"' || ch === "'") {
                const before = i;
                quoted(ch);
                for (let k = before; k < i; k += 1) if (mask[k] !== "\n") mask[k] = " ";
                continue;
            }
            if (ch === "{") depth += 1;
            if (ch === "}") {
                if (depth === 0) return;
                depth -= 1;
            }
            put(ch, true);
        }
    }

    while (i < n) {
        const ch = src[i];
        const nx = src[i + 1];
        if (ch === "/" && nx === "/") {
            while (i < n && src[i] !== "\n") blank();
            continue;
        }
        if (ch === "/" && nx === "*") {
            blank(); blank();
            while (i < n && !(src[i] === "*" && src[i + 1] === "/")) blank();
            if (i < n) { blank(); blank(); }
            continue;
        }
        if (ch === '"' || ch === "'") { quoted(ch); continue; }
        if (ch === "`") { template(); continue; }
        if (ch === "/" && regexAllowed()) { regex(); continue; }
        put(ch, false);
    }
    return { code: code.join(""), mask: mask.join("") };
}

const OPEN = "([{";
const CLOSE = ")]}";

/** Split the argument list of the call whose "(" is at mask[openIdx]. */
function readArgs(mask, openIdx) {
    const args = [];
    let depth = 0;
    let start = openIdx + 1;
    for (let k = openIdx + 1; k < mask.length; k += 1) {
        const ch = mask[k];
        if (OPEN.includes(ch)) depth += 1;
        else if (CLOSE.includes(ch)) {
            if (depth === 0) {
                if (mask.slice(start, k).trim()) args.push({ start, end: k });
                return args;
            }
            depth -= 1;
        } else if (ch === "," && depth === 0) {
            args.push({ start, end: k });
            start = k + 1;
        }
    }
    throw new Error(`unbalanced call starting at ${openIdx}`);
}

/** End index of the expression starting at `from` (stops at a depth-0 , ; or closer). */
function readValueEnd(mask, from) {
    let depth = 0;
    for (let k = from; k < mask.length; k += 1) {
        const ch = mask[k];
        if (OPEN.includes(ch)) depth += 1;
        else if (CLOSE.includes(ch)) {
            if (depth === 0) return k;
            depth -= 1;
        } else if ((ch === "," || ch === ";") && depth === 0) return k;
    }
    return mask.length;
}

/** Index just past the bracketed group whose opener is at mask[openIdx]. */
function matchBracket(mask, openIdx) {
    let depth = 0;
    for (let k = openIdx; k < mask.length; k += 1) {
        if (OPEN.includes(mask[k])) depth += 1;
        else if (CLOSE.includes(mask[k])) {
            depth -= 1;
            if (depth === 0) return k + 1;
        }
    }
    throw new Error(`unbalanced group at ${openIdx}`);
}

const STRING_LITERAL = /^(["'])((?:\\.|(?!\1)[^\\\n])*)\1$/;
const PLAIN_TEMPLATE = /^`([^`$\\]*)`$/;

/** The string value if `text` is exactly one string literal, else null. */
function asLiteral(text) {
    const t = text.trim();
    let m = STRING_LITERAL.exec(t);
    if (m) return m[2];
    m = PLAIN_TEMPLATE.exec(t);
    return m ? m[1] : null;
}

/** Every string literal inside an expression (for ternaries like `a ? "x" : "y"`). */
function literalsIn(code, mask, start, end) {
    const out = [];
    const re = /(["'])/g;
    re.lastIndex = start;
    let m;
    while ((m = re.exec(mask)) && m.index < end) {
        const close = mask.indexOf(m[1], m.index + 1);
        out.push(code.slice(m.index + 1, close));
        re.lastIndex = close + 1;
    }
    return out;
}

/**
 * Every `type` property in [start, end): explicit `type: <expr>` or shorthand `type`.
 * Returns [{ literal, expr }] where literal is null for a non-literal value.
 */
function typeProps(code, mask, start, end) {
    const region = mask.slice(start, end);
    const out = [];
    const explicit = /(?<![\w$.])type\s*:\s*/g;
    let m;
    while ((m = explicit.exec(region))) {
        const vStart = start + m.index + m[0].length;
        const vEnd = readValueEnd(mask, vStart);
        const text = code.slice(vStart, vEnd);
        out.push({ literal: asLiteral(text), expr: text.trim().replace(/\s+/g, " ") });
    }
    const shorthand = /(?<=[{,]\s*)type(?=\s*[,}])/g;
    while ((m = shorthand.exec(region))) out.push({ literal: null, expr: "type" });
    return out;
}

// ── Call-site discovery ─────────────────────────────────────────────────────

function lineOf(src, idx) {
    return src.slice(0, idx).split("\n").length;
}

/** Identifiers bound by `X = require("<...>/<moduleName>")` in a file. */
function requireBindings(code, moduleName) {
    const re = new RegExp(`([\\w$]+)\\s*=\\s*require\\(\\s*["'][^"']*\\b${moduleName}(?:\\.js)?["']\\s*\\)`, "g");
    const names = new Set();
    let m;
    while ((m = re.exec(code))) names.add(m[1]);
    return names;
}

/** Local names bound to `method` by `const { method } / { method: alias } = require(...)`. */
function destructuredBindings(code, moduleName, method) {
    const re = new RegExp(`\\{([^}]*)\\}\\s*=\\s*require\\(\\s*["'][^"']*\\b${moduleName}(?:\\.js)?["']\\s*\\)`, "g");
    const names = new Set();
    let m;
    while ((m = re.exec(code))) {
        for (const part of m[1].split(",")) {
            const [key, alias] = part.split(":").map((s) => s.trim());
            if (key === method) names.add(alias || key);
        }
    }
    return names;
}

function requiresModule(code, moduleName) {
    return new RegExp(`require\\(\\s*["'][^"']*\\b${moduleName}(?:\\.js)?["']\\s*\\)`).test(code);
}

/**
 * Service-call sites: `<receiver>.<method>(a0, TYPE, ...)`, `require(".../svc").<method>(...)`
 * and destructured bare `<alias>(...)`. Receivers are any identifier (optionally a zero-arg
 * getter call) whose name contains `receiverHint`, which covers the module binding, the lazy
 * `_activityLogService` cache and badgeService's `activityLog()` getter.
 */
function serviceCalls(file, code, mask, { moduleName, method, receiverHint }) {
    const sites = [];
    const patterns = [
        new RegExp(`(?<![\\w$.])[\\w$]*${receiverHint}[\\w$]*(?:\\s*\\(\\s*\\))?\\s*\\.\\s*${method}\\s*\\(`, "gi"),
        new RegExp(`require\\(\\s*["'][^"']*\\b${moduleName}(?:\\.js)?["']\\s*\\)\\s*\\.\\s*${method}\\s*\\(`, "g"),
    ];
    for (const alias of destructuredBindings(code, moduleName, method)) {
        patterns.push(new RegExp(`(?<![\\w$.]|function\\s)${alias}\\s*\\(`, "g"));
    }
    const seen = new Set();
    for (const re of patterns) {
        let m;
        while ((m = re.exec(code))) {
            const openIdx = m.index + m[0].length - 1;
            if (mask[openIdx] !== "(" || seen.has(openIdx)) continue; // inside a string
            seen.add(openIdx);
            const args = readArgs(mask, openIdx);
            const line = lineOf(code, m.index);
            if (args.length < 2) {
                throw new Error(`${file}:${line} ${method}() call with fewer than 2 args; scanner cannot read its type`);
            }
            const text = code.slice(args[1].start, args[1].end);
            sites.push({ file, line, literal: asLiteral(text), expr: text.trim().replace(/\s+/g, " ") });
        }
    }
    return sites;
}

/** Model-write sites: `<Model>.create|insertMany|insertOne|collection.insertMany(...)`, `new <Model>(...)`. */
function modelWrites(file, code, mask, modelFile) {
    const sites = [];
    for (const name of requireBindings(code, modelFile)) {
        const re = new RegExp(
            `(?<![\\w$.])(?:${name}\\s*\\.\\s*(?:collection\\s*\\.\\s*)?(?:create|insertMany|insertOne)|new\\s+${name})\\s*\\(`,
            "g",
        );
        let m;
        while ((m = re.exec(mask))) {
            const openIdx = m.index + m[0].length - 1;
            const end = matchBracket(mask, openIdx);
            const line = lineOf(code, m.index);
            const props = typeProps(code, mask, openIdx + 1, end - 1);
            if (props.length === 0) {
                // e.g. Model.create(entry): the type is not visible here, force a resolver.
                const expr = code.slice(openIdx + 1, end - 1).trim().replace(/\s+/g, " ");
                sites.push({ file, line, literal: null, expr });
            }
            for (const p of props) sites.push({ file, line, ...p });
        }
    }
    return sites;
}

// ── Resolvers for non-literal type arguments ────────────────────────────────

const lexCache = new Map();
function lexFile(rel) {
    if (!lexCache.has(rel)) {
        const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
        lexCache.set(rel, lex(src));
    }
    return lexCache.get(rel);
}

function requireAllLiteral(props, where) {
    assert.ok(props.length > 0, `${where}: no \`type:\` properties found`);
    for (const p of props) {
        assert.ok(p.literal !== null, `${where}: non-literal type \`${p.expr}\`; extend the resolver`);
    }
    return props.map((p) => p.literal);
}

/** Literal `type:` values inside the body of `function fnName(...)`. */
function fromFunction(rel, fnName) {
    return () => {
        const { code, mask } = lexFile(rel);
        const m = new RegExp(`function\\s+${fnName}\\s*\\(`).exec(mask);
        assert.ok(m, `${rel}: function ${fnName} not found`);
        const paramsEnd = matchBracket(mask, m.index + m[0].length - 1);
        const bodyOpen = mask.indexOf("{", paramsEnd);
        const bodyEnd = matchBracket(mask, bodyOpen);
        return requireAllLiteral(typeProps(code, mask, bodyOpen + 1, bodyEnd - 1), `${rel} ${fnName}()`);
    };
}

/** Literal `type:` values inside the initializer of `const|let|var name = ...`. */
function fromDeclaration(rel, name) {
    return () => {
        const { code, mask } = lexFile(rel);
        const m = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`).exec(mask);
        assert.ok(m, `${rel}: declaration ${name} not found`);
        const start = m.index + m[0].length;
        const end = OPEN.includes(mask[start]) ? matchBracket(mask, start) : readValueEnd(mask, start);
        return requireAllLiteral(typeProps(code, mask, start, end), `${rel} ${name}`);
    };
}

/** Every string literal in every `prop: <expr>` value in the file (e.g. a ternary). */
function fromProperty(rel, prop) {
    return () => {
        const { code, mask } = lexFile(rel);
        const re = new RegExp(`(?<![\\w$.])${prop}\\s*:\\s*`, "g");
        const out = [];
        let m;
        while ((m = re.exec(mask))) {
            const vStart = m.index + m[0].length;
            const lits = literalsIn(code, mask, vStart, readValueEnd(mask, vStart));
            assert.ok(lits.length > 0, `${rel}:${lineOf(code, m.index)} ${prop} has no string literal`);
            out.push(...lits);
        }
        assert.ok(out.length > 0, `${rel}: no \`${prop}:\` values found`);
        return out;
    };
}

/** The writer's own parameter: every caller of it is scanned separately. */
const PASSTHROUGH = () => [];

const ACTIVITY_DYNAMIC = {
    "services/activityLogService.js::type": PASSTHROUGH,
    "services/fightService.js::titleWinDesc.log.type": fromFunction("services/fightService.js", "describeTitleWin"),
    "services/mediaHubService.js::e.type": fromFunction("services/personaService.js", "personaFeedEvents"),
    "services/interviewService.js::e.type": fromFunction("services/personaService.js", "personaFeedEvents"),
    "services/pvpRewardService.js::feedType": fromProperty("services/pvpRewardService.js", "feedType"),
    "scripts/seedMarketingAccount.js::e.type": fromDeclaration("scripts/seedMarketingAccount.js", "FEED"),
};

const ANALYTICS_DYNAMIC = {
    "services/analyticsService.js::type": PASSTHROUGH,
};

// ── Collection ──────────────────────────────────────────────────────────────

function collect({ service, model, dynamic }) {
    const sites = [];
    const requiringFiles = [];
    for (const file of allSourceFiles()) {
        const { code, mask } = lexFile(file);
        const before = sites.length;
        sites.push(...serviceCalls(file, code, mask, service));
        sites.push(...modelWrites(file, code, mask, model));
        const requires = requiresModule(code, service.moduleName) || requiresModule(code, model);
        if (requires) requiringFiles.push({ file, found: sites.length - before });
    }

    const types = new Map(); // type -> ["file:line", ...]
    const unresolved = [];
    for (const s of sites) {
        let values;
        if (s.literal !== null) values = [s.literal];
        else {
            const resolver = dynamic[`${s.file}::${s.expr}`];
            if (!resolver) { unresolved.push(`${s.file}:${s.line} type expression \`${s.expr}\``); continue; }
            values = resolver();
        }
        for (const v of values) {
            if (!types.has(v)) types.set(v, []);
            types.get(v).push(`${s.file}:${s.line}`);
        }
    }
    return { sites, types, unresolved, requiringFiles };
}

function enumOf(Model) {
    return new Set(Model.schema.path("type").enumValues);
}

// ── Scanner self-checks ─────────────────────────────────────────────────────

test("scanner ignores calls in comments and strings, reads literals and ternaries", () => {
    const src = [
        "// activityLogService.log(id, \"COMMENTED\", 'x')",
        "/* activityLogService.log(id, \"BLOCK\", 'x') */",
        "const s = \"activityLogService.log(id, 'IN_STRING', 'x')\";",
        "const r = /\\/\\*/g;",
        "activityLogService.log(id, \"REAL\", `t ${a / 2} // not a comment`, { k: 1 });",
        "activityLog().log(\n  id,\n  'GETTER',\n  'x',\n);",
        "require(\"./activityLogService\").log(id, e.type, e.detail);",
        "const x = { feedType: c ? \"A\" : \"B\" };",
    ].join("\n");
    const { code, mask } = lex(src);
    assert.equal(code.length, src.length);
    assert.equal(mask.length, src.length);
    const sites = serviceCalls("t.js", code, mask, {
        moduleName: "activityLogService", method: "log", receiverHint: "activityLog",
    });
    assert.deepStrictEqual(
        sites.map((s) => s.literal ?? `<${s.expr}>`).sort(),
        ["<e.type>", "GETTER", "REAL"],
    );
    const start = mask.indexOf("feedType");
    assert.deepStrictEqual(literalsIn(code, mask, start, mask.length), ["A", "B"]);
});

// ── The guards ──────────────────────────────────────────────────────────────

test("every activity-log type written anywhere in the backend is in the ActivityLog enum", () => {
    const { types, unresolved, requiringFiles } = collect({
        service: { moduleName: "activityLogService", method: "log", receiverHint: "activityLog" },
        model: "activityLogModel",
        dynamic: ACTIVITY_DYNAMIC,
    });

    assert.deepStrictEqual(unresolved, [], "register a resolver in ACTIVITY_DYNAMIC for these call sites");

    // A file that imports the writer but yields no site means the scanner missed a call
    // shape (read-only importers are allowed explicitly).
    const READ_ONLY = new Set(["controllers/fighterController.js", "services/dashboardService.js"]);
    const blind = requiringFiles.filter((f) => f.found === 0 && !READ_ONLY.has(f.file)).map((f) => f.file);
    assert.deepStrictEqual(blind, [], "these files import the activity log but no write was detected");

    // Floor: the scanner must still see the known writers, or it is passing vacuously.
    for (const known of ["FIGHT_WIN", "TITLE_WON", "BADGE_EARNED", "GYM_COMPENSATION",
        "pvp_win", "pvp_belt_won", "pvp_season_first", "PERSONA_CROWNED", "PERSONA_SIGNATURE",
        "PERSONA_BREAK_CHARACTER"]) {
        assert.ok(types.has(known), `scanner no longer sees ${known}; it is broken, not the enum`);
    }

    const allowed = enumOf(ActivityLog);
    const missing = [...types.keys()].filter((t) => !allowed.has(t))
        .map((t) => `${t} (${types.get(t).join(", ")})`);
    assert.deepStrictEqual(missing, [], "add these to models/activityLogModel.js type enum");
});

test("every analytics event type tracked anywhere in the backend is in the AnalyticsEvent enum", () => {
    const { types, unresolved, requiringFiles } = collect({
        service: { moduleName: "analyticsService", method: "track", receiverHint: "analytics" },
        model: "analyticsEventModel",
        dynamic: ANALYTICS_DYNAMIC,
    });

    assert.deepStrictEqual(unresolved, [], "register a resolver in ANALYTICS_DYNAMIC for these call sites");

    // Importers that only use the retention report, not track().
    const READ_ONLY = new Set(
        requiringFiles
            .filter((f) => /computeRetention/.test(lexFile(f.file).code) && !/\.track\s*\(/.test(lexFile(f.file).code))
            .map((f) => f.file),
    );
    const blind = requiringFiles.filter((f) => f.found === 0 && !READ_ONLY.has(f.file)).map((f) => f.file);
    assert.deepStrictEqual(blind, [], "these files import analytics but no track() was detected");

    for (const known of ["signup", "guest_signup", "session", "fight_resolved", "pvp_first_fight"]) {
        assert.ok(types.has(known), `scanner no longer sees ${known}; it is broken, not the enum`);
    }

    const allowed = enumOf(AnalyticsEvent);
    const missing = [...types.keys()].filter((t) => !allowed.has(t))
        .map((t) => `${t} (${types.get(t).join(", ")})`);
    assert.deepStrictEqual(missing, [], "add these to models/analyticsEventModel.js type enum");
});
