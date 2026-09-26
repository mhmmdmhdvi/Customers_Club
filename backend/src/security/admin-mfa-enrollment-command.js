const {
    isValidIranianPhone,
    normalizePhone,
} = require(
    "../utils/phone",
);

function createAdminMfaEnrollmentCommand({
    getDatabaseIdentity,
    findUserByPhone,
    enroll,
    buildUri,
}) {
    return async function enrollAdminMfa(
        rawPhone,
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

        const phone =
            typeof rawPhone === "string"
                ? normalizePhone(rawPhone)
                : null;

        if (
            !phone ||
            !isValidIranianPhone(phone)
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

        const enrollment =
            await enroll(
                user.id,
            );

        const uri =
            buildUri({
                secret:
                    enrollment.secret,

                accountLabel:
                    `admin-${user.id}`,

                issuer:
                    "Megatite Customer Club",
            });

        return {
            userId:
                user.id,

            secret:
                enrollment.secret,

            uri,
        };
    };
}

module.exports = {
    createAdminMfaEnrollmentCommand,
};