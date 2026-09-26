import {
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";
import { AuthProvider } from "../auth/AuthProvider";
import { useAuth } from "../auth/AuthContext";

const sharedSession = {
    user: {
        id: 7,
        phone: "09123456789",
        firstName: "سارا",
        lastName: "احمدی",
        role: "MEMBER",
        createdAt: "2026-09-10T08:00:00.000Z",
    },
    accessToken: "test.access.token",
    tokenType: "Bearer",
    accessExpiresAt: new Date(
        Date.now() + 15 * 60 * 1000,
    ).toISOString(),
};

function SharedSessionSetter() {
    const { establishSession } = useAuth();

    return (
        <button
            type="button"
            onClick={() => establishSession(sharedSession)}
        >
            Set shared session
        </button>
    );
}

function renderWithUnauthenticatedRefresh(ui) {
    const requestFetch = globalThis.fetch;

    vi.stubGlobal(
        "fetch",
        vi.fn((url, options) => {
            if (
                typeof url === "string" &&
                /\/auth\/refresh$/.test(url)
            ) {
                return Promise.resolve({
                    ok: false,
                    status: 401,
                });
            }

            if (typeof requestFetch !== "function") {
                throw new Error(
                    `Unexpected fetch request: ${String(url)}`,
                );
            }

            return requestFetch(url, options);
        }),
    );

    return render(ui);
}

async function renderLoginPage(props = {}) {
    const result = renderWithUnauthenticatedRefresh(
        <AuthProvider>
            <LoginPage {...props} />
        </AuthProvider>,
    );

    await screen.findByRole("textbox", {
        name: "شماره موبایل",
    });

    return result;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("LoginPage", () => {
    it("shows the login heading and phone-number field", async () => {
        await renderLoginPage();
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
                    message: "Code sent",
                }),
            }),
        );
        await renderLoginPage();
        const phoneInput = screen.getByRole("textbox", {
            name: "شماره موبایل",
        });
        fireEvent.change(phoneInput, {
            target: {
                value: "09123456789",
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

it("shows an already-established shared session", () => {
    renderWithUnauthenticatedRefresh(
        <AuthProvider>
            <SharedSessionSetter />
            <LoginPage />
        </AuthProvider>,
    );

    fireEvent.click(
        screen.getByRole("button", {
            name: "Set shared session",
        }),
    );

    expect(
        screen.getByRole("heading", {
            name: "خوش آمدید",
        }),
    ).toBeInTheDocument();

    expect(screen.getByText("سارا احمدی")).toBeInTheDocument();
});

it("waits for session restoration before showing the phone form", async () => {
    let resolveRefresh;

    const refreshPromise = new Promise((resolve) => {
        resolveRefresh = resolve;
    });

    vi.stubGlobal(
        "fetch",
        vi.fn((url) => {
            if (
                typeof url === "string" &&
                /\/auth\/refresh$/.test(url)
            ) {
                return refreshPromise;
            }

            throw new Error(
                `Unexpected fetch request: ${String(url)}`,
            );
        }),
    );

    render(
        <AuthProvider>
            <LoginPage />
        </AuthProvider>,
    );

    expect(
        screen.queryByRole("textbox", {
            name: "شماره موبایل",
        }),
    ).not.toBeInTheDocument();

    resolveRefresh({
        ok: false,
        status: 401,
    });

    expect(
        await screen.findByRole("textbox", {
            name: "شماره موبایل",
        }),
    ).toBeInTheDocument();
});

it("does not show the login form when session restoration fails ambiguously", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
        }),
    );

    render(
        <AuthProvider>
            <LoginPage />
        </AuthProvider>,
    );

    expect(
        await screen.findByRole("alert"),
    ).toHaveTextContent(
        "بررسی وضعیت ورود انجام نشد.",
    );

    expect(
        screen.queryByRole("textbox", {
            name: "شماره موبایل",
        }),
    ).not.toBeInTheDocument();
});

it("shows registration fields after verifying a new member's code", async () => {
    const phone = "09123456789";
    const code = "123456";

    const fetchMock = vi
        .fn()
        // First request: ask for an OTP.
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Code sent",
            }),
        })
        // Second request: verify the entered OTP.
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "OTP verified",
                nextStep: "REGISTER",
                authenticated: false,
                verificationToken: "a".repeat(64), // Test-only proof.
                verificationExpiresAt: new Date(
                    Date.now() + 5 * 60 * 1000,
                ).toISOString(),
            }),
        });

    vi.stubGlobal("fetch", fetchMock);

    await renderLoginPage();

    fireEvent.change(
        screen.getByRole("textbox", { name: "شماره موبایل" }),
        { target: { value: phone } },
    );

    fireEvent.click(
        screen.getByRole("button", { name: "دریافت کد تأیید" }),
    );

    const codeInput = await screen.findByRole("textbox", {
        name: "کد تأیید",
    });

    fireEvent.change(codeInput, {
        target: { value: code },
    });

    fireEvent.click(
        screen.getByRole("button", { name: "تأیید کد" }),
    );

    expect(
        await screen.findByRole("textbox", { name: "نام" }),
    ).toBeInTheDocument();

    expect(
        screen.getByRole("textbox", { name: "نام خانوادگی" }),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(/\/auth\/verify-code$/),
        expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({
                "Content-Type": "application/json",
            }),
            body: JSON.stringify({ phone, code }),
        }),
    );
});

it("registers a new member and shows a signed-in confirmation", async () => {
    const onAuthenticated = vi.fn();
    const phone = "09123456789";
    const code = "123456";
    const verificationToken = "a".repeat(64);

    const user = {
        id: 1,
        phone,
        firstName: "علی",
        lastName: "احمدی",
        role: "MEMBER",
        createdAt: "2026-09-10T08:00:00.000Z",
    };

    const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Code sent",
            }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "OTP verified",
                nextStep: "REGISTER",
                authenticated: false,
                verificationToken,
                verificationExpiresAt: new Date(
                    Date.now() + 5 * 60 * 1000,
                ).toISOString(),
            }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 201,
            json: async () => ({
                message: "Registration completed",
                authenticated: true,
                user,
                tokenType: "Bearer",
                accessToken: "test.access.token",
                expiresIn: 900,
                accessExpiresAt: new Date(
                    Date.now() + 15 * 60 * 1000,
                ).toISOString(),
            }),
        });

    vi.stubGlobal("fetch", fetchMock);

    await renderLoginPage({ onAuthenticated });

    fireEvent.change(
        screen.getByRole("textbox", { name: "شماره موبایل" }),
        { target: { value: phone } },
    );

    fireEvent.click(
        screen.getByRole("button", { name: "دریافت کد تأیید" }),
    );

    const codeInput = await screen.findByRole("textbox", {
        name: "کد تأیید",
    });

    fireEvent.change(codeInput, {
        target: { value: code },
    });

    fireEvent.click(
        screen.getByRole("button", { name: "تأیید کد" }),
    );

    const firstNameInput = await screen.findByRole("textbox", {
        name: "نام",
    });

    fireEvent.change(firstNameInput, {
        target: { value: user.firstName },
    });

    fireEvent.change(
        screen.getByRole("textbox", { name: "نام خانوادگی" }),
        { target: { value: user.lastName } },
    );

    const registerButton = screen.getByRole("button", {
        name: "تکمیل ثبت‌نام",
    });

    expect(registerButton).toBeEnabled();
    fireEvent.click(registerButton);

    expect(
        await screen.findByRole("heading", { name: "خوش آمدید" }),
    ).toBeInTheDocument();

    expect(screen.getByText("علی احمدی")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [url, options] = fetchMock.mock.calls[2];

    expect(url).toMatch(/\/auth\/register$/);

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

    expect(JSON.parse(options.body)).toEqual({
        verificationToken,
        firstName: user.firstName,
        lastName: user.lastName,
    });
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
});

it("logs in an existing member without showing registration fields", async () => {
    const onAuthenticated = vi.fn();
    const phone = "09123456789";
    const code = "123456";
    const verificationToken = "b".repeat(64);

    const user = {
        id: 7,
        phone,
        firstName: "سارا",
        lastName: "احمدی",
        role: "MEMBER",
        createdAt: "2026-09-10T08:00:00.000Z",
    };

    const fetchMock = vi
        .fn()
        // Request 1: ask for the OTP.
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Code sent",
            }),
        })
        // Request 2: verify the OTP for an existing member.
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "OTP verified",
                nextStep: "LOGIN",
                authenticated: false,
                verificationToken,
                verificationExpiresAt: new Date(
                    Date.now() + 5 * 60 * 1000,
                ).toISOString(),
            }),
        })
        // Request 3: exchange the proof for a session.
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Logged in",
                authenticated: true,
                user,
                tokenType: "Bearer",
                accessToken: "test.access.token", // Test-only value.
                expiresIn: 900,
                accessExpiresAt: new Date(
                    Date.now() + 15 * 60 * 1000,
                ).toISOString(),
            }),
        });

    vi.stubGlobal("fetch", fetchMock);

    await renderLoginPage({ onAuthenticated });

    // Enter the phone number and request a code.
    fireEvent.change(
        screen.getByRole("textbox", { name: "شماره موبایل" }),
        { target: { value: phone } },
    );

    fireEvent.click(
        screen.getByRole("button", { name: "دریافت کد تأیید" }),
    );

    // Enter and verify the OTP.
    const codeInput = await screen.findByRole("textbox", {
        name: "کد تأیید",
    });

    fireEvent.change(codeInput, {
        target: { value: code },
    });

    fireEvent.click(
        screen.getByRole("button", { name: "تأیید کد" }),
    );

    // Login should proceed without asking for registration details.
    expect(
        await screen.findByRole("heading", { name: "خوش آمدید" }),
    ).toBeInTheDocument();

    expect(screen.getByText("سارا احمدی")).toBeInTheDocument();

    expect(
        screen.queryByRole("textbox", { name: "نام" }),
    ).not.toBeInTheDocument();

    expect(
        screen.queryByRole("textbox", { name: "نام خانوادگی" }),
    ).not.toBeInTheDocument();

    // An existing member must not be told that a new account was created.
    expect(
        screen.queryByText("حساب شما ساخته شد و وارد شده‌اید."),
    ).not.toBeInTheDocument();

    // Verify the login request, not just the welcome screen.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [url, options] = fetchMock.mock.calls[2];

    expect(url).toMatch(/\/auth\/login$/);

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

    expect(JSON.parse(options.body)).toEqual({
        verificationToken,
    });
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
});

it("logs out and returns to an empty phone-number form", async () => {
    const phone = "09123456789";
    const code = "123456";
    const verificationToken = "b".repeat(64);

    const user = {
        id: 7,
        phone,
        firstName: "سارا",
        lastName: "احمدی",
        role: "MEMBER",
        createdAt: "2026-09-10T08:00:00.000Z",
    };

    // A 204 response has no JSON body to read.
    const logoutJson = vi.fn().mockRejectedValue(
        new SyntaxError("No response body"),
    );

    const fetchMock = vi
        .fn()
        // Request 1: request the OTP.
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Code sent",
            }),
        })
        // Request 2: verify the OTP.
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "OTP verified",
                nextStep: "LOGIN",
                authenticated: false,
                verificationToken,
                verificationExpiresAt: new Date(
                    Date.now() + 5 * 60 * 1000,
                ).toISOString(),
            }),
        })
        // Request 3: log in.
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Logged in",
                authenticated: true,
                user,
                tokenType: "Bearer",
                accessToken: "test.access.token",
                expiresIn: 900,
                accessExpiresAt: new Date(
                    Date.now() + 15 * 60 * 1000,
                ).toISOString(),
            }),
        })
        // Request 4: log out successfully, with no response body.
        .mockResolvedValueOnce({
            ok: true,
            status: 204,
            json: logoutJson,
        });

    vi.stubGlobal("fetch", fetchMock);

    await renderLoginPage();

    // First, sign in through the existing flow.
    fireEvent.change(
        screen.getByRole("textbox", { name: "شماره موبایل" }),
        { target: { value: phone } },
    );

    fireEvent.click(
        screen.getByRole("button", { name: "دریافت کد تأیید" }),
    );

    const codeInput = await screen.findByRole("textbox", {
        name: "کد تأیید",
    });

    fireEvent.change(codeInput, {
        target: { value: code },
    });

    fireEvent.click(
        screen.getByRole("button", { name: "تأیید کد" }),
    );

    expect(
        await screen.findByRole("heading", { name: "خوش آمدید" }),
    ).toBeInTheDocument();

    // Then, log out.
    fireEvent.click(
        screen.getByRole("button", { name: "خروج از حساب" }),
    );

    // The form should return, with the previous phone number cleared.
    expect(
        await screen.findByRole("textbox", { name: "شماره موبایل" }),
    ).toHaveValue("");

    expect(
        screen.queryByRole("heading", { name: "خوش آمدید" }),
    ).not.toBeInTheDocument();

    expect(
        screen.queryByText("سارا احمدی"),
    ).not.toBeInTheDocument();

    // Confirm that logout contacted the correct endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const [url, options] = fetchMock.mock.calls[3];

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
    expect(logoutJson).not.toHaveBeenCalled();
});

it("resets the session before allowing sign-in again after a restoration error", async () => {
    const logoutJson = vi.fn();

    const fetchMock = vi
        .fn()
        // Initial restoration fails ambiguously.
        .mockResolvedValueOnce({
            ok: false,
            status: 503,
        })
        // Explicit recovery logout succeeds with no body.
        .mockResolvedValueOnce({
            ok: true,
            status: 204,
            json: logoutJson,
        });

    vi.stubGlobal("fetch", fetchMock);

    render(
        <AuthProvider>
            <LoginPage />
        </AuthProvider>,
    );

    expect(
        await screen.findByRole("alert"),
    ).toHaveTextContent(
        "بررسی وضعیت ورود انجام نشد.",
    );

    fireEvent.click(
        screen.getByRole("button", {
            name: "ورود دوباره",
        }),
    );

    expect(
        await screen.findByRole("textbox", {
            name: "شماره موبایل",
        }),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, options] = fetchMock.mock.calls[1];

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
    expect(logoutJson).not.toHaveBeenCalled();
});

it("keeps the restoration error when session reset is not confirmed", async () => {
    const fetchMock = vi
        .fn()
        // Initial restoration fails ambiguously.
        .mockResolvedValueOnce({
            ok: false,
            status: 503,
        })
        // Explicit recovery logout also fails.
        .mockResolvedValueOnce({
            ok: false,
            status: 500,
        });

    vi.stubGlobal("fetch", fetchMock);

    render(
        <AuthProvider>
            <LoginPage />
        </AuthProvider>,
    );

    expect(
        await screen.findByText("بررسی وضعیت ورود انجام نشد."),
    ).toBeInTheDocument();

    fireEvent.click(
        screen.getByRole("button", {
            name: "ورود دوباره",
        }),
    );

    expect(
        await screen.findByText(
            "شروع دوباره ورود تأیید نشد. لطفاً دوباره تلاش کنید.",
        ),
    ).toBeInTheDocument();

    expect(
        screen.queryByRole("textbox", {
            name: "شماره موبایل",
        }),
    ).not.toBeInTheDocument();

    expect(
        localStorage.getItem("club-auth-refresh-blocked"),
    ).toBe("1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("shows the authenticator-code step when ADMIN login requires MFA", async () => {
    const onAuthenticated = vi.fn();

    const phone = "09123456789";
    const code = "123456";
    const verificationToken = "b".repeat(64);
    const mfaChallengeToken = "c".repeat(64);

    const fetchMock = vi
        .fn()
        // Request 1: ask for the SMS OTP.
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Code sent",
            }),
        })
        // Request 2: verify the SMS OTP.
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "OTP verified",
                nextStep: "LOGIN",
                authenticated: false,
                verificationToken,
                verificationExpiresAt: new Date(
                    Date.now() + 5 * 60 * 1000,
                ).toISOString(),
            }),
        })
        // Request 3: ADMIN first factor requires MFA.
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "MFA required",
                authenticated: false,
                mfaRequired: true,
                mfaChallengeToken,
                mfaExpiresAt: new Date(
                    Date.now() + 5 * 60 * 1000,
                ).toISOString(),
            }),
        });

    vi.stubGlobal("fetch", fetchMock);

    await renderLoginPage({
        onAuthenticated,
    });

    fireEvent.change(
        screen.getByRole("textbox", {
            name: "شماره موبایل",
        }),
        {
            target: {
                value: phone,
            },
        },
    );

    fireEvent.click(
        screen.getByRole("button", {
            name: "دریافت کد تأیید",
        }),
    );

    const codeInput =
        await screen.findByRole(
            "textbox",
            {
                name: "کد تأیید",
            },
        );

    fireEvent.change(
        codeInput,
        {
            target: {
                value: code,
            },
        },
    );

    fireEvent.click(
        screen.getByRole("button", {
            name: "تأیید کد",
        }),
    );

    expect(
        await screen.findByRole(
            "textbox",
            {
                name: "کد احراز هویت",
            },
        ),
    ).toBeInTheDocument();

    expect(
        screen.queryByRole(
            "heading",
            {
                name: "خوش آمدید",
            },
        ),
    ).not.toBeInTheDocument();

    expect(
        onAuthenticated,
    ).not.toHaveBeenCalled();

    expect(
        fetchMock,
    ).toHaveBeenCalledTimes(3);
});

it("completes ADMIN login with the authenticator code", async () => {
    const onAuthenticated = vi.fn();

    const phone = "09123456789";
    const smsCode = "123456";
    const mfaCode = "654321";
    const verificationToken = "b".repeat(64);
    const mfaChallengeToken = "c".repeat(64);

    const user = {
        id: 1,
        phone,
        firstName: "مدیر",
        lastName: "سیستم",
        role: "ADMIN",
        createdAt: "2026-09-10T08:00:00.000Z",
    };

    const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Code sent",
            }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "OTP verified",
                nextStep: "LOGIN",
                authenticated: false,
                verificationToken,
                verificationExpiresAt: new Date(
                    Date.now() + 5 * 60 * 1000,
                ).toISOString(),
            }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "MFA required",
                authenticated: false,
                mfaRequired: true,
                mfaChallengeToken,
                mfaExpiresAt: new Date(
                    Date.now() + 5 * 60 * 1000,
                ).toISOString(),
            }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Logged in",
                authenticated: true,
                user,
                tokenType: "Bearer",
                accessToken: "admin.access.token",
                expiresIn: 900,
                accessExpiresAt: new Date(
                    Date.now() + 15 * 60 * 1000,
                ).toISOString(),
            }),
        });

    vi.stubGlobal("fetch", fetchMock);

    await renderLoginPage({
        onAuthenticated,
    });

    fireEvent.change(
        screen.getByRole("textbox", {
            name: "شماره موبایل",
        }),
        {
            target: {
                value: phone,
            },
        },
    );

    fireEvent.click(
        screen.getByRole("button", {
            name: "دریافت کد تأیید",
        }),
    );

    const smsInput =
        await screen.findByRole("textbox", {
            name: "کد تأیید",
        });

    fireEvent.change(
        smsInput,
        {
            target: {
                value: smsCode,
            },
        },
    );

    fireEvent.click(
        screen.getByRole("button", {
            name: "تأیید کد",
        }),
    );

    const mfaInput =
        await screen.findByRole("textbox", {
            name: "کد احراز هویت",
        });

    fireEvent.change(
        mfaInput,
        {
            target: {
                value: mfaCode,
            },
        },
    );

    fireEvent.click(
        screen.getByRole("button", {
            name: "تأیید احراز هویت",
        }),
    );

    expect(
        await screen.findByRole("heading", {
            name: "خوش آمدید",
        }),
    ).toBeInTheDocument();

    expect(
        screen.getByText("مدیر سیستم"),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(4);

    const [url, options] =
        fetchMock.mock.calls[3];

    expect(url).toMatch(
        /\/auth\/login\/mfa$/,
    );

    expect(options).toEqual(
        expect.objectContaining({
            method: "POST",
            credentials: "include",
            headers:
                expect.objectContaining({
                    "Content-Type":
                        "application/json",
                    "X-CSRF-Protection":
                        "1",
                }),
        }),
    );

    expect(
        JSON.parse(options.body),
    ).toEqual({
        mfaChallengeToken,
        code: mfaCode,
    });

    expect(
        onAuthenticated,
    ).toHaveBeenCalledTimes(1);
});

it("keeps the ADMIN on the MFA step when the authenticator code is not 6 digits", async () => {
    const phone = "09123456789";
    const smsCode = "123456";
    const verificationToken = "b".repeat(64);
    const mfaChallengeToken = "c".repeat(64);

    const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Code sent",
            }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "OTP verified",
                nextStep: "LOGIN",
                authenticated: false,
                verificationToken,
                verificationExpiresAt: new Date(
                    Date.now() + 5 * 60 * 1000,
                ).toISOString(),
            }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "MFA required",
                authenticated: false,
                mfaRequired: true,
                mfaChallengeToken,
                mfaExpiresAt: new Date(
                    Date.now() + 5 * 60 * 1000,
                ).toISOString(),
            }),
        });

    vi.stubGlobal("fetch", fetchMock);

    await renderLoginPage();

    fireEvent.change(
        screen.getByRole("textbox", {
            name: "شماره موبایل",
        }),
        {
            target: {
                value: phone,
            },
        },
    );

    fireEvent.click(
        screen.getByRole("button", {
            name: "دریافت کد تأیید",
        }),
    );

    const smsInput =
        await screen.findByRole("textbox", {
            name: "کد تأیید",
        });

    fireEvent.change(smsInput, {
        target: {
            value: smsCode,
        },
    });

    fireEvent.click(
        screen.getByRole("button", {
            name: "تأیید کد",
        }),
    );

    const mfaInput =
        await screen.findByRole("textbox", {
            name: "کد احراز هویت",
        });

    fireEvent.change(mfaInput, {
        target: {
            value: "123",
        },
    });

    fireEvent.click(
        screen.getByRole("button", {
            name: "تأیید احراز هویت",
        }),
    );

    expect(
        await screen.findByRole("alert"),
    ).toHaveTextContent(
        "کد احراز هویت باید دقیقاً ۶ رقم باشد.",
    );

    expect(
        screen.getByRole("textbox", {
            name: "کد احراز هویت",
        }),
    ).toBeInTheDocument();

    expect(
        screen.queryByRole("heading", {
            name: "خوش آمدید",
        }),
    ).not.toBeInTheDocument();

    // No /auth/login/mfa request should have been sent.
    expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("keeps the MFA challenge when the backend rejects the authenticator code", async () => {
    const phone = "09123456789";
    const smsCode = "123456";
    const verificationToken = "b".repeat(64);
    const mfaChallengeToken = "c".repeat(64);

    const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "Code sent",
            }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "OTP verified",
                nextStep: "LOGIN",
                authenticated: false,
                verificationToken,
                verificationExpiresAt: new Date(
                    Date.now() + 5 * 60 * 1000,
                ).toISOString(),
            }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                message: "MFA required",
                authenticated: false,
                mfaRequired: true,
                mfaChallengeToken,
                mfaExpiresAt: new Date(
                    Date.now() + 5 * 60 * 1000,
                ).toISOString(),
            }),
        })
        .mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: async () => ({
                message: "Unauthorized",
            }),
        });

    vi.stubGlobal("fetch", fetchMock);

    await renderLoginPage();

    fireEvent.change(
        screen.getByRole("textbox", {
            name: "شماره موبایل",
        }),
        {
            target: {
                value: phone,
            },
        },
    );

    fireEvent.click(
        screen.getByRole("button", {
            name: "دریافت کد تأیید",
        }),
    );

    const smsInput =
        await screen.findByRole("textbox", {
            name: "کد تأیید",
        });

    fireEvent.change(smsInput, {
        target: {
            value: smsCode,
        },
    });

    fireEvent.click(
        screen.getByRole("button", {
            name: "تأیید کد",
        }),
    );

    const mfaInput =
        await screen.findByRole("textbox", {
            name: "کد احراز هویت",
        });

    fireEvent.change(mfaInput, {
        target: {
            value: "654321",
        },
    });

    fireEvent.click(
        screen.getByRole("button", {
            name: "تأیید احراز هویت",
        }),
    );

    expect(
        await screen.findByRole("alert"),
    ).toHaveTextContent(
        "کد احراز هویت نامعتبر است یا منقضی شده است.",
    );

    expect(
        screen.getByRole("textbox", {
            name: "کد احراز هویت",
        }),
    ).toBeInTheDocument();

    expect(
        screen.queryByRole("heading", {
            name: "خوش آمدید",
        }),
    ).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(4);

    expect(
        JSON.parse(
            fetchMock.mock.calls[3][1].body,
        ),
    ).toEqual({
        mfaChallengeToken,
        code: "654321",
    });
});