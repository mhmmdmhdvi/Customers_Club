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

import App from "./App";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("App", () => {
    it("renders the hero with its main heading and actions", () => {
        render(<App />);

        const hero = screen.getByRole("region", {
            name: /باشگاه مشتریان/,
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
});