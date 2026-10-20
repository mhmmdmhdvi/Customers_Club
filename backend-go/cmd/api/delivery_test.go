package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
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

// Runs native HTTPS checks against the actual Go runtime and compiled SPA
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
	ca := x509.NewCertPool()
	ca.AddCert(server.Certificate())
	transport := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: ca, MinVersion: tls.VersionTLS12}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	get := func(path, contentType string) string {
		t.Helper()
		response, err := client.Get(server.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		body, err := io.ReadAll(response.Body)
		if err != nil || response.StatusCode != 200 || !strings.Contains(response.Header.Get("Content-Type"), contentType) {
			t.Fatalf("HTTPS %s: status=%d err=%v", path, response.StatusCode, err)
		}
		return string(body)
	}
	for _, path := range []string{"/", "/admin", "/login"} {
		html := get(path, "text/html")
		if !strings.Contains(html, `<div id="root">`) {
			t.Fatalf("SPA missing at %s", path)
		}
		if path == "/" {
			match := regexp.MustCompile(`<script\b[^>]*\bsrc="([^"]+)"`).FindStringSubmatch(html)
			if len(match) != 2 {
				t.Fatal("built SPA script missing")
			}
			asset := get(match[1], "javascript")
			if !regexp.MustCompile("[\"'`]/api[\"'`]").MatchString(asset) {
				t.Fatal("SPA must use same-site /api")
			}
		}
	}
	for _, path := range []string{"/api/health", "/api/ready"} {
		get(path, "application/json")
	}
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api/auth/logout", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Origin", server.URL)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-CSRF-Protection", "1")
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 204 {
		t.Fatalf("HTTPS logout: %d", response.StatusCode)
	}
	cookies := response.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("logout cookies: %d", len(cookies))
	}
	cookie := cookies[0]
	if cookie.Name != "__Host-club_refresh" || !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/" || cookie.Domain != "" {
		t.Fatalf("cookie policy: %+v", cookie)
	}
	t.Log("Native HTTPS passed: trusted CA, SPA reloads, /api stripping, readiness and Secure cookie policy")
}
