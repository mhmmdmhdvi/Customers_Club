const BASE32_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encodeBase32(buffer) {
    let bits = 0;
    let value = 0;
    let output = "";

    for (const byte of buffer) {
        value =
            (value << 8) | byte;

        bits += 8;

        while (bits >= 5) {
            output +=
                BASE32_ALPHABET[
                (value >>> (bits - 5)) &
                31
                ];

            bits -= 5;
        }
    }

    if (bits > 0) {
        output +=
            BASE32_ALPHABET[
            (value << (5 - bits)) &
            31
            ];
    }

    return output;
}

function createAdminMfaResetService(
    db,
    {
        mfaCrypto,
        randomBytes,
    },
) {
    return async function resetAdminMfa(
        userId,
    ) {
        const secret =
            encodeBase32(
                randomBytes(20),
            );

        const encrypted =
            mfaCrypto.encrypt(
                secret,
            );

        return db.$transaction(
            async (tx) => {
                const user =
                    await tx.user.findUnique({
                        where: {
                            id: userId,
                        },
                        select: {
                            id: true,
                            role: true,
                        },
                    });

                if (
                    !user ||
                    user.role !== "ADMIN"
                ) {
                    throw new Error(
                        "User is not an ADMIN",
                    );
                }

                const now =
                    new Date();

                await tx.adminMfaChallenge.updateMany({
                    where: {
                        userId,
                        usedAt: null,
                    },
                    data: {
                        usedAt: now,
                    },
                });

                await tx.adminMfaCredential.update({
                    where: {
                        userId,
                    },
                    data: {
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
            },
        );
    };
}

module.exports = {
    createAdminMfaResetService,
};