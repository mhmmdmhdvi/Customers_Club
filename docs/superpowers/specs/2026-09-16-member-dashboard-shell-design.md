# Member Dashboard Shell Design

**Date:** 2026-09-16
**Branch:** `feat/member-dashboard-shell`

## Purpose

Add the first authenticated member dashboard for the Megatite Customer Club.

The dashboard must be fast, responsive, simple, and information-focused. It must reuse the existing authentication/session architecture and existing site header instead of introducing a second navigation system.

## Scope

The first dashboard contains only member account information:

- نام
- نام خانوادگی
- شماره موبایل
- وضعیت عضویت
- تاریخ عضویت

No points, rewards, purchases, membership tiers, promotional cards, placeholder statistics, or invented customer-club data are included in this milestone.

## Routing

Add `/dashboard` using the project's existing lightweight pathname-based routing.

No routing dependency is added.

Behavior:

- `/` renders the public landing page.
- `/login` renders the login/registration flow.
- `/dashboard` renders the authenticated dashboard.
- An unauthenticated visitor to `/dashboard` is redirected to `/login`.
- Protected member information must never render while authentication restoration is still unresolved.
- An authenticated member who completes login or registration should proceed to `/dashboard`.

## Authentication and data source

The dashboard uses the existing `AuthProvider` session.

No extra `/auth/me` request is made merely to render the dashboard because login and refresh already return a live authenticated user and session restoration already validates the session.

The backend already supplies:

- `id`
- `phone`
- `firstName`
- `lastName`
- `role`
- `createdAt`
- `updatedAt`

The frontend authenticated-response validation must therefore require the dashboard fields it depends on:

- positive safe-integer `user.id`
- string `user.phone` matching the existing Iranian mobile format
- string `user.firstName`
- string `user.lastName`
- `user.role` equal to `MEMBER` or `ADMIN`
- valid `user.createdAt`
- valid future `accessExpiresAt`
- non-empty bearer access token

The same user/session validation rules should be shared between registration, login, and refresh rather than allowing those paths to drift apart.

Access tokens remain memory-only. No user/session credentials are added to localStorage, sessionStorage, URLs, or logs.

## Header

Reuse the existing Megatite `SiteHeader`.

### Unauthenticated state

Keep the current public navigation and `ورود` action.

### Authenticated state

Replace `ورود` with:

- `داشبورد` → `/dashboard`
- `خروج` → performs the existing authenticated logout operation

Logout must:

- call `POST /auth/logout`
- include credentials
- include the existing JSON and CSRF headers
- clear frontend session state only after HTTP `204`
- not parse a body from the `204` response
- preserve the current fail-closed behavior if logout cannot be confirmed

### Desktop

Show `داشبورد` and `خروج` beside the existing navigation.

### Mobile

Keep the existing hamburger navigation.

Authenticated mobile users see `داشبورد` and `خروج` inside that menu. No new bottom navigation is introduced.

The header remains usable on both the landing page and `/dashboard`. Links to landing-page sections must still navigate correctly when clicked from `/dashboard`.

The dashboard version of the fixed header must have a solid/readable background at the top of the page; it must not depend on a hero image being behind it.

## Dashboard presentation

The dashboard is Persian RTL and visually consistent with the existing Megatite site.

It contains a single main section titled:

`اطلاعات عضویت`

The information is presented as a clean two-column table or table-like responsive data list:

| عنوان | اطلاعات |
| --- | --- |
| نام | authenticated user's `firstName` |
| نام خانوادگی | authenticated user's `lastName` |
| شماره موبایل | authenticated user's `phone` |
| وضعیت عضویت | `فعال` |
| تاریخ عضویت | authenticated user's `createdAt` formatted for Persian users |

There is no greeting paragraph, marketing copy, AI-style filler text, placeholder card, or fake metric.

## Membership status

No new membership-status database field is introduced in this milestone.

For this initial dashboard, an authenticated member account is displayed as:

`فعال`

This is presentation behavior only. A real membership lifecycle/status model can replace it later when business rules for suspended, inactive, tiered, or other statuses are defined.

## Join date

`User.createdAt` is the membership start date for this milestone.

The raw ISO/database timestamp must not be displayed directly.

Format it for Persian users using the browser's `Intl.DateTimeFormat` support with the Persian calendar/locale.

The output should resemble:

`۲۵ شهریور ۱۴۰۵`

Formatting must be deterministic enough to test without requiring a new date library.

## Responsive behavior

Desktop:

- retain the existing site header
- center the dashboard content within the existing page width system
- show a conventional two-column information table

Mobile:

- retain the existing hamburger header
- keep each label/value readable without horizontal scrolling
- table rows may become stacked label/value rows if necessary
- phone number should remain visually understandable in RTL layout

No additional navigation framework is introduced.

## Performance

The dashboard should not make an additional API request when valid authenticated session data is already available.

No new frontend dependency is required.

No new backend endpoint is required.

No database migration is required.

## Accessibility

- dashboard content uses semantic headings
- information table uses appropriate table semantics when rendered as a table
- logout is a real button because it performs an action
- navigation actions have clear labels
- mobile menu retains the existing accessible expanded/control behavior
- focus and keyboard behavior must remain usable

## Error and loading behavior

While session restoration is pending, protected member information is not displayed.

If restoration establishes an authenticated session, render `/dashboard`.

If restoration establishes that the user is unauthenticated, navigate to `/login`.

If session restoration fails ambiguously, do not automatically retry refresh credentials. Preserve the existing safe recovery model rather than weakening refresh replay protection.

## Testing

Implementation follows TDD.

Tests must cover at minimum:

1. authenticated session-response validation accepts `phone`, `role`, and `createdAt`
2. malformed/missing dashboard user fields are rejected
3. authenticated desktop header shows `داشبورد` and `خروج`
4. unauthenticated header continues to show `ورود`
5. authenticated mobile menu exposes dashboard/logout actions
6. dashboard does not reveal member information during restoration
7. unauthenticated `/dashboard` access redirects to `/login`
8. authenticated `/dashboard` renders all five requested information fields
9. join date is formatted in Persian rather than exposing an ISO timestamp
10. dashboard logout clears session only after confirmed HTTP `204`
11. refresh/session restoration continues to populate the dashboard fields
12. existing landing and login behaviors remain covered by their regression tests

Final verification includes:

- frontend test suite
- frontend lint
- frontend production build
- `git diff --check`

## Non-goals

This milestone does not add:

- customer points
- rewards
- purchase history
- loyalty tiers
- profile editing
- admin dashboard
- new member-status persistence
- new dashboard API
- database migrations
- React Router or another routing package
- new UI libraries