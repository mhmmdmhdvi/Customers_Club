# Customer Club frontend

React 19/Vite 8 browser application. Requires Node 24.20.0. Install with `npm ci --ignore-scripts`, then run `npm test`, `npm run lint` (warnings fail), and `npm run build`.

`VITE_API_BASE_URL` is compiled into the bundle. Use `/api` behind the supplied nginx so SPA navigation `/admin` and `/login` remains HTML while `/api/admin/...` reaches Go. Rebuild after any base change. Local standalone development defaults to `http://localhost:3000`; configure the API allowed origin for Vite's actual localhost origin. `.env.example` documents the same-site base.

Access credentials remain in memory. The provider renews before expiry, coordinates cookie mutations across tabs with Web Locks and localStorage, rejects stale lifecycle results, and retries only eligible protected reads. Ambiguous single-use proof/refresh/registration/MFA/logout mutations are never retried automatically. `/api` is added exactly once; relative-base cookie responses clear safety blocks within the same lock.

WebOTP is optional; manual six-digit input remains supported. New registrations require valid complete past Jalali birthdays, while legacy unknown birthdays remain null. Layout/UI work is deferred. See [deployment](../docs/deployment.md) and [API contracts](../backend-go/README.md).

The operational browser smoke script is frontend tooling:
`node frontend/scripts/smoke.cjs <origin>` from the repository root. It checks
SPA reloads, built `/api` routing, readiness and harmless logout cookie flags.
For self-signed local TLS provide the CA with `NODE_EXTRA_CA_CERTS`. It does not
request SMS. Native Go tests independently exercise the initialized HTTPS API
and compiled SPA with a trusted test CA; they never launch Node.
