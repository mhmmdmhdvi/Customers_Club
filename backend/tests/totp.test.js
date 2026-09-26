const test = require("node:test");
const assert = require("node:assert/strict");

const {
    generateTotp,
    verifyTotp,
} = require(
    "../src/security/totp",
);

const RFC_SECRET =
    "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("generates the RFC 6238 TOTP vector", () => {
    const code =
        generateTotp(
            RFC_SECRET,
            {
                timeMs: 59_000,
                digits: 8,
            },
        );

    assert.equal(
        code,
        "94287082",
    );
});

test("verifies a valid code within one time step", () => {
    const timeMs =
        90_000;

    const code =
        generateTotp(
            RFC_SECRET,
            {
                timeMs,
                digits: 6,
            },
        );

    assert.equal(
        verifyTotp(
            RFC_SECRET,
            code,
            {
                timeMs:
                    timeMs +
                    30_000,
                digits: 6,
                window: 1,
            },
        ),
        true,
    );
});

test("rejects an invalid TOTP code", () => {
    assert.equal(
        verifyTotp(
            RFC_SECRET,
            "000000",
            {
                timeMs: 59_000,
                digits: 6,
                window: 1,
            },
        ),
        false,
    );
});

test("returns the matched TOTP counter for replay protection", () => {
    const timeMs = 90_000;

    const code =
        generateTotp(
            RFC_SECRET,
            {
                timeMs,
                digits: 6,
            },
        );

    const result =
        verifyTotp(
            RFC_SECRET,
            code,
            {
                timeMs,
                digits: 6,
                window: 1,
                returnCounter: true,
            },
        );

    assert.deepEqual(
        result,
        {
            valid: true,
            counter: 3,
        },
    );
});