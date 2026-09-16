import { fireEvent, render, screen } from "@testing-library/react";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./AuthContext";
import { StrictMode } from "react";

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

beforeEach(() => {
    vi.stubGlobal("navigator", {
        locks: {
            request: vi.fn((_name, callback) => callback()),
        },
    });

    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
        }),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

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

function AuthStatusReader() {
    const { authStatus } = useAuth();

    return <p>{authStatus}</p>;
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

    it("restores an authenticated session from the refresh endpoint", async () => {
        const restoredUser = {
            id: 7,
            phone: "09123456789",
            firstName: "سارا",
            lastName: "احمدی",
            role: "MEMBER",
        };

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Session refreshed",
                authenticated: true,
                user: restoredUser,
                tokenType: "Bearer",
                accessToken: "restored.access.token",
                expiresIn: 900,
                accessExpiresAt: new Date(
                    Date.now() + 15 * 60 * 1000,
                ).toISOString(),
            }),
        });

        vi.stubGlobal("fetch", fetchMock);

        render(
            <AuthProvider>
                <SessionReader />
            </AuthProvider>,
        );

        expect(
            await screen.findByText("سارا احمدی"),
        ).toBeInTheDocument();

        expect(fetchMock).toHaveBeenCalledTimes(1);

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringMatching(/\/auth\/refresh$/),
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Protection": "1",
                },
                body: JSON.stringify({}),
            },
        );
    });

    it("shares one in-flight refresh request under StrictMode", async () => {
        const restoredUser = {
            id: 7,
            phone: "09123456789",
            firstName: "سارا",
            lastName: "احمدی",
            role: "MEMBER",
        };

        let resolveRefresh;

        const refreshPromise = new Promise((resolve) => {
            resolveRefresh = resolve;
        });

        const fetchMock = vi.fn(() => refreshPromise);

        vi.stubGlobal("fetch", fetchMock);

        render(
            <StrictMode>
                <AuthProvider>
                    <SessionReader />
                </AuthProvider>
            </StrictMode>,
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);

        resolveRefresh({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Session refreshed",
                authenticated: true,
                user: restoredUser,
                tokenType: "Bearer",
                accessToken: "restored.access.token",
                expiresIn: 900,
                accessExpiresAt: new Date(
                    Date.now() + 15 * 60 * 1000,
                ).toISOString(),
            }),
        });

        expect(
            await screen.findByText("سارا احمدی"),
        ).toBeInTheDocument();
    });

    it("reports that authentication is being restored while refresh is in flight", async () => {
        const restoredUser = {
            id: 7,
            phone: "09123456789",
            firstName: "سارا",
            lastName: "احمدی",
            role: "MEMBER",
        };

        let resolveRefresh;

        const refreshPromise = new Promise((resolve) => {
            resolveRefresh = resolve;
        });

        vi.stubGlobal(
            "fetch",
            vi.fn(() => refreshPromise),
        );

        render(
            <AuthProvider>
                <AuthStatusReader />
            </AuthProvider>,
        );

        expect(screen.getByText("restoring")).toBeInTheDocument();

        // Let the in-flight request finish before this test ends so the
        // module-level refresh coordinator does not leak into later tests.
        resolveRefresh({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Session refreshed",
                authenticated: true,
                user: restoredUser,
                tokenType: "Bearer",
                accessToken: "restored.access.token",
                expiresIn: 900,
                accessExpiresAt: new Date(
                    Date.now() + 15 * 60 * 1000,
                ).toISOString(),
            }),
        });

        expect(
            await screen.findByText("authenticated"),
        ).toBeInTheDocument();
    });

    it("reports authenticated after restoring a valid session", async () => {
        const restoredUser = {
            id: 7,
            phone: "09123456789",
            firstName: "سارا",
            lastName: "احمدی",
            role: "MEMBER",
        };

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    message: "Session refreshed",
                    authenticated: true,
                    user: restoredUser,
                    tokenType: "Bearer",
                    accessToken: "restored.access.token",
                    expiresIn: 900,
                    accessExpiresAt: new Date(
                        Date.now() + 15 * 60 * 1000,
                    ).toISOString(),
                }),
            }),
        );

        render(
            <AuthProvider>
                <AuthStatusReader />
            </AuthProvider>,
        );

        expect(
            await screen.findByText("authenticated"),
        ).toBeInTheDocument();
    });

    it("reports unauthenticated when refresh returns 401", async () => {
        const responseJson = vi.fn();

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                json: responseJson,
            }),
        );

        render(
            <AuthProvider>
                <AuthStatusReader />
            </AuthProvider>,
        );

        expect(
            await screen.findByText("unauthenticated"),
        ).toBeInTheDocument();

        expect(responseJson).not.toHaveBeenCalled();
    });

    it("reports error when session restoration fails ambiguously", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
            }),
        );

        render(
            <AuthProvider>
                <AuthStatusReader />
            </AuthProvider>,
        );

        expect(
            await screen.findByText("error"),
        ).toBeInTheDocument();
    });

    it("reports authenticated when a session is established manually", async () => {
        render(
            <AuthProvider>
                <SessionSetter />
                <AuthStatusReader />
            </AuthProvider>,
        );

        // Let the default mocked 401 restoration finish first.
        expect(
            await screen.findByText("unauthenticated"),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Sign in",
            }),
        );

        expect(
            screen.getByText("authenticated"),
        ).toBeInTheDocument();
    });

    it("reports unauthenticated when the shared session is cleared", async () => {
        render(
            <AuthProvider>
                <SessionSetter />
                <AuthStatusReader />
            </AuthProvider>,
        );

        // Let the default mocked restoration finish first.
        expect(
            await screen.findByText("unauthenticated"),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Sign in",
            }),
        );

        expect(
            screen.getByText("authenticated"),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Sign out",
            }),
        );

        expect(
            screen.getByText("unauthenticated"),
        ).toBeInTheDocument();
    });

    it("clears the refresh block after a session is established successfully", async () => {
        localStorage.setItem("club-auth-refresh-blocked", "1");

        render(
            <AuthProvider>
                <SessionSetter />
                <AuthStatusReader />
            </AuthProvider>,
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "Sign in",
            }),
        );

        expect(
            screen.getByText("authenticated"),
        ).toBeInTheDocument();

        expect(
            localStorage.getItem("club-auth-refresh-blocked"),
        ).toBeNull();
    });

    it("clears the refresh block when the shared session is cleared", async () => {
        localStorage.setItem("club-auth-refresh-blocked", "1");

        render(
            <AuthProvider>
                <SessionSetter />
                <AuthStatusReader />
            </AuthProvider>,
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "Sign in",
            }),
        );

        localStorage.setItem("club-auth-refresh-blocked", "1");

        fireEvent.click(
            screen.getByRole("button", {
                name: "Sign out",
            }),
        );

        expect(
            screen.getByText("unauthenticated"),
        ).toBeInTheDocument();

        expect(
            localStorage.getItem("club-auth-refresh-blocked"),
        ).toBeNull();
    });
});