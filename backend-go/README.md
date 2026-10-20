# Go API

Requires Go 1.27.1 and a fresh PostgreSQL database. Build `go build ./cmd/...`, apply the embedded SQL with `go run ./cmd/migrate`, then run `go run ./cmd/api` with injected environment variables matching [.env.example](.env.example). The binary deliberately does not read `.env`. Startup validates database, JWT/OTP secrets, issuer/audience, allowed origins, MFA key, FarazSMS credentials and trusted proxy addresses before listening. `NODE_ENV=production` requires HTTPS origins and issues `__Host-club_refresh` cookies with Secure, HttpOnly, Path=/ and SameSite=Strict. Development cookies use `club_refresh`. Access TTL is900 seconds, member absolute session expiry7 days, admin expiry8 hours.

API routes; the supplied browser deployment adds `/api` and strips it at nginx:

| Method | Path | Behavior |
| --- | --- | --- |
| GET/HEAD | /health | Liveness; does not depend on database health |
| GET/HEAD | /ready | Bounded2s database/schema readiness;503 on failure |
| POST | /auth/request-code | Normalized Iranian phone, HMAC budgets, FarazSMS delivery |
| POST | /auth/verify-code | Atomic OTP claim and5minute REGISTER/LOGIN proof |
| POST | /auth/register | Valid names and complete past Jalali birthday; creates MEMBER session |
| POST | /auth/login | Consumes LOGIN proof; admins receive MFA challenge |
| POST | /auth/login/mfa | Atomic TOTP challenge, attempts and replay protection |
| POST | /auth/refresh | Rotates refresh cookie; replay revokes session |
| POST | /auth/logout | Revokes presented session and clears cookie |
| GET/HEAD | /auth/me | Live session and user authorization |
| POST | /contact/messages | Validated public contact submission/quota |
| GET/HEAD | /admin/overview | ADMIN aggregate counts |
| GET/HEAD | /admin/users | ADMIN paginated user search |
| GET/HEAD | /admin/messages | ADMIN filtered paginated messages |
| GET/HEAD | /admin/messages/:id | ADMIN message detail |
| PATCH | /admin/messages/:id/status | ADMIN atomic status transition and audit |
| GET/HEAD | /admin/audit | ADMIN filtered paginated audit events |
| GET/HEAD | /admin/audit/:id | ADMIN sanitized audit detail |
| GET/HEAD | /admin/security | ADMIN filtered paginated security events |
| GET/HEAD | /admin/security/:id | ADMIN sanitized security detail |

Session mutations and admin PATCH require JSON and `X-CSRF-Protection:1`, plus an exact approved Origin when present. Protected reads require the Bearer access credential; tokens in URLs/cookies do not authenticate. Credentialed CORS never reflects an unapproved origin. JSON is bounded; request contexts last30s, headers5s, read15s, write45s and idle60s. Request IDs and safe errors avoid disclosure of dependency details.

`TRUSTED_PROXY_CIDRS` defaults empty: forwarding headers are ignored. Explicit addresses/CIDRs may trust only the connection peer. The supplied nginx overwrites `X-Real-IP` with its socket peer and clears forwarding chains; trusted malformed/duplicate values return400. Never accept client forwarding chains or trust every peer. The OTP send and verify budgets retain normalized customer IPs through this boundary.

SIGINT/SIGTERM stops accepts and drains HTTP for up to 10 seconds before closing the pgx pool. The container has15s grace. `/ready` checks database connectivity and required core schema; it does not probe or send SMS. Runtime migration is separate from API startup.

For offline checks run `go test ./... -count=1`, `go vet ./...`, and
`go build ./cmd/...`. The backend suite requires neither Node nor npm. For real
database/concurrency/contracts/migration checks load the [owned harness](internal/testdb/README.md)
first. Linux CI additionally runs `go test -race ./...`.

Native tools never read `.env`. Inject `DATABASE_URL` for migration/promotion;
enrollment/reset also need the same 64-hex `ADMIN_MFA_ENCRYPTION_KEY` used by API:

```text
go run ./cmd/migrate
go run ./cmd/admin promote <phone>
go run ./cmd/admin mfa-enroll <phone>
go run ./cmd/admin mfa-reset <phone>
```

Promotion selects an existing member. Enrollment requires an existing ADMIN
without a credential; reset requires an enrolled ADMIN. Each operation revokes
prior sessions/challenges and records a security event transactionally. Only
explicit enrollment/reset prints a new secret and authenticator URI; keep that
output private. See [deployment](../docs/deployment.md) for target selection and
migration refusal rules.
