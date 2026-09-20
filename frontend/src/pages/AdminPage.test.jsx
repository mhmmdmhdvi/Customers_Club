import {
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import { AuthContext } from "../auth/AuthContext";
import { AdminPage } from "./AdminPage";

afterEach(() => {
    vi.unstubAllGlobals();
});

const adminSession = {
    user: {
        id: 1,
        phone: "09121234567",
        firstName: "مدیر",
        lastName: "سیستم",
        role: "ADMIN",
        createdAt:
            "2026-09-20T08:00:00.000Z",
    },
    accessToken: "admin.access.token",
    tokenType: "Bearer",
    accessExpiresAt:
        "2026-09-20T09:00:00.000Z",
};

describe("AdminPage", () => {
    it("loads and renders overview metrics", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    members: {
                        total: 128,
                        newLast7Days: 9,
                    },
                    messages: {
                        total: 34,
                        new: 6,
                    },
                    sessions: {
                        active: 17,
                    },
                }),
            });

        vi.stubGlobal(
            "fetch",
            fetchMock,
        );

        render(
            <AuthContext.Provider
                value={{
                    session: adminSession,
                    authStatus:
                        "authenticated",
                    establishSession:
                        vi.fn(),
                    clearSession:
                        vi.fn(),
                }}
            >
                <AdminPage pathname="/admin" />
            </AuthContext.Provider>,
        );

        await waitFor(() => {
            expect(fetchMock)
                .toHaveBeenCalledWith(
                    "http://localhost:3000/admin/overview",
                    {
                        headers: {
                            Authorization:
                                "Bearer admin.access.token",
                        },
                    },
                );
        });

        expect(
            await screen.findByText(
                "کل اعضا",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText("۱۲۸"),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "اعضای جدید در ۷ روز",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText("۹"),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "پیام‌های دریافتی",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText("۳۴"),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "۶ پیام جدید",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "نشست‌های فعال",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText("۱۷"),
        ).toBeInTheDocument();
    });

    it("renders the dedicated users section at /admin/users", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    items: [
                        {
                            id: 7,
                            phone: "09123456789",
                            firstName: "سارا",
                            lastName: "احمدی",
                            role: "MEMBER",
                            createdAt:
                                "2026-09-18T08:30:00.000Z",
                            updatedAt:
                                "2026-09-18T08:30:00.000Z",
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
            <AuthContext.Provider
                value={{
                    session: adminSession,
                    authStatus:
                        "authenticated",
                    establishSession:
                        vi.fn(),
                    clearSession:
                        vi.fn(),
                }}
            >
                <AdminPage
                    pathname="/admin/users"
                />
            </AuthContext.Provider>,
        );

        expect(
            await screen.findByText(
                "سارا احمدی",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByRole(
                "heading",
                {
                    name: "کاربران",
                },
            ),
        ).toBeInTheDocument();

        expect(fetchMock)
            .toHaveBeenCalledWith(
                "http://localhost:3000/admin/users?page=1&pageSize=20",
                {
                    headers: {
                        Authorization:
                            "Bearer admin.access.token",
                    },
                },
            );
    });

    it("provides admin section navigation for mobile layouts", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    members: {
                        total: 0,
                        newLast7Days: 0,
                    },
                    messages: {
                        total: 0,
                        new: 0,
                    },
                    sessions: {
                        active: 0,
                    },
                }),
            });

        vi.stubGlobal(
            "fetch",
            fetchMock,
        );

        render(
            <AuthContext.Provider
                value={{
                    session: adminSession,
                    authStatus:
                        "authenticated",
                    establishSession:
                        vi.fn(),
                    clearSession:
                        vi.fn(),
                }}
            >
                <AdminPage pathname="/admin" />
            </AuthContext.Provider>,
        );

        const mobileNavigation =
            screen.getByRole(
                "navigation",
                {
                    name: "ناوبری مدیریت موبایل",
                },
            );

        expect(
            within(
                mobileNavigation,
            ).getByRole("link", {
                name: "نمای کلی",
            }),
        ).toHaveAttribute(
            "href",
            "/admin",
        );

        expect(
            within(
                mobileNavigation,
            ).getByRole("link", {
                name: "کاربران",
            }),
        ).toHaveAttribute(
            "href",
            "/admin/users",
        );

        expect(
            within(
                mobileNavigation,
            ).getByRole("link", {
                name: "پیام‌ها",
            }),
        ).toHaveAttribute(
            "href",
            "/admin/messages",
        );

        expect(
            within(
                mobileNavigation,
            ).getByRole("link", {
                name: "فعالیت‌ها",
            }),
        ).toHaveAttribute(
            "href",
            "/admin/activity",
        );

        expect(
            within(
                mobileNavigation,
            ).getByRole("link", {
                name: "امنیت و مانیتورینگ",
            }),
        ).toHaveAttribute(
            "href",
            "/admin/security",
        );
    });

    it("renders the dedicated messages section at /admin/messages", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    items: [
                        {
                            id: 42,
                            name: "سارا احمدی",
                            phone: "09123456789",
                            email:
                                "sara@example.com",
                            subject: "SUPPORT",
                            status: "NEW",
                            createdAt:
                                "2026-09-20T08:30:00.000Z",
                            updatedAt:
                                "2026-09-20T08:30:00.000Z",
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
            <AuthContext.Provider
                value={{
                    session: adminSession,
                    authStatus:
                        "authenticated",
                    establishSession:
                        vi.fn(),
                    clearSession:
                        vi.fn(),
                }}
            >
                <AdminPage
                    pathname="/admin/messages"
                />
            </AuthContext.Provider>,
        );

        expect(
            await screen.findByText(
                "سارا احمدی",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByRole("heading", {
                name: "پیام‌ها",
            }),
        ).toBeInTheDocument();

        expect(fetchMock)
            .toHaveBeenCalledWith(
                "http://localhost:3000/admin/messages?page=1&pageSize=20",
                {
                    headers: {
                        Authorization:
                            "Bearer admin.access.token",
                    },
                },
            );
    });

    it("renders the dedicated activity section at /admin/activity", async () => {
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
            <AuthContext.Provider
                value={{
                    session: adminSession,
                    authStatus:
                        "authenticated",
                    establishSession:
                        vi.fn(),
                    clearSession:
                        vi.fn(),
                }}
            >
                <AdminPage
                    pathname="/admin/activity"
                />
            </AuthContext.Provider>,
        );

        expect(
            await screen.findByText(
                "تغییر وضعیت پیام تماس",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByRole("heading", {
                name: "فعالیت‌ها",
            }),
        ).toBeInTheDocument();

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

    it("renders the dedicated security section at /admin/security", async () => {
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
                            outcome: "FAILURE",
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
            <AuthContext.Provider
                value={{
                    session: adminSession,
                    authStatus:
                        "authenticated",
                    establishSession:
                        vi.fn(),
                    clearSession:
                        vi.fn(),
                }}
            >
                <AdminPage
                    pathname="/admin/security"
                />
            </AuthContext.Provider>,
        );

        expect(
            await screen.findByText(
                "رد احراز هویت",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByRole("heading", {
                name:
                    "امنیت و مانیتورینگ",
            }),
        ).toBeInTheDocument();

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
});