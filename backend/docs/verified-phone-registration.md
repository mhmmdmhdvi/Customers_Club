# Verified-phone registration (review branch; not production-ready)

> OTP behavior is now extended by [OTP release safeguards](otp-release-safeguards.md).
> Historical migration/test counts below describe the prior session checkpoint.
> The subsequent Windows test-only rehearsal and all 30 DB checks passed (user-reported).
> See the current verification record in OTP release safeguards. Do not repeat migration five.
> The normal development database was not migrated by that rehearsal.
> Runtime SMS is not implemented; test checkers explicitly use fake delivery.

## What changed

- `POST /auth/request-code` keeps the existing API behavior.
- `POST /auth/verify-code` consumes the OTP and stores a phone-verification proof
  **in the same Prisma interactive transaction**. Failed proof creation rolls
  back the consumption. The raw proof is 32 random bytes, returned as 64 lowercase
  hexadecimal characters; only its SHA-256 hash is persisted.
- A proof expires after five minutes. New phones get `nextStep: REGISTER`; existing
  phones get `nextStep: LOGIN`. The purposes are stored server-side, not trusted
  from the client. Neither response means the user is logged in.
- `POST /auth/register` accepts only `verificationToken`, `firstName`, `lastName`.
  It derives the phone from the stored REGISTER proof and always assigns MEMBER.
  The proof claim and User creation are one transaction. Proof replay/expiry
  returns 400; duplicate phone returns 409. A failed insert rolls back the claim.
- Names are Unicode NFC-normalized and trimmed, 1–80 Unicode code points, without
  control characters. Persian letters and ZWNJ remain supported. Names are plain
  data, not trusted HTML; clients must render them as escaped text.
- Verification and registration responses use `Cache-Control: no-store`.

## Examples (placeholders, not real credentials)

POST /auth/verify-code
```json
{ "phone": "+989121234567", "code": "123456" }
```

Successful response (200):
```json
{
  "message": "OTP verified",
  "nextStep": "REGISTER",
  "authenticated": false,
  "verificationToken": "<64-character-token-from-response>",
  "verificationExpiresAt": "<ISO timestamp>"
}
```

POST /auth/register
```json
{
  "verificationToken": "<token-from-verify-code>",
  "firstName": "خسرو",
  "lastName": "وفایی"
}
```

Successful response (201) includes `message: Registration completed`, `user`
(id, phone, firstName, lastName, role, createdAt, updatedAt),
`authenticated: true`, `tokenType: Bearer`, `accessToken`, `expiresIn` and
`accessExpiresAt`. The refresh credential is set as an HttpOnly cookie, not JSON.
The HTTP registration route now composes proof consumption, member creation and
session issuance in one transaction. It also requires JSON, an approved Origin
when supplied, and `X-CSRF-Protection: 1`. See [auth-sessions.md](auth-sessions.md)
for configuration, refresh, logout, current-user access and token handling.
LOGIN proofs are exchanged at `/auth/login`; a proof alone is not a session.
Existing clients expecting exactly `{message: OTP verified}` must accept the new
response fields when integrated. Error messages for current OTP validation remain.

## Files and responsibilities

- routes/auth.routes.js: adds the route; no business/database logic.
- controllers/auth.controller.factory.js: request/response and error mapping.
- controllers/auth.controller.js: supplies real services to the controller.
- services/registration.service.factory.js: proof/registration business rules.
- services/registration.service.js: supplies the real database dependency.
- utils/registration-error.js: expected registration errors.
- prisma/schema.prisma and the NEW migration: the additional verification table.
- tests/registration.*.test.js and helpers/registration-db.js: isolated tests.

## Verification and database safety

The 2026-09-12 project handoff reports completed local verification: 244 npm tests
passed with no failures or skips BEFORE the new offline target-regression tests;
separately, 10 registration DB checks and 12 session DB checks passed against
customer_club_test_db / customer_club_test_user and verified their scoped cleanup.
Prisma schema validation and client generation also succeeded as reported.
The earlier 86-test registration-only count is historical, not the current baseline.

Both customer_club_db and customer_club_test_db had all four migrations applied
at the last observation. An earlier launcher accidentally applied the verification
and session migrations to the normal local development database; the missing test
session migration was later applied deliberately through the explicit test config.
No production-server migration was performed. There was no pre-incident snapshot,
so the inspection does not prove all historical data was unchanged. See the
[incident record and corrected procedure](registration-db-checks.md).

Do not repeat local migrations, regenerate the client, reinstall dependencies or
rerun the completed database checkers just for this documentation/offline-test update.
The ordinary development server's session settings remain unconfirmed; ephemeral
checker credentials did not configure it for manual Postman/browser login.

For the new source-level target regressions only, from the repository root:
```powershell
node --test backend/tests/migration-target-isolation.test.js
```
The new file uses isolated environment objects and blocked database imports; it
needs no database connection or Prisma CLI execution. Its limits are documented
in [registration-db-checks.md](registration-db-checks.md#offline-migration-target-regressions).

Future migration/deployment work still needs explicit target review, least-privilege
credentials, backup/restore rehearsal, reviewed additive SQL and target-environment
integration/rollback checks. Test migration commands must name
backend/prisma.test.config.cjs and use securely supplied TEST_DATABASE_URL plus
ALLOW_TEST_DATABASE_WRITES. Do not reset databases or rewrite applied migrations.
A separate connection identity check is not proof of a later Prisma process's target.

The transaction substitute serializes callbacks and snapshots in-memory rows.
Its tests check service behavior and transaction boundaries, NOT PostgreSQL locks,
isolation, actual migration SQL execution, or deployment compatibility.
The expiry predicates use application timestamps; delayed database execution and
clock skew are not modeled. Do not describe these tests as full security proof.

## Still required before production

Session deployment/rehearsal and refresh coordination; request/attempt limits; safe concurrent resends and failed
creation handling; protection of low-entropy OTP codes at rest; real SMS; HTTPS;
authz/dashboard APIs; log redaction beyond this new path; cleanup of expired proof
rows; target-environment integration/rollback checks; deployment/backup/restore rehearsal.
No frontend or production configuration was changed by this batch.

## Design references

Prisma interactive transactions:
https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions
OWASP token lifecycle guidance (used as design guidance, not a claim about this app):
https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
