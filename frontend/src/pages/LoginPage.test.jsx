import {
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

describe("LoginPage", () => {
    it("shows the login heading and phone-number field", () => {
        render(<LoginPage />);
        expect(
            screen.getByRole("heading", {
                name: "ورود",
                level: 1,
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("textbox", {
                name: "شماره موبایل",
            }),
        ).toBeInTheDocument();
    });
    it("shows the verification step after requesting a code", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    Message: "Code sent",
                }),
            }),
        );
        render(<LoginPage />);
        const phoneInput = screen.getByRole("textbox", {
            name: "شماره موبایل",
        });
        fireEvent.change(phoneInput, {
            target: {
                value: "091392360398",
            },
        });
        fireEvent.click(
            screen.getByRole("button", {
                name: "دریافت کد تأیید",
            }),
        );
        await waitFor(() => {
            expect(
                screen.getByRole("textbox", {
                    name: "کد تأیید",
                }),
            ).toBeInTheDocument();
        });
    });
});