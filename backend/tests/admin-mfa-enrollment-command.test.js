const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminMfaEnrollmentCommand,
} = require(
    "../src/security/admin-mfa-enrollment-command",
);

test("enrolls one existing local ADMIN and returns authenticator setup data", async () => {
    const calls = [];

    const command =
        createAdminMfaEnrollmentCommand({
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

            enroll:
                async (userId) => {
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

            buildUri: (input) => {
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
                type: "enroll",
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

test("refuses enrollment outside the expected local database", async () => {
    let userLookupCalled = false;
    let enrollCalled = false;

    const command =
        createAdminMfaEnrollmentCommand({
            getDatabaseIdentity:
                async () => ({
                    database:
                        "some_other_database",
                    user:
                        "customer_club_user",
                }),

            findUserByPhone:
                async () => {
                    userLookupCalled = true;

                    return {
                        id: 1,
                        role: "ADMIN",
                    };
                },

            enroll:
                async () => {
                    enrollCalled = true;

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
        userLookupCalled,
        false,
    );

    assert.equal(
        enrollCalled,
        false,
    );
});

test("refuses an invalid phone before user lookup", async () => {
    let userLookupCalled = false;

    const command =
        createAdminMfaEnrollmentCommand({
            getDatabaseIdentity:
                async () => ({
                    database:
                        "customer_club_db",
                    user:
                        "customer_club_user",
                }),

            findUserByPhone:
                async () => {
                    userLookupCalled = true;

                    return null;
                },

            enroll:
                async () => {
                    assert.fail(
                        "Enrollment must not run for an invalid phone",
                    );
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
        userLookupCalled,
        false,
    );
});

test("refuses MFA enrollment for a MEMBER account", async () => {
    let enrollCalled = false;

    const command =
        createAdminMfaEnrollmentCommand({
            getDatabaseIdentity:
                async () => ({
                    database:
                        "customer_club_db",
                    user:
                        "customer_club_user",
                }),

            findUserByPhone:
                async () => ({
                    id: 2,
                    phone:
                        "09121234567",
                    role: "MEMBER",
                }),

            enroll:
                async () => {
                    enrollCalled = true;

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
        enrollCalled,
        false,
    );
});