# Owned PostgreSQL HTTP measurements

The retained [baseline](performance-baseline.json) (`644ac15`) and
[final result](performance-final.json) (`3737493`) record the historical
optimization measurements. Those artifacts retain the then-live Node comparison
for provenance. The current harness measures only the Go HTTP service. Old
candidate/GIN-flush experiments and intermediate artifacts have been removed;
use Git history at the recorded commits to inspect them.

Reproduce the current workload from the root with the independently marked
native PostgreSQL cluster already started:

```powershell
./scripts/benchmark.ps1 -Output .superpowers/performance-current.json -AllowPerformance
```

Use a distinct existing output directory. The wrapper loads only owned test
credentials; testdb creates, migrates, seeds and drops a unique child. Both
database and expensive-performance opt-ins are required. Ordinary tests/CI skip
the workload. No `.env`, existing database, SMS or external deployment is used.
No new measurements were necessary for Go-only retirement.

The workload has 100,000 users and 20,000 each of sessions, messages, audit and
security events, with fixed synthetic distributions relative to one timestamp.
It measures eight endpoints: auth/me, first/deep/search users, overview, and
filtered messages/audit/security. Every response must be HTTP 200. It uses 50
serial warmup requests and 500 measured requests per endpoint, eight workers,
reused HTTP connections, and six prewarmed database connections. Percentiles
use nearest rank after consuming complete responses. Pool wait/acquire deltas,
PostgreSQL settings and EXPLAIN (ANALYZE, BUFFERS) observations are retained in
each output. Plans use a fixed UTC millisecond timestamp matching bound query
arguments. The default seed uses the actual production index settings, without
GIN flush or autovacuum overrides.

The historical measurements used an Intel i3-12100F, eight logical cores,
roughly 16 GB RAM, Windows 11 amd64, Go 1.27.1 and PostgreSQL 18.6. Pool six is
a harness choice, not the production default. Go latency p50/p95/p99 in ms:

| Endpoint | Baseline | Final | Requests/s before → after |
| --- | --- | --- | --- |
| `/auth/me` | 0.57 / 1.74 / 4.98 | 0.52 / 1.30 / 5.76 | 9,253 → 11,904 |
| `/admin/users` | 94.78 / 176.41 / 211.23 | 6.96 / 10.66 / 11.29 | 79 → 1,086 |
| users page 500 | 110.74 / 181.90 / 216.89 | 10.38 / 16.53 / 40.63 | 68 → 699 |
| users search Needle | 115.02 / 133.03 / 137.66 | 1.69 / 2.65 / 3.63 | 69 → 4,481 |
| overview | 28.05 / 39.74 / 44.15 | 19.76 / 25.80 / 28.75 | 274 → 399 |
| messages NEW | 3.14 / 4.37 / 5.44 | 3.09 / 4.05 / 4.64 | 2,474 → 2,579 |
| audit status changes | 1.78 / 3.05 / 5.83 | 1.73 / 2.80 / 4.55 | 3,910 → 4,145 |
| security ADMIN_LOGIN | 1.70 / 6.49 / 22.99 | 1.70 / 2.72 / 3.93 | 3,062 → 4,274 |

The descending user B-tree removes sorting while exact counts remain linear.
The multicolumn GIN supports phone LIKE/name ILIKE OR searches without changing
wildcard semantics. Short/broad patterns may still scan much of the data. The
MEMBER-filtered overview counts each relevant relation once. Real database
regressions retain count predicates, ordering, wildcard/null/case behavior and
the 29 independently captured admin read expectations.

GIN `fastupdate=off` prioritizes search tail stability after bulk writes and
adds write work/WAL. A historical controlled ON/OFF diagnostic observed seed
time 5.005 → 15.415 seconds and a single rolled-back 1,000-user INSERT probe
34.681 → 166.781 ms, WAL 2,329,389 → 15,048,970 bytes. These were individual
observations, not stable registration throughput estimates. The final retained
run uses OFF with no benchmark cleanup. Index disk/WAL costs and this write
tradeoff need reassessment for a write-heavy workload. SQL migration files own
the setting; changing it alone does not flush an existing pending list.

These are separate warm fixed-concurrency batches on one local machine. There
are no repeated-run confidence intervals, saturation curves or production
capacity guarantees. Small changes on untouched endpoints include noise and
worse tails. The historical Node comparison reflects different query/library
costs as well as common indexes, and establishes no language speed claim.
Exact broad counts and deep page offsets still scale with data. No stateless
authorization, weakened revocation, approximate counts or speculative cache
was introduced.
