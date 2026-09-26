const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
    createAdminMfaService,
} = require(
    "../src/services/admin-mfa.service.factory",
);

const hash = (value) =>
    crypto
        .createHash("sha256")
        .update(value)
        .digest("hex");

test("begin creates a five-minute single-use challenge for an enrolled admin", async () => {
    const now =
        new Date(
            "2026-09-26T06:00:00.000Z",
        );

    const created = [];

    const prisma = {
        adminMfaCredential: {
            findUnique: async ({
                where,
            }) => {
                assert.deepEqual(
                    where,
                    {
                        userId: 1,
                    },
                );

                return {
                    userId: 1,
                };
            },
        },

        adminMfaChallenge: {
            updateMany: async () => ({
                count: 0,
            }),

            create: async ({
                data,
            }) => {
                created.push(data);

                return {
                    id:
                        "00000000-0000-0000-0000-000000000001",
                    ...data,
                };
            },
        },
    };

    const service =
        createAdminMfaService(
            prisma,
            {
                now: () => now,

                randomBytes: () =>
                    Buffer.from(
                        "a".repeat(64),
                        "hex",
                    ),
            },
        );

    const result =
        await service.begin(
            1,
            prisma,
        );

    assert.equal(
        result.mfaRequired,
        undefined,
    );

    assert.match(
        result.mfaChallengeToken,
        /^[a-f0-9]{64}$/,
    );

    assert.equal(
        result.mfaExpiresAt,
        new Date(
            now.getTime() +
            5 * 60 * 1000,
        ).toISOString(),
    );

    assert.equal(
        created.length,
        1,
    );

    assert.equal(
        created[0].userId,
        1,
    );

    assert.equal(
        created[0].tokenHash,
        hash(
            result.mfaChallengeToken,
        ),
    );

    assert.equal(
        created[0].expiresAt.getTime(),
        now.getTime() +
        5 * 60 * 1000,
    );

    assert.equal(
        created[0].usedAt,
        undefined,
    );

    assert.equal(
        created[0].failedAttempts,
        0,
    );
});

test("begin invalidates older active challenges for the same admin", async () => {
    const now =
        new Date(
            "2026-09-26T06:00:00.000Z",
        );

    const invalidations = [];

    const prisma = {
        adminMfaCredential: {
            findUnique: async () => ({
                userId: 1,
            }),
        },

        adminMfaChallenge: {
            updateMany: async (args) => {
                invalidations.push(args);

                return {
                    count: 1,
                };
            },

            create: async ({ data }) => ({
                id:
                    "00000000-0000-0000-0000-000000000002",
                ...data,
            }),
        },
    };

    const service =
        createAdminMfaService(
            prisma,
            {
                now: () => now,

                randomBytes: () =>
                    Buffer.from(
                        "b".repeat(64),
                        "hex",
                    ),
            },
        );

    await service.begin(
        1,
        prisma,
    );

    assert.deepEqual(
        invalidations,
        [
            {
                where: {
                    userId: 1,
                    usedAt: null,
                    expiresAt: {
                        gt: now,
                    },
                },

                data: {
                    usedAt: now,
                },
            },
        ],
    );
});

test("complete consumes a valid challenge and records the TOTP counter", async () => {
    const now =
        new Date(
            "2026-09-26T06:00:00.000Z",
        );

    const challengeToken =
        "c".repeat(64);

    const challengeUpdates = [];
    const credentialUpdates = [];

    const prisma = {
        adminMfaChallenge: {
            findUnique: async () => ({
                id:
                    "00000000-0000-0000-0000-000000000003",
                userId: 1,
                tokenHash:
                    hash(challengeToken),
                expiresAt:
                    new Date(
                        now.getTime() +
                        60_000,
                    ),
                usedAt: null,
                failedAttempts: 0,
            }),

            updateMany: async (args) => {
                challengeUpdates.push(
                    args,
                );

                return {
                    count: 1,
                };
            },
        },

        adminMfaCredential: {
            findUnique: async () => ({
                userId: 1,
                secretCiphertext:
                    "encrypted",
                secretIv: "iv",
                secretTag: "tag",
                lastUsedCounter: 100,
            }),

            updateMany: async (args) => {
                credentialUpdates.push(
                    args,
                );

                return {
                    count: 1,
                };
            },
        },
    };

    const service =
        createAdminMfaService(
            prisma,
            {
                now: () => now,

                mfaCrypto: {
                    decrypt: () =>
                        "JBSWY3DPEHPK3PXP",
                },

                verifyTotpFn: () => ({
                    valid: true,
                    counter: 101,
                }),
            },
        );

    const userId =
        await service.complete(
            {
                mfaChallengeToken:
                    challengeToken,
                code: "123456",
            },
            prisma,
        );

    assert.equal(
        userId,
        1,
    );

    assert.equal(
        challengeUpdates.length,
        1,
    );

    assert.equal(
        challengeUpdates[0].data.usedAt,
        now,
    );

    assert.equal(
        credentialUpdates.length,
        1,
    );

    assert.equal(
        credentialUpdates[0]
            .data.lastUsedCounter,
        101,
    );
});

test("complete increments failed attempts for an invalid TOTP code", async () => {
    const now =
        new Date(
            "2026-09-26T06:00:00.000Z",
        );

    const challengeToken =
        "e".repeat(64);

    const challengeUpdates = [];

    const prisma = {
        adminMfaChallenge: {
            findUnique: async () => ({
                id:
                    "00000000-0000-0000-0000-000000000004",
                userId: 1,
                tokenHash:
                    hash(challengeToken),
                expiresAt:
                    new Date(
                        now.getTime() +
                        60_000,
                    ),
                usedAt: null,
                failedAttempts: 2,
            }),

            updateMany: async (args) => {
                challengeUpdates.push(
                    args,
                );

                return {
                    count: 1,
                };
            },
        },

        adminMfaCredential: {
            findUnique: async () => ({
                userId: 1,
                secretCiphertext:
                    "encrypted",
                secretIv: "iv",
                secretTag: "tag",
                lastUsedCounter: 100,
            }),
        },
    };

    const service =
        createAdminMfaService(
            prisma,
            {
                now: () => now,

                mfaCrypto: {
                    decrypt: () =>
                        "JBSWY3DPEHPK3PXP",
                },

                verifyTotpFn: () => ({
                    valid: false,
                    counter: null,
                }),
            },
        );

    const result =
        await service.complete(
            {
                mfaChallengeToken:
                    challengeToken,
                code: "123456",
            },
            prisma,
        );

    assert.equal(
        result,
        null,
    );

    assert.deepEqual(
        challengeUpdates,
        [
            {
                where: {
                    id:
                        "00000000-0000-0000-0000-000000000004",
                    usedAt: null,
                    expiresAt: {
                        gt: now,
                    },
                    failedAttempts: {
                        lt: 5,
                    },
                },

                data: {
                    failedAttempts: {
                        increment: 1,
                    },
                },
            },
        ],
    );
});

test("complete rejects a challenge that has reached five failed attempts", async () => {
    const now =
        new Date(
            "2026-09-26T06:00:00.000Z",
        );

    const challengeToken =
        "f".repeat(64);

    let credentialRead = false;

    const prisma = {
        adminMfaChallenge: {
            findUnique: async () => ({
                id:
                    "00000000-0000-0000-0000-000000000005",
                userId: 1,
                tokenHash:
                    hash(challengeToken),
                expiresAt:
                    new Date(
                        now.getTime() +
                        60_000,
                    ),
                usedAt: null,
                failedAttempts: 5,
            }),
        },

        adminMfaCredential: {
            findUnique: async () => {
                credentialRead = true;

                return {
                    userId: 1,
                };
            },
        },
    };

    const service =
        createAdminMfaService(
            prisma,
            {
                now: () => now,

                mfaCrypto: {
                    decrypt: () =>
                        "JBSWY3DPEHPK3PXP",
                },
            },
        );

    await assert.rejects(
        service.complete(
            {
                mfaChallengeToken:
                    challengeToken,
                code: "123456",
            },
            prisma,
        ),
        {
            statusCode: 401,
        },
    );

    assert.equal(
        credentialRead,
        false,
    );
});

test("enroll creates one encrypted MFA credential for an ADMIN", async () => {
    const encrypted = {
        ciphertext: "ciphertext-value",
        iv: "iv-value",
        tag: "tag-value",
    };

    const created = [];

    const prisma = {
        user: {
            findUnique: async ({
                where,
            }) => {
                assert.deepEqual(
                    where,
                    {
                        id: 1,
                    },
                );

                return {
                    id: 1,
                    role: "ADMIN",
                };
            },
        },

        adminMfaCredential: {
            findUnique: async () =>
                null,

            create: async ({
                data,
            }) => {
                created.push(data);

                return {
                    userId: 1,
                    ...data,
                };
            },
        },
    };

    const service =
        createAdminMfaService(
            prisma,
            {
                randomBytes: () =>
                    Buffer.from(
                        "0123456789abcdef0123",
                        "utf8",
                    ),

                mfaCrypto: {
                    encrypt: (
                        secret,
                    ) => {
                        assert.equal(
                            typeof secret,
                            "string",
                        );

                        assert.ok(
                            secret.length > 0,
                        );

                        return encrypted;
                    },
                },
            },
        );

    const result =
        await service.enroll(
            1,
            prisma,
        );

    assert.equal(
        created.length,
        1,
    );

    assert.deepEqual(
        created[0],
        {
            userId: 1,
            secretCiphertext:
                encrypted.ciphertext,
            secretIv:
                encrypted.iv,
            secretTag:
                encrypted.tag,
            lastUsedCounter: null,
        },
    );

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

    assert.ok(
        !JSON.stringify(
            created,
        ).includes(
            result.secret,
        ),
    );
});

test("complete atomically rejects reuse of the same TOTP counter", async () => {
    const now =
        new Date(
            "2026-09-26T06:00:00.000Z",
        );

    const challengeToken =
        "9".repeat(64);

    const credentialUpdates = [];

    const prisma = {
        adminMfaChallenge: {
            findUnique: async () => ({
                id:
                    "00000000-0000-0000-0000-000000000009",
                userId: 1,
                tokenHash:
                    hash(challengeToken),
                expiresAt:
                    new Date(
                        now.getTime() +
                        60_000,
                    ),
                usedAt: null,
                failedAttempts: 0,
            }),

            updateMany: async () => ({
                count: 1,
            }),
        },

        adminMfaCredential: {
            findUnique: async () => ({
                userId: 1,
                secretCiphertext:
                    "encrypted",
                secretIv: "iv",
                secretTag: "tag",
                lastUsedCounter: 100,
            }),

            updateMany: async (args) => {
                credentialUpdates.push(
                    args,
                );

                return {
                    count: 1,
                };
            },
        },
    };

    const service =
        createAdminMfaService(
            prisma,
            {
                now: () => now,

                mfaCrypto: {
                    decrypt: () =>
                        "JBSWY3DPEHPK3PXP",
                },

                verifyTotpFn: () => ({
                    valid: true,
                    counter: 101,
                }),
            },
        );

    await service.complete(
        {
            mfaChallengeToken:
                challengeToken,
            code: "123456",
        },
        prisma,
    );

    assert.deepEqual(
        credentialUpdates[0].where,
        {
            userId: 1,

            OR: [
                {
                    lastUsedCounter: null,
                },
                {
                    lastUsedCounter: {
                        lt: 101,
                    },
                },
            ],
        },
    );
});

test("enroll rejects a MEMBER account", async () => {
    const prisma = {
        user: {
            findUnique: async () => ({
                id: 2,
                role: "MEMBER",
            }),
        },
    };

    const service =
        createAdminMfaService(
            prisma,
            {
                mfaCrypto: {
                    encrypt: () => {
                        assert.fail(
                            "MEMBER secret must not be generated",
                        );
                    },
                },
            },
        );

    await assert.rejects(
        service.enroll(
            2,
            prisma,
        ),
        {
            statusCode: 403,
        },
    );
});

test("enroll refuses to overwrite an existing ADMIN MFA credential", async () => {
    let created = false;

    const prisma = {
        user: {
            findUnique: async () => ({
                id: 1,
                role: "ADMIN",
            }),
        },

        adminMfaCredential: {
            findUnique: async () => ({
                userId: 1,
            }),

            create: async () => {
                created = true;
            },
        },
    };

    const service =
        createAdminMfaService(
            prisma,
            {
                mfaCrypto: {
                    encrypt: () => {
                        assert.fail(
                            "Existing secret must not be replaced",
                        );
                    },
                },
            },
        );

    await assert.rejects(
        service.enroll(
            1,
            prisma,
        ),
        {
            statusCode: 409,
        },
    );

    assert.equal(
        created,
        false,
    );
});