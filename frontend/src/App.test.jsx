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
import { AuthContext } from "./auth/AuthContext";
import App from "./App";

afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
});

describe("App", () => {
    it("renders the hero with its main heading and actions", () => {
        render(<App />);

        const hero = screen.getByRole("region", {
            name: "بخش معرفی باشگاه مشتریان",
        });

        expect(hero).toHaveAttribute("id", "hero");

        const heading = within(hero).getByRole("heading", {
            level: 1,
        });

        expect(heading).toHaveTextContent("باشگاه مشتریان");
        expect(heading).toHaveTextContent("جایی برای");
        expect(heading).toHaveTextContent("حرفه");

        expect(
            within(hero).getByRole("link", {
                name: "عضویت در باشگاه",
            }),
        ).toHaveAttribute("href", "#join");

        expect(
            within(hero).getByRole("link", {
                name: "مشاهده رویدادها",
            }),
        ).toHaveAttribute("href", "#events");
    });

    it("shows a customer-club home link in the site header", () => {
        render(<App />);

        const header = screen.getByRole("banner");

        expect(
            within(header).getByRole("link", {
                name: "صفحه اصلی باشگاه مشتریان",
            }),
        ).toHaveAttribute("href", "#hero");
    });

    it("reveals hero content when IntersectionObserver is unavailable", async () => {
        vi.stubGlobal("IntersectionObserver", undefined);

        render(<App />);

        const heading = screen.getByRole("heading", {
            level: 1,
        });

        await waitFor(() => {
            expect(heading).toHaveAttribute(
                "data-visible",
                "true",
            );
        });
    });
    it("renders the benefits section", () => {
        render(<App />);
        const benefits = screen.getByRole("region", {
            name: /مزایای باشگاه/,
        });
        expect(benefits).toHaveAttribute("id", "benefits");
    });
    it("renders the events section", () => {
        render(<App />);

        const events = screen.getByRole("region", {
            name: /رویدادهای باشگاه/,
        });

        expect(events).toHaveAttribute("id", "events");
    });
    it("renders the membership section", () => {
        render(<App />);

        const membership = screen.getByRole("region", {
            name: /عضویت/,
        });

        expect(membership).toHaveAttribute("id", "join");
    });
    it("renders the about section", () => {
        render(<App />);

        const about = screen.getByRole("region", {
            name: /درباره باشگاه/,
        });

        expect(about).toHaveAttribute("id", "about");
    });
    it("renders the contact section", () => {
        render(<App />);

        const contact = screen.getByRole("region", {
            name: /تماس با ما/,
        });

        expect(contact).toHaveAttribute("id", "contact");
    });
    it("renders the footer section", () => {
        render(<App />);

        const footer = screen.getByRole("contentinfo");

        expect(footer).toBeInTheDocument();
    });

    it("redirects an unauthenticated dashboard visitor to login", async () => {
        window.history.replaceState({}, "", "/dashboard");

        render(
            <AuthContext.Provider
                value={{
                    session: null,
                    authStatus: "unauthenticated",
                    establishSession: vi.fn(),
                    clearSession: vi.fn(),
                }}
            >
                <App />
            </AuthContext.Provider>,
        );

        await waitFor(() => {
            expect(window.location.pathname).toBe("/login");
        });

        expect(
            screen.getByRole("textbox", {
                name: "شماره موبایل",
            }),
        ).toBeInTheDocument();
    });

    it("renders the dashboard for an authenticated member", () => {
        window.history.replaceState({}, "", "/dashboard");

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
                                "2026-09-16T08:00:00.000Z",
                        },
                        accessToken: "test.access.token",
                        tokenType: "Bearer",
                        accessExpiresAt: new Date(
                            Date.now() + 15 * 60 * 1000,
                        ).toISOString(),
                    },
                    authStatus: "authenticated",
                    establishSession: vi.fn(),
                    clearSession: vi.fn(),
                }}
            >
                <App />
            </AuthContext.Provider>,
        );

        expect(
            screen.getByRole("heading", {
                name: "اطلاعات عضویت",
            }),
        ).toBeInTheDocument();
    });
});