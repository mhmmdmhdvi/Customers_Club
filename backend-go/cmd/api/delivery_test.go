package main

import (
	"context"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/database"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

func TestInitializedReadinessTracksDatabaseWhileHealthRemainsLive(t *testing.T) {
	pool := testdb.Open(t)
	config, err := readStartupConfig(boundaryEnvironment())
	if err != nil {
		t.Fatal(err)
	}
	handler, cleanup, err := initializeAPI(context.Background(), config, func(context.Context, database.Config) (*pgxpool.Pool, error) { return pool, nil }, &http.Client{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(cleanup)
	check := func(path string, status int) {
		t.Helper()
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != status {
			t.Fatalf("%s: %d", path, w.Code)
		}
	}
	check("/ready", 200)
	pool.Close()
	check("/ready", 503)
	check("/health", 200)
}

// Runs the operational smoke tool against the actual Go runtime and compiled SPA
// through a native TLS prefix proxy. Container/nginx execution remains a CI check.
func TestOperationalHTTPSProxySmoke(t *testing.T) {
	pool := testdb.Open(t)
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	dist := filepath.Join(root, "frontend", "dist")
	if _, err := os.Stat(filepath.Join(dist, "index.html")); err != nil {
		t.Skip("compile frontend with VITE_API_BASE_URL=/api before operational smoke")
	}
	var api http.Handler
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			clone := r.Clone(r.Context())
			clone.URL.Path = strings.TrimPrefix(r.URL.Path, "/api")
			clone.Header.Set("X-Real-IP", "127.0.0.1")
			clone.Header.Del("X-Forwarded-For")
			api.ServeHTTP(w, clone)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			http.FileServer(http.Dir(dist)).ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(dist, "index.html"))
	}))
	t.Cleanup(server.Close)
	env := boundaryEnvironment()
	env["NODE_ENV"] = "production"
	env["AUTH_ALLOWED_ORIGINS"] = "https://" + server.Listener.Addr().String()
	env["TRUSTED_PROXY_CIDRS"] = "127.0.0.1,::1"
	config, err := readStartupConfig(env)
	if err != nil {
		t.Fatal(err)
	}
	api, cleanup, err := initializeAPI(context.Background(), config, func(context.Context, database.Config) (*pgxpool.Pool, error) { return pool, nil }, &http.Client{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(cleanup)
	server.StartTLS()
	cert := filepath.Join(t.TempDir(), "smoke-ca.pem")
	if err := os.WriteFile(cert, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw}), 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, "node", "-e", `require(process.argv[1]).smoke(process.argv[2]).catch(error=>{console.error(error.message);process.exitCode=1;})`, filepath.Join(root, "scripts", "smoke.cjs"), server.URL)
	command.Env = append(os.Environ(), "NODE_EXTRA_CA_CERTS="+cert)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("operational smoke: %v: %s", err, output)
	} else {
		t.Log(string(output))
	}
}
