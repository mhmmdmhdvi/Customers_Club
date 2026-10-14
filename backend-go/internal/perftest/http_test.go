package perftest

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/accesstoken"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/admin"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/httpapi"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/session"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

const warmup, samples, concurrency, poolMax = 50, 500, 8, 6

var paths = []string{
	"/auth/me", "/admin/users", "/admin/users?page=500&pageSize=20",
	"/admin/users?search=Needle", "/admin/overview",
	"/admin/messages?status=NEW", "/admin/audit?action=CONTACT_MESSAGE_STATUS_CHANGED",
	"/admin/security?eventType=ADMIN_LOGIN",
}

type poolDelta struct {
	Acquires         int64   `json:"acquires"`
	EmptyAcquires    int64   `json:"emptyAcquires"`
	AcquireMS        float64 `json:"acquireMs"`
	EmptyWaitMS      float64 `json:"emptyWaitMs"`
	MaxConnections   int32   `json:"maxConnections"`
	TotalConnections int32   `json:"totalConnections"`
}
type endpoint struct {
	Path string `json:"path"`
	latency
	Pool *poolDelta `json:"pool,omitempty"`
}
type evidence struct {
	Revision    string                `json:"revision"`
	Started     string                `json:"startedUtc"`
	Go          string                `json:"go"`
	Node        string                `json:"node"`
	OS          string                `json:"os"`
	CPUs        int                   `json:"logicalCpus"`
	GOMAXPROCS  int                   `json:"gomaxprocs"`
	PoolMax     int                   `json:"poolMax"`
	PoolMin     int                   `json:"poolMin"`
	Warmup      int                   `json:"warmupPerEndpoint"`
	Concurrency int                   `json:"concurrency"`
	Seed        map[string]int        `json:"seedRows"`
	Settings    map[string]string     `json:"postgresSettings"`
	Plans       map[string][]string   `json:"explainAnalyzeBuffers"`
	Results     map[string][]endpoint `json:"results"`
	Candidate   map[string]any        `json:"candidate,omitempty"`
}

// Expensive and destructive only inside testdb's unique marked child. Both
// performance opt-in AND testdb's explicit owned-target opt-in are required.
func TestHTTPDatabasePerformance(t *testing.T) {
	if os.Getenv("ALLOW_MIGRATION_PERFORMANCE") != "1" {
		t.Skip("separate performance opt-in required")
	}
	if os.Getenv("MIGRATION_TEST_DATABASE_URL") == "" || os.Getenv("ALLOW_MIGRATION_TEST_DATABASE") != "1" {
		t.Fatal("performance run requires explicit owned database target")
	}
	output := os.Getenv("MIGRATION_PERFORMANCE_OUTPUT")
	if output == "" {
		t.Fatal("performance evidence output path required")
	}
	owned := testdb.Open(t)
	cfg := owned.Config().Copy()
	cfg.MaxConns, cfg.MinConns = poolMax, poolMax
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	p, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal("performance pool creation failed")
	}
	t.Cleanup(p.Close)
	seed(t, ctx, p)
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
	defer server.Close()
	revision, _ := exec.Command("git", "rev-parse", "HEAD").Output()
	nodeVersion, _ := exec.Command("node", "--version").Output()
	data := evidence{Revision: strings.TrimSpace(string(revision)), Started: time.Now().UTC().Format(time.RFC3339), Go: runtime.Version(), Node: strings.TrimSpace(string(nodeVersion)), OS: runtime.GOOS + "/" + runtime.GOARCH, CPUs: runtime.NumCPU(), GOMAXPROCS: runtime.GOMAXPROCS(0), PoolMax: poolMax, PoolMin: poolMax, Warmup: warmup, Concurrency: concurrency, Seed: map[string]int{"users": 100000, "sessions": 20000, "messages": 20000, "audit": 20000, "security": 20000}, Settings: map[string]string{}, Plans: map[string][]string{}, Results: map[string][]endpoint{}}
	for _, setting := range []string{"server_version", "shared_buffers", "work_mem", "max_connections", "effective_cache_size", "random_page_cost", "jit", "track_io_timing", "timezone"} {
		var value string
		if err = p.QueryRow(ctx, "SHOW "+setting).Scan(&value); err != nil {
			t.Fatal(err)
		}
		data.Settings[setting] = value
	}
	capturePlans(t, ctx, p, data.Plans)
	workload := paths
	if os.Getenv("MIGRATION_PERFORMANCE_CANDIDATE") == "trigram" {
		workload = paths[3:4]
	} else if os.Getenv("MIGRATION_PERFORMANCE_CANDIDATE") == "overview" {
		workload = paths[4:5]
	}
	for _, path := range workload {
		result := measure(t, server.URL, path, token.AccessToken, p)
		data.Results["go"] = append(data.Results["go"], result)
		t.Logf("go %s p50=%.2f p95=%.2f p99=%.2f rps=%.2f", path, result.P50MS, result.P95MS, result.P99MS, result.RequestsPerSecond)
	}
	nodeURL := startNode(t, ctx, p)
	for _, path := range workload {
		result := measure(t, nodeURL, path, token.AccessToken, nil)
		data.Results["node"] = append(data.Results["node"], result)
		t.Logf("node %s p50=%.2f p95=%.2f p99=%.2f rps=%.2f", path, result.P50MS, result.P95MS, result.P99MS, result.RequestsPerSecond)
	}
	if os.Getenv("MIGRATION_PERFORMANCE_CANDIDATE") == "trigram" {
		trigramCandidate(t, ctx, p, &data)
		for implementation, base := range map[string]string{"candidateGo": server.URL, "candidateNode": nodeURL} {
			var measuredPool *pgxpool.Pool
			if implementation == "candidateGo" {
				measuredPool = p
			}
			result := measure(t, base, paths[3], token.AccessToken, measuredPool)
			data.Results[implementation] = []endpoint{result}
			t.Logf("%s search p50=%.2f p95=%.2f p99=%.2f rps=%.2f", implementation, result.P50MS, result.P95MS, result.P99MS, result.RequestsPerSecond)
		}
	}
	if os.Getenv("MIGRATION_PERFORMANCE_CANDIDATE") == "overview" {
		candidate := httptest.NewServer(httpapi.WithBrowserPolicy(httpapi.NewRouterWithDependencies(httpapi.RouterDependencies{Session: service, Auth: auth, Admin: overviewCandidate{admin.New(p), p}}), auth))
		defer candidate.Close()
		result := measure(t, candidate.URL, paths[4], token.AccessToken, p)
		data.Results["candidateGo"] = []endpoint{result}
		data.Candidate = map[string]any{"kind": "overview-single-pass"}
		t.Logf("candidateGo overview p50=%.2f p95=%.2f p99=%.2f rps=%.2f", result.P50MS, result.P95MS, result.P99MS, result.RequestsPerSecond)
	}
	raw, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(output, append(raw, '\n'), 0600); err != nil {
		t.Fatal(err)
	}
}

// An experimental service remains test-only until HTTP measurements justify
// changing the actual service. It preserves the endpoint and exact predicates.
type overviewCandidate struct {
	*admin.Service
	pool *pgxpool.Pool
}

func (s overviewCandidate) Overview(ctx context.Context) (map[string]any, error) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	var members, recent, messages, newMessages, active int64
	err := s.pool.QueryRow(ctx, `SELECT members.total,members.recent,messages.total,messages.new,(SELECT count(*) FROM "AuthSession" WHERE "revokedAt" IS NULL AND "expiresAt">$2) FROM (SELECT count(*) total,count(*) FILTER (WHERE "createdAt">=$1) recent FROM "User" WHERE role='MEMBER') members CROSS JOIN (SELECT count(*) total,count(*) FILTER (WHERE status='NEW') new FROM "ContactMessage") messages`, now.Add(-7*24*time.Hour), now).Scan(&members, &recent, &messages, &newMessages, &active)
	if err != nil {
		return nil, err
	}
	return map[string]any{"members": map[string]any{"total": members, "newLast7Days": recent}, "messages": map[string]any{"total": messages, "new": newMessages}, "sessions": map[string]any{"active": active}}, nil
}

func seed(t *testing.T, ctx context.Context, p *pgxpool.Pool) {
	t.Helper()
	// Deterministic distribution relative to one anchor. No random phone/name,
	// private content, actual credential, SMS or external service is involved.
	_, err := p.Exec(ctx, `
 INSERT INTO "User" (id,phone,"firstName","lastName",role,"createdAt","updatedAt")
 SELECT i,'09'||lpad(i::text,9,'0'),CASE WHEN i%1000=0 THEN 'Needle' ELSE 'Member' END,'Example',CASE WHEN i=1 THEN 'ADMIN'::"Role" ELSE 'MEMBER'::"Role" END,
 date_trunc('second',now())-(i%30)*interval '1 day'-i*interval '1 millisecond',date_trunc('second',now()) FROM generate_series(1,100000) i;
 INSERT INTO "AuthSession" (id,"userId","createdAt","expiresAt","revokedAt")
 SELECT md5('session-'||i)::uuid,i,date_trunc('second',now()),date_trunc('second',now())+CASE WHEN i%4=0 THEN interval '-1 day' ELSE interval '1 day' END,CASE WHEN i%5=0 THEN date_trunc('second',now()) ELSE NULL END FROM generate_series(1,20000) i;
 INSERT INTO "ContactMessage" (name,phone,email,subject,message,status,"createdAt","updatedAt")
 SELECT 'Example','09'||lpad(i::text,9,'0'),NULL,'SUPPORT','Synthetic benchmark message',CASE i%3 WHEN 0 THEN 'NEW'::"ContactMessageStatus" WHEN 1 THEN 'READ'::"ContactMessageStatus" ELSE 'RESOLVED'::"ContactMessageStatus" END,date_trunc('second',now())-i*interval '1 second',date_trunc('second',now()) FROM generate_series(1,20000) i;
 INSERT INTO "AdminAuditEvent" ("actorUserId",action,"targetType","targetId",outcome,"createdAt")
 SELECT 1,CASE WHEN i%5=0 THEN 'CONTACT_MESSAGE_STATUS_CHANGED' ELSE 'OTHER_ACTION' END,'CONTACT_MESSAGE',i::text,'SUCCESS',date_trunc('second',now())-i*interval '1 second' FROM generate_series(1,20000) i;
 INSERT INTO "SecurityEvent" ("eventType",outcome,"actorUserId",route,"statusCode","createdAt")
 SELECT CASE WHEN i%5=0 THEN 'ADMIN_LOGIN' ELSE 'CSRF_REJECTED' END,'SUCCESS',1,'/synthetic',200,date_trunc('second',now())-i*interval '1 second' FROM generate_series(1,20000) i;
 ANALYZE "User"; ANALYZE "AuthSession"; ANALYZE "ContactMessage"; ANALYZE "AdminAuditEvent"; ANALYZE "SecurityEvent";`)
	if err != nil {
		t.Fatal("synthetic seed failed", err)
	}
}

func measure(t *testing.T, base, path, token string, p *pgxpool.Pool) endpoint {
	t.Helper()
	transport := &http.Transport{MaxIdleConns: concurrency, MaxIdleConnsPerHost: concurrency, MaxConnsPerHost: concurrency}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 30 * time.Second}
	request := func() error {
		req, err := http.NewRequest(http.MethodGet, base+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("loopback HTTP failed")
		}
		defer res.Body.Close()
		if _, err = io.Copy(io.Discard, res.Body); err != nil {
			return fmt.Errorf("loopback body failed")
		}
		if res.StatusCode != 200 {
			return fmt.Errorf("unexpected HTTP status %d", res.StatusCode)
		}
		return nil
	}
	for i := 0; i < warmup; i++ {
		if err := request(); err != nil {
			t.Fatal(path, err)
		}
	}
	var before *pgxpool.Stat
	if p != nil {
		before = p.Stat()
	}
	durations := make([]time.Duration, samples)
	var next atomic.Int64
	var wg sync.WaitGroup
	failures := make(chan error, concurrency)
	start := time.Now()
	for worker := 0; worker < concurrency; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				i := int(next.Add(1) - 1)
				if i >= samples {
					return
				}
				begin := time.Now()
				if err := request(); err != nil {
					failures <- err
					return
				}
				durations[i] = time.Since(begin)
			}
		}()
	}
	wg.Wait()
	wall := time.Since(start)
	close(failures)
	for err := range failures {
		t.Fatal(path, err)
	}
	result := endpoint{Path: path, latency: summarize(durations, wall)}
	if p != nil {
		after := p.Stat()
		result.Pool = &poolDelta{after.AcquireCount() - before.AcquireCount(), after.EmptyAcquireCount() - before.EmptyAcquireCount(), float64(after.AcquireDuration()-before.AcquireDuration()) / float64(time.Millisecond), float64(after.EmptyAcquireWaitTime()-before.EmptyAcquireWaitTime()) / float64(time.Millisecond), after.MaxConns(), after.TotalConns()}
	}
	return result
}

func capturePlans(t *testing.T, ctx context.Context, p *pgxpool.Pool, out map[string][]string) {
	t.Helper()
	plans := map[string]string{
		"authSession":                 `SELECT "userId","expiresAt","revokedAt" FROM "AuthSession" WHERE id=md5('session-1')::uuid`,
		"authUser":                    `SELECT id,phone,"firstName","lastName",role,"birthYear","birthMonth","birthDay","createdAt","updatedAt" FROM "User" WHERE id=1`,
		"usersFirst":                  `SELECT id,phone,"firstName","lastName",role,"birthYear","birthMonth","birthDay","createdAt","updatedAt" FROM "User" ORDER BY "createdAt" DESC,id DESC LIMIT 20`,
		"usersDeep":                   `SELECT id,phone,"firstName","lastName",role,"birthYear","birthMonth","birthDay","createdAt","updatedAt" FROM "User" ORDER BY "createdAt" DESC,id DESC LIMIT 20 OFFSET 9980`,
		"usersCount":                  `SELECT count(*) FROM "User"`,
		"usersSearch":                 `SELECT id,phone,"firstName","lastName",role,"birthYear","birthMonth","birthDay","createdAt","updatedAt" FROM "User" WHERE phone LIKE '%Needle%' OR "firstName" ILIKE '%Needle%' OR "lastName" ILIKE '%Needle%' ORDER BY "createdAt" DESC,id DESC LIMIT 20`,
		"usersSearchCount":            `SELECT count(*) FROM "User" WHERE phone LIKE '%Needle%' OR "firstName" ILIKE '%Needle%' OR "lastName" ILIKE '%Needle%'`,
		"overview":                    `SELECT (SELECT count(*) FROM "User" WHERE role='MEMBER'),(SELECT count(*) FROM "User" WHERE role='MEMBER' AND "createdAt">=now()-interval '7 days'),(SELECT count(*) FROM "ContactMessage"),(SELECT count(*) FROM "ContactMessage" WHERE status='NEW'),(SELECT count(*) FROM "AuthSession" WHERE "revokedAt" IS NULL AND "expiresAt">now())`,
		"candidateOverviewSinglePass": `SELECT members.total,members.recent,messages.total,messages.new,(SELECT count(*) FROM "AuthSession" WHERE "revokedAt" IS NULL AND "expiresAt">now()) FROM (SELECT count(*) total,count(*) FILTER (WHERE "createdAt">=now()-interval '7 days') recent FROM "User" WHERE role='MEMBER') members CROSS JOIN (SELECT count(*) total,count(*) FILTER (WHERE status='NEW') new FROM "ContactMessage") messages`,
		"messages":                    `SELECT id,name,phone,email,subject,status,"createdAt","updatedAt" FROM "ContactMessage" WHERE status='NEW' ORDER BY "createdAt" DESC LIMIT 20`,
		"audit":                       `SELECT id,"actorUserId",action,"targetType","targetId",outcome,"requestId","createdAt" FROM "AdminAuditEvent" WHERE action='CONTACT_MESSAGE_STATUS_CHANGED' ORDER BY "createdAt" DESC LIMIT 20`,
		"security":                    `SELECT id,"eventType",outcome,"actorUserId","requestId",route,"statusCode","createdAt" FROM "SecurityEvent" WHERE "eventType"='ADMIN_LOGIN' ORDER BY "createdAt" DESC LIMIT 20`,
	}
	for name, sql := range plans {
		// Runtime Overview binds one millisecond UTC timestamp. Use a timestamp
		// literal so EXPLAIN does not evaluate now()-interval per scanned row.
		anchor := "'" + time.Now().UTC().Truncate(time.Millisecond).Format("2006-01-02 15:04:05.000") + "'::timestamp"
		sql = strings.ReplaceAll(sql, "now()", anchor)
		out[name] = explain(t, ctx, p.Query, "EXPLAIN (ANALYZE, BUFFERS) "+sql)
	}
}

func explain(t *testing.T, ctx context.Context, query func(context.Context, string, ...any) (pgx.Rows, error), sql string) []string {
	t.Helper()
	rows, err := query(ctx, sql)
	if err != nil {
		t.Fatal("owned explain failed", err)
	}
	defer rows.Close()
	lines := []string{}
	for rows.Next() {
		var line string
		if err = rows.Scan(&line); err != nil {
			t.Fatal(err)
		}
		lines = append(lines, line)
	}
	if err = rows.Err(); err != nil {
		t.Fatal(err)
	}
	return lines
}

func trigramCandidate(t *testing.T, ctx context.Context, p *pgxpool.Pool, data *evidence) {
	t.Helper()
	var available, superuser bool
	if err := p.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_trgm'),(SELECT rolsuper FROM pg_roles WHERE rolname=current_user)`).Scan(&available, &superuser); err != nil {
		t.Fatal(err)
	}
	data.Candidate = map[string]any{"extensionAvailable": available, "installerSuperuser": superuser}
	if !available || superuser {
		t.Fatal("trigram trial requires available extension and owned non-superuser")
	}
	writeProbe := func(name string) {
		tx, err := p.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer func() {
			cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = tx.Rollback(cleanup)
		}()
		data.Plans[name] = explain(t, ctx, tx.Query, `EXPLAIN (ANALYZE, BUFFERS, WAL) INSERT INTO "User" (id,phone,"firstName","lastName","createdAt","updatedAt") SELECT 100000+i,'09'||lpad((100000+i)::text,9,'0'),'WriteProbe','Example',now(),now() FROM generate_series(1,1000) i`)
		if err = tx.Rollback(ctx); err != nil {
			t.Fatal(err)
		}
		if _, err = p.Exec(ctx, `VACUUM (ANALYZE) "User"`); err != nil {
			t.Fatal(err)
		}
	}
	writeProbe("userWriteBeforeTrigram")
	begin := time.Now()
	if _, err := p.Exec(ctx, `CREATE EXTENSION pg_trgm; CREATE INDEX "User_search_trgm_idx" ON "User" USING GIN (phone gin_trgm_ops,"firstName" gin_trgm_ops,"lastName" gin_trgm_ops)`); err != nil {
		t.Fatal("owned trigram build failed", err)
	}
	data.Candidate["extensionAndIndexBuildMs"] = float64(time.Since(begin)) / float64(time.Millisecond)
	var ginBytes, btreeBytes int64
	if err := p.QueryRow(ctx, `SELECT pg_relation_size('"User_search_trgm_idx"'),pg_relation_size('"User_createdAt_id_idx"')`).Scan(&ginBytes, &btreeBytes); err != nil {
		t.Fatal(err)
	}
	data.Candidate["trigramIndexBytes"] = ginBytes
	data.Candidate["orderingIndexBytes"] = btreeBytes
	writeProbe("userWriteWithTrigram")
	after := map[string][]string{}
	capturePlans(t, ctx, p, after)
	for _, key := range []string{"usersSearch", "usersSearchCount"} {
		data.Plans["trigram"+key] = after[key]
	}
	var count int64
	if err := p.QueryRow(ctx, `SELECT count(*) FROM "User"`).Scan(&count); err != nil || count != 100000 {
		t.Fatal("write probes changed seeded population")
	}
}

func startNode(t *testing.T, ctx context.Context, p *pgxpool.Pool) string {
	t.Helper()
	cfg := p.Config().ConnConfig
	target := (&url.URL{Scheme: "postgresql", Host: cfg.Host + ":" + strconv.Itoa(int(cfg.Port)), Path: "/" + cfg.Database, User: url.UserPassword(cfg.User, cfg.Password), RawQuery: "sslmode=disable"}).String()
	_, source, _, _ := runtime.Caller(0)
	cmd := exec.CommandContext(ctx, "node", "scripts/performance-reference.cjs")
	cmd.Dir = filepath.Join(filepath.Dir(source), "..", "..", "..", "backend")
	cmd.Env = append(os.Environ(), "PERFORMANCE_DATABASE_URL="+target, "PERFORMANCE_CONFIRM=read:"+cfg.Database, "ALLOW_MIGRATION_PERFORMANCE=1")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	// Helper emits only a fixed sanitized error; no database URI or tokens.
	cmd.Stderr = os.Stderr
	if err = cmd.Start(); err != nil {
		t.Fatal("Node reference start failed")
	}
	t.Cleanup(func() { _ = cmd.Process.Kill(); _ = cmd.Wait() })
	scanner := bufio.NewScanner(stdout)
	if !scanner.Scan() {
		t.Fatal("Node reference did not become ready")
	}
	base := scanner.Text()
	parsed, err := url.Parse(base)
	if err != nil || parsed.Scheme != "http" || parsed.Hostname() != "127.0.0.1" || parsed.Port() == "" {
		t.Fatal("invalid Node loopback listener")
	}
	return base
}
