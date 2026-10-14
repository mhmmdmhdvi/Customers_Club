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
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/farazsms"
)

func TestInitializeAPIFailsWhenDatabaseUnavailable(
	t *testing.T,
) {
	// A complete, valid offline configuration.
	// These are fake credentials, not real secrets.
	env := map[string]string{
		"NODE_ENV": "test",

		"DATABASE_URL": "postgresql://fake:fake@127.0.0.1:1/offline_no_connection",

		"OTP_HMAC_SECRET": strings.Repeat("a", 64),

		"ACCESS_TOKEN_SECRET": strings.Repeat("b", 64), "ADMIN_MFA_ENCRYPTION_KEY": strings.Repeat("c", 64),

		"JWT_ISSUER":           "customer-club-tests",
		"JWT_AUDIENCE":         "customer-club-web-tests",
		"AUTH_ALLOWED_ORIGINS": "http://localhost:5173",

		"FARAZSMS_API_KEY":      "fake-sms-api-key",
		"FARAZSMS_LINE_NUMBER":  "50002178584000",
		"FARAZSMS_PATTERN_CODE": "fake-pattern",
	}

	config, err := readStartupConfig(env)

	if err != nil {
		t.Fatalf(
			"expected valid configuration, got %v",
			err,
		)
	}

	databaseFailure := errors.New(
		"synthetic PostgreSQL connection failure",
	)

	openCalls := 0

	// Fake database opener: it never opens
	// an actual PostgreSQL connection.
	openDatabase := func(
		ctx context.Context,
		gotConfig database.Config,
	) (*pgxpool.Pool, error) {
		openCalls++

		if gotConfig.URL != config.Database.URL {
			t.Fatal("unexpected database configuration")
		}

		return nil, databaseFailure
	}

	// This startup initializer does not exist yet.
	handler, cleanup, err := initializeAPI(
		context.Background(),
		config,
		openDatabase,
		&http.Client{},
	)

	if !errors.Is(err, databaseFailure) {
		t.Fatalf(
			"expected PostgreSQL failure, got %v",
			err,
		)
	}

	if openCalls != 1 {
		t.Fatalf(
			"expected one database connection attempt, got %d",
			openCalls,
		)
	}

	if handler != nil {
		t.Fatal(
			"database failure must not produce an HTTP handler",
		)
	}

	if cleanup != nil {
		t.Fatal(
			"failed initialization must not return a live cleanup function",
		)
	}
}

func TestInitializeAPIClosesPoolWhenSMSInitializationFails(
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
	}

	config, err := readStartupConfig(env)
	if err != nil {
		t.Fatalf("expected valid configuration: %v", err)
	}

	// Deliberately invalidate the already-parsed
	// SMS configuration to simulate a later
	// initialization failure.
	config.SMS = farazsms.Config{}

	pool, err := pgxpool.New(
		context.Background(),
		env["DATABASE_URL"],
	)
	if err != nil {
		t.Fatalf("failed to create offline pool: %v", err)
	}

	// pgxpool.New does not establish a connection.
	// The pool is never used for queries.
	openCalls := 0

	openDatabase := func(
		ctx context.Context,
		gotConfig database.Config,
	) (*pgxpool.Pool, error) {
		openCalls++
		return pool, nil
	}

	handler, cleanup, err := initializeAPI(
		context.Background(),
		config,
		openDatabase,
		&http.Client{},
	)

	if err == nil {
		t.Fatal("expected SMS initialization failure")
	}

	if handler != nil {
		t.Fatal("failed startup must not return handler")
	}

	if cleanup != nil {
		t.Fatal("failed startup must not return cleanup")
	}

	if openCalls != 1 {
		t.Fatalf(
			"expected one database opener call, got %d",
			openCalls,
		)
	}
}

func TestInitializeAPIClosesPoolAfterLaterStartupFailure(
	t *testing.T,
) {
	// Valid database and SMS settings,
	// but intentionally missing the OTP secret.
	config := startupConfig{
		Database: database.Config{
			URL: "postgresql://fake:fake@127.0.0.1:1/offline_no_connection",
		},
		SMS: farazsms.Config{
			APIKey:      "fake-api-key",
			LineNumber:  "fake-line",
			PatternCode: "fake-pattern",
		},
	}
	// Session configuration is valid so this still exercises the later OTP
	// initialization failure and its cleanup after sessions were introduced.
	validConfig, err := readStartupConfig(boundaryEnvironment())
	if err != nil {
		t.Fatal(err)
	}
	config.Auth = validConfig.Auth
	config.MFAKey = validConfig.MFAKey

	// Construct a pool without connecting to PostgreSQL.
	poolConfig, err := pgxpool.ParseConfig(
		config.Database.URL,
	)
	if err != nil {
		t.Fatalf("unexpected pool configuration error: %v", err)
	}

	poolConfig.MinConns = 0

	// Prevent ANY actual database connection
	// if a regression accidentally tries to acquire one.
	connectionAttempts := 0

	poolConfig.BeforeConnect = func(
		ctx context.Context,
		connConfig *pgx.ConnConfig,
	) error {
		connectionAttempts++
		return errors.New("offline test forbids database connections")
	}

	pool, err := pgxpool.NewWithConfig(
		context.Background(),
		poolConfig,
	)
	if err != nil {
		t.Fatalf("expected offline pool, got %v", err)
	}
	defer pool.Close()

	openCalls := 0

	// Fake opener returns our unconnected pool.
	openDatabase := func(
		ctx context.Context,
		gotConfig database.Config,
	) (*pgxpool.Pool, error) {
		openCalls++

		if gotConfig.URL != config.Database.URL {
			t.Fatal("unexpected database configuration")
		}

		return pool, nil
	}

	handler, cleanup, err := initializeAPI(
		context.Background(),
		config,
		openDatabase,
		&http.Client{},
	)

	// The invalid OTP configuration must prevent startup.
	if err == nil {
		t.Fatal("expected OTP initialization to fail")
	}

	if openCalls != 1 {
		t.Fatalf(
			"expected one database opener call, got %d",
			openCalls,
		)
	}

	if handler != nil {
		t.Fatal("failed startup must not return an HTTP handler")
	}

	if cleanup != nil {
		t.Fatal("failed startup must not return a cleanup function")
	}

	// A closed pool rejects acquisition immediately.
	// A connection attempt is also blocked by BeforeConnect.
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
		!strings.Contains(acquireErr.Error(), "closed pool") {
		t.Fatalf(
			"expected PostgreSQL pool to be closed, got %v",
			acquireErr,
		)
	}

	if connectionAttempts != 0 {
		t.Fatal("offline test must not attempt a database connection")
	}
}

func TestInitializeAPIReturnsHandlerAndCleanup(
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
	}

	config, err := readStartupConfig(env)
	if err != nil {
		t.Fatalf(
			"expected valid configuration, got %v",
			err,
		)
	}

	// Create a PostgreSQL pool object without
	// connecting to a real database.
	poolConfig, err := pgxpool.ParseConfig(
		config.Database.URL,
	)
	if err != nil {
		t.Fatalf("invalid test pool configuration: %v", err)
	}

	poolConfig.MinConns = 0

	connectionAttempts := 0

	// Prevent accidental database connections.
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

	openDatabase := func(
		ctx context.Context,
		gotConfig database.Config,
	) (*pgxpool.Pool, error) {
		openCalls++

		if gotConfig.URL != config.Database.URL {
			t.Fatal("unexpected database configuration")
		}

		return pool, nil
	}

	handler, cleanup, err := initializeAPI(
		context.Background(),
		config,
		openDatabase,
		&http.Client{},
	)

	if err != nil {
		t.Fatalf(
			"expected successful initialization, got %v",
			err,
		)
	}

	if handler == nil {
		t.Fatal("expected HTTP handler")
	}

	if cleanup == nil {
		t.Fatal("expected database cleanup function")
	}

	if openCalls != 1 {
		t.Fatalf(
			"expected one database opener call, got %d",
			openCalls,
		)
	}

	// Verify that the initialized HTTP router works.
	req := httptest.NewRequest(
		http.MethodGet,
		"/health",
		nil,
	)

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf(
			"expected health HTTP 200, got %d: %s",
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

	// The caller owns cleanup after successful
	// initialization.
	cleanup()

	// A closed pool must reject new acquisitions.
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
		!strings.Contains(acquireErr.Error(), "closed pool") {
		t.Fatalf(
			"expected closed PostgreSQL pool, got %v",
			acquireErr,
		)
	}

	if connectionAttempts != 0 {
		t.Fatalf(
			"expected no database connections, got %d",
			connectionAttempts,
		)
	}
}
