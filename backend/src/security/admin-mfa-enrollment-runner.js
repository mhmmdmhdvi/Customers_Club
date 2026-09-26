function createAdminMfaEnrollmentRunner({
    command,
    writeLine,
}) {
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
                "Usage: node scripts/enroll-admin-mfa.js 09123456789",
            );
        }

        const result =
            await command(
                phone.trim(),
            );

        writeLine(
            `ADMIN MFA enrollment completed for user #${result.userId}`,
        );

        writeLine(
            `Authenticator secret (shown once): ${result.secret}`,
        );

        writeLine(
            `Authenticator URI (shown once): ${result.uri}`,
        );

        writeLine(
            "Store this secret securely. It cannot be recovered from the database in plaintext.",
        );

        return result;
    };
}

module.exports = {
    createAdminMfaEnrollmentRunner,
};