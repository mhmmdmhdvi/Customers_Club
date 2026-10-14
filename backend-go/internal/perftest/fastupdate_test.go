package perftest

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/accesstoken"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/admin"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/httpapi"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/session"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

// Hold background index maintenance constant in two separate owned children.
// Each index receives identical writes; OFF is set before any seed insertion.
func runGINFastupdateComparison(t *testing.T, output string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	revision, _ := exec.Command("git", "rev-parse", "HEAD").Output()
	data := evidence{Revision: strings.TrimSpace(string(revision)), Started: time.Now().UTC().Format(time.RFC3339), Go: runtime.Version(), OS: runtime.GOOS + "/" + runtime.GOARCH, CPUs: runtime.NumCPU(), GOMAXPROCS: runtime.GOMAXPROCS(0), PoolMax: poolMax, PoolMin: poolMax, Warmup: warmup, Concurrency: concurrency, Seed: map[string]int{"users": 100000, "sessions": 20000, "messages": 20000, "audit": 20000, "security": 20000}, Settings: map[string]string{}, Plans: map[string][]string{}, Results: map[string][]endpoint{}, Candidate: map[string]any{"kind": "GIN fastupdate on versus off", "userAutovacuumDisabledInBothOwnedChildren": true}, SeedMaintenance: map[string]any{"ginPendingList": "no cleanup in either arm"}}
	for _, mode := range []string{"on", "off"} {
		owned := testdb.Open(t)
		cfg := owned.Config().Copy()
		cfg.MaxConns, cfg.MinConns = poolMax, poolMax
		p, err := pgxpool.NewWithConfig(ctx, cfg)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(p.Close)
		if _, err = p.Exec(ctx, `ALTER TABLE "User" SET (autovacuum_enabled=false); ALTER INDEX "User_search_trgm_idx" SET (fastupdate=`+mode+`)`); err != nil {
			t.Fatal(err)
		}
		start := time.Now()
		seed(t, ctx, p)
		data.Candidate[mode+"SeedWallMs"] = float64(time.Since(start)) / float64(time.Millisecond)
		var bytes int64
		if err = p.QueryRow(ctx, `SELECT pg_relation_size('"User_search_trgm_idx"')`).Scan(&bytes); err != nil {
			t.Fatal(err)
		}
		data.Candidate[mode+"IndexBytes"] = bytes
		for _, setting := range []string{"server_version", "shared_buffers", "work_mem", "max_connections", "effective_cache_size", "random_page_cost", "jit", "track_io_timing", "timezone"} {
			var value string
			if err = p.QueryRow(ctx, "SHOW "+setting).Scan(&value); err != nil {
				t.Fatal(err)
			}
			data.Settings[setting] = value
		}
		plans := map[string][]string{}
		capturePlans(t, ctx, p, plans)
		for key, plan := range plans {
			data.Plans[mode+":"+key] = plan
		}
		auth := authconfig.Config{Secret: []byte(strings.Repeat("a", 32)), Issuer: "performance", Audience: "performance", AccessTTLSeconds: 900}
		tokens, err := accesstoken.New(accesstoken.Config{Secret: auth.Secret, Issuer: auth.Issuer, Audience: auth.Audience, AccessTTLSeconds: 900})
		if err != nil {
			t.Fatal(err)
		}
		var sid string
		if err = p.QueryRow(ctx, `SELECT id FROM "AuthSession" WHERE "userId"=1`).Scan(&sid); err != nil {
			t.Fatal(err)
		}
		token, err := tokens.Issue(1, sid, time.Now().Add(time.Hour))
		if err != nil {
			t.Fatal(err)
		}
		service, err := session.New(p, auth, []byte(strings.Repeat("b", 32)))
		if err != nil {
			t.Fatal(err)
		}
		server := httptest.NewServer(httpapi.WithBrowserPolicy(httpapi.NewRouterWithDependencies(httpapi.RouterDependencies{Session: service, Auth: auth, Admin: admin.New(p)}), auth))
		t.Cleanup(server.Close)
		result := measure(t, server.URL, paths[3], token.AccessToken, p)
		server.Close()
		data.Results[mode] = []endpoint{result}
		t.Logf("fastupdate %s search p50=%.2f p95=%.2f p99=%.2f rps=%.2f seedMs=%.2f", mode, result.P50MS, result.P95MS, result.P99MS, result.RequestsPerSecond, data.Candidate[mode+"SeedWallMs"])
		tx, err := p.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = tx.Rollback(cleanup)
		})
		data.Plans[mode+":userWrite1000"] = explain(t, ctx, tx.Query, `EXPLAIN (ANALYZE, BUFFERS, WAL) INSERT INTO "User" (id,phone,"firstName","lastName","createdAt","updatedAt") SELECT 100000+i,'09'||lpad((100000+i)::text,9,'0'),'WriteProbe','Example',now(),now() FROM generate_series(1,1000) i`)
		if err = tx.Rollback(ctx); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(output, append(raw, '\n'), 0600); err != nil {
		t.Fatal(err)
	}
}
