# Customers Club

React/Vite frontend and a Go 1.27.1 HTTP API backed by PostgreSQL 18. The API,
migration runner and administrator tools are native Go. Node 24.20.0 is needed
only for frontend development, builds and browser smoke tooling.

Install and verify without loading a local environment file:

```powershell
npm ci --ignore-scripts --prefix frontend
npm test --prefix frontend
npm run lint --prefix frontend
$env:VITE_API_BASE_URL='/api'
npm run build --prefix frontend
Remove-Item Env:VITE_API_BASE_URL
Push-Location backend-go
go test ./... -count=1
go vet ./...
go build ./cmd/...
Pop-Location
```

Follow [Go setup and API routes](backend-go/README.md), [deployment and native
tools](docs/deployment.md), and the [owned PostgreSQL harness](backend-go/internal/testdb/README.md).
Ordinary Go tests stay offline; opted-in tests create unique, marked disposable
databases and never load `.env`. Coverage retains 296 HTTP contracts, 29 captured
admin read cases, all 3,239 supported Jalali calendar years, encryption/TOTP,
session/MFA/contact/admin concurrency and native migration integrity tests.

[Performance evidence](docs/performance.md) describes one local workload and
its write/read tradeoffs. CI adds Linux race detection and a fresh HTTPS Compose
rehearsal. The UI remains the existing React application; this change does not
redesign it.
