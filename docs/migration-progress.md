# Migration progress — plan: docs/superpowers/plans/2026-10-14-go-migration.md

The user explicitly requested implementation of the seven-stage sequence. Work remains in the existing feature checkout to preserve IDE context and untracked startup work. The Node backend is the behavior reference; existing databases and real SMS are excluded from test execution.

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

1. Runtime/browser: pending.
2. Compatibility/harness: pending.
3. Registration/sessions/MFA: pending.
4. Birthday/renewal: pending.
5. Contact/admin/audit: pending.
6. Performance: pending.
7. Consolidation/CI/deployment: pending.
