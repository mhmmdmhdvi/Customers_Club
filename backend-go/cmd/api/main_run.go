package main

import (
	"context"
	"errors"
	"net/http"
)

// serveAPIFunc describes a function that starts
// an HTTP server with the supplied handler.
type serveAPIFunc func(
	ctx context.Context,
	address string,
	handler http.Handler,
) error

// runAPI coordinates the application startup.
//
// It validates configuration, initializes the
// API dependencies, and starts the HTTP server.
func runAPI(
	ctx context.Context,
	env map[string]string,
	openDatabase databaseOpenFunc,
	httpClient *http.Client,
	serve serveAPIFunc,
) error {
	// A missing HTTP server function must
	// never result in successful startup.
	if serve == nil {
		return errors.New(
			"HTTP server unavailable",
		)
	}

	// Step 1: Validate environment configuration.
	config, err := readStartupConfig(env)
	if err != nil {
		return err
	}

	// Step 2: Initialize PostgreSQL, FarazSMS,
	// and the database-backed OTP HTTP API.
	handler, cleanup, err := initializeAPI(
		ctx,
		config,
		openDatabase,
		httpClient,
	)
	if err != nil {
		return err
	}

	// Step 3: Ensure PostgreSQL resources
	// are released when the server stops.
	defer cleanup()

	// Step 4: Determine the listening port.
	port := env["PORT"]
	if port == "" {
		port = "3000"
	}

	address := ":" + port

	// Step 5: Start serving HTTP only after
	// all required dependencies are ready.
	return serve(
		ctx,
		address,
		handler,
	)
}
