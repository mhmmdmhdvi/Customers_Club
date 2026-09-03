import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader";

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
        expect(eventsLink).toHaveAttribute("href", "#events");
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
        ).toHaveAttribute("href", "#events");
        expect(
            within(mobileNavigation).getByRole("link", {
                name: "درباره ما",
            }),
        ).toHaveAttribute("href", "#about");
        expect(
            within(mobileNavigation).getByRole("link", {
                name: "تماس با ما",
            }),
        ).toHaveAttribute("href", "#contact");
        expect(
            within(mobileNavigation).getByRole("link", {
                name: "ورود",
            }),
        ).toHaveAttribute("href", "#join");
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
        ).toHaveAttribute("href", "#join");
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
});