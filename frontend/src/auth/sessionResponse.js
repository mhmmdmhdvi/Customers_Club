import { isValidJalaaliDate } from "jalaali-js";

function validBirthday(user) {
    const parts = [user?.birthYear, user?.birthMonth, user?.birthDay];
    if (parts.every(value => value == null)) return true;
    if (!parts.every(Number.isSafeInteger)) return false;
    const [year, month, day] = parts;
    return isValidJalaaliDate(year, month, day);
}

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
        (typeof data.user.firstName === "string" || data.user.firstName === null) &&
        (typeof data.user.lastName === "string" || data.user.lastName === null) &&
        validBirthday(data.user) &&
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
