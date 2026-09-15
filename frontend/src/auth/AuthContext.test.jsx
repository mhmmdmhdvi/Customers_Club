import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./AuthContext";

const testSession = {
    authenticated: true,
    user: {
        id: 7,
        phone: "09123456789",
        firstName: "سارا",
        lastName: "احمدی",
        role: "MEMBER",
    },
    tokenType: "Bearer",
    accessToken: "test.access.token",
};

function SessionSetter() {
    const { establishSession, clearSession } = useAuth();

    return (
        <>
            <button
                type="button"
                onClick={() => establishSession(testSession)}
            >
                Sign in
            </button>

            <button type="button" onClick={clearSession}>
                Sign out
            </button>
        </>
    );
}

function SessionReader() {
    const { session } = useAuth();

    return (
        <p>
            {session
                ? `${session.user.firstName} ${session.user.lastName}`
                : "Signed out"}
        </p>
    );
}

describe("AuthProvider", () => {
    it("shares the same signed-in session between components", () => {
        render(
            <AuthProvider>
                <SessionSetter />
                <SessionReader />
            </AuthProvider>,
        );

        expect(screen.getByText("Signed out")).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Sign in",
            }),
        );

        expect(screen.getByText("سارا احمدی")).toBeInTheDocument();
    });

    it("clears the shared session for consuming components", () => {
        render(
            <AuthProvider>
                <SessionSetter />
                <SessionReader />
            </AuthProvider>,
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "Sign in",
            }),
        );

        expect(screen.getByText("سارا احمدی")).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Sign out",
            }),
        );

        expect(screen.getByText("Signed out")).toBeInTheDocument();
    });

});