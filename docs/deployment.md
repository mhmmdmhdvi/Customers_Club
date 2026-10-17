# Deployment and operations

This is a reviewed deployment recipe, not evidence of a production deployment. Local native Go/frontend builds and owned PostgreSQL rehearsals are available; Docker image/stack execution needs a working daemon. CI supplies those commands and Linux race checks; remote CI has not run in this workspace.

## Fresh development stack

Copy `deployment/api.env.example` to ignored `deployment/api.env`. Supply three independent 64 hex authentication/OTP/MFA keys and actual FarazSMS settings. Create ignored `deployment/secrets/bootstrap-db-password` and `deployment/secrets/app-db-password` through a secret manager; the app password must be 64 lowercase hex. Keep the host secrets directory private and arrange file modes so the nonroot API and PostgreSQL process can read their respective mounted secrets. Compose file-backed secrets retain host file permissions: a private 0700 parent directory with a 0444 app password file allows the container user to read while blocking other host users from traversing the directory. Do not put secrets in shell arguments or commit them.

```sh
docker compose --env-file deployment/api.env up --build -d --wait
node frontend/scripts/smoke.cjs http://localhost:8080
```

Only the frontend loopback port 8080 is published. PostgreSQL 18 stores its data under `/var/lib/postgresql/18/docker`; mount the parent `/var/lib/postgresql`, as the [official image documentation](https://hub.docker.com/_/postgres) requires. The image's `POSTGRES_USER=club_bootstrap` is a bootstrap superuser. Initialization creates `customer_club_user` with NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION, and `customer_club_db` owned by that role. Only this ordinary owner/password reaches the migration runner and API. The application database network is internal; neither API nor DB ports are published. Do not reuse an older volume layout or assume init scripts rerun on an existing volume.

The one-shot migration service runs `migrate` from the same Go image as the API. It applies embedded SQL with an immutable checksummed `public.go_migrations` ledger and a dedicated PostgreSQL advisory lock. Each migration and its ledger row commit together. The image also includes `admin`; the entrypoint injects only the separately mounted ordinary application database password, then executes the selected binary (default `api`). API startup depends on successful migration; frontend startup depends on API readiness. Migration service failure requires investigation rather than a schema reset. For a reviewed update, explicitly run `docker compose run --rm migrate` while app writes are stopped before restarting API; a previously exited migration container is not an automatic recurring migration scheduler.

## HTTPS production

Provide a valid certificate chain at ignored `deployment/tls/fullchain.pem` and key at `deployment/tls/privkey.pem`. Set `CLUB_ORIGIN` to the exact public HTTPS origin and use Compose2.24.4+ for `!override` port semantics:

```sh
docker compose --env-file deployment/api.env -f compose.yml -f compose.production.yml up --build -d --wait
node frontend/scripts/smoke.cjs https://club.example
```

Production publishes only 443, sets `NODE_ENV=production`, requires the exact HTTPS allowed origin and Secure `__Host-` cookies. Keep TLS terminated at the supplied nginx so its `$remote_addr` is the actual customer. If another load balancer is introduced, review and explicitly configure its trusted peer/IP rewriting at nginx before routing traffic; trusting arbitrary inbound forwarding headers destroys customer OTP budgets. Compose pins the proxy at 172.30.80.10 and Go trusts only that peer. Review subnet collisions and change both network and trusted address together when necessary.

Vite's API base is compile time: the frontend Docker build uses `VITE_API_BASE_URL=/api`. Both nginx configs strip only `/api/` before proxying to Go. `/admin` and `/login` navigation/reloads serve the SPA as HTML; `/api/admin/...` reaches the protected API. Smoke checks these routes, readiness, and a harmless no-cookie logout including HTTPS Secure/HttpOnly/SameSite flags. It never requests an OTP or sends SMS. Readiness checks database/core tables, not provider availability. Stop grace is 15 seconds around Go's 10 second HTTP drain.

## Native migration and administrator tools

Fresh databases are the supported deployment target. `migrate` refuses an
untracked nonempty schema, changed/missing/unknown ledger rows, and incompatible
history without resetting or adopting it. The fourteen embedded SQL migrations
are the sole schema history. Add a new migration for future changes; never edit
an applied file. pg_trgm must be available to the ordinary owner. This is an
unreleased project; no legacy adoption/recovery launcher is retained.

Outside Compose, inject `DATABASE_URL` from the intended environment/secret
store and run `go run ./cmd/migrate` from `backend-go/`. Verify the host, port,
database, role and TLS settings before selecting a target. These operational
commands deliberately use the injected target and do not apply disposable test
name restrictions. They never read a local `.env`.

From `backend-go/`:

```text
go run ./cmd/admin promote <phone>
go run ./cmd/admin mfa-enroll <phone>
go run ./cmd/admin mfa-reset <phone>
```

All need `DATABASE_URL`; enrollment/reset additionally require the API's
`ADMIN_MFA_ENCRYPTION_KEY` (64 hexadecimal characters). Promotion needs an existing
member. Enrollment/reset need an existing ADMIN; enroll only once and use reset
for rotation. Role/credential changes, prior-session revocation, MFA challenge
consumption and secret-free security events are atomic. Enrollment/reset prints
a new secret/URI only after commit; use a private terminal and do not collect
the output in public logs. In Compose use `docker compose run --rm api admin
<operation> <phone>` with the same environment/secret mounts.

Unknown legacy birthdays remain null. Registration requires a complete valid
past Jalali date. Backfill only verified user-supplied dates and update all three
fields together; never invent defaults.

## Verification

Use the root README for offline Go/frontend checks and the [owned
harness](../backend-go/internal/testdb/README.md) for database tests. Run
`go run ./cmd/testdb-audit` after owned tests: expected children=0 and
parent_tables=0. Test roles alone have CREATEDB; production app owners do not.

CI installs Node dependencies only for frontend, runs the full offline and owned
Go suites (including Linux race), 296 HTTP contracts, 29 captured admin reads,
native migration/admin tests and the catalog audit. Its separate fresh Compose
project checks the ordinary owner, 14-row native ledger, idempotent migration
rerun and HTTPS frontend smoke with fake provider settings; it never requests
an OTP. The script removes only its own project volumes on exit.

Local Windows verification can run without Docker. Container/stack execution
requires a working Docker daemon; race detection requires CGO and a C compiler.
Checked-in CI commands are a recipe, not a claim of a hosted run or deployment.
