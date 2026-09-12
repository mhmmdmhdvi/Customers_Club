# Auth sessions design

Scope approved in the conversation: verified-phone login, automatic login after
registration, refresh, logout, and GET /auth/me. Preserve JavaScript/CommonJS and
route -> controller -> service -> Prisma boundaries. No frontend changes or live
migrations. Base: GitHub main eac804e745206f99066b97e3e489b0d19ce57573.

JWT access tokens use the maintained jsonwebtoken package, HS256 with an explicit
algorithm allowlist, issuer, audience, token-use, session ID and subject validation.
Access lifetime is 15 minutes maximum. The signer key is 32 random bytes supplied
as 64 hex characters in ACCESS_TOKEN_SECRET; never committed or defaulted.
JWT_ISSUER, JWT_AUDIENCE, AUTH_ALLOWED_ORIGINS and NODE_ENV are explicit config.

Refresh tokens are 32 random bytes (hex) stored only as SHA-256 hashes. AuthSession
has an absolute 7-day expiry and revocation/version fields. Refresh rotation uses
conditional updates inside a transaction, retaining used token hashes until the
session is eligible for cleanup. Reuse revokes the entire session and is committed
before the service returns 401. Concurrent refresh is treated as reuse, deliberately
requiring frontend single-flight refresh; do not automatically retry an old token.
All authenticated requests also check the session and current user in PostgreSQL;
logout therefore invalidates subsequent authenticated requests immediately.

Registration claims its REGISTER proof, creates a MEMBER and issues the session
in one transaction. Existing members exchange a LOGIN proof via POST /auth/login.
The existing verification endpoint still issues proof, not an authenticated session.
No second OTP is required after registration. Signing/persistence failure rolls back.

Refresh credentials are cookie-only, HttpOnly, SameSite=Strict, no Domain, Path=/.
Production uses Secure + __Host- prefix; explicit local dev/test uses a separate
unprefixed cookie name for HTTP localhost. API access uses Authorization: Bearer;
no access-cookie or query-token fallback. Access tokens stay in browser memory,
not localStorage/sessionStorage. Browser integration targets a same-site deployment.
Session mutations require JSON, X-CSRF-Protection: 1, and allowed Origin when present.
CORS allows only explicit origins, credentials, and necessary headers/methods.
Configuration errors fail closed (503), not an insecure token fallback.

Two additive tables and one User relation; no existing table is dropped or reset.
Remaining production prerequisites: OTP brute-force/resend limits and storage
hardening, schema rehearsal, protected deployment/backup operations, real SMS.
