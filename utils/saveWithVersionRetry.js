/**
 * Optimistic-concurrency save helper.
 *
 * Background heal jobs and lazy GET-tick can mutate the same fighter doc
 * concurrently. Mongoose's versionKey (__v) guards against lost updates: a stale
 * save throws a VersionError. This helper retries the full load+mutate+save cycle
 * on a fresh document so the loser of the race re-applies its mutation against the
 * winner's persisted state instead of clobbering it.
 *
 * @param {() => Promise<import("mongoose").Document|null>} loadFn
 *   Loads a FRESH document each attempt (e.g. () => Fighter.findById(id)).
 * @param {(doc: import("mongoose").Document) => (void|Promise<void>)} mutateFn
 *   Pure-document mutations only. Must be idempotent across reloads — side effects
 *   (Redis, energy) belong OUTSIDE this helper.
 * @param {{ retries?: number }} [opts]
 * @returns {Promise<import("mongoose").Document|null>} the saved doc, or null if loadFn returned null.
 */
async function saveWithVersionRetry(loadFn, mutateFn, { retries = 3 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const doc = await loadFn();
        if (!doc) return null;
        await mutateFn(doc);
        try {
            await doc.save();
            return doc;
        } catch (err) {
            if (err && err.name === "VersionError") {
                lastErr = err;
                continue;
            }
            throw err;
        }
    }
    // Exhausted retries — surface the version conflict rather than failing silently.
    throw lastErr;
}

module.exports = saveWithVersionRetry;
