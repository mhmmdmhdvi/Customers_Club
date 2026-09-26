import {
    fireEvent,
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

import { AdminUsersSection } from "./AdminUsersSection";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("AdminUsersSection", () => {
    it("loads and renders the users table", async () => {
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
                        {
                            id: 1,
                            phone: "09121234567",
                            firstName: "مدیر",
                            lastName: "سیستم",
                            role: "ADMIN",
                            createdAt:
                                "2026-09-10T10:00:00.000Z",
                            updatedAt:
                                "2026-09-20T10:00:00.000Z",
                        },
                    ],
                    pagination: {
                        page: 1,
                        pageSize: 20,
                        total: 2,
                        totalPages: 1,
                    },
                }),
            });

        vi.stubGlobal(
            "fetch",
            fetchMock,
        );

        render(
            <AdminUsersSection
                accessToken="admin.access.token"
            />,
        );

        await waitFor(() => {
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

        expect(
            await screen.findByRole(
                "heading",
                {
                    name: "کاربران",
                },
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "سارا احمدی",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "09123456789",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "مدیر سیستم",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "۲ کاربر",
            ),
        ).toBeInTheDocument();
    });

    it("searches users and resets to page one", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    items: [],
                    pagination: {
                        page: 1,
                        pageSize: 20,
                        total: 0,
                        totalPages: 0,
                    },
                }),
            });

        vi.stubGlobal("fetch", fetchMock);

        render(
            <AdminUsersSection
                accessToken="admin.access.token"
            />,
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        fireEvent.change(
            screen.getByRole("searchbox", {
                name: "جستجوی کاربران",
            }),
            {
                target: {
                    value: "سارا",
                },
            },
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "جستجو",
            }),
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        const requestUrl =
            new URL(
                fetchMock.mock.calls[1][0],
            );

        expect(
            requestUrl.searchParams.get(
                "page",
            ),
        ).toBe("1");

        expect(
            requestUrl.searchParams.get(
                "pageSize",
            ),
        ).toBe("20");

        expect(
            requestUrl.searchParams.get(
                "search",
            ),
        ).toBe("سارا");
    });

    it("loads the next users page", async () => {
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
                        total: 21,
                        totalPages: 2,
                    },
                }),
            });

        vi.stubGlobal("fetch", fetchMock);

        render(
            <AdminUsersSection
                accessToken="admin.access.token"
            />,
        );

        expect(
            await screen.findByText(
                "سارا احمدی",
            ),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: "صفحه بعد",
            }),
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        const requestUrl =
            new URL(
                fetchMock.mock.calls[1][0],
            );

        expect(
            requestUrl.searchParams.get(
                "page",
            ),
        ).toBe("2");

        expect(
            requestUrl.searchParams.get(
                "pageSize",
            ),
        ).toBe("20");
    });

    it("includes mobile labels for each user record", async () => {
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

        vi.stubGlobal("fetch", fetchMock);

        render(
            <AdminUsersSection
                accessToken="admin.access.token"
            />,
        );

        const userName =
            await screen.findByText(
                "سارا احمدی",
            );

        const userRow =
            userName.closest("tr");

        expect(userRow).not.toBeNull();

        expect(
            within(userRow).getByText(
                "شماره موبایل",
            ),
        ).toBeInTheDocument();

        expect(
            within(userRow).getByText(
                "نقش",
            ),
        ).toBeInTheDocument();

        expect(
            within(userRow).getByText(
                "تاریخ عضویت",
            ),
        ).toBeInTheDocument();
    });
});