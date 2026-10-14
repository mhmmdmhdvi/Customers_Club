# Complete Go migration

The user approved execution of the seven stages from the read-only review, in order. The intended outcome is a fast, maintainable Go replacement for every existing Node API, with a working frontend and reproducible verification.

## Binding constraints

- Preserve existing Node HTTP methods, paths, JSON fields, expected status codes, authentication lifetimes, and cookie names/flags.
- Keep the PostgreSQL schema and Prisma migration history as the single schema authority. Do not reset, migrate, or seed the user's existing databases.
- Use a new disposable PostgreSQL cluster for integration, migration, concurrency, and performance tests. Do not read or emit existing secret values.
- Preserve HMAC OTP budgets, Node-compatible locks and hashes, transactional verification and registration, refresh replay revocation, live authorization, and admin TOTP replay protection.
- Access tokens last at most 900 seconds. Member sessions have absolute seven-day expiry; admin sessions have absolute eight-hour expiry.
- Preserve the existing untracked startup files and local admin script. Keep work in the current feature checkout so IDE files remain the implementation destination.
- Finish and verify each stage before starting the following stage. Do not deploy, push, or modify external accounts.

## Architecture

Use the existing net/http router and pgx pool. Initialize dependencies once at startup and expose narrowly scoped session, MFA, contact, and admin services. Transport handlers own JSON validation, headers, cookies, authorization, and status mapping; services own transactions and business rules.

Keep Node operational as the migration reference. Shared JSON contract fixtures are exercised by both actual HTTP implementations with deterministic test dependencies. Real PostgreSQL tests establish SQL, time-zone, rollback, concurrency, and migration behavior.

Browser policy applies exact credentialed CORS allowlists, bounded request contexts, JSON errors, request IDs, and security headers. Authentication mutations use the existing JSON/custom-header CSRF policy. Shutdown drains HTTP before closing the database pool.

## Seven stages

1. Connect main to the real startup runner, server timeouts, dependency lifecycle, CORS and request deadlines. Cover signal cancellation and transaction cleanup.
2. Add shared Node/Go HTTP contracts and an isolated PostgreSQL test harness. Capture existing Node failures separately and repair prerequisites needed to execute the reference.
3. Add registration, sessions, cookies, refresh/logout, live authentication, and admin MFA. Use atomic claims and retain used refresh hashes for replay detection.
4. Add a safe birthday migration path for populated pre-birthday schemas without inventing birthdays. Require real birthdays on new registrations while tolerating missing birthdays on legacy users. Add coordinated frontend renewal and authenticated requests without retrying ambiguous credential mutations.
5. Add contact and all existing admin/audit/security endpoints, including atomic message transitions, sanitized event details, filters, and pagination.
6. Record repeatable database-backed endpoint measurements. Optimize only demonstrated costs and retain before/after evidence with workload and hardware limits.
7. Consolidate repeated transport/validation code, fix touched lint problems, and provide CI, Docker deployment, schema checks, environment examples, smoke tests, and operational documentation.

## Validation and release limits

Run all Go tests, race checks where available, Node offline tests, shared contracts, frontend tests/lint/build, and isolated database integration tests. CI must reproduce those checks. Local performance results establish this workload only; live SMS delivery and production deployment remain environment-specific rehearsals.
