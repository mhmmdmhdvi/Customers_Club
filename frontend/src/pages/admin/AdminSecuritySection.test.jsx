import {
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import { AdminSecuritySection } from "./AdminSecuritySection";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("AdminSecuritySection", () => {
    it("loads and renders security events", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    items: [
                        {
                            id: 21,
                            eventType:
                                "AUTHENTICATION_REJECTED",
                            outcome:
                                "FAILURE",
                            actorUserId: null,
                            requestId:
                                "request-security-123",
                            route:
                                "/admin/overview",
                            statusCode: 401,
                            createdAt:
                                "2026-09-20T09:30:00.000Z",
                        },
                    ],
                    pagination: {
                        page: 1,
                        pageSize: 20,
                        total: 1,
                        totalPages: 1,
                    },
                }),
            });

        vi.stubGlobal(
            "fetch",
            fetchMock,
        );

        render(
            <AdminSecuritySection
                accessToken="admin.access.token"
            />,
        );

        await waitFor(() => {
            expect(fetchMock)
                .toHaveBeenCalledWith(
                    "http://localhost:3000/admin/security?page=1&pageSize=20",
                    {
                        headers: {
                            Authorization:
                                "Bearer admin.access.token",
                        },
                    },
                );
        });

        expect(
            await screen.findByRole(
                "heading",
                {
                    name:
                        "امنیت و مانیتورینگ",
                },
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "رد احراز هویت",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "/admin/overview",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText("401"),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "کاربر ناشناس",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "۱ رویداد",
            ),
        ).toBeInTheDocument();
    });
});