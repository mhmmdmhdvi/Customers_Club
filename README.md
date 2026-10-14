# Customers Club

React/Vite frontend and a Go 1.27.1 HTTP API backed by PostgreSQL 18. The Node 24 backend remains a tested compatibility reference; Prisma 7.10 owns the schema and additive migration history. No UI redesign accompanies this migration.

Install and verify without a developer environment file:

```powershell
npm ci --ignore-scripts --prefix backend
npm ci --ignore-scripts --prefix frontend
npm run generate:test --prefix backend
npm test --prefix backend
npm test --prefix frontend
npm run lint --prefix frontend
$env:VITE_API_BASE_URL='/api'
npm run build --prefix frontend
Remove-Item Env:VITE_API_BASE_URL
Push-Location backend-go
go test ./... -count=1
go vet ./...
go build ./cmd/api
Pop-Location
```

`npm test` enforces an offline preload that blocks real PostgreSQL connections and developer dotenv loading. `generate:test` uses a separate connection-free Prisma configuration. Installs have no postinstall hook. Node development uses the built-in `node --watch`, watching the entrypoint and required modules. Follow [Go setup and all API routes](backend-go/README.md), [deployment and migration procedures](docs/deployment.md), and [the owned PostgreSQL test harness](backend-go/internal/testdb/README.md).

The shared fixtures contain 296 HTTP cases; owned integration also compares 29 actual Node/Prisma results and exercises real session, MFA, contact/admin concurrency. Seven actual Prisma-history rehearsals cover fresh, populated, failed, interrupted, applied and drifted schemas. [Performance evidence](docs/performance.md) describes this local workload and its limitations; it is not a production capacity guarantee. CI adds Linux race detection and a fresh HTTPS Compose smoke rehearsal. Windows has no local CGO compiler, and the local Docker daemon is unavailable; neither container execution nor remote CI success is claimed.

Current operations are described in the linked guides. Older `backend/docs` verification counts, database incident records and `docs/superpowers` plans are explicitly historical records. The new migration has never been applied to an existing user database; no live SMS, deployment or external publication was performed.
