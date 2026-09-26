const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminMfaEnrollmentRunner,
} = require(
    "../src/security/admin-mfa-enrollment-runner",
);

test("runner enrolls the supplied phone and prints setup data once", async () => {
    const lines = [];

    const runner =
        createAdminMfaEnrollmentRunner({
            command: async (phone) => {
                assert.equal(
                    phone,
                    "09121234567",
                );

                return {
                    userId: 1,
                    secret:
                        "JBSWY3DPEHPK3PXP",
                    uri:
                        "otpauth://example",
                };
            },

            writeLine: (value) => {
                lines.push(value);
            },
        });

    await runner([
        "node",
        "scripts/enroll-admin-mfa.js",
        "09121234567",
    ]);

    assert.deepEqual(
        lines,
        [
            "ADMIN MFA enrollment completed for user #1",
            "Authenticator secret (shown once): JBSWY3DPEHPK3PXP",
            "Authenticator URI (shown once): otpauth://example",
            "Store this secret securely. It cannot be recovered from the database in plaintext.",
        ],
    );
});

test("runner rejects a missing phone argument before calling enrollment", async () => {
    let commandCalled = false;

    const runner =
        createAdminMfaEnrollmentRunner({
            command: async () => {
                commandCalled = true;
            },

            writeLine: () => { },
        });

    await assert.rejects(
        runner([
            "node",
            "scripts/enroll-admin-mfa.js",
        ]),
        {
            message:
                "Usage: node scripts/enroll-admin-mfa.js 09123456789",
        },
    );

    assert.equal(
        commandCalled,
        false,
    );
});