const test = require("node:test");
const assert = require("node:assert/strict");

const {
    readAdminMfaConfig,
} = require(
    "../src/config/admin-mfa",
);

test("reads a 32-byte ADMIN MFA encryption key", () => {
    const env = {
        ADMIN_MFA_ENCRYPTION_KEY:
            "ab".repeat(32),
    };

    const config =
        readAdminMfaConfig(env);

    assert.ok(
        Buffer.isBuffer(
            config.encryptionKey,
        ),
    );

    assert.equal(
        config.encryptionKey.length,
        32,
    );
});

test("rejects a missing or malformed ADMIN MFA encryption key", () => {
    for (const value of [
        undefined,
        "",
        "abc",
        "zz".repeat(32),
        "ab".repeat(31),
    ]) {
        assert.throws(() => {
            readAdminMfaConfig({
                ADMIN_MFA_ENCRYPTION_KEY:
                    value,
            });
        });
    }
});