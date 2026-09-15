import { screen } from "@testing-library/react";
import { expect, it } from "vitest";

it("provides authentication context to the login page", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    window.history.pushState({}, "", "/login");

    await import("./main.jsx");

    expect(
        await screen.findByRole("heading", {
            name: "ورود",
            level: 1,
        }),
    ).toBeInTheDocument();
});