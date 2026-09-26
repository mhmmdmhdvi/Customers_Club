const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminMfaResetService,
} = require(
    "../src/services/admin-mfa-reset.service",
);

test("rotates an existing ADMIN MFA credential and invalidates challenges", async () => {
    const calls = [];

    const db = {
        user: {
            findUnique: async () => ({
                id: 1,
                role: "ADMIN",
            }),
        },

        adminMfaChallenge: {
            updateMany: async (args) => {
                calls.push({
                    type: "challenges",
                    args,
                });

                return {
                    count: 1,
                };
            },
        },

        adminMfaCredential: {
            update: async (args) => {
                calls.push({
                    type: "credential",
                    args,
                });

                return {};
            },
        },
    };

    db.$transaction =
        async (callback) =>
            callback(db);

    const mfaCrypto = {
        encrypt: () => ({
            ciphertext:
                "ciphertext",
            iv:
                "iv",
            tag:
                "tag",
        }),
    };

    const reset =
        createAdminMfaResetService(
            db,
            {
                mfaCrypto,

                randomBytes: () =>
                    Buffer.alloc(
                        20,
                        1,
                    ),
            },
        );

    const result =
        await reset(1);

    assert.equal(
        result.userId,
        1,
    );

    assert.equal(
        typeof result.secret,
        "string",
    );

    assert.ok(
        result.secret.length > 0,
    );

    assert.equal(
        calls[0].type,
        "challenges",
    );

    assert.equal(
        calls[1].type,
        "credential",
    );

    assert.equal(
        calls[1].args.data.lastUsedCounter,
        null,
    );
});

test("maps the production MFA crypto output into credential columns", async () => {
    let credentialUpdate;

    const db = {
        user: {
            findUnique: async () => ({
                id: 1,
                role: "ADMIN",
            }),
        },

        adminMfaChallenge: {
            updateMany: async () => ({
                count: 0,
            }),
        },

        adminMfaCredential: {
            update: async (args) => {
                credentialUpdate = args;

                return {};
            },
        },
    };

    db.$transaction =
        async (callback) =>
            callback(db);

    const mfaCrypto = {
        encrypt: () => ({
            ciphertext:
                "ciphertext",
            iv:
                "iv",
            tag:
                "tag",
        }),
    };

    const reset =
        createAdminMfaResetService(
            db,
            {
                mfaCrypto,

                randomBytes: () =>
                    Buffer.alloc(
                        20,
                        1,
                    ),
            },
        );

    await reset(1);

    assert.deepEqual(
        credentialUpdate.data,
        {
            secretCiphertext:
                "ciphertext",
            secretIv:
                "iv",
            secretTag:
                "tag",
            lastUsedCounter:
                null,
        },
    );
});

test("uses one database transaction for the MFA reset", async () => {
    let transactionCalled = 0;
    let outerDatabaseTouched = false;

    const tx = {
        user: {
            findUnique: async () => ({
                id: 1,
                role: "ADMIN",
            }),
        },

        adminMfaChallenge: {
            updateMany: async () => ({
                count: 1,
            }),
        },

        adminMfaCredential: {
            update: async () => ({}),
        },
    };

    const db = {
        $transaction: async (callback) => {
            transactionCalled += 1;

            return callback(tx);
        },

        user: {
            findUnique: async () => {
                outerDatabaseTouched = true;

                throw new Error(
                    "Reset must use the transaction client",
                );
            },
        },

        adminMfaChallenge: {
            updateMany: async () => {
                outerDatabaseTouched = true;

                throw new Error(
                    "Reset must use the transaction client",
                );
            },
        },

        adminMfaCredential: {
            update: async () => {
                outerDatabaseTouched = true;

                throw new Error(
                    "Reset must use the transaction client",
                );
            },
        },
    };

    const mfaCrypto = {
        encrypt: () => ({
            ciphertext:
                "ciphertext",
            iv:
                "iv",
            tag:
                "tag",
        }),
    };

    const reset =
        createAdminMfaResetService(
            db,
            {
                mfaCrypto,

                randomBytes: () =>
                    Buffer.alloc(
                        20,
                        1,
                    ),
            },
        );

    const result =
        await reset(1);

    assert.equal(
        transactionCalled,
        1,
    );

    assert.equal(
        outerDatabaseTouched,
        false,
    );

    assert.equal(
        result.userId,
        1,
    );
});