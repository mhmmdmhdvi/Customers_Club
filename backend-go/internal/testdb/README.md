# Disposable PostgreSQL tests

Ordinary `go test ./...` runs offline. `testdb.Open(t)` skips unless both
`MIGRATION_TEST_DATABASE_URL` and `ALLOW_MIGRATION_TEST_DATABASE=1` are present.
Invalid opted-in targets fail before creating anything. Do not set `DATABASE_URL`.

On Windows with native PostgreSQL 18, run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-postgres.ps1 -Action Start
. ./scripts/test-postgres.ps1 -Action Load
Push-Location backend-go
go test ./internal/testdb -count=1 -v
go test ./... -count=1
go run ./cmd/testdb-audit
Pop-Location
```

`Start` creates a fresh cluster bound to `127.0.0.1` on a free port with random
credentials. The test role has CREATEDB and is not a superuser. The ignored,
current-user-readable credential file is
`.superpowers/sdd/2026-10-14-go-migration/postgres-env.json`. Do not print, commit,
or copy its contents into reports. `Load` sets the two explicit test variables in
the current PowerShell process. `Status`, `Restart` and `Stop` operate only on the matching
owned cluster directory and marker. Stop retains diagnostic files. Restart validates ownership and refuses active clusters or stale PID files. It
retains the same credentials and diagnostics. Start refuses
to replace any existing environment file.

For a local/CI cluster created independently, provision these exact identities:
`mig_owner_<16 lowercase hex>` (LOGIN CREATEDB, non-superuser) and its owned
`mig_parent_<same hex>` database. Both database and role comments must equal
`customers-club-migration:<same hex>`. Use a 64 lowercase hex password, a loopback
host (`127.0.0.1` or `::1`), a nondefault port, and a PostgreSQL URI with only
`?sslmode=disable`. Ambient connection options/fallbacks are rejected.

`Open` validates the actual current database, current/session user, owner, and
both comments; creates a unique `mig_test_<cluster ID>_<32 random hex>` database;
verifies the actual child identity; and applies the embedded checksummed SQL via
`migrate.Apply`. Its `public.go_migrations` ledger validates an immutable prefix
and each migration commits transactionally. `OpenEmpty` allocates the same
guarded empty database for native runner integrity/rollback/concurrency tests. Each call
registers cleanup; DROP requires its exact unique name, owner, and nonce marker.
No development or ordinary test database names are accepted.

For direct loading without invoking the script:

```powershell
$migrationTestState = Get-Content .superpowers/sdd/2026-10-14-go-migration/postgres-env.json -Raw | ConvertFrom-Json
$env:MIGRATION_TEST_DATABASE_URL = $migrationTestState.MIGRATION_TEST_DATABASE_URL
$env:ALLOW_MIGRATION_TEST_DATABASE = '1'
```

Stop only this disposable cluster when finished:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-postgres.ps1 -Action Stop
Remove-Item Env:MIGRATION_TEST_DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:ALLOW_MIGRATION_TEST_DATABASE -ErrorAction SilentlyContinue
```

`-InstanceName <name>` selects a separate owned cluster directory/environment
under the same ignored scratch root; the default `postgres` preserves the paths
above. `-StartupControllerTimeoutSeconds` bounds the controller wait (default
35, range 1-60). A failed or timed-out startup is tracked before spawning, then
shutdown is attempted only after checking its exact generated path and marker.

The opted-in Windows Go suite includes `TestNativeFailedStartupStopsItsOwnedChild`.
It runs `scripts/tests/test-postgres-startup-failure.ps1` with a compiled controller
fixture that starts a real PostgreSQL child in separate named owned namespaces,
then exits nonzero or times out. Both cases require a ready child, stopped PID,
and no published environment file. It never stops the default shared cluster.
It retains diagnostic directories and safely stops any RED orphan it created.

`go run ./cmd/testdb-audit` reuses the same URL and actual identity/ownership
guards. It is read-only, refuses superusers/role creators/default port, and
requires zero owned children and zero public parent tables. Run it only when
owned tests have finished. Native tests do not need Node/npm or a schema checkout
outside the Go module. When deriving a child URI use actual current pgx fields;
`Config.ConnString()` retains the original parsed parent string after changing
`Database` and must not be used for that purpose.
