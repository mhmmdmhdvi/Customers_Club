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

import { AdminMessagesSection } from "./AdminMessagesSection";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("AdminMessagesSection", () => {
    it("loads and renders contact messages", async () => {
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
            <AdminMessagesSection
                accessToken="admin.access.token"
            />,
        );

        await waitFor(() => {
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

        const sender =
            await screen.findByText(
                "سارا احمدی",
            );

        const messageRow =
            sender.closest("tr");

        expect(messageRow).not.toBeNull();

        expect(
            screen.getByRole("heading", {
                name: "پیام‌ها",
            }),
        ).toBeInTheDocument();

        expect(
            within(messageRow).getByText(
                "09123456789",
            ),
        ).toBeInTheDocument();

        expect(
            within(messageRow).getByText(
                "پشتیبانی",
            ),
        ).toBeInTheDocument();

        expect(
            within(messageRow).getByText(
                "جدید",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText("۱ پیام"),
        ).toBeInTheDocument();
    });

    it("filters messages and resets to page one", async () => {
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
            <AdminMessagesSection
                accessToken="admin.access.token"
            />,
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        fireEvent.change(
            screen.getByRole("searchbox", {
                name: "جستجوی پیام‌ها",
            }),
            {
                target: {
                    value: "سارا",
                },
            },
        );

        fireEvent.change(
            screen.getByRole("combobox", {
                name: "وضعیت پیام",
            }),
            {
                target: {
                    value: "NEW",
                },
            },
        );

        fireEvent.change(
            screen.getByRole("combobox", {
                name: "موضوع پیام",
            }),
            {
                target: {
                    value: "SUPPORT",
                },
            },
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "اعمال فیلترها",
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
            requestUrl.searchParams.get("page"),
        ).toBe("1");

        expect(
            requestUrl.searchParams.get("pageSize"),
        ).toBe("20");

        expect(
            requestUrl.searchParams.get("search"),
        ).toBe("سارا");

        expect(
            requestUrl.searchParams.get("status"),
        ).toBe("NEW");

        expect(
            requestUrl.searchParams.get("subject"),
        ).toBe("SUPPORT");
    });

    it("loads the next messages page", async () => {
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
                        total: 21,
                        totalPages: 2,
                    },
                }),
            });

        vi.stubGlobal("fetch", fetchMock);

        render(
            <AdminMessagesSection
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
            requestUrl.searchParams.get("page"),
        ).toBe("2");

        expect(
            requestUrl.searchParams.get("pageSize"),
        ).toBe("20");
    });

    it("opens a message and loads its full details", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
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
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    id: 42,
                    name: "سارا احمدی",
                    phone: "09123456789",
                    email:
                        "sara@example.com",
                    subject: "SUPPORT",
                    message:
                        "برای سفارش جدید نیاز به راهنمایی دارم.",
                    status: "NEW",
                    createdAt:
                        "2026-09-20T08:30:00.000Z",
                    updatedAt:
                        "2026-09-20T08:30:00.000Z",
                }),
            });

        vi.stubGlobal(
            "fetch",
            fetchMock,
        );

        render(
            <AdminMessagesSection
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
                name: "مشاهده پیام سارا احمدی",
            }),
        );

        await waitFor(() => {
            expect(fetchMock)
                .toHaveBeenCalledTimes(2);
        });

        expect(
            fetchMock.mock.calls[1],
        ).toEqual([
            "http://localhost:3000/admin/messages/42",
            {
                headers: {
                    Authorization:
                        "Bearer admin.access.token",
                },
            },
        ]);

        expect(
            await screen.findByRole(
                "dialog",
                {
                    name: "جزئیات پیام",
                },
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "برای سفارش جدید نیاز به راهنمایی دارم.",
            ),
        ).toBeInTheDocument();
    });

    it("moves a NEW message to READ", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
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
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    id: 42,
                    name: "سارا احمدی",
                    phone: "09123456789",
                    email:
                        "sara@example.com",
                    subject: "SUPPORT",
                    message:
                        "برای سفارش جدید نیاز به راهنمایی دارم.",
                    status: "NEW",
                    createdAt:
                        "2026-09-20T08:30:00.000Z",
                    updatedAt:
                        "2026-09-20T08:30:00.000Z",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    id: 42,
                    status: "READ",
                    updatedAt:
                        "2026-09-20T09:00:00.000Z",
                }),
            });

        vi.stubGlobal(
            "fetch",
            fetchMock,
        );

        render(
            <AdminMessagesSection
                accessToken="admin.access.token"
            />,
        );

        await screen.findByText(
            "سارا احمدی",
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "مشاهده پیام سارا احمدی",
            }),
        );

        await screen.findByText(
            "برای سفارش جدید نیاز به راهنمایی دارم.",
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "علامت‌گذاری به‌عنوان خوانده‌شده",
            }),
        );

        await waitFor(() => {
            expect(fetchMock)
                .toHaveBeenCalledTimes(3);
        });

        expect(
            fetchMock.mock.calls[2],
        ).toEqual([
            "http://localhost:3000/admin/messages/42/status",
            {
                method: "PATCH",
                headers: {
                    Authorization:
                        "Bearer admin.access.token",
                    "Content-Type":
                        "application/json",
                    "X-CSRF-Protection":
                        "1",
                },
                body: JSON.stringify({
                    status: "READ",
                }),
            },
        ]);

        expect(
            await screen.findByText(
                "خوانده‌شده",
            ),
        ).toBeInTheDocument();
    });
});