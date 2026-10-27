/**
 * In-memory fakes for the real-money shop tests. Injected through require.cache (the same
 * pattern as tests/services/guestAccount.qa.test.js), so nothing connects to Mongo, Redis,
 * Stripe or an email provider.
 *
 * Call installPaymentFakes() BEFORE anything requires services/paymentService.js (or
 * shopService.js). It returns a `state` object the tests read and reset.
 *
 * NOT a test file (no .test.js suffix), so `npm test` does not run it on its own.
 */
"use strict";
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const P = (rel) => path.resolve(ROOT, rel);

function inject(absPath, exports) {
    require.cache[absPath] = { id: absPath, filename: absPath, loaded: true, exports };
}

/** A Mongoose-like query: awaitable, with chainable select() and lean(). */
function query(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.lean = () => p;
    return p;
}

function matches(doc, filter) {
    return Object.keys(filter).every((key) => {
        const want = filter[key];
        const got = doc[key];
        if (want && typeof want === "object" && !Array.isArray(want)) {
            if ("$in" in want) return want.$in.map(String).includes(String(got));
            if ("$ne" in want) return String(got) !== String(want.$ne);
        }
        if (want === null) return got === null || got === undefined;
        return String(got) === String(want);
    });
}

function installPaymentFakes() {
    const state = {
        users: new Map(),
        fighters: new Map(),
        purchases: [],
        tracked: [],
        emails: [],
        stripeCreates: [],
        stripeKeys: [],
        sendEmailImpl: async () => ({ id: "fake-email" }),
        // Set to an async function that throws to simulate a failing grant write.
        fighterUpdateImpl: null,
        // Set to an async function that throws to simulate a failing chargeback claw-back write.
        clawbackImpl: null,
        nextSessionNo: 1,
        // payment_intent -> checkout session id, for checkout.sessions.list({ payment_intent }).
        sessionsByPi: new Map(),
        reset() {
            this.users.clear();
            this.fighters.clear();
            this.purchases.length = 0;
            this.tracked.length = 0;
            this.emails.length = 0;
            this.stripeCreates.length = 0;
            this.sendEmailImpl = async () => ({ id: "fake-email" });
            this.fighterUpdateImpl = null;
            this.clawbackImpl = null;
            this.sessionsByPi.clear();
        },
        addUser(u) { this.users.set(String(u._id), { ...u }); return this.users.get(String(u._id)); },
        addFighter(f) {
            const doc = {
                inventory: { energyDrinks: 0 },
                ...f,
                saves: 0,
                async save() { this.saves += 1; return this; },
                markModified() {},
            };
            this.fighters.set(String(f._id), doc);
            return doc;
        },
        addPurchase(p) {
            const doc = {
                stripePaymentIntentId: null, fulfilledByEventId: null, fulfilledAt: null,
                lastError: null, consentAccepted: null, amountTotalCents: null, taxCents: null,
                expiresAt: null, createdAt: new Date(), ...p,
            };
            this.purchases.push(doc);
            return doc;
        },
    };

    // ── Stripe ──────────────────────────────────────────────────────────────
    const fakeStripe = (key) => {
        state.stripeKeys.push(key);
        return {
            checkout: {
                sessions: {
                    async create(params, opts) {
                        state.stripeCreates.push({ params, opts });
                        const id = `cs_test_fake${state.nextSessionNo++}`;
                        return { id, url: `https://checkout.stripe.test/c/pay/${id}` };
                    },
                    async list({ payment_intent }) {
                        const id = state.sessionsByPi.get(payment_intent);
                        return { data: id ? [{ id }] : [] };
                    },
                },
            },
            webhooks: {
                // Only the literal "t=1,v1=valid" verifies; everything else is a forgery.
                constructEvent(raw, sig) {
                    if (sig !== "t=1,v1=valid") throw new Error("No signatures found matching the expected signature");
                    return JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
                },
            },
        };
    };
    inject(require.resolve("stripe"), fakeStripe);

    // ── Models ──────────────────────────────────────────────────────────────
    inject(P("models/userModel.js"), {
        findById: (id) => query(state.users.get(String(id)) || null),
        async updateOne(filter, update) {
            const doc = state.users.get(String(filter._id));
            if (!doc) return { matchedCount: 0, modifiedCount: 0 };
            Object.assign(doc, update.$set || {});
            return { matchedCount: 1, modifiedCount: 1 };
        },
    });
    inject(P("models/fighterModel.js"), {
        findById: (id) => query(state.fighters.get(String(id)) || null),
        async exists(filter) {
            return state.fighters.has(String(filter._id)) ? { _id: filter._id } : null;
        },
        // Supports exactly what paymentService.fulfil sends: {_id, paidPurchaseIds: {$ne}} with $inc + $push.
        async updateOne(filter, update) {
            const doc = state.fighters.get(String(filter._id));
            if (!doc) return { matchedCount: 0, modifiedCount: 0 };
            const ne = filter.paidPurchaseIds && filter.paidPurchaseIds.$ne;
            if (ne != null && (doc.paidPurchaseIds || []).map(String).includes(String(ne))) {
                return { matchedCount: 0, modifiedCount: 0 };
            }
            if (state.fighterUpdateImpl) await state.fighterUpdateImpl();
            for (const [k, v] of Object.entries(update.$inc || {})) {
                const [a, b] = k.split(".");
                doc[a] = doc[a] || {};
                doc[a][b] = (doc[a][b] || 0) + v;
            }
            for (const [k, v] of Object.entries(update.$push || {})) doc[k] = [...(doc[k] || []), v];
            return { matchedCount: 1, modifiedCount: 1 };
        },
        // Supports exactly what paymentService.clawBackDrinks sends: {_id, clawedBackPurchaseIds: {$ne}}
        // with a one-stage pipeline that sets energyDrinks = max(0, x - n) and appends the id.
        // Returns the PRE-update document. (The real pipeline is proven against local Mongo.)
        async findOneAndUpdate(filter, update) {
            const doc = state.fighters.get(String(filter._id));
            if (!doc) return null;
            const ne = filter.clawedBackPurchaseIds && filter.clawedBackPurchaseIds.$ne;
            if (ne != null && (doc.clawedBackPurchaseIds || []).map(String).includes(String(ne))) return null;
            if (state.clawbackImpl) await state.clawbackImpl();
            const set = update[0].$set;
            const n = set["inventory.energyDrinks"].$max[1].$subtract[1];
            const before = { ...doc, inventory: { ...doc.inventory } };
            doc.inventory.energyDrinks = Math.max(0, (doc.inventory.energyDrinks || 0) - n);
            doc.clawedBackPurchaseIds = [...(doc.clawedBackPurchaseIds || []), ne];
            return before;
        },
    });
    let purchaseNo = 0;
    inject(P("models/purchaseModel.js"), {
        async create(data) {
            purchaseNo += 1;
            const doc = state.addPurchase({ _id: `65a0000000000000000000${String(purchaseNo).padStart(2, "0")}`, ...data });
            return { ...doc };
        },
        findOne: (filter) => {
            const doc = state.purchases.find((d) => matches(d, filter));
            return query(doc ? { ...doc } : null);
        },
        async updateOne(filter, update) {
            const doc = state.purchases.find((d) => matches(d, filter));
            if (!doc) return { matchedCount: 0, modifiedCount: 0 };
            Object.assign(doc, update.$set || {});
            return { matchedCount: 1, modifiedCount: 1 };
        },
        async findOneAndUpdate(filter, update, opts = {}) {
            const doc = state.purchases.find((d) => matches(d, filter));
            if (!doc) return null;
            const before = { ...doc };
            Object.assign(doc, update.$set || {});
            return opts.new ? { ...doc } : before;
        },
    });

    // ── Side-effect services ────────────────────────────────────────────────
    inject(P("services/analyticsService.js"), {
        track(userId, type, meta, opts) {
            state.tracked.push({ userId: String(userId), type, meta, opts });
            return Promise.resolve();
        },
        computeRetention: async () => ({}),
    });

    // Real templates, fake transport.
    const realEmail = require(P("lib/email.js"));
    delete require.cache[P("lib/email.js")];
    inject(P("lib/email.js"), {
        ...realEmail,
        sendEmail: (args) => {
            state.emails.push(args);
            return state.sendEmailImpl(args);
        },
        sendAccountEmail: async () => { throw new Error("payments must not use sendAccountEmail"); },
    });

    return state;
}

module.exports = { installPaymentFakes, query, matches };
