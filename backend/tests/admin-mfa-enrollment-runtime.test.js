const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminMfaEnrollmentRuntime,
} = require(
    "../src/security/admin-mfa-enrollment-runtime",
);

test("runtime wires the local database and MFA service into enrollment", async () => {
    const calls = [];

    const prisma = {
        $queryRawUnsafe: async (
            sql,
        ) => {
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
            findUnique: async (
                args,
            ) => {
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

    const adminMfaService = {
        enroll: async (
            userId,
        ) => {
            calls.push({
                type: "enroll",
                userId,
            });

            return {
                userId,
                secret:
                    "JBSWY3DPEHPK3PXP",
            };
        },
    };

    const lines = [];

    const run =
        createAdminMfaEnrollmentRuntime({
            prisma,
            adminMfaService,

            buildUri: () =>
                "otpauth://example",

            writeLine: (line) => {
                lines.push(line);
            },
        });

    await run([
        "node",
        "scripts/enroll-admin-mfa.js",
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
        calls[1].args,
        {
            where: {
                phone:
                    "09121234567",
            },

            select: {
                id: true,
                phone: true,
                role: true,
            },
        },
    );

    assert.deepEqual(
        calls[2],
        {
            type: "enroll",
            userId: 1,
        },
    );

    assert.match(
        lines[0],
        /user #1/,
    );
});