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

import { AdminActivitySection } from "./AdminActivitySection";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("AdminActivitySection", () => {
    it("loads and renders admin audit events", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    items: [
                        {
                            id: 11,
                            actorUserId: 1,
                            action:
                                "CONTACT_MESSAGE_STATUS_CHANGED",
                            targetType:
                                "CONTACT_MESSAGE",
                            targetId: "42",
                            outcome: "SUCCESS",
                            requestId:
                                "request-123",
                            createdAt:
                                "2026-09-20T09:00:00.000Z",
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
            <AdminActivitySection
                accessToken="admin.access.token"
            />,
        );

        await waitFor(() => {
            expect(fetchMock)
                .toHaveBeenCalledWith(
                    "http://localhost:3000/admin/audit?page=1&pageSize=20",
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
                    name: "فعالیت‌ها",
                },
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "تغییر وضعیت پیام تماس",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "موفق",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "مدیر #۱",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "۱ رویداد",
            ),
        ).toBeInTheDocument();
    });
});