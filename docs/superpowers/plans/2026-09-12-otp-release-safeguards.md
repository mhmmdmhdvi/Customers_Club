# OTP Release Safeguards Implementation Plan

> For agentic workers: use superpowers:executing-plans; implementation is approved in chat.

**Goal:** Deliver one patch for approved OTP abuse/storage safeguards.
**Architecture:** CommonJS factories; PostgreSQL lock/quota utilities; injected sender;
OTP verification owns its transaction and invokes proof creation as a callback.
**Tech stack:** Existing Node/Express/Prisma/PostgreSQL; no dependencies added.
**Spec:** ../specs/2026-09-12-otp-release-safeguards.md

## Global constraints
- Preserve existing proofs, users, sessions, refresh policy and all old migrations.
- New SQL is reviewed separately; no database connection in the application step.
- All verification reports distinguish real execution from source review and mocks.

## Execution checklist
- [x] Write failing storage, rolling-limit, concurrency and rollback unit tests.
- [x] Add config/crypto/IP helpers and parameterized PostgreSQL locking/quota helpers.
- [x] Implement reserve/deliver/activate issuance and transactional verification.
- [x] Integrate verifyPhone through the transaction callback and map safe HTTP errors.
- [x] Adapt existing OTP and registration fixtures; retain prior behavioral assertions.
- [x] Add the row-preserving schema migration and guarded database verification path.
- [x] Run available Node suites, syntax checks, applicator unit checks and mutation checks.
- [x] Document unavailable full-runtime/PostgreSQL checks and exact local checkpoint.

File boundaries: backend/src/config/otp.js (configuration), utils/otp-{error,crypto,ip}.js
(validation/cryptography), services/otp-{db,delivery}.js (database/sender boundaries),
otp.service.factory.js (orchestration), registration.service.factory.js (proof callback),
auth.controller.factory.js (HTTP), tests/helpers (test-only stores/fixtures),
prisma/schema.prisma and one new migration (schema), docs/otp-release-safeguards.md.

Commands before delivery: node --test for the dependency-free affected suites;
node --check for each changed .js file; git diff --check; git apply --check on a
separate base tree. No application database, .env, migration CLI, install scripts,
GitHub write, or production resources participate in preparation.

- [ ] Run the combined installed-dependency suite on Windows at the supplied checkpoint.
- [ ] Rehearse the fifth migration and revised real-PostgreSQL checks after separate approval.
