function createAdminMfaResetCommand({
    getDatabaseIdentity,
    findUserByPhone,
    reset,
    buildUri,
}) {
    return async function resetAdminMfa(
        phone,
    ) {
        const identity =
            await getDatabaseIdentity();

        if (
            identity?.database !==
            "customer_club_db" ||
            identity?.user !==
            "customer_club_user"
        ) {
            throw new Error(
                "Refusing to continue: unexpected database target",
            );
        }

        if (
            typeof phone !== "string" ||
            !/^09\d{9}$/.test(phone)
        ) {
            throw new Error(
                "Invalid Iranian phone number",
            );
        }

        const user =
            await findUserByPhone(
                phone,
            );

        if (
            !user ||
            user.role !== "ADMIN"
        ) {
            throw new Error(
                "User is not an ADMIN",
            );
        }

        const result =
            await reset(
                user.id,
            );

        const uri =
            buildUri({
                secret:
                    result.secret,
                accountLabel:
                    `admin-${user.id}`,
                issuer:
                    "Megatite Customer Club",
            });

        return {
            userId:
                result.userId,
            secret:
                result.secret,
            uri,
        };
    };
}

module.exports = {
    createAdminMfaResetCommand,
};