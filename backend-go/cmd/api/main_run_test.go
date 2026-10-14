package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/database"
)

func TestRunAPIDoesNotServeWhenDatabaseFails(
	t *testing.T,
) {
	// Valid but entirely fake startup configuration.
	env := map[string]string{
		"NODE_ENV": "test",

		"DATABASE_URL": "postgresql://fake:fake@127.0.0.1:1/offline_no_connection",

		"OTP_HMAC_SECRET":     strings.Repeat("a", 64),
		"ACCESS_TOKEN_SECRET": strings.Repeat("b", 64), "ADMIN_MFA_ENCRYPTION_KEY": strings.Repeat("c", 64),

		"JWT_ISSUER":           "customer-club-tests",
		"JWT_AUDIENCE":         "customer-club-web-tests",
		"AUTH_ALLOWED_ORIGINS": "http://localhost:5173",

		"FARAZSMS_API_KEY":      "fake-api-key",
		"FARAZSMS_LINE_NUMBER":  "50002178584000",
		"FARAZSMS_PATTERN_CODE": "fake-pattern",

		"PORT": "3001",
	}

	databaseFailure := errors.New(
		"synthetic PostgreSQL startup failure",
	)

	openCalls := 0
	serveCalls := 0

	// Simulate PostgreSQL failing to start.
	openDatabase := func(
		ctx context.Context,
		config database.Config,
	) (*pgxpool.Pool, error) {
		openCalls++

		if config.URL != env["DATABASE_URL"] {
			t.Fatal("unexpected database configuration")
		}

		return nil, databaseFailure
	}

	// Fake HTTP server.
	// This function must never execute if
	// database initialization fails.
	serve := func(
		ctx context.Context,
		address string,
		handler http.Handler,
	) error {
		serveCalls++

		t.Fatal(
			"HTTP server must not start when PostgreSQL fails",
		)

		return nil
	}

	// The application runner does not exist yet.
	err := runAPI(
		context.Background(),
		env,
		openDatabase,
		&http.Client{},
		serve,
	)

	if !errors.Is(err, databaseFailure) {
		t.Fatalf(
			"expected database startup failure, got %v",
			err,
		)
	}

	if openCalls != 1 {
		t.Fatalf(
			"expected one database opening attempt, got %d",
			openCalls,
		)
	}

	if serveCalls != 0 {
		t.Fatalf(
			"server must not start after database failure, got %d calls",
			serveCalls,
		)
	}
}

func TestRunAPIStartsServerAndClosesPool(
	t *testing.T,
) {
	env := map[string]string{
		"NODE_ENV": "test",

		"DATABASE_URL": "postgresql://fake:fake@127.0.0.1:1/offline_no_connection",

		"OTP_HMAC_SECRET":     strings.Repeat("a", 64),
		"ACCESS_TOKEN_SECRET": strings.Repeat("b", 64), "ADMIN_MFA_ENCRYPTION_KEY": strings.Repeat("c", 64),

		"JWT_ISSUER":           "customer-club-tests",
		"JWT_AUDIENCE":         "customer-club-web-tests",
		"AUTH_ALLOWED_ORIGINS": "http://localhost:5173",

		"FARAZSMS_API_KEY":      "fake-api-key",
		"FARAZSMS_LINE_NUMBER":  "50002178584000",
		"FARAZSMS_PATTERN_CODE": "fake-pattern",

		"PORT": "3001",
	}

	// Create an offline PostgreSQL pool.
	poolConfig, err := pgxpool.ParseConfig(
		env["DATABASE_URL"],
	)
	if err != nil {
		t.Fatalf("invalid test pool configuration: %v", err)
	}

	poolConfig.MinConns = 0

	connectionAttempts := 0

	// Block all accidental database connections.
	poolConfig.BeforeConnect = func(
		ctx context.Context,
		connConfig *pgx.ConnConfig,
	) error {
		connectionAttempts++
		return errors.New(
			"offline test forbids database connections",
		)
	}

	pool, err := pgxpool.NewWithConfig(
		context.Background(),
		poolConfig,
	)
	if err != nil {
		t.Fatalf("failed to create offline pool: %v", err)
	}
	defer pool.Close()

	openCalls := 0
	serveCalls := 0

	// Simulate successful PostgreSQL initialization.
	openDatabase := func(
		ctx context.Context,
		config database.Config,
	) (*pgxpool.Pool, error) {
		openCalls++

		if config.URL != env["DATABASE_URL"] {
			t.Fatal("unexpected database URL")
		}

		return pool, nil
	}

	// The fake server returns this error to simulate
	// the HTTP server stopping.
	serverStopped := errors.New(
		"synthetic HTTP server stopped",
	)

	serve := func(
		ctx context.Context,
		address string,
		handler http.Handler,
	) error {
		serveCalls++

		if address != ":3001" {
			t.Fatalf(
				"expected port 3001, got %q",
				address,
			)
		}

		if handler == nil {
			t.Fatal("expected HTTP handler")
		}

		// Test the handler without opening a port.
		req := httptest.NewRequest(
			http.MethodGet,
			"/health",
			nil,
		)

		recorder := httptest.NewRecorder()

		handler.ServeHTTP(recorder, req)

		if recorder.Code != http.StatusOK {
			t.Fatalf(
				"expected HTTP 200, got %d: %s",
				recorder.Code,
				recorder.Body.String(),
			)
		}

		if !strings.Contains(
			recorder.Body.String(),
			`"status":"ok"`,
		) {
			t.Fatal("expected healthy API response")
		}

		return serverStopped
	}

	err = runAPI(
		context.Background(),
		env,
		openDatabase,
		&http.Client{},
		serve,
	)

	if !errors.Is(err, serverStopped) {
		t.Fatalf(
			"expected server stop error, got %v",
			err,
		)
	}

	if openCalls != 1 {
		t.Fatalf(
			"expected one database initialization, got %d",
			openCalls,
		)
	}

	if serveCalls != 1 {
		t.Fatalf(
			"expected one HTTP server call, got %d",
			serveCalls,
		)
	}

	// runAPI must have executed its deferred cleanup.
	checkCtx, cancel := context.WithTimeout(
		context.Background(),
		time.Second,
	)
	defer cancel()

	conn, acquireErr := pool.Acquire(checkCtx)

	if conn != nil {
		conn.Release()
	}

	if acquireErr == nil ||
		!strings.Contains(
			acquireErr.Error(),
			"closed pool",
		) {
		t.Fatalf(
			"expected closed PostgreSQL pool, got %v",
			acquireErr,
		)
	}

	if connectionAttempts != 0 {
		t.Fatalf(
			"offline test attempted %d database connections",
			connectionAttempts,
		)
	}
}
