package main

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/database"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/farazsms"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/httpapi"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/session"
)

// databaseOpenFunc describes how to open
// and verify a PostgreSQL connection pool.
type databaseOpenFunc func(
	ctx context.Context,
	config database.Config,
) (*pgxpool.Pool, error)

// initializeAPI assembles the real dependencies
// required by our Go HTTP API.
//
// It returns:
// 1. The HTTP handler.
// 2. A cleanup function for database resources.
// 3. An error if initialization fails.
func initializeAPI(
	ctx context.Context,
	config startupConfig,
	openDatabase databaseOpenFunc,
	httpClient *http.Client,
) (http.Handler, func(), error) {
	// Fail before opening connections if
	// required initialization functions
	// or the HTTP client are missing.
	if openDatabase == nil || httpClient == nil {
		return nil, nil, errors.New(
			"API initialization dependencies unavailable",
		)
	}

	// Step 1: Open and check PostgreSQL.
	startupCtx, cancelStartup := context.WithTimeout(ctx, 10*time.Second)
	defer cancelStartup()
	pool, err := openDatabase(
		startupCtx,
		config.Database,
	)

	if err != nil {
		// Defensive cleanup if an opener returns
		// both a pool and an error.
		if pool != nil {
			pool.Close()
		}

		return nil, nil, err
	}

	if pool == nil {
		return nil, nil, errors.New(
			"database pool unavailable",
		)
	}

	// Step 2: Initialize FarazSMS.
	// Constructing the sender does not send SMS.
	sender, err := farazsms.NewSender(
		config.SMS,
		httpClient,
	)

	if err != nil {
		pool.Close()
		return nil, nil, err
	}

	// Step 3: Adapt the PostgreSQL pool
	// into our OTP transaction provider.
	begin := otpdb.BeginFromPool(pool)
	sessionService, err := session.New(pool, config.Auth, config.MFAKey)
	if err != nil {
		pool.Close()
		return nil, nil, err
	}

	// Step 4: Build the database-backed
	// OTP HTTP API.
	handler, err := newDatabaseAPIHandler(
		config.OTP.Secret,
		begin,
		sender.SendOTP,
		httpapi.RouterDependencies{Session: sessionService, Auth: config.Auth},
	)

	if err != nil {
		pool.Close()
		return nil, nil, err
	}

	// The caller owns cleanup after success.
	return httpapi.WithBrowserPolicy(handler, config.Auth), pool.Close, nil
}
