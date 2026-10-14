# Complete Go Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Complete the seven approved migration stages in sequence, with preserved API behavior and fresh verification.

**Architecture:** Existing net/http and pgx form one Go API. Prisma remains schema owner. Node and Go share executable contract fixtures; database checks use a separate disposable cluster.

**Tech Stack:** Go 1.27.1, PostgreSQL 18, Node 24, React/Vite, Prisma 7.

**Spec:** ../specs/2026-10-14-go-migration-design.md

## Global Constraints

Preserve Node paths, fields, statuses and security semantics. JWT TTL <=900 seconds; MEMBER session seven days; ADMIN session eight hours. No existing database changes, real SMS, deployment, push, or secret output. Work in the current feature checkout and preserve pre-existing untracked files. Verify stages sequentially.

## Review Focus

- Cancellation/panics release transactions and HTTP resources.
- Concurrent proof, MFA, refresh, logout and status claims retain at most one winner and committed failure state.
- Populated legacy user schemas upgrade without invented birthdays or edited applied migrations.
- Browser renewal coordinates across tabs and never repeats ambiguous credential exchanges.
- Invalid filters, duplicate cookies, malformed JSON and untrusted origins fail safely and consistently.

### Task 1: Runtime and browser boundary

Files: backend-go/cmd/api/{main,main_run,http_server,runtime_wiring}.go; backend-go/internal/httpapi/{router,browser}.go; backend-go/internal/otpdb/transaction.go and covering tests.
Interfaces: export httpapi.WithBrowserPolicy(handler http.Handler, config authconfig.Config) http.Handler; add serveHTTP(ctx context.Context, address string, handler http.Handler) error; preserve runAPI and initializeAPI signatures.
- [ ] Add failing tests for preflight/exact origins, configured server cancellation, production main dependency entrypoint, and panic rollback.
- [ ] Run the new tests and record expected failures.
- [ ] Connect startup, bounded startup/query contexts, browser policy, JSON errors, and shutdown; guarantee rollback with independent cleanup context.
- [ ] Run go test ./... and go vet ./...; review task diff.

### Task 2: Shared contracts and database harness

Files: contracts/http.json; backend/tests/api-contract.test.js; backend-go/internal/httpapi/contract_test.go; backend-go/internal/testdb/; scripts/test-postgres.ps1; docs/migration-progress.md.
Interfaces: shared fixtures specify method/path/body/status/JSON/headers; testdb.Open(t testing.TB) *pgxpool.Pool opens a uniquely named test database only with MIGRATION_TEST_DATABASE_URL and an explicit test opt-in.
- [ ] Add contract fixtures exercising real Node HTTP boundaries and Go HTTP boundaries, with deterministic service dependencies.
- [ ] Observe incompatibilities, then align Go behavior while preserving Node contracts.
- [ ] Create a loopback-only disposable PostgreSQL cluster with random credentials; apply checked-in schema migrations only there.
- [ ] Run Node/Go contracts, offline suites, and a real database smoke test; review task diff.

### Task 3: Registration, sessions and MFA

Files: backend-go/internal/{session,adminmfa}/; backend-go/internal/httpapi/session.go; startup/runtime wiring; shared contracts and integration tests.
Interfaces: session.New(pool *pgxpool.Pool, auth authconfig.Config, mfaKey []byte) (*Service,error); session service owns Register/Login/CompleteMFA/Refresh/Logout/Authenticate; HTTP router dependencies use narrow service interfaces.
- [ ] Add failing service and HTTP tests for all six session endpoints and MFA challenges.
- [ ] Implement Node-compatible name/Jalali validation, proof claims, session issuance and cookies.
- [ ] Implement rotation/replay revocation, idempotent logout, live session/user checks, encrypted TOTP credentials, five-attempt challenges and counter replay protection.
- [ ] Verify real PostgreSQL rollback/concurrent claims plus shared contracts and complete Go suite; review task diff.

### Task 4: Birthday migration and frontend renewal

Files: backend/prisma/schema.prisma; new additive migration; scripts/legacy-migration.*; frontend/src/auth/{AuthProvider,api,refreshSession,sessionResponse}.*; frontend admin request sites and date formatting.
Interfaces: legacy migration runner operates only against explicitly guarded targets and supplies an alternative pending birthday migration path, leaving already-applied files intact; api request helper renews via existing cross-tab coordinator before safe API calls.
- [ ] Add failing populated-schema migration tests and legacy birthday/session tests.
- [ ] Add a migration-safe nullable legacy path and explicit backfill/enforcement instructions; retain required birthday validation for new registrations.
- [ ] Add failing expiry/401/cross-tab tests, then proactive/safe request renewal, expiry timers, cancellation and recoverable UI state.
- [ ] Run frontend suite/lint and PostgreSQL migration/concurrency checks; review task diff.

### Task 5: Contact, admin, audit and security

Files: backend-go/internal/{contact,admin,events}/; backend-go/internal/httpapi/{contact,admin}.go; runtime wiring; shared contracts and DB tests.
- [ ] Add failing tests for contact quota/validation and all nine admin endpoints.
- [ ] Implement filtered paginated reads, overview counts, detail endpoints and role guards with current session identity.
- [ ] Implement locked contact quota and conditional NEW->READ->RESOLVED transitions with transactional sanitized audits; preserve security event behavior.
- [ ] Verify real database queries, concurrent transitions and shared contracts; run full Go suite and review diff.

### Task 6: Measurements and optimization

Files: backend-go/internal/perftest/; scripts/benchmark.*; docs/performance.md; measured query files and additive index migration if justified.
- [ ] Seed deterministic disposable workloads and measure HTTP latency, throughput and database plans.
- [ ] Record baseline before modifying demonstrated hot paths.
- [ ] Apply narrowly justified query/index/pool improvements and remeasure identical workloads.
- [ ] Retain functional/concurrency checks and publish reproducible results with limits; review diff.

### Task 7: Consolidation and delivery verification

Files: shared frontend/backend helpers; .github/workflows/ci.yml; Dockerfile/compose; environment examples; root and backend-go README; deployment scripts and tests.
- [ ] Consolidate repeated parsers/request helpers and duplicate middleware while preserving contract tests.
- [ ] Add CI for Node/Go/frontend plus disposable PostgreSQL integration and migration rehearsal.
- [ ] Add deployable images, reverse proxy/same-site guidance, readiness, shutdown, secrets/configuration examples and smoke verification.
- [ ] Run all suites, lint, build, vet/race checks, contracts and database checks; perform independent whole-change review and address findings.
