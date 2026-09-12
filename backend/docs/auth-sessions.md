# Member login sessions

## Scope and current migration boundary

This feature extends verified-phone registration with authenticated sessions.
No changes to frontend, SMS delivery, OTP request limits or production deployment.
Session safety does not make the full system production-ready. In particular OTP
attempt/resend limits and OTP storage hardening remain release prerequisites.

The additive migration `20260912120000_add_auth_sessions` creates AuthSession and
RefreshToken, foreign keys and indexes. The User relation is Prisma metadata only.
At the recorded local checkpoint on 2026-09-12, BOTH customer_club_db and
customer_club_test_db had all four migrations applied. The verification/session
migrations had accidentally targeted the normal local development database;
this was not undone. The test database's missing session migration was then
applied deliberately using the explicit test configuration. No production-server
migration was performed. See the [incident and verification record](registration-db-checks.md)
for the inspection limits, completed checks and corrected future procedure.
Do not repeat migrations or reset either database for this documentation/test update.

The recorded local setup already installed pinned `jsonwebtoken@9.0.3` using npm
and updated package-lock.json. No reinstall is required for this follow-up.
Do not hand-edit lock entries. Keep Prisma 7.10 and the scoped overrides.

## Contract

`POST /auth/verify-code` is unchanged: consume OTP and obtain a five-minute,
single-use proof with `nextStep: REGISTER` or `LOGIN`. This alone is NOT a session.

All four session-changing endpoints require:
- `Content-Type: application/json`
- `X-CSRF-Protection: 1`
- An exact allowed `Origin` when the client supplies one.

This custom-header/JSON policy is paired with an exact credentialed CORS allowlist.
No wildcard, reflected unapproved origin, form-body authentication, or permissive
SameSite=None fallback is used. Postman can omit Origin but must send the header.

### Register and log in immediately
`POST /auth/register` body: `{ verificationToken, firstName, lastName }`.
Only these fields are accepted. The proof supplies phone and the server sets MEMBER.
Return 201 after account, proof consumption and session persistence commit together.
Signing/persistence failure rolls everything back. No second OTP is needed.

### Log in an existing member
`POST /auth/login` body: `{ verificationToken }`, where proof purpose is LOGIN.
Return 200; REGISTER, used, invalid or expired proofs do not authenticate.

Both successful endpoints and refresh return:
```
{
  message, authenticated: true, user, tokenType: "Bearer",
  accessToken, expiresIn, accessExpiresAt
}
```
`expiresIn` is seconds; accessExpiresAt is ISO time. No refresh token appears in JSON.
Never write tokens to logs, browser localStorage/sessionStorage, URLs or query strings.
Keep the access token in browser memory. Refresh it using the cookie after a reload.

### Current user
`GET /auth/me` with `Authorization: Bearer <accessToken>` returns `{ user }`.
JWT signature, HS256 algorithm, issuer, audience, purpose, time and identity claims
are validated. Each request also reads the live session/user from PostgreSQL.
Revoked/expired sessions and removed users fail; role comes from current DB state.
Authorization helpers distinguish 401 unauthenticated from 403 forbidden.

### Refresh
`POST /auth/refresh`, JSON `{}`, using the refresh cookie. No body-token fallback.
Each refresh consumes its token, increments the session version, and returns a new
refresh cookie. Only SHA-256 hashes of high-entropy 32-byte refresh tokens are stored.
Session expiry is absolute seven days and never extended by refresh.

**Strict replay policy:** reusing an old refresh token revokes the entire session,
including the replacement access/refresh credentials. The revocation is committed
before returning 401. Two simultaneous refreshes are treated as reuse; frontends
must serialize refresh (including coordination across tabs). Do not automatically
retry a timed-out refresh with the old token. A lost response may require fresh OTP
login. This is a deliberate security/availability trade-off, not a retry API.

### Logout
`POST /auth/logout`, JSON `{}`, using the refresh cookie, returns 204 and clears it.
Revocation makes subsequent /me and refresh requests fail. Repeated logout is safe.
An already-rotated credential can revoke its associated session. Database failures
return 500 rather than claiming that a session was revoked.

## Cookies and deployment assumptions

Cookies are HttpOnly, SameSite=Strict, Path=/, no Domain attribute. Production uses
Secure and `__Host-club_refresh`. Explicit development/test use `club_refresh` so
localhost HTTP can be tested. Do not run NODE_ENV=development on a public server.
Browser deployment must be same-site (reverse proxy or same-site frontend/API).
Cross-site frontend domains will not receive Strict cookies; do not remove security
flags to make a misconfigured deployment work. Restrict other applications on the
same host; host-only cookies do not isolate TCP ports.

## Explicit runtime configuration

These settings must be supplied before session operations succeed:
- NODE_ENV: development, test, or production.
- ACCESS_TOKEN_SECRET: 32 cryptographically random bytes encoded as 64 hex digits.
- JWT_ISSUER: a stable application identifier, 1–128 visible ASCII characters.
- JWT_AUDIENCE: the intended client identifier, 1–128 visible ASCII characters.
- AUTH_ALLOWED_ORIGINS: comma-separated exact origins, no paths, credentials or *.
  Production requires https; only local development/test allows localhost HTTP.

Generate the key locally using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Keep it private and outside Git. Never paste it into chat. No key is included here.
Changing the key invalidates existing access tokens. Runtime secrets need deployment
secret management; rotation planning and rate limits are release work, not defaults.

Configuration is checked before session work, and errors produce a generic 503.
/health and OTP input validation can still run without session configuration.
A missing signing key is never replaced by an insecure default or generated on boot.
The ordinary development server's session configuration has not been confirmed.
The database checkers' ephemeral credentials do not configure that server.

## Verification

Normal `npm test` uses in-memory fixtures for service logic. The HTTP route tests
use the actual Express/session router, controllers, middleware and JWT library with
an injected fake DB, never your normal connection. Keys are generated per test.

`node scripts/session-db-check.js` is a separate, explicit real-PostgreSQL check.
It requires TEST_DATABASE_URL and ALLOW_TEST_DATABASE_WRITES=customer_club_test_db,
and validates the actual database and non-admin test login before seeding fixtures.
It runs 12 checks, including forced overlapping reads in independent transactions.
Cleanup is scoped to newly allocated test phones, with FK-cascaded session/token
cleanup verified. No resets, truncation, automatic migration or .env writes occur.
The registration DB checker also expects automatic login and supplies process-local
ephemeral session credentials. Keep used refresh hashes until the session expires
or is revoked; deleting them early defeats replay detection.

Completed local results, reported in the 2026-09-12 handoff: 244 npm tests passed
with no failures or skips; separately, 12 session DB checks and 10 registration
DB checks passed against customer_club_test_db / customer_club_test_user. Both
checkers reported verified cleanup. These results predate the new offline tests;
they are not fresh execution in this documentation follow-up or production approval.

`backend/tests/migration-target-isolation.test.js` adds 59 offline regression tests
for target validation, identity validation, explicit config selection and both
checkers' environment-loading guards. It reads reviewed source files into isolated
test contexts; it does not run Prisma CLI, load dotenv, connect to PostgreSQL or
run either checker's integration body. See [the test scope](registration-db-checks.md#offline-migration-target-regressions).
No repeat of the completed database checkers is requested for this follow-up.

References used in design (not a claim of full OAuth protocol implementation):
- https://github.com/auth0/node-jsonwebtoken
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2
