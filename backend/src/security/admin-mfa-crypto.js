const crypto = require(
    "node:crypto",
);

const ALGORITHM =
    "aes-256-gcm";

function createAdminMfaCrypto(
    key,
) {
    if (
        !Buffer.isBuffer(key) ||
        key.length !== 32
    ) {
        throw new TypeError(
            "Admin MFA encryption key must be 32 bytes",
        );
    }

    function encrypt(secret) {
        if (
            typeof secret !==
            "string" ||
            secret.length < 1
        ) {
            throw new TypeError(
                "MFA secret is required",
            );
        }

        const iv =
            crypto.randomBytes(12);

        const cipher =
            crypto.createCipheriv(
                ALGORITHM,
                key,
                iv,
            );

        const ciphertext =
            Buffer.concat([
                cipher.update(
                    secret,
                    "utf8",
                ),
                cipher.final(),
            ]);

        const tag =
            cipher.getAuthTag();

        return {
            ciphertext:
                ciphertext.toString(
                    "base64url",
                ),

            iv: iv.toString(
                "base64url",
            ),

            tag: tag.toString(
                "base64url",
            ),
        };
    }

    function decrypt({
        ciphertext,
        iv,
        tag,
    } = {}) {
        if (
            typeof ciphertext !==
            "string" ||
            typeof iv !== "string" ||
            typeof tag !== "string"
        ) {
            throw new TypeError(
                "Invalid encrypted MFA secret",
            );
        }

        const decipher =
            crypto.createDecipheriv(
                ALGORITHM,
                key,
                Buffer.from(
                    iv,
                    "base64url",
                ),
            );

        decipher.setAuthTag(
            Buffer.from(
                tag,
                "base64url",
            ),
        );

        const plaintext =
            Buffer.concat([
                decipher.update(
                    Buffer.from(
                        ciphertext,
                        "base64url",
                    ),
                ),
                decipher.final(),
            ]);

        return plaintext.toString(
            "utf8",
        );
    }

    return {
        encrypt,
        decrypt,
    };
}

module.exports = {
    createAdminMfaCrypto,
};