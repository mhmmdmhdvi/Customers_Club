const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminMfaResetRuntime,
} = require(
    "../src/security/admin-mfa-reset-runtime",
);

test("runtime wires the guarded ADMIN reset flow", async () => {
    const calls = [];
    const lines = [];

    const prisma = {
        $queryRawUnsafe: async (sql) => {
            calls.push({
                type: "database",
                sql,
            });

            return [
                {
                    database:
                        "customer_club_db",
                    user:
                        "customer_club_user",
                },
            ];
        },

        user: {
            findUnique: async (args) => {
                calls.push({
                    type: "user",
                    args,
                });

                return {
                    id: 1,
                    phone:
                        "09121234567",
                    role: "ADMIN",
                };
            },
        },
    };

    const reset = async (userId) => {
        calls.push({
            type: "reset",
            userId,
        });

        return {
            userId,
            secret:
                "JBSWY3DPEHPK3PXP",
        };
    };

    const run =
        createAdminMfaResetRuntime({
            prisma,
            reset,

            buildUri: () =>
                "otpauth://example",

            writeLine: (line) => {
                lines.push(line);
            },
        });

    await run([
        "node",
        "scripts/reset-admin-mfa.js",
        "09121234567",
    ]);

    assert.equal(
        calls[0].type,
        "database",
    );

    assert.equal(
        calls[1].type,
        "user",
    );

    assert.deepEqual(
        calls[2],
        {
            type: "reset",
            userId: 1,
        },
    );

    assert.deepEqual(
        lines,
        [
            "ADMIN MFA reset completed for user #1",
            "New authenticator secret (shown once): JBSWY3DPEHPK3PXP",
            "New authenticator URI (shown once): otpauth://example",
            "Add the new secret to your authenticator app now.",
        ],
    );
});