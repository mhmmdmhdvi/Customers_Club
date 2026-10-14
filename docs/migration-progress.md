# Migration progress — plan: docs/superpowers/plans/2026-10-14-go-migration.md

The user explicitly requested implementation of the seven-stage sequence. Work remains in the existing feature checkout to preserve IDE context and untracked startup work. The Node backend is the behavior reference; existing databases and real SMS are excluded from test execution.

Scope clarification: the user withdrew responsive/UI verification on 2026-10-14. Preserve the current interface while completing migration and session renewal; UI/UX work is deferred to a later request.

## Preflight

| Tasks | Shared boundary | Decision |
|---|---|---|
| 1/3/5 | Router and runtime dependency wiring | Preserve existing OTP constructors; attach session/admin dependencies progressively. |
| 2/3/4/5/6/7 | Isolated test database | One shared guarded harness; uniquely allocated databases. |
| 3/4 | Birthday validation and legacy users | Validate birthdays on new registrations; tolerate missing historical values. |
| 2/3/5/7 | Shared HTTP fixtures | Extend fixtures as endpoints become available. |
| 4/7 | Frontend requests | One coordinated authentication helper, no ambiguous mutation retries. |
| 1/6/7 | Runtime bounds and observability | Keep deadlines/security checks when optimizing. |

All seven task descriptions match the accepted stage order and security constraints. Source ownership is sequential; no parallel implementers modify shared files.

Baseline: Go tests passed. Node offline suite: 560 passed, four test files failed (admin.app, auth, health, request-id.app); investigating prerequisite failures. Frontend baseline started. Docker daemon unavailable; PostgreSQL 18 binaries are installed and can host an independent test cluster.

## Stage status

1. Runtime/browser: complete (8bbfcc5 + d7e06f6). Behavioral tests/full Go suite/vet passed; independent review and scoped fix review passed. Node CORS semantics preserved; all server exits drain before pool cleanup.
2. Compatibility/harness: complete (4ed7500 + 0b7ef1a). Node offline 682 passed, including 107 shared HTTP cases; Go offline/owned-PostgreSQL/vet pass. Real PostgreSQL isolation/cleanup and native nonzero/timeout startup cleanup passed. Fix round 1/5: four P2 findings addressed, zero open; scoped spec/quality review passed.
3. Registration/sessions/MFA: complete (197f710). Complete Go offline/owned-PostgreSQL/vet checks and 731 Node tests passed, including 156 shared HTTP cases. Independent spec/quality/security review approved with no blocking findings. All six routes, atomic credential claims, refresh/logout, live authorization and interoperable admin MFA are wired.
4. Birthday/renewal: complete (91bc4c4 + 429b597). Fix round 1/5: three Important findings addressed, zero open; scoped spec/quality review approved. Frontend 146 tests/lint/build and seven actual Prisma histories passed; closing catalog/process audit clean. Initial complete Go/offline/vet and Node 732 checks passed. Historical SQL and existing UI layouts preserved.
5. Contact/admin/audit: complete (ad25ec2 + 94dac8b). Fix round 1/5: query parser parity addressed, zero open; scoped spec/quality review approved. Four actual-HTTP regressions RED/GREEN, 140 contact/admin shared cases and 29 real Prisma comparisons passed; shared total 296. Initial full Go owned/offline/vet/build (687 named tests) and Node 866 passed. Runtime/all-nine-endpoint flow and final parent tables/owned children audits passed.
6. Performance: in progress. Capture committed-harness baseline on owned database-backed HTTP workloads before changing queries/indexes/pool configuration; retain reproducible before/after evidence.
7. Consolidation/CI/deployment: pending.

Frontend baseline: 18 files / 119 tests passed. Node failure cause confirmed: eager MFA configuration at app import; stage 2 will make configuration lazy without fake runtime credentials. Local race detector is unavailable (CGO off and no C compiler); Linux CI will run race checks.

Stage 3 checkpoint: real PostgreSQL lifecycle/concurrent claims, rollback/cancellation, refresh/logout overlap, MFA attempts/replay and bidirectional Node crypto tests passed. Production initializeAPI/browser-wrapper HTTP flow passed for member register/refresh/me/logout and persisted admin MFA/replay. Another 49 shared session fixtures passed within 156 total shared cases. Source and final verification are recorded in task-3-report.md; review approved in task-3-review.md. Go issuance uses Node-compatible UTC millisecond precision to preserve absolute database expiry.

Deferred minor (Stage3 -> Stage7): capture/assert the expected Authentication operation failed diagnostic in backend/tests/session-contract.test.js:20 so passing offline test output is clean. Runtime sanitized logging remains intact.

Stage 4 checkpoint: seven actual Prisma-history scenarios passed, including populated/failed birthday migration reconciliation, interrupted post-resolve recovery, real Node legacy null reads, drift refusal, supplied DOB preservation and idempotence. Frontend early-renewal/concurrency/safe-read retry/cancellation tests passed; login/register/MFA/logout/refresh share the existing Web Lock, lifecycle generations reject late results, and short non-advancing expiry cannot trigger continuous rotation. Recovery clears safety blocks inside that lock only. Source/final verification are in task-4-report.md; independent review and fix-round1 re-review approved. One early failed-run orphan was removed after exact name/owner/marker validation; final parent public tables and owned child databases both zero. Three existing LoginPage/WebOTP lint warnings remain for Stage7 cleanup.

Stage7 triage note: frontend dependency installation reported two high-severity npm audit notices. Inspect actual current advisories/affected versions and apply minimal compatible fixes if available, retaining tests and npm-generated lockfile. Do not use blind force upgrades.
