# Deployment and operations

This is a reviewed deployment recipe, not evidence of a production deployment. Local native Go/frontend builds and owned PostgreSQL rehearsals are available; Docker image/stack execution needs a working daemon. CI supplies those commands and Linux race checks; remote CI has not run in this workspace.

## Fresh development stack

Copy `deployment/api.env.example` to ignored `deployment/api.env`. Supply three independent 64 hex authentication/OTP/MFA keys and actual FarazSMS settings. Create ignored `deployment/secrets/bootstrap-db-password` and `deployment/secrets/app-db-password` through a secret manager; the app password must be 64 lowercase hex. Keep the host secrets directory private and arrange file modes so the nonroot API and PostgreSQL process can read their respective mounted secrets. Compose file-backed secrets retain host file permissions: a private 0700 parent directory with a 0444 app password file allows the container user to read while blocking other host users from traversing the directory. Do not put secrets in shell arguments or commit them.

```sh
docker compose --env-file deployment/api.env up --build -d --wait
node scripts/smoke.cjs http://localhost:8080
```

Only the frontend loopback port 8080 is published. PostgreSQL 18 stores its data under `/var/lib/postgresql/18/docker`; mount the parent `/var/lib/postgresql`, as the [official image documentation](https://hub.docker.com/_/postgres) requires. The image's `POSTGRES_USER=club_bootstrap` is a bootstrap superuser. Initialization creates `customer_club_user` with NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION, and `customer_club_db` owned by that role. Only this ordinary owner/password reaches the migration runner and API. The application database network is internal; neither API nor DB ports are published. Do not reuse an older volume layout or assume init scripts rerun on an existing volume.

The one-shot migration service validates actual identity and history, applies the guarded birthday recovery when needed, then uses Prisma migrate deploy. API startup depends on successful migration; frontend startup depends on API readiness. Migration service failure requires investigation rather than a schema reset. For a reviewed update, explicitly run `docker compose run --rm migrate` while app writes are stopped before restarting API; a previously exited migration container is not an automatic recurring migration scheduler.

## HTTPS production

Provide a valid certificate chain at ignored `deployment/tls/fullchain.pem` and key at `deployment/tls/privkey.pem`. Set `CLUB_ORIGIN` to the exact public HTTPS origin and use Compose2.24.4+ for `!override` port semantics:

```sh
docker compose --env-file deployment/api.env -f compose.yml -f compose.production.yml up --build -d --wait
node scripts/smoke.cjs https://club.example
```

Production publishes only 443, sets `NODE_ENV=production`, requires the exact HTTPS allowed origin and Secure `__Host-` cookies. Keep TLS terminated at the supplied nginx so its `$remote_addr` is the actual customer. If another load balancer is introduced, review and explicitly configure its trusted peer/IP rewriting at nginx before routing traffic; trusting arbitrary inbound forwarding headers destroys customer OTP budgets. Compose pins the proxy at 172.30.80.10 and Go trusts only that peer. Review subnet collisions and change both network and trusted address together when necessary.

Vite's API base is compile time: the frontend Docker build uses `VITE_API_BASE_URL=/api`. Both nginx configs strip only `/api/` before proxying to Go. `/admin` and `/login` navigation/reloads serve the SPA as HTML; `/api/admin/...` reaches the protected API. Smoke checks these routes, readiness, and a harmless no-cookie logout including HTTPS Secure/HttpOnly/SameSite flags. It never requests an OTP or sends SMS. Readiness checks database/core tables, not provider availability. Stop grace is 15 seconds around Go's 10 second HTTP drain.

## Existing schemas and operational tools

Back up and review the intended database, stop writes and use [the explicit legacy migration runner](../backend/docs/legacy-birthday-migration.md). Supply `LEGACY_MIGRATION_DATABASE_URL` through your secret store and `LEGACY_MIGRATION_CONFIRM=migrate:<exact_database_name>`; execute `node backend/scripts/legacy-migration.js`. It never reads developer `.env` or uses ambient `DATABASE_URL`. The target must be owned by its actual login/session user with neither superuser nor role-creation privileges. Historical checksums stay unchanged; unknown/partial drift is refused. Fresh, populated, failed, interrupted-after-resolve, applied and drifted histories are rehearsed in isolated owned children.

Legacy birthdays remain null; new registration requires a complete valid past Jalali birthday. Backfill only verified user-supplied dates, updating all three fields together after validation. Never infer birthdays from timestamps or invent a default. Any future mandatory legacy birthdays require verified backfill and a new additive Prisma migration.

Existing `backend/scripts/enroll-admin-mfa.js <phone>` and `reset-admin-mfa.js <phone>` remain operational with Go-compatible AES-GCM secret envelopes and replay counters. They intentionally accept only database `customer_club_db` and login `customer_club_user`, matching the fresh Compose owner. They load Node runtime configuration and emit a enrollment secret/URI for the operator: run manually in a private terminal with the intended target's configuration and the same `ADMIN_MFA_ENCRYPTION_KEY`. Do not run them as CI/smoke commands or capture their output in public logs. The commands require an existing ADMIN; enrollment/reset is not a role promotion. Reset invalidates existing sessions/challenges and records its event. Check the tool argument help/guards before any authorized operation. No such command was run during this migration.

Their built-in identity guard checks database and user names. The operator must separately verify the supplied `DATABASE_URL` host, explicit port and TLS settings against the intended target; these admin tools do not enforce the disposable harness's loopback/marker rules. Use injected runtime configuration from the intended secret store, not credentials copied from another environment.

## Verification and evidence

Local offline commands are in the root README. On Windows load/restart only the [marked owned test cluster](../backend-go/internal/testdb/README.md); `Restart` refuses active/stale-PID clusters and preserves credentials/diagnostics. Run the full Go suite and `node scripts/testdb-audit.cjs`; expected final catalog is zero owned children and zero parent public tables. CI provisions a separate native PostgreSQL 18 test owner with CREATEDB for disposable children; that privilege is never granted to the production app owner. CI runs full owned `-race` tests, real Prisma history and 296 shared contracts, audits then stops its own cluster. `ci-stack.sh` uses an isolated Compose project, fake provider settings, self-signed localhost TLS and fresh owner/migration/HTTPS smoke checks, then removes only its project volumes. No performance experiment is enabled.

Dependency audit on 2026-10-14: frontend source-map-js1.2.1→1.2.2 and undici8.10.1→8.10.2 fix the reported two high notices. Minimal backend updates fix proxy-addr2.0.7→2.0.8 and fast-uri3.1.7→3.1.8; removal of the unused nodemon/chokidar/braces chain in favor of Node 24 native watch resolves the remaining development-tool notices. Both npm audits return zero advisories at the recorded check. Sources: [source-map-js maintainer fix](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2), [undici maintainer advisory](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3), [proxy-addr maintainer advisory](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h), [fast-uri maintainer advisory](https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj), and [Node 24 watch documentation](https://raw.githubusercontent.com/nodejs/node/v24.20.0/doc/api/cli.md). No forced major upgrades were used.
