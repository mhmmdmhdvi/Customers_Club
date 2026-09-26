const crypto = require("node:crypto");

const BASE32_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(value) {
    if (typeof value !== "string") {
        throw new TypeError(
            "TOTP secret must be a string",
        );
    }

    const normalized = value
        .toUpperCase()
        .replace(/=+$/g, "")
        .replace(/\s+/g, "");

    if (!normalized) {
        throw new TypeError(
            "TOTP secret is required",
        );
    }

    let bits = "";

    for (const character of normalized) {
        const index =
            BASE32_ALPHABET.indexOf(
                character,
            );

        if (index === -1) {
            throw new TypeError(
                "Invalid Base32 TOTP secret",
            );
        }

        bits += index
            .toString(2)
            .padStart(5, "0");
    }

    const bytes = [];

    for (
        let offset = 0;
        offset + 8 <= bits.length;
        offset += 8
    ) {
        bytes.push(
            Number.parseInt(
                bits.slice(
                    offset,
                    offset + 8,
                ),
                2,
            ),
        );
    }

    return Buffer.from(bytes);
}

function validateOptions({
    timeMs,
    digits,
    periodSeconds,
}) {
    if (
        typeof timeMs !== "number" ||
        !Number.isFinite(timeMs) ||
        timeMs < 0
    ) {
        throw new TypeError(
            "Invalid TOTP time",
        );
    }

    if (
        !Number.isInteger(digits) ||
        digits < 6 ||
        digits > 8
    ) {
        throw new TypeError(
            "Invalid TOTP digits",
        );
    }

    if (
        !Number.isInteger(
            periodSeconds,
        ) ||
        periodSeconds < 1
    ) {
        throw new TypeError(
            "Invalid TOTP period",
        );
    }
}

function generateTotp(
    secret,
    {
        timeMs = Date.now(),
        digits = 6,
        periodSeconds = 30,
    } = {},
) {
    validateOptions({
        timeMs,
        digits,
        periodSeconds,
    });

    const key =
        decodeBase32(secret);

    const counter =
        BigInt(
            Math.floor(
                timeMs /
                (periodSeconds * 1000),
            ),
        );

    const counterBuffer =
        Buffer.alloc(8);

    counterBuffer.writeBigUInt64BE(
        counter,
    );

    const digest = crypto
        .createHmac("sha1", key)
        .update(counterBuffer)
        .digest();

    const offset =
        digest[digest.length - 1] &
        0x0f;

    const binary =
        (
            digest.readUInt32BE(
                offset,
            ) & 0x7fffffff
        );

    const modulus =
        10 ** digits;

    return String(
        binary % modulus,
    ).padStart(
        digits,
        "0",
    );
}

function verifyTotp(
    secret,
    code,
    {
        timeMs = Date.now(),
        digits = 6,
        periodSeconds = 30,
        window = 1,
        returnCounter = false,
    } = {},
) {
    validateOptions({
        timeMs,
        digits,
        periodSeconds,
    });

    if (
        typeof code !== "string" ||
        !new RegExp(
            `^\\d{${digits}}$`,
        ).test(code)
    ) {
        return returnCounter
            ? {
                valid: false,
                counter: null,
            }
            : false;
    }

    if (
        !Number.isInteger(window) ||
        window < 0 ||
        window > 10
    ) {
        throw new TypeError(
            "Invalid TOTP window",
        );
    }

    const provided =
        Buffer.from(code);

    const baseCounter =
        Math.floor(
            timeMs /
            (periodSeconds * 1000),
        );

    for (
        let offset = -window;
        offset <= window;
        offset += 1
    ) {
        const candidateCounter =
            baseCounter + offset;

        if (candidateCounter < 0) {
            continue;
        }

        const candidateTime =
            candidateCounter *
            periodSeconds *
            1000;

        const candidate =
            Buffer.from(
                generateTotp(
                    secret,
                    {
                        timeMs:
                            candidateTime,
                        digits,
                        periodSeconds,
                    },
                ),
            );

        if (
            candidate.length ===
            provided.length &&
            crypto.timingSafeEqual(
                candidate,
                provided,
            )
        ) {
            return returnCounter
                ? {
                    valid: true,
                    counter:
                        candidateCounter,
                }
                : true;
        }
    }

    return returnCounter
        ? {
            valid: false,
            counter: null,
        }
        : false;
}

module.exports = {
    generateTotp,
    verifyTotp,
};