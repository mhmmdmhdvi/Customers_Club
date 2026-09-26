const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
    createAdminMfaCrypto,
} = require(
    "../src/security/admin-mfa-crypto",
);

test("encrypts and decrypts an MFA secret without storing plaintext", () => {
    const key =
        crypto.randomBytes(32);

    const mfaCrypto =
        createAdminMfaCrypto(key);

    const secret =
        "JBSWY3DPEHPK3PXP";

    const encrypted =
        mfaCrypto.encrypt(secret);

    assert.equal(
        typeof encrypted.ciphertext,
        "string",
    );

    assert.equal(
        typeof encrypted.iv,
        "string",
    );

    assert.equal(
        typeof encrypted.tag,
        "string",
    );

    assert.ok(
        !JSON.stringify(
            encrypted,
        ).includes(secret),
    );

    assert.equal(
        mfaCrypto.decrypt(
            encrypted,
        ),
        secret,
    );
});

test("rejects tampered MFA ciphertext", () => {
    const key =
        crypto.randomBytes(32);

    const mfaCrypto =
        createAdminMfaCrypto(key);

    const encrypted =
        mfaCrypto.encrypt(
            "JBSWY3DPEHPK3PXP",
        );

    const tampered = {
        ...encrypted,
        ciphertext:
            encrypted.ciphertext.slice(
                0,
                -2,
            ) + "AA",
    };

    assert.throws(() => {
        mfaCrypto.decrypt(
            tampered,
        );
    });
});

test("requires a 32 byte encryption key", () => {
    assert.throws(() => {
        createAdminMfaCrypto(
            Buffer.alloc(31),
        );
    });
});