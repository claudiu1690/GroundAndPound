/**
 * Minimal localization helper.
 *
 * Prep-for-translation only — there is NO language switching yet. Every
 * user-facing string lives in `src/locales/en.json` under a namespaced key, and
 * components read it via `t("namespace.key")`. To add a language later, a future
 * dev drops in `fr.json` and swaps `messages` (or wires a provider) — no call
 * sites change.
 *
 * Usage:
 *   import { t } from "@/lib/i18n";
 *   t("pvp.title")                       -> "The Proving Ground"
 *   t("gym.sessionCost", { n: 8 })       -> "Costs 8 energy"   (en.json: "Costs {n} energy")
 *
 * Missing keys return the key string itself, so an un-migrated/typo'd key is
 * visible in the UI rather than crashing.
 */
import en from "../locales/en.json";

// Only English for now. Swap/extend this to switch languages later.
const messages = en;

function resolve(obj, path) {
    return path.split(".").reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}

/**
 * Translate a dot-path key, with optional {placeholder} interpolation.
 * @param {string} key   e.g. "pvp.title"
 * @param {object} [vars] e.g. { n: 8, name: "Alex" }
 * @returns {string}
 */
export function t(key, vars) {
    let str = resolve(messages, key);
    if (typeof str !== "string") return key; // visible fallback for missing keys
    if (vars) {
        str = str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
    }
    return str;
}

export default t;
