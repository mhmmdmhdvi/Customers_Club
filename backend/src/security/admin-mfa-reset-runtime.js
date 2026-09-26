const {
    createAdminMfaResetCommand,
} = require(
    "./admin-mfa-reset-command",
);

function createAdminMfaResetRuntime({
    prisma,
    reset,
    buildUri,
    writeLine,
}) {
    const command =
        createAdminMfaResetCommand({
            getDatabaseIdentity:
                async () => {
                    const rows =
                        await prisma
                            .$queryRawUnsafe(
                                "SELECT current_database() AS database, current_user AS user",
                            );

                    return rows[0];
                },

            findUserByPhone:
                async (phone) =>
                    prisma.user.findUnique({
                        where: {
                            phone,
                        },

                        select: {
                            id: true,
                            phone: true,
                            role: true,
                        },
                    }),

            reset,

            buildUri,
        });

    return async function run(
        argv = process.argv,
    ) {
        const phone =
            argv[2];

        if (
            typeof phone !== "string" ||
            phone.trim() === ""
        ) {
            throw new Error(
                "Usage: node scripts/reset-admin-mfa.js 09123456789",
            );
        }

        const result =
            await command(
                phone.trim(),
            );

        writeLine(
            `ADMIN MFA reset completed for user #${result.userId}`,
        );

        writeLine(
            `New authenticator secret (shown once): ${result.secret}`,
        );

        writeLine(
            `New authenticator URI (shown once): ${result.uri}`,
        );

        writeLine(
            "Add the new secret to your authenticator app now.",
        );

        return result;
    };
}

module.exports = {
    createAdminMfaResetRuntime,
};