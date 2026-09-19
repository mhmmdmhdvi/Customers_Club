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

import { AuthContext } from "../../auth/AuthContext";
import { SiteHeader } from "./SiteHeader";

afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
});

describe("SiteHeader", () => {
    it("toggles the mobile navigation with one accessible button", () => {
        render(<SiteHeader />);

        const menuButton = screen.getByRole("button", {
            name: "باز کردن منو",
        });

        expect(menuButton).toHaveAttribute("aria-expanded", "false");

        expect(
            screen.queryByRole("navigation", {
                name: "ناوبری موبایل",
            }),
        ).not.toBeInTheDocument();

        fireEvent.click(menuButton);

        const closeButton = screen.getByRole("button", {
            name: "بستن منو",
        });

        expect(closeButton).toBe(menuButton);
        expect(closeButton).toHaveAttribute("aria-expanded", "true");

        expect(
            screen.getByRole("navigation", {
                name: "ناوبری موبایل",
            }),
        ).toBeInTheDocument();

        fireEvent.click(closeButton);

        expect(
            screen.getByRole("button", {
                name: "باز کردن منو",
            }),
        ).toHaveAttribute("aria-expanded", "false");

        expect(
            screen.queryByRole("navigation", {
                name: "ناوبری موبایل",
            }),
        ).not.toBeInTheDocument();
    });
    it("closes the mobile navigation after selecting a link", () => {
        render(<SiteHeader />);
        fireEvent.click(
            screen.getByRole("button", { name: "باز کردن منو" }),
        );
        const mobileNavigation = screen.getByRole("navigation", {
            name: "ناوبری موبایل",
        });
        const eventsLink = within(mobileNavigation).getByRole("link", {
            name: "رویدادها",
        });
        expect(eventsLink).toHaveAttribute("href", "/#events");
        fireEvent.click(eventsLink);
        expect(
            screen.queryByRole("navigation", {
                name: "ناوبری موبایل",
            }),
        ).not.toBeInTheDocument();
    });
    it("provides links to the landing-page sections", () => {
        render(<SiteHeader />);
        fireEvent.click(
            screen.getByRole("button", { name: "باز کردن منو" }),
        );
        const mobileNavigation = screen.getByRole("navigation", {
            name: "ناوبری موبایل",
        });
        expect(
            within(mobileNavigation).getByRole("link", {
                name: "رویدادها",
            }),
        ).toHaveAttribute("href", "/#events");
        expect(
            within(mobileNavigation).getByRole("link", {
                name: "درباره ما",
            }),
        ).toHaveAttribute("href", "/#about");
        expect(
            within(mobileNavigation).getByRole("link", {
                name: "تماس با ما",
            }),
        ).toHaveAttribute("href", "/#contact");
        expect(
            within(mobileNavigation).getByRole("link", {
                name: "ورود",
            }),
        ).toHaveAttribute("href", "/login");
    });
    it("shows an icon inside the mobile menu button", () => {
        render(<SiteHeader />);
        const menuButton = screen.getByRole("button", {
            name: "باز کردن منو",
        });
        expect(menuButton.querySelector("svg")).toBeInTheDocument();
    });
    it("renders the desktop navigation from the medium breakpoint", () => {
        render(<SiteHeader />);

        const desktopNavigation = screen.getByRole("navigation", {
            name: "ناوبری اصلی",
        });

        expect(desktopNavigation).toHaveClass("hidden", "md:flex");

        expect(
            within(desktopNavigation).getByRole("link", {
                name: "ورود",
            }),
        ).toHaveAttribute("href", "/login");
    });
    it("adds the scrolled header treatment after the page moves", () => {
        Object.defineProperty(window, "scrollY", {
            configurable: true,
            writable: true,
            value: 0,
        });
        render(<SiteHeader />);
        const header = screen.getByRole("banner");
        expect(header).not.toHaveClass("shadow-refined");
        window.scrollY = 20;
        fireEvent.scroll(window);
        expect(header).toHaveClass("shadow-refined");
        window.scrollY = 0;
        fireEvent.scroll(window);
        expect(header).not.toHaveClass("shadow-refined");
    });

    it("shows dashboard and logout controls for an authenticated member", () => {
        window.history.replaceState({}, "", "/dashboard");
        const clearSession = vi.fn();

        render(
            <AuthContext.Provider
                value={{
                    session: {
                        user: {
                            id: 7,
                            phone: "09123456789",
                            firstName: "سارا",
                            lastName: "احمدی",
                            role: "MEMBER",
                            createdAt:
                                "2026-09-10T08:00:00.000Z",
                        },
                        accessToken: "test.access.token",
                        tokenType: "Bearer",
                        accessExpiresAt: new Date(
                            Date.now() + 15 * 60 * 1000,
                        ).toISOString(),
                    },
                    authStatus: "authenticated",
                    establishSession: vi.fn(),
                    clearSession,
                }}
            >
                <SiteHeader />
            </AuthContext.Provider>,
        );

        const desktopNavigation = screen.getByRole(
            "navigation",
            {
                name: "ناوبری اصلی",
            },
        );

        const dashboardLink = within(
            desktopNavigation,
        ).getByRole("link", {
            name: "داشبورد",
        });

        expect(dashboardLink).toHaveAttribute(
            "href",
            "/dashboard",
        );

        expect(dashboardLink).toHaveAttribute(
            "aria-current",
            "page",
        );

        expect(
            dashboardLink.querySelector("svg"),
        ).toBeInTheDocument();

        const logoutButton = within(
            desktopNavigation,
        ).getByRole("button", {
            name: "خروج",
        });

        expect(
            logoutButton.querySelector("svg"),
        ).toBeInTheDocument();

        expect(
            within(desktopNavigation).queryByRole("link", {
                name: "ورود",
            }),
        ).not.toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: "باز کردن منو",
            }),
        );

        const mobileNavigation = screen.getByRole(
            "navigation",
            {
                name: "ناوبری موبایل",
            },
        );

        expect(
            within(mobileNavigation).getByRole("link", {
                name: "داشبورد",
            }),
        ).toHaveAttribute("href", "/dashboard");

        expect(
            within(mobileNavigation).getByRole("button", {
                name: "خروج",
            }),
        ).toBeInTheDocument();

        expect(
            within(mobileNavigation).queryByRole("link", {
                name: "ورود",
            }),
        ).not.toBeInTheDocument();
    });

    it("logs out through the session endpoint before clearing the session", async () => {
        const clearSession = vi.fn();

        const fetchMock = vi.fn().mockResolvedValue({
            status: 204,
        });

        vi.stubGlobal("fetch", fetchMock);

        render(
            <AuthContext.Provider
                value={{
                    session: {
                        user: {
                            id: 7,
                            phone: "09123456789",
                            firstName: "سارا",
                            lastName: "احمدی",
                            role: "MEMBER",
                            createdAt:
                                "2026-09-10T08:00:00.000Z",
                        },
                        accessToken: "test.access.token",
                        tokenType: "Bearer",
                        accessExpiresAt: new Date(
                            Date.now() + 15 * 60 * 1000,
                        ).toISOString(),
                    },
                    authStatus: "authenticated",
                    establishSession: vi.fn(),
                    clearSession,
                }}
            >
                <SiteHeader />
            </AuthContext.Provider>,
        );

        const desktopNavigation = screen.getByRole(
            "navigation",
            {
                name: "ناوبری اصلی",
            },
        );

        fireEvent.click(
            within(desktopNavigation).getByRole("button", {
                name: "خروج",
            }),
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        const [url, options] = fetchMock.mock.calls[0];

        expect(url).toMatch(/\/auth\/logout$/);

        expect(options).toEqual(
            expect.objectContaining({
                method: "POST",
                credentials: "include",
                headers: expect.objectContaining({
                    "Content-Type": "application/json",
                    "X-CSRF-Protection": "1",
                }),
            }),
        );

        expect(JSON.parse(options.body)).toEqual({});

        await waitFor(() => {
            expect(clearSession).toHaveBeenCalledTimes(1);
        });
    });
});