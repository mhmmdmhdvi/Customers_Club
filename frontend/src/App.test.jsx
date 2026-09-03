import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
    it("place the customer club heading inside the main content", () => {
        render(<App />);
        const main = screen.getByRole("main");
        expect(
            within(main).getByRole("heading", { name:"باشگاه مشتریان"}),
        ).toBeInTheDocument();
    });
    it("shows a customer-club home link in the site header", () => {
        render(<App />);
        const header = screen.getByRole("banner");
        expect(
            within(header).getByRole("link", {
                name:"صفحه اصلی باشگاه مشتریان",
            }),
        ).toHaveAttribute("href", "#hero");
    });
});