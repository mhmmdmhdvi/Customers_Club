# Legacy birthday migration

Prisma remains the schema owner. Do not edit or replace `20260927125149_add_member_birthday/migration.sql`: existing deployments retain its original checksum. That migration cannot add required birthday columns to populated legacy users. The additive `20261014120000_allow_legacy_birthday` migration makes birthdays nullable and enforces all three fields being either present or absent. Registration still requires and validates a real past Jalali birthday and string names; legacy DTOs may contain null birthdays and names.

## Explicit target runner

Arrange a reviewed backup and maintenance window, and stop application writes during reconciliation. Supply `LEGACY_MIGRATION_DATABASE_URL` directly from the intended target's secret store and set `LEGACY_MIGRATION_CONFIRM` to `migrate:<exact_database_name>`. From `backend`, run:

```powershell
node scripts/legacy-migration.js
```

The runner and `prisma.legacy.config.cjs` do not load an environment file or use `DATABASE_URL`. The URL must explicitly identify the PostgreSQL host, port, database, username and password. The confirmation must exactly match the database. The connected current/session user must be that database's owner, use the public schema, and have neither superuser nor role-creation privileges. Errors from the entrypoint omit connection details.

The runner validates the checked-in migration checksums and complete prior history, refuses unknown/modified/failed prior migrations and partially added or unexpected birthday columns, and holds a database advisory lock throughout reconciliation/deployment. For the exact pending historical birthday migration on populated users, it transactionally adds nullable integer columns without defaults or updates to user rows. Column comments identify this precise recovery state so an interrupted run can safely resume. If Prisma previously recorded a failed birthday attempt, it uses supported `migrate resolve --rolled-back`, then `migrate resolve --applied`, followed by `migrate deploy`. It never edits `_prisma_migrations` directly. Fresh empty schemas apply the original migration normally; already-applied birthdays keep their values. Existing applied nullable migrations must retain the validated all-or-none constraint. See [Prisma 7 recovery guidance](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing).

Only this runner should reconcile the pending populated case. Running ordinary `migrate deploy` first will fail at the historical NOT NULL migration; the later nullable migration cannot rescue that failure by itself. Do not reset, seed, drop users, use `db push`, or mark arbitrary drift applied. A refusal requires investigation before any further changes. Confirm the history, row counts and original user identifiers/timestamps after the run; rerunning a reconciled target is idempotent.

## Client generation and rehearsal

Regenerate the ignored client after changing the nullable schema, using the same explicit dedicated configuration:

```powershell
node node_modules/prisma/build/index.js generate --config prisma.legacy.config.cjs
```

Generation does not apply migrations. `go test ./internal/testdb -run TestLegacyPrismaMigrationHistories -count=1` from `backend-go`, with the owned test-cluster opt-in loaded, allocates unique empty databases and rehearses real Prisma histories for fresh, populated, failed pending, already-applied, partial-column drift and checksum drift cases. The subprocess URI is reconstructed from the child database configuration and checked against its ownership marker before any write. Rehearsal proves idempotence, constraint enforcement and actual Node Prisma reads of legacy null fields. Ordinary Go/Node tests require no developer environment file; the integration test skips without explicit disposable-cluster opt-in.

## Verified backfill and optional enforcement

Unknown legacy birthdays remain null until a user supplies a verified date. Validate the same complete Jalali date/past-in-Tehran rule as registration, then update `birthYear`, `birthMonth` and `birthDay` together in one transaction tied to the identified user. Retain the verification evidence according to the application's data policy. Never derive a birthday from account creation or substitute a default date. Legacy null names similarly remain unknown until supplied.

If a future product requirement makes birthdays mandatory for all users, first complete verified backfill and audit that no user has any null birthday field and that every stored triple passes the application validator. Add a new reviewed Prisma migration setting NOT NULL on all three fields. Rehearse it against a populated disposable copy and schedule the required table locks before any production execution. This stage supplies the capability and test evidence; it does not execute against existing or production databases.
