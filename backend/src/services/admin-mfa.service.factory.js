const crypto = require("node:crypto");

const {
    AuthError,
} = require(
    "../utils/auth-error",
);

const {
    verifyTotp,
} = require(
    "../security/totp",
);

const CHALLENGE_TTL_MS =
    5 * 60 * 1000;

const BASE32_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encodeBase32(buffer) {
    let bits = "";

    for (const byte of buffer) {
        bits += byte
            .toString(2)
            .padStart(8, "0");
    }

    let result = "";

    for (
        let offset = 0;
        offset < bits.length;
        offset += 5
    ) {
        const chunk =
            bits
                .slice(offset, offset + 5)
                .padEnd(5, "0");

        result +=
            BASE32_ALPHABET[
            Number.parseInt(
                chunk,
                2,
            )
            ];
    }

    return result;
}

function digest(value) {
    return crypto
        .createHash("sha256")
        .update(value)
        .digest("hex");
}

function createAdminMfaService(
    prisma,
    {
        now = () => new Date(),

        randomBytes =
        crypto.randomBytes,

        mfaCrypto,

        verifyTotpFn =
        verifyTotp,
    } = {},
) {

    async function enroll(
        userId,
        transaction,
    ) {
        if (
            !Number.isSafeInteger(userId) ||
            userId < 1
        ) {
            throw new AuthError();
        }

        if (
            !mfaCrypto ||
            typeof mfaCrypto.encrypt !==
            "function"
        ) {
            throw new Error(
                "Admin MFA crypto unavailable",
            );
        }

        const db =
            transaction ?? prisma;

        const user =
            await db.user.findUnique({
                where: {
                    id: userId,
                },
            });

        if (
            !user ||
            user.role !== "ADMIN"
        ) {
            throw new AuthError(
                "Forbidden",
                403,
            );
        }

        const existing =
            await db.adminMfaCredential
                .findUnique({
                    where: {
                        userId,
                    },
                });

        if (existing) {
            throw new AuthError(
                "Admin MFA is already enrolled",
                409,
            );
        }

        const secret =
            encodeBase32(
                randomBytes(20),
            );

        const encrypted =
            mfaCrypto.encrypt(
                secret,
            );

        await db.adminMfaCredential.create({
            data: {
                userId,

                secretCiphertext:
                    encrypted.ciphertext,

                secretIv:
                    encrypted.iv,

                secretTag:
                    encrypted.tag,

                lastUsedCounter:
                    null,
            },
        });

        return {
            userId,
            secret,
        };
    }

    async function begin(
        userId,
        transaction,
    ) {
        const db =
            transaction ?? prisma;

        const credential =
            await db.adminMfaCredential
                .findUnique({
                    where: {
                        userId,
                    },
                });

        if (!credential) {
            throw new AuthError(
                "Admin MFA is not enrolled",
                403,
            );
        }

        const currentTime =
            now();

        const challengeToken =
            randomBytes(32)
                .toString("hex");

        const expiresAt =
            new Date(
                currentTime.getTime() +
                CHALLENGE_TTL_MS,
            );

        await db.adminMfaChallenge
            .updateMany({
                where: {
                    userId,
                    usedAt: null,

                    expiresAt: {
                        gt: currentTime,
                    },
                },

                data: {
                    usedAt:
                        currentTime,
                },
            });

        await db.adminMfaChallenge
            .create({
                data: {
                    userId,

                    tokenHash:
                        digest(
                            challengeToken,
                        ),

                    expiresAt,

                    failedAttempts: 0,
                },
            });

        return {
            mfaChallengeToken:
                challengeToken,

            mfaExpiresAt:
                expiresAt
                    .toISOString(),
        };
    }

    async function complete(
        input,
        transaction,
    ) {
        if (
            !input ||
            typeof input !== "object" ||
            Array.isArray(input) ||
            typeof input
                .mfaChallengeToken !==
            "string" ||
            !/^[a-f0-9]{64}$/.test(
                input.mfaChallengeToken,
            ) ||
            typeof input.code !==
            "string" ||
            !/^\d{6}$/.test(
                input.code,
            )
        ) {
            throw new AuthError();
        }

        if (
            !mfaCrypto ||
            typeof mfaCrypto.decrypt !==
            "function"
        ) {
            throw new Error(
                "Admin MFA crypto unavailable",
            );
        }

        const db =
            transaction ?? prisma;

        const currentTime =
            now();

        const tokenHash =
            digest(
                input.mfaChallengeToken,
            );

        const challenge =
            await db.adminMfaChallenge
                .findUnique({
                    where: {
                        tokenHash,
                    },
                });

        if (
            !challenge ||
            challenge.usedAt !== null ||
            challenge.expiresAt <=
            currentTime ||
            challenge.failedAttempts >= 5
        ) {
            throw new AuthError();
        }

        const credential =
            await db.adminMfaCredential
                .findUnique({
                    where: {
                        userId:
                            challenge.userId,
                    },
                });

        if (!credential) {
            throw new AuthError();
        }

        const secret =
            mfaCrypto.decrypt({
                ciphertext:
                    credential
                        .secretCiphertext,

                iv:
                    credential.secretIv,

                tag:
                    credential.secretTag,
            });

        const verification =
            verifyTotpFn(
                secret,
                input.code,
                {
                    timeMs:
                        currentTime
                            .getTime(),

                    digits: 6,
                    window: 1,

                    returnCounter:
                        true,
                },
            );

        if (
            !verification ||
            verification.valid !== true ||
            !Number.isSafeInteger(
                verification.counter,
            )
        ) {
            const failed =
                await db.adminMfaChallenge
                    .updateMany({
                        where: {
                            id:
                                challenge.id,

                            usedAt: null,

                            expiresAt: {
                                gt:
                                    currentTime,
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
                    });

            if (failed.count !== 1) {
                throw new AuthError();
            }

            return null;
        }

        if (
            credential
                .lastUsedCounter !==
            null &&
            credential
                .lastUsedCounter !==
            undefined &&
            verification.counter <=
            credential
                .lastUsedCounter
        ) {
            throw new AuthError();
        }

        const claimedChallenge =
            await db.adminMfaChallenge
                .updateMany({
                    where: {
                        id:
                            challenge.id,

                        usedAt: null,

                        expiresAt: {
                            gt:
                                currentTime,
                        },

                        failedAttempts: {
                            lt: 5,
                        },
                    },

                    data: {
                        usedAt:
                            currentTime,
                    },
                });

        if (
            claimedChallenge.count !==
            1
        ) {
            throw new AuthError();
        }

        const updatedCredential =
            await db.adminMfaCredential
                .updateMany({
                    where: {
                        userId:
                            challenge.userId,

                        OR: [
                            {
                                lastUsedCounter:
                                    null,
                            },
                            {
                                lastUsedCounter: {
                                    lt:
                                        verification.counter,
                                },
                            },
                        ],
                    },

                    data: {
                        lastUsedCounter:
                            verification.counter,
                    },
                });

        if (
            updatedCredential.count !==
            1
        ) {
            throw new AuthError();
        }

        return challenge.userId;
    }

    return {
        enroll,
        begin,
        complete,
    };
}

module.exports = {
    createAdminMfaService,
};