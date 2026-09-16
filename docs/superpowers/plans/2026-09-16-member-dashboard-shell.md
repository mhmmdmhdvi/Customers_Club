# Member Dashboard Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fast authenticated `/dashboard` that reuses the existing session and header and shows only the five approved membership fields.

**Architecture:** Keep the current lightweight pathname routing and shared `AuthProvider`. Reuse the authenticated user object instead of adding a dashboard API. Extract one shared authenticated-session validator so login, registration, and refresh enforce the same user shape. The dashboard reads session state directly, while the existing header becomes auth-aware and performs confirmed-204 logout.

**Tech Stack:** React 19, JavaScript/JSX, Vite, Tailwind CSS, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-16-member-dashboard-shell-design.md`

## Global Constraints

- No new frontend dependency.
- No React Router.
- No backend endpoint.
- No database migration.
- No fake points, tiers, rewards, purchase data, or placeholder metrics.
- Dashboard fields are only: first name, last name, phone, membership status, join date.
- Membership status is presentation-only `فعال`.
- `User.createdAt` is the join date.
- Access tokens remain memory-only.
- Do not put credentials or member/session data into localStorage, sessionStorage, URLs, or logs.
- Do not weaken refresh replay protection or automatically retry ambiguous refreshes.
- Use TDD for every production behavior change.

---

## File Structure

### New files

- `frontend/src/auth/sessionResponse.js`
  - validates authenticated login/register/refresh responses and returns the frontend session shape.

- `frontend/src/auth/sessionResponse.test.js`
  - unit tests for valid and malformed authenticated responses.

- `frontend/src/utils/formatPersianDate.js`
  - formats `User.createdAt` using the Persian calendar.

- `frontend/src/utils/formatPersianDate.test.js`
  - deterministic formatter tests.

- `frontend/src/pages/DashboardPage.jsx`
  - protected dashboard presentation and membership table.

- `frontend/src/pages/DashboardPage.test.jsx`
  - dashboard restoration/protection/data rendering tests.

### Modified files

- `frontend/src/auth/refreshSession.js`
  - uses the shared session-response validator.

- `frontend/src/auth/refreshSession.test.js`
  - refresh fixtures include `createdAt`; malformed dashboard fields are covered through the shared validator.

- `frontend/src/auth/AuthContext.test.jsx`
  - restored user fixtures include `createdAt`.

- `frontend/src/pages/LoginPage.jsx`
  - uses shared session validation and calls an optional `onAuthenticated` callback after successful login/registration.

- `frontend/src/pages/LoginPage.test.jsx`
  - successful auth fixtures include `createdAt`; verifies post-auth callback.

- `frontend/src/App.jsx`
  - adds lightweight `/dashboard` routing without a new routing library.

- `frontend/src/App.test.jsx`
  - tests protected dashboard routing.

- `frontend/src/components/layout/SiteHeader.jsx`
  - becomes auth-aware, adds dashboard/logout actions, solid dashboard treatment, and landing-section links that work from `/dashboard`.

- `frontend/src/components/layout/SiteHeader.test.jsx`
  - tests public/authenticated desktop and mobile states plus logout behavior.

---

### Task 1: Shared Authenticated Session Validation

**Files:**
- Create: `frontend/src/auth/sessionResponse.js`
- Create: `frontend/src/auth/sessionResponse.test.js`
- Modify: `frontend/src/auth/refreshSession.js`
- Modify: `frontend/src/auth/refreshSession.test.js`
- Modify: `frontend/src/auth/AuthContext.test.jsx`
- Modify: `frontend/src/pages/LoginPage.jsx`
- Modify: `frontend/src/pages/LoginPage.test.jsx`

**Interfaces:**
- Produces:
  - `parseAuthenticatedSession(data, now = Date.now())`
  - returns:
    ```js
    {
      user,
      accessToken,
      tokenType,
      accessExpiresAt,
    }
    ```
  - throws `Error("Invalid authenticated session")` for malformed data.

- Consumes backend user fields:
  - `id`
  - `phone`
  - `firstName`
  - `lastName`
  - `role`
  - `createdAt`

- [ ] **Step 1: Write the failing session validator tests**

Create `frontend/src/auth/sessionResponse.test.js`:

```js
import { describe, expect, it } from "vitest";
import { parseAuthenticatedSession } from "./sessionResponse";

const NOW = Date.parse("2026-09-16T10:00:00.000Z");

function validResponse() {
    return {
        authenticated: true,
        user: {
            id: 7,
            phone: "09123456789",
            firstName: "سارا",
            lastName: "احمدی",
            role: "MEMBER",
            createdAt: "2026-09-10T08:00:00.000Z",
        },
        tokenType: "Bearer",
        accessToken: "test.access.token",
        accessExpiresAt: "2026-09-16T10:15:00.000Z",
    };
}

describe("parseAuthenticatedSession", () => {
    it("accepts the complete member session required by the dashboard", () => {
        expect(parseAuthenticatedSession(validResponse(), NOW)).toEqual({
            user: validResponse().user,
            accessToken: "test.access.token",
            tokenType: "Bearer",
            accessExpiresAt: "2026-09-16T10:15:00.000Z",
        });
    });

    for (const field of ["phone", "role", "createdAt"]) {
        it(`rejects a session missing user.${field}`, () => {
            const response = validResponse();
            delete response.user[field];

            expect(() =>
                parseAuthenticatedSession(response, NOW),
            ).toThrow("Invalid authenticated session");
        });
    }

    it("rejects an invalid Iranian phone", () => {
        const response = validResponse();
        response.user.phone = "08123456789";

        expect(() =>
            parseAuthenticatedSession(response, NOW),
        ).toThrow("Invalid authenticated session");
    });

    it("rejects an unsupported role", () => {
        const response = validResponse();
        response.user.role = "UNKNOWN";

        expect(() =>
            parseAuthenticatedSession(response, NOW),
        ).toThrow("Invalid authenticated session");
    });

    it("rejects an invalid join date", () => {
        const response = validResponse();
        response.user.createdAt = "not-a-date";

        expect(() =>
            parseAuthenticatedSession(response, NOW),
        ).toThrow("Invalid authenticated session");
    });

    it("rejects an expired access token", () => {
        const response = validResponse();
        response.accessExpiresAt = "2026-09-16T09:59:59.000Z";

        expect(() =>
            parseAuthenticatedSession(response, NOW),
        ).toThrow("Invalid authenticated session");
    });
});
```

- [ ] **Step 2: Run the new test and verify RED**

From `frontend`:

```powershell
npm test -- src/auth/sessionResponse.test.js
```

Expected: FAIL because `sessionResponse.js` does not exist yet.

- [ ] **Step 3: Implement the minimal shared validator**

Create `frontend/src/auth/sessionResponse.js`:

```js
export function parseAuthenticatedSession(
    data,
    now = Date.now(),
) {
    const accessExpiresAt = Date.parse(data?.accessExpiresAt);
    const createdAt = Date.parse(data?.user?.createdAt);

    const isValid =
        data?.authenticated === true &&
        data?.tokenType === "Bearer" &&
        typeof data?.accessToken === "string" &&
        data.accessToken.length > 0 &&
        Number.isSafeInteger(data?.user?.id) &&
        data.user.id > 0 &&
        typeof data.user.phone === "string" &&
        /^09\d{9}$/.test(data.user.phone) &&
        typeof data.user.firstName === "string" &&
        typeof data.user.lastName === "string" &&
        ["MEMBER", "ADMIN"].includes(data.user.role) &&
        Number.isFinite(createdAt) &&
        Number.isFinite(accessExpiresAt) &&
        accessExpiresAt > now;

    if (!isValid) {
        throw new Error("Invalid authenticated session");
    }

    return {
        user: data.user,
        accessToken: data.accessToken,
        tokenType: data.tokenType,
        accessExpiresAt: data.accessExpiresAt,
    };
}
```

- [ ] **Step 4: Verify GREEN**

```powershell
npm test -- src/auth/sessionResponse.test.js
```

Expected: all validator tests PASS.

- [ ] **Step 5: Replace duplicate validation in refresh**

In `refreshSession.js` import:

```js
import { parseAuthenticatedSession } from "./sessionResponse";
```

After reading JSON:

```js
const data = await response.json();
const session = parseAuthenticatedSession(data);

return {
    kind: "authenticated",
    session,
};
```

Remove the old duplicated field checks.

- [ ] **Step 6: Replace duplicate login/register validation**

In `LoginPage.jsx` import:

```js
import { parseAuthenticatedSession } from "../auth/sessionResponse";
```

For registration success:

```js
const nextSession = parseAuthenticatedSession(data);
establishSession(nextSession);
```

For `loginWithProof`:

```js
const data = await response.json();
return parseAuthenticatedSession(data);
```

Keep the existing HTTP/error behavior unchanged.

- [ ] **Step 7: Update existing authenticated test fixtures**

Every successful user response in:

```text
src/auth/refreshSession.test.js
src/auth/AuthContext.test.jsx
src/pages/LoginPage.test.jsx
```

must include a valid value such as:

```js
createdAt: "2026-09-10T08:00:00.000Z",
```

Do not change unauthenticated/error fixtures unnecessarily.

- [ ] **Step 8: Run auth regression tests**

```powershell
npm test -- `
  src/auth/sessionResponse.test.js `
  src/auth/refreshSession.test.js `
  src/auth/AuthContext.test.jsx `
  src/pages/LoginPage.test.jsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add frontend/src/auth frontend/src/pages/LoginPage.jsx frontend/src/pages/LoginPage.test.jsx
git commit -m "refactor: share authenticated session validation"
```

---

### Task 2: Persian Join Date and Membership Dashboard

**Files:**
- Create: `frontend/src/utils/formatPersianDate.js`
- Create: `frontend/src/utils/formatPersianDate.test.js`
- Create: `frontend/src/pages/DashboardPage.jsx`
- Create: `frontend/src/pages/DashboardPage.test.jsx`

**Interfaces:**
- Produces:
  - `formatPersianJoinDate(value)`
  - `DashboardPage({ onRequireLogin })`

- `onRequireLogin()` is invoked only after auth restoration resolves to unauthenticated/error.

- [ ] **Step 1: Write the formatter test**

```js
import { expect, it } from "vitest";
import { formatPersianJoinDate } from "./formatPersianDate";

it("formats a membership date with the Persian calendar", () => {
    expect(
        formatPersianJoinDate("2026-09-16T08:00:00.000Z"),
    ).toBe("۲۵ شهریور ۱۴۰۵");
});
```

- [ ] **Step 2: Verify formatter RED**

```powershell
npm test -- src/utils/formatPersianDate.test.js
```

Expected: FAIL because the formatter does not exist.

- [ ] **Step 3: Implement the formatter**

```js
const formatter = new Intl.DateTimeFormat(
    "fa-IR-u-ca-persian",
    {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Asia/Tehran",
    },
);

export function formatPersianJoinDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new TypeError("Invalid membership date");
    }

    return formatter.format(date);
}
```

- [ ] **Step 4: Verify formatter GREEN**

```powershell
npm test -- src/utils/formatPersianDate.test.js
```

Expected: PASS.

- [ ] **Step 5: Write dashboard RED tests**

`DashboardPage.test.jsx` must cover:

```js
const memberSession = {
    user: {
        id: 7,
        phone: "09123456789",
        firstName: "سارا",
        lastName: "احمدی",
        role: "MEMBER",
        createdAt: "2026-09-16T08:00:00.000Z",
    },
    accessToken: "test.access.token",
    tokenType: "Bearer",
    accessExpiresAt: "2026-09-16T10:15:00.000Z",
};
```

Authenticated test assertions:

```js
expect(
    screen.getByRole("heading", {
        name: "اطلاعات عضویت",
    }),
).toBeInTheDocument();

expect(screen.getByText("سارا")).toBeInTheDocument();
expect(screen.getByText("احمدی")).toBeInTheDocument();
expect(screen.getByText("09123456789")).toBeInTheDocument();
expect(screen.getByText("فعال")).toBeInTheDocument();
expect(screen.getByText("۲۵ شهریور ۱۴۰۵")).toBeInTheDocument();

expect(
    screen.queryByText("2026-09-16T08:00:00.000Z"),
).not.toBeInTheDocument();
```

Restoring-state test:

```js
expect(
    screen.queryByText("09123456789"),
).not.toBeInTheDocument();
```

Unauthenticated test:

```js
expect(onRequireLogin).toHaveBeenCalledTimes(1);
expect(
    screen.queryByText("09123456789"),
).not.toBeInTheDocument();
```

- [ ] **Step 6: Verify dashboard RED**

```powershell
npm test -- src/pages/DashboardPage.test.jsx
```

Expected: FAIL because `DashboardPage.jsx` does not exist.

- [ ] **Step 7: Implement DashboardPage**

Use `useAuth()`, `useEffect`, `SiteHeader`, and `formatPersianJoinDate`.

Behavior:

```js
if (authStatus === "restoring") {
    return (
        <main
            dir="rtl"
            className="min-h-screen bg-surface px-4 pt-28"
        >
            <p role="status">در حال بررسی وضعیت ورود...</p>
        </main>
    );
}

if (
    authStatus !== "authenticated" ||
    !session
) {
    return null;
}
```

Redirect callback:

```js
useEffect(() => {
    if (
        authStatus === "unauthenticated" ||
        authStatus === "error"
    ) {
        onRequireLogin();
    }
}, [authStatus, onRequireLogin]);
```

Authenticated structure:

```jsx
<div dir="rtl" className="min-h-screen bg-surface">
    <SiteHeader solid />

    <main className="page-container pt-28 pb-16">
        <h1 className="text-2xl font-extrabold text-foreground">
            اطلاعات عضویت
        </h1>

        <div className="mt-8 overflow-hidden border border-border bg-background">
            <table className="w-full border-collapse text-sm">
                <tbody>
                    {/* five approved rows only */}
                </tbody>
            </table>
        </div>
    </main>
</div>
```

Use `<th scope="row">` for labels.

Render phone as:

```jsx
<span dir="ltr" className="inline-block">
    {session.user.phone}
</span>
```

Rows are exactly:

```text
نام
نام خانوادگی
شماره موبایل
وضعیت عضویت
تاریخ عضویت
```

- [ ] **Step 8: Verify dashboard GREEN**

```powershell
npm test -- `
  src/utils/formatPersianDate.test.js `
  src/pages/DashboardPage.test.jsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add frontend/src/utils frontend/src/pages/DashboardPage.jsx frontend/src/pages/DashboardPage.test.jsx
git commit -m "feat: add member information dashboard"
```

---

### Task 3: Protected Dashboard Routing and Post-Auth Navigation

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/App.test.jsx`
- Modify: `frontend/src/pages/LoginPage.jsx`
- Modify: `frontend/src/pages/LoginPage.test.jsx`

**Interfaces:**
- `LoginPage` gains optional:
  - `onAuthenticated = () => {}`
- `DashboardPage` consumes:
  - `onRequireLogin`

- [ ] **Step 1: Write routing RED tests**

In `App.test.jsx`, reset pathname after each test:

```js
window.history.replaceState({}, "", "/");
```

Add a protected-route test that:

1. changes pathname to `/dashboard`;
2. provides auth context with `authStatus: "unauthenticated"` and `session: null`;
3. renders `App`;
4. waits for `window.location.pathname` to become `/login`;
5. verifies the login phone field renders.

Add authenticated route coverage verifying `/dashboard` renders `اطلاعات عضویت`.

- [ ] **Step 2: Add post-auth callback RED coverage**

Change the helper to:

```js
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
```

In the existing successful registration test:

```js
const onAuthenticated = vi.fn();
await renderLoginPage({ onAuthenticated });
```

After successful registration assert:

```js
expect(onAuthenticated).toHaveBeenCalledTimes(1);
```

Do the same in the existing-member successful login test.

- [ ] **Step 3: Verify RED**

```powershell
npm test -- `
  src/App.test.jsx `
  src/pages/LoginPage.test.jsx
```

Expected: new navigation assertions FAIL.

- [ ] **Step 4: Implement lightweight path state in App**

Import:

```js
import { useEffect, useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
```

Initialize:

```js
const [pathname, setPathname] = useState(
    window.location.pathname,
);
```

Listen for browser navigation:

```js
useEffect(() => {
    function handlePopState() {
        setPathname(window.location.pathname);
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
        window.removeEventListener(
            "popstate",
            handlePopState,
        );
    };
}, []);
```

Use one replace-navigation helper:

```js
function replacePath(nextPath) {
    window.history.replaceState({}, "", nextPath);
    setPathname(nextPath);
}
```

Normalize trailing slash:

```js
const currentPath =
    pathname.length > 1 && pathname.endsWith("/")
        ? pathname.slice(0, -1)
        : pathname;
```

Routes:

```jsx
if (currentPath === "/login") {
    return (
        <LoginPage
            onAuthenticated={() =>
                replacePath("/dashboard")
            }
        />
    );
}

if (currentPath === "/dashboard") {
    return (
        <DashboardPage
            onRequireLogin={() =>
                replacePath("/login")
            }
        />
    );
}
```

Landing page remains the default route.

This avoids a full reload immediately after authentication, preserving the in-memory access token instead of forcing an unnecessary refresh-token rotation.

- [ ] **Step 5: Invoke the post-auth callback**

Change signature:

```js
export function LoginPage({
    onAuthenticated = () => {},
}) {
```

After successful existing-member login:

```js
establishSession(nextSession);
onAuthenticated();
```

After successful registration:

```js
establishSession(nextSession);
onAuthenticated();
```

Do not invoke it before `establishSession`.

- [ ] **Step 6: Verify GREEN**

```powershell
npm test -- `
  src/App.test.jsx `
  src/pages/LoginPage.test.jsx `
  src/pages/DashboardPage.test.jsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/App.jsx frontend/src/App.test.jsx frontend/src/pages/LoginPage.jsx frontend/src/pages/LoginPage.test.jsx
git commit -m "feat: protect and route member dashboard"
```

---

### Task 4: Auth-Aware Header and Confirmed Logout

**Files:**
- Modify: `frontend/src/components/layout/SiteHeader.jsx`
- Modify: `frontend/src/components/layout/SiteHeader.test.jsx`

**Interfaces:**
- `SiteHeader({ solid = false })`
- Reads optional auth context using `useAuth()`.
- Clears shared session only after `/auth/logout` returns HTTP `204`.

- [ ] **Step 1: Write authenticated header RED tests**

Provide auth context directly with:

```jsx
<AuthContext.Provider
    value={{
        session: memberSession,
        authStatus: "authenticated",
        clearSession,
        establishSession: vi.fn(),
    }}
>
    <SiteHeader />
</AuthContext.Provider>
```

Assert desktop navigation contains:

```text
داشبورد
خروج
```

and does not contain:

```text
ورود
```

Open the mobile menu and assert the same authenticated actions exist there.

Keep existing unauthenticated tests verifying `ورود`.

Update public section link expectations to:

```text
/#events
/#about
/#contact
```

and logo/home link to:

```text
/#hero
```

- [ ] **Step 2: Write logout RED tests**

Successful logout mock:

```js
vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
        status: 204,
    }),
);
```

Click `خروج`, then assert:

```js
expect(clearSession).toHaveBeenCalledTimes(1);
```

and request options include:

```js
{
    method: "POST",
    credentials: "include",
    headers: {
        "Content-Type": "application/json",
        "X-CSRF-Protection": "1",
    },
    body: JSON.stringify({}),
}
```

Failed logout:

```js
vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
        status: 503,
    }),
);
```

Assert:

```js
expect(clearSession).not.toHaveBeenCalled();
```

No `.json()` call is made for successful `204`.

- [ ] **Step 3: Verify RED**

```powershell
npm test -- src/components/layout/SiteHeader.test.jsx
```

Expected: authenticated/logout tests FAIL.

- [ ] **Step 4: Implement auth-aware header**

Import:

```js
import { useAuth } from "../../auth/AuthContext";
```

API base:

```js
const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ??
    "http://localhost:3000";
```

Component signature:

```js
export function SiteHeader({ solid = false }) {
```

Safely read context:

```js
const auth = useAuth();

const isAuthenticated =
    auth?.authStatus === "authenticated" &&
    Boolean(auth.session);
```

Logout state:

```js
const [isLoggingOut, setIsLoggingOut] =
    useState(false);
const [logoutError, setLogoutError] =
    useState("");
```

Logout handler:

```js
async function handleLogout() {
    if (!isAuthenticated || isLoggingOut) {
        return;
    }

    setLogoutError("");
    setIsLoggingOut(true);

    try {
        const response = await fetch(
            `${API_BASE_URL}/auth/logout`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type":
                        "application/json",
                    "X-CSRF-Protection": "1",
                },
                body: JSON.stringify({}),
            },
        );

        if (response.status !== 204) {
            throw new Error(
                "Logout was not confirmed",
            );
        }

        auth.clearSession();
        closeMenu();
    } catch {
        setLogoutError("خروج انجام نشد.");
    } finally {
        setIsLoggingOut(false);
    }
}
```

Authenticated desktop actions:

```jsx
<a href="/dashboard">داشبورد</a>

<button
    type="button"
    onClick={handleLogout}
    disabled={isLoggingOut}
>
    {isLoggingOut ? "در حال خروج..." : "خروج"}
</button>
```

Authenticated mobile menu gets the same actions.

Unauthenticated state keeps `/login`.

Change landing links to root-qualified fragment links:

```js
const navigation = [
    { label: "رویدادها", href: "/#events" },
    { label: "درباره ما", href: "/#about" },
    { label: "تماس با ما", href: "/#contact" },
];
```

Logo:

```jsx
href="/#hero"
```

For dashboard solid treatment, include `solid` in the existing background condition so the fixed header is readable even when `window.scrollY === 0`.

- [ ] **Step 5: Verify GREEN**

```powershell
npm test -- src/components/layout/SiteHeader.test.jsx
```

Expected: PASS.

- [ ] **Step 6: Run dashboard/header integration tests**

```powershell
npm test -- `
  src/App.test.jsx `
  src/components/layout/SiteHeader.test.jsx `
  src/pages/DashboardPage.test.jsx `
  src/pages/LoginPage.test.jsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/components/layout/SiteHeader.jsx frontend/src/components/layout/SiteHeader.test.jsx
git commit -m "feat: add authenticated site navigation"
```

---

### Task 5: Full Frontend Verification

**Files:**
- No new production behavior.
- Review all changes against the spec.

- [ ] **Step 1: Run the full frontend test suite**

From `frontend`:

```powershell
npm test
```

Required: `fail 0`.

- [ ] **Step 2: Run lint**

```powershell
npm run lint
```

Required: zero errors and zero warnings.

- [ ] **Step 3: Run production build**

```powershell
npm run build
```

Required: successful Vite production build.

- [ ] **Step 4: Check whitespace**

From repository root or either package directory:

```powershell
git diff --check
```

Required: no output.

- [ ] **Step 5: Review changed files**

```powershell
git status --short --branch
git diff main...HEAD --stat
```

Verify there is:

- no `.env`
- no database migration
- no backend change
- no new dependency
- no fake club data

- [ ] **Step 6: Browser verification**

With backend and frontend running:

1. Public landing header shows `ورود` when signed out.
2. Successful login/registration transitions to `/dashboard` without a full reload.
3. Dashboard shows exactly:
   - نام
   - نام خانوادگی
   - شماره موبایل
   - وضعیت عضویت
   - تاریخ عضویت
4. Join date is Persian-formatted.
5. Desktop header shows `داشبورد` and `خروج`.
6. Mobile hamburger menu shows `داشبورد` and `خروج`.
7. Logout returns to the unauthenticated login state only after backend `204`.
8. Refreshing `/dashboard` restores the session and renders the same member fields.
9. Opening `/dashboard` signed out navigates to `/login`.

- [ ] **Step 7: Final checkpoint commit only if needed**

If verification causes no additional edits, do not create an empty commit.

If small test/style corrections are required:

```powershell
git add frontend
git commit -m "test: verify member dashboard shell"
```