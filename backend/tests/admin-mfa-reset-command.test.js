const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminMfaResetCommand,
} = require(
    "../src/security/admin-mfa-reset-command",
);

test("refuses MFA reset outside the expected local database", async () => {
    let lookupCalled = false;
    let resetCalled = false;

    const command =
        createAdminMfaResetCommand({
            getDatabaseIdentity:
                async () => ({
                    database:
                        "customer_club_test_db",
                    user:
                        "customer_club_test_user",
                }),

            findUserByPhone:
                async () => {
                    lookupCalled = true;

                    return {
                        id: 1,
                        role: "ADMIN",
                    };
                },

            reset:
                async () => {
                    resetCalled = true;

                    return {
                        userId: 1,
                        secret:
                            "JBSWY3DPEHPK3PXP",
                    };
                },

            buildUri: () =>
                "otpauth://example",
        });

    await assert.rejects(
        command(
            "09121234567",
        ),
        {
            message:
                "Refusing to continue: unexpected database target",
        },
    );

    assert.equal(
        lookupCalled,
        false,
    );

    assert.equal(
        resetCalled,
        false,
    );
});

test("resets MFA for one existing local ADMIN and returns new setup data", async () => {
    const calls = [];

    const command =
        createAdminMfaResetCommand({
            getDatabaseIdentity:
                async () => ({
                    database:
                        "customer_club_db",
                    user:
                        "customer_club_user",
                }),

            findUserByPhone:
                async (phone) => {
                    calls.push({
                        type: "find-user",
                        phone,
                    });

                    return {
                        id: 1,
                        phone,
                        role: "ADMIN",
                    };
                },

            reset:
                async (userId) => {
                    calls.push({
                        type: "reset",
                        userId,
                    });

                    return {
                        userId,
                        secret:
                            "JBSWY3DPEHPK3PXP",
                    };
                },

            buildUri:
                (input) => {
                    calls.push({
                        type: "build-uri",
                        input,
                    });

                    return "otpauth://example";
                },
        });

    const result =
        await command(
            "09121234567",
        );

    assert.deepEqual(
        result,
        {
            userId: 1,
            secret:
                "JBSWY3DPEHPK3PXP",
            uri:
                "otpauth://example",
        },
    );

    assert.deepEqual(
        calls,
        [
            {
                type: "find-user",
                phone:
                    "09121234567",
            },
            {
                type: "reset",
                userId: 1,
            },
            {
                type: "build-uri",
                input: {
                    secret:
                        "JBSWY3DPEHPK3PXP",
                    accountLabel:
                        "admin-1",
                    issuer:
                        "Megatite Customer Club",
                },
            },
        ],
    );
});

test("refuses an invalid phone before user lookup", async () => {
    let lookupCalled = false;
    let resetCalled = false;

    const command =
        createAdminMfaResetCommand({
            getDatabaseIdentity:
                async () => ({
                    database:
                        "customer_club_db",
                    user:
                        "customer_club_user",
                }),

            findUserByPhone:
                async () => {
                    lookupCalled = true;
                    return null;
                },

            reset:
                async () => {
                    resetCalled = true;
                },

            buildUri: () =>
                "otpauth://example",
        });

    await assert.rejects(
        command("123"),
        {
            message:
                "Invalid Iranian phone number",
        },
    );

    assert.equal(
        lookupCalled,
        false,
    );

    assert.equal(
        resetCalled,
        false,
    );
});

test("refuses MFA reset for a MEMBER account", async () => {
    let resetCalled = false;

    const command =
        createAdminMfaResetCommand({
            getDatabaseIdentity:
                async () => ({
                    database:
                        "customer_club_db",
                    user:
                        "customer_club_user",
                }),

            findUserByPhone:
                async (phone) => ({
                    id: 2,
                    phone,
                    role: "MEMBER",
                }),

            reset:
                async () => {
                    resetCalled = true;

                    return {
                        userId: 2,
                        secret:
                            "JBSWY3DPEHPK3PXP",
                    };
                },

            buildUri: () =>
                "otpauth://example",
        });

    await assert.rejects(
        command(
            "09121234567",
        ),
        {
            message:
                "User is not an ADMIN",
        },
    );

    assert.equal(
        resetCalled,
        false,
    );
});