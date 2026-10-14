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
6. Performance: complete (baseline 644ac15; final production 3737493; evidence 4f8aa0e). Independent spec/quality review approved with no blocking findings. Final owned/offline Go, vet/build and Node 872 passed; parent tables/owned children zero. User-list p95 176.41 -> 10.66ms; selective search 133.03 -> 2.65ms; overview 39.74 -> 25.80ms on the documented local workload. GIN fastupdate OFF write/WAL tradeoff and all candidate results retained in docs/performance.md. Two minor benchmark cleanup issues assigned to Stage7.
7. Consolidation/CI/deployment: implementation and task review complete (90e1194 + 7389b05 + 2dc327c). Fix round 1/5: Linux CI socket default addressed; scoped review approved, zero open findings. Node 872/frontend 148/full owned Go 715 named passes/shared 296/Prisma comparisons 29/histories 7 passed. Lint/vet/build/gofmt/audits clean; native HTTPS readiness/cookies/SPA smoke and owned restart passed. Docker, Linux race and remote CI execution remain unverified. Final whole-change architecture/security review approved with no new Critical, Important or Minor findings.

Frontend baseline: 18 files / 119 tests passed. Node failure cause confirmed: eager MFA configuration at app import; stage 2 will make configuration lazy without fake runtime credentials. Local race detector is unavailable (CGO off and no C compiler); Linux CI will run race checks.

Stage 3 checkpoint: real PostgreSQL lifecycle/concurrent claims, rollback/cancellation, refresh/logout overlap, MFA attempts/replay and bidirectional Node crypto tests passed. Production initializeAPI/browser-wrapper HTTP flow passed for member register/refresh/me/logout and persisted admin MFA/replay. Another 49 shared session fixtures passed within 156 total shared cases. Source and final verification are recorded in task-3-report.md; review approved in task-3-review.md. Go issuance uses Node-compatible UTC millisecond precision to preserve absolute database expiry.

Deferred minor (Stage3 -> Stage7): capture/assert the expected Authentication operation failed diagnostic in backend/tests/session-contract.test.js:20 so passing offline test output is clean. Runtime sanitized logging remains intact.

Stage 4 checkpoint: seven actual Prisma-history scenarios passed, including populated/failed birthday migration reconciliation, interrupted post-resolve recovery, real Node legacy null reads, drift refusal, supplied DOB preservation and idempotence. Frontend early-renewal/concurrency/safe-read retry/cancellation tests passed; login/register/MFA/logout/refresh share the existing Web Lock, lifecycle generations reject late results, and short non-advancing expiry cannot trigger continuous rotation. Recovery clears safety blocks inside that lock only. Source/final verification are in task-4-report.md; independent review and fix-round1 re-review approved. One early failed-run orphan was removed after exact name/owner/marker validation; final parent public tables and owned child databases both zero. Three existing LoginPage/WebOTP lint warnings remain for Stage7 cleanup.

Stage7 triage note: frontend dependency installation reported two high-severity npm audit notices. Inspect actual current advisories/affected versions and apply minimal compatible fixes if available, retaining tests and npm-generated lockfile. Do not use blind force upgrades.

Stage7 task review/fix round 1: socket-directory finding addressed by explicit TCP-only unix_socket_directories in 2dc327c; scoped spec/quality review approved. Focused emitted-config RED/GREEN, Bash syntax and diff checks passed. Native Go/Node/frontend/HTTPS/audit evidence accepted; Docker/Linux race/hosted CI execution limits remain explicit. Whole-change review approved; no final fix wave required.

## Final completion

All seven implementation stages are complete and independently reviewed. Final review covers 3aeb069..02b0360; product source ends at 2dc327c after the scoped CI socket correction. No merge, push or deployment was requested or performed. The existing feature checkout and preexisting untracked admin helper are preserved.

Final evidence: owned Go 715 named passes / zero failures / one optional performance skip; offline Go 656 / zero / 56 database/performance skips; Node 872; frontend 148 across 21 files; shared HTTP 296; actual Prisma comparisons 29; migration histories 7. Lint, vet, production builds, formatting and both dependency audits pass. Native verified HTTPS/runtime/compiled-SPA smoke, readiness failure and safe owned-cluster restart pass. Closing owned catalog contained zero child databases and zero parent public tables.

Reviewed scope decisions: responsive/UI work was explicitly withdrawn. Live SMS, existing data/restore and deployment are excluded from authorized execution. Docker/nginx, Linux race and hosted CI results remain unexecuted limitations; full real-browser coverage was not claimed. Documented niche charset/native parsing differences remain explicit compatibility limitations. Historical externally inserted event data is not retrospectively rewritten. Benchmarks establish the documented local workload, not production capacity. An existing pg_trgm installation outside public requires a separate reviewed migration, not an automatic schema change.

Ruling: preserve Node's live-role authorization during administrative promotion rather than silently redesign it in a compatibility migration. Promotion should revoke prior member sessions before administrative use. Cost if wrong: a promoted member's existing session can acquire admin access without a new MFA login and retain its original member expiry; this policy needs separate hardening if direct promotion is used.

Owned test diagnostics and restart metadata are retained in ignored storage. The owned test server is stopped after final review; no existing server is targeted.