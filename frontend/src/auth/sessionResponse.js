export function parseAuthenticatedSession(
    data,
    now = Date.now(),
) {
    const accessExpiresAt = Date.parse(
        data?.accessExpiresAt,
    );
    const createdAt = Date.parse(
        data?.user?.createdAt,
    );

    const isValid =
        data?.authenticated === true &&
        data?.tokenType === "Bearer" &&
        typeof data?.accessToken === "string" &&
        data.accessToken.length > 0 &&
        Number.isSafeInteger(data?.user?.id) &&
        data.user.id > 0 &&
        typeof data.user.phone === "string" &&
        /^09\d{9}$/.test(data.user.phone) &&
        typeof data.user.firstName === "string" &&
        typeof data.user.lastName === "string" &&
        ["MEMBER", "ADMIN"].includes(
            data.user.role,
        ) &&
        Number.isFinite(createdAt) &&
        Number.isFinite(accessExpiresAt) &&
        accessExpiresAt > now;

    if (!isValid) {
        throw new Error(
            "Invalid authenticated session",
        );
    }

    return {
        user: data.user,
        accessToken: data.accessToken,
        tokenType: data.tokenType,
        accessExpiresAt: data.accessExpiresAt,
    };
}