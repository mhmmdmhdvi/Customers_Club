import { fireEvent, render, screen, within, } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader";

describe("SiteHeader", () => {
    it("opens the mobile navigation", () => {
        render(<SiteHeader />);
        const menuButton = screen.getByRole("button", {
            name: "باز کردن منو",
        });
        expect(menuButton).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(menuButton);
        expect(menuButton).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "بستن منوی کناری" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("navigation", { name: "ناوبری موبایل" }),
        ).toBeInTheDocument();
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
    it("closes the mobile drawer when the backdrop is clicked", () => {
        render(<SiteHeader />);

        fireEvent.click(
            screen.getByRole("button", { name: "باز کردن منو" }),
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "بستن منو با کلیک روی پس زمینه",
            }),
        );

        expect(
            screen.queryByRole("navigation", { name: "ناوبری موبایل" }),
        ).not.toBeInTheDocument();
    });
    it("closes the drawer from its own close button", () => {
        render(<SiteHeader />);
        fireEvent.click(
            screen.getByRole("button", { name: "باز کردن منو" }),
        );
        const mobileNavigation = screen.getByRole("navigation", {
            name: "ناوبری موبایل",
        });
        fireEvent.click(
            within(mobileNavigation).getByRole("button", { name: "بستن منوی کناری" }),
        );
        expect(
            screen.queryByRole("navigation", { name: "ناوبری موبایل" }),
        ).not.toBeInTheDocument();
    });
    it("shows an icon inside the mobile menu button", () => {
        render(<SiteHeader />);
        const menuButton = screen.getByRole("button", {
            name: "باز کردن منو",
        });
        expect(menuButton.querySelector("svg")).toBeInTheDocument();
    });
});