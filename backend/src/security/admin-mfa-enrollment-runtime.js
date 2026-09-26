const {
    createAdminMfaEnrollmentCommand,
} = require(
    "./admin-mfa-enrollment-command",
);

const {
    createAdminMfaEnrollmentRunner,
} = require(
    "./admin-mfa-enrollment-runner",
);

function createAdminMfaEnrollmentRuntime({
    prisma,
    adminMfaService,
    buildUri,
    writeLine,
}) {
    const command =
        createAdminMfaEnrollmentCommand({
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

            enroll:
                async (userId) =>
                    adminMfaService.enroll(
                        userId,
                    ),

            buildUri,
        });

    return createAdminMfaEnrollmentRunner({
        command,
        writeLine,
    });
}

module.exports = {
    createAdminMfaEnrollmentRuntime,
};