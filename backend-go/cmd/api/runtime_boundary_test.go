package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/database"
)

func boundaryEnvironment() map[string]string {
	return map[string]string{
		"NODE_ENV": "test", "DATABASE_URL": "postgresql://fake:fake@127.0.0.1:1/offline",
		"OTP_HMAC_SECRET": strings.Repeat("a", 64), "ACCESS_TOKEN_SECRET": strings.Repeat("b", 64),
		"JWT_ISSUER": "tests", "JWT_AUDIENCE": "tests", "AUTH_ALLOWED_ORIGINS": "http://localhost:5173",
		"FARAZSMS_API_KEY": "fake", "FARAZSMS_LINE_NUMBER": "fake", "FARAZSMS_PATTERN_CODE": "fake",
	}
}

func TestProductionMainFailsClosedWithEmptyEnvironment(t *testing.T) {
	// Build and execute the actual entrypoint, rather than an injected runner.
	binary := filepath.Join(t.TempDir(), "api.exe")
	if output, err := exec.Command("go", "build", "-o", binary, ".").CombinedOutput(); err != nil {
		t.Fatalf("build entrypoint: %v: %s", err, output)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, binary)
	cmd.Env = []string{}
	output, err := cmd.CombinedOutput()
	if ctx.Err() != nil {
		t.Fatalf("entrypoint did not reject empty configuration before listening: %s", output)
	}
	if err == nil || !strings.Contains(string(output), "API startup failed") {
		t.Fatalf("expected sanitized dependency startup failure, got %v: %s", err, output)
	}
	if strings.Contains(string(output), "Server running") {
		t.Fatal("entrypoint announced a listener before validating dependencies")
	}
}

func TestInitializeAPIBoundsStartupContext(t *testing.T) {
	config, err := readStartupConfig(boundaryEnvironment())
	if err != nil {
		t.Fatal(err)
	}
	failure := errors.New("offline")
	_, _, err = initializeAPI(context.Background(), config, func(ctx context.Context, _ database.Config) (*pgxpool.Pool, error) {
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) > 15*time.Second {
			t.Error("database startup has no bounded context")
		}
		return nil, failure
	}, &http.Client{})
	if !errors.Is(err, failure) {
		t.Fatalf("lost startup failure: %v", err)
	}
}

func TestInitializeAPIAppliesBrowserPolicy(t *testing.T) {
	config, err := readStartupConfig(boundaryEnvironment())
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(context.Background(), config.Database.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	handler, cleanup, err := initializeAPI(context.Background(), config, func(context.Context, database.Config) (*pgxpool.Pool, error) {
		return pool, nil
	}, &http.Client{})
	if err != nil {
		t.Fatal(err)
	}
	defer cleanup()
	r := httptest.NewRequest(http.MethodOptions, "/auth/request-code", nil)
	r.Header.Set("Origin", "http://localhost:5173")
	r.Header.Set("Access-Control-Request-Method", "POST")
	r.Header.Set("Access-Control-Request-Headers", "content-type,x-csrf-protection")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusNoContent || w.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatalf("configured runtime did not handle credentialed preflight: %d %v", w.Code, w.Header())
	}
}
