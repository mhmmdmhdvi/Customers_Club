# Verified-phone registration (review branch; not production-ready)

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

Do not run migrations against the normal or production database as a first test.
The delivered patch and application script do not run `migrate`, `db push`, seeds,
installs, database resets, git commits, pushes, merges, or deployments.

Initial local check from the repository root:
```powershell
npm --prefix backend test
```
The registration foundation originally had 86 tests. The session batch adds further coverage; consult its verification report for the current expected total.
The existing generated client must already be present, as for the current tests.
The new tests use a fake DB, so this first check needs no migration.

Before exercising valid registration through Postman or merging:
1. Rehearse migration/client generation with a dedicated local PostgreSQL test DB
   and a separate test role. Inspect the connection target; never print its URL.
2. Validate the schema, apply the NEW migration to that disposable DB, and generate
   the client. Do not reset or rewrite old migrations.
3. Run real database tests for OTP/proof rollback, duplicate phone constraints,
   two simultaneous OTP submissions and two registration submissions, expiry,
   and a wrong-purpose proof. Restore unrelated environment settings afterward.
4. Verify the complete HTTP flow against that test DB and then rerun regressions.

The transaction substitute serializes callbacks and snapshots in-memory rows.
Its tests check service behavior and transaction boundaries, NOT PostgreSQL locks,
isolation, actual migration SQL execution, or deployment compatibility.
The expiry predicates use application timestamps; delayed database execution and
clock skew are not modeled. Do not describe these tests as full security proof.

## Still required before production

Session deployment/rehearsal and refresh coordination; request/attempt limits; safe concurrent resends and failed
creation handling; protection of low-entropy OTP codes at rest; real SMS; HTTPS;
authz/dashboard APIs; log redaction beyond this new path; cleanup of expired proof
rows; database integration/rollback checks; deployment/backup/restore rehearsal.
No frontend or production configuration was changed by this batch.

## Design references

Prisma interactive transactions:
https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions
OWASP token lifecycle guidance (used as design guidance, not a claim about this app):
https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
