/**
 * Migration: Guest Account System — index swap.
 *
 * The guest lane makes `email` optional (nullable). The old non-partial unique
 * index `email_1` rejects a SECOND document with `email: null`, so it must be
 * replaced with a partial unique index that only enforces uniqueness on real
 * email strings.
 *
 * This script:
 *   1. Drops `email_1` (ignores IndexNotFound if it's already gone).
 *   2. Creates `email_unique_partial` (unique, partial on string emails).
 *   3. Creates `{ isGuest: 1, lastActiveAt: 1 }` (purge query support).
 *   4. Creates the sparse `recoveryCodeHash` index (resume lookup).
 *
 * Idempotent: re-running is safe — createIndex is a no-op when the index
 * already exists with the same spec, and the drop tolerates a missing index.
 *
 * MUST be run BEFORE deploying code that writes `email: null`, otherwise the
 * old `email_1` index rejects the second guest insert.
 *
 * Run: node scripts/migrateGuestIndexes.js
 */
const mongoose = require("mongoose");
const config = require("../config");

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    const users = mongoose.connection.collection("users");

    // 1. Drop the legacy non-partial unique index. Tolerate its absence.
    try {
        await users.dropIndex("email_1");
        console.log("Dropped legacy index email_1");
    } catch (err) {
        // 27 = IndexNotFound, 26 = NamespaceNotFound (fresh DB, collection not
        // created yet). Also match by message for older server versions.
        if (err.code === 27 || err.code === 26 || /index not found|ns not found/i.test(err.message || "")) {
            console.log("email_1 not present — nothing to drop");
        } else {
            throw err;
        }
    }

    // 2. Partial unique index — uniqueness only on real email strings.
    await users.createIndex(
        { email: 1 },
        {
            unique: true,
            partialFilterExpression: { email: { $type: "string" } },
            name: "email_unique_partial",
        }
    );
    console.log("Ensured index email_unique_partial");

    // 3. Purge query support.
    await users.createIndex({ isGuest: 1, lastActiveAt: 1 });
    console.log("Ensured index { isGuest: 1, lastActiveAt: 1 }");

    // 4. Recovery-code lookup (sparse).
    await users.createIndex({ recoveryCodeHash: 1 }, { sparse: true });
    console.log("Ensured sparse index { recoveryCodeHash: 1 }");

    console.log("Guest index migration complete.");
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error("migrateGuestIndexes failed:", err);
    process.exit(1);
});
