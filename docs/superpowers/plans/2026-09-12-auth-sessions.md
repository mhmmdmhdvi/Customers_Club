# Auth Sessions Implementation Plan

> For agentic workers: execute as one feature batch, maintaining test-first gates.

**Goal:** Add authenticated sessions to the verified-phone flow.
**Architecture:** Dedicated configuration/JWT/cookie helpers, transactional session
service factory plus wiring, session controller and authorization/CSRF middleware.
**Tech Stack:** CommonJS, Express 5, PostgreSQL 18, Prisma 7.10, jsonwebtoken 9.0.3.
**Spec:** docs/superpowers/specs/2026-09-12-auth-sessions.md

## Global constraints
No secrets in code. No changes to normal database or frontend. Keep scoped Prisma
overrides. Generated Prisma files must not be committed. Test database writes need
both the dedicated database/login and explicit authorization.

## Tasks
1. Write service/config/cookie/controller tests, including transactional rollback,
   proof rejection, rotation, reuse revocation, logout and authorization; run red.
2. Implement session logic; adapt registration's existing transaction boundary and
   controller contract, retain existing validation tests; run isolated regressions.
3. Add actual-library JWT tests and HTTP route tests for execution after the pinned
   dependency is installed; do not report fake-library tests as crypto verification.
4. Add additive schema migration and guarded DB-check coverage; do not apply to
   normal development DB. Document strict refresh policy and response contract.
5. Produce applicable patch and verification report. Local user checkpoint: install
   pinned dependency with scripts disabled, full tests and audit. No auto commit.
