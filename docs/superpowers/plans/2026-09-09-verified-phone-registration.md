# Verified-phone Registration Implementation Plan

**Goal:** deliver OTP proof issuance and MEMBER registration as one reviewable batch.
**Architecture:** existing OTP factory participates in Prisma transactions; a new
registration service owns proofs/account creation and separate controllers own HTTP.
**Tech Stack:** JavaScript/CommonJS, Node test runner, existing Prisma/PostgreSQL.
**Spec:** docs/superpowers/specs/2026-09-09-verified-phone-registration.md

## Global constraints
No secrets, no frontend edits, no new dependencies, no existing-table changes,
no migration execution against user data, no JWT or implied authenticated session.

## Tasks
- [x] Add failing proof/registration/controller tests with isolated dependencies.
- [x] Implement hashed, expiring, purpose-bound proof issuance in OTP transaction.
- [x] Implement name/input validation and transactional MEMBER registration.
- [x] Wire POST /auth/register and extend /auth/verify-code; preserve old errors.
- [x] Add additive schema/migration and API/verification instructions.
- [x] Run syntax/regression checks; separate executed tests from unrun integration.
- [x] Produce an applicable patch; do not modify remote main or user databases.

## Outcome
GitHub create_branch was denied with HTTP 403. Delivery is a local patch, not a
published branch/PR. Executed tests and remaining runtime checks are documented
in VERIFICATION.md in the delivery bundle. No real database was accessed.
