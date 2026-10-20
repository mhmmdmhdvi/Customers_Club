import { describe, expect, it } from "vitest";
import { parseAuthenticatedSession } from "./sessionResponse";

const NOW = Date.parse("2026-09-16T10:00:00.000Z");

function validResponse() {
    return {
        authenticated: true,
        user: {
            id: 7,
            phone: "09123456789",
            firstName: "سارا",
            lastName: "احمدی",
            role: "MEMBER",
            createdAt: "2026-09-10T08:00:00.000Z",
        },
        tokenType: "Bearer",
        accessToken: "test.access.token",
        accessExpiresAt: "2026-09-16T10:15:00.000Z",
    };
}

describe("parseAuthenticatedSession", () => {
    it("accepts explicit null legacy names and birthday", () => {
        const data = validResponse();
        Object.assign(data.user, { firstName: null, lastName: null, birthYear: null, birthMonth: null, birthDay: null });
        expect(parseAuthenticatedSession(data, NOW).user).toEqual(data.user);
    });

    for (const birthday of [
        { birthYear: 1400 },
        { birthYear: 1400, birthMonth: null, birthDay: 1 },
        { birthYear: 1400, birthMonth: 13, birthDay: 1 },
        { birthYear: 1400, birthMonth: 12, birthDay: 30 },
        { birthYear: "1400", birthMonth: 1, birthDay: 1 },
    ]) {
        it(`rejects malformed supplied birthday ${JSON.stringify(birthday)}`, () => {
            const data = validResponse();
            Object.assign(data.user, birthday);
            expect(() => parseAuthenticatedSession(data, NOW)).toThrow("Invalid authenticated session");
        });
    }
    it("accepts the complete member session required by the dashboard", () => {
        const response = validResponse();

        expect(
            parseAuthenticatedSession(response, NOW),
        ).toEqual({
            user: response.user,
            accessToken: "test.access.token",
            tokenType: "Bearer",
            accessExpiresAt: "2026-09-16T10:15:00.000Z",
        });
    });

    for (const field of ["phone", "role", "createdAt"]) {
        it(`rejects a session missing user.${field}`, () => {
            const response = validResponse();

            delete response.user[field];

            expect(() =>
                parseAuthenticatedSession(response, NOW),
            ).toThrow("Invalid authenticated session");
        });
    }

    it("rejects an invalid Iranian phone", () => {
        const response = validResponse();

        response.user.phone = "08123456789";

        expect(() =>
            parseAuthenticatedSession(response, NOW),
        ).toThrow("Invalid authenticated session");
    });

    it("rejects an unsupported role", () => {
        const response = validResponse();

        response.user.role = "UNKNOWN";

        expect(() =>
            parseAuthenticatedSession(response, NOW),
        ).toThrow("Invalid authenticated session");
    });

    it("rejects an invalid join date", () => {
        const response = validResponse();

        response.user.createdAt = "not-a-date";

        expect(() =>
            parseAuthenticatedSession(response, NOW),
        ).toThrow("Invalid authenticated session");
    });

    it("rejects an expired access token", () => {
        const response = validResponse();

        response.accessExpiresAt =
            "2026-09-16T09:59:59.000Z";

        expect(() =>
            parseAuthenticatedSession(response, NOW),
        ).toThrow("Invalid authenticated session");
    });
});
