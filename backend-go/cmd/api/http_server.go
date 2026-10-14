package main

import (
	"context"
	"errors"
	"net"
	"net/http"
	"time"
)

// serveHTTP stops accepting connections and drains requests before the caller
// closes dependencies. A separate shutdown context survives signal cancellation.
func serveHTTP(ctx context.Context, address string, handler http.Handler) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	server := newHTTPServer(address, handler)
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return err
	}
	return serveHTTPListener(ctx, server, listener)
}

// serveHTTPListener owns the accepted HTTP connections as well as the listener.
func serveHTTPListener(ctx context.Context, server *http.Server, listener net.Listener) error {
	result := make(chan error, 1)
	go func() { result <- server.Serve(listener) }()
	var serveErr error
	serveStopped := false
	select {
	case err := <-result:
		serveErr = err
		serveStopped = true
	case <-ctx.Done():
	}
	// Serve can return after an accept failure while accepted requests are still
	// running. Every post-listen exit must drain before dependencies are closed.
	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	shutdownErr := server.Shutdown(shutdownCtx)
	if shutdownErr != nil {
		shutdownErr = errors.Join(shutdownErr, server.Close())
	}
	if !serveStopped {
		serveErr = <-result
	}
	if errors.Is(serveErr, http.ErrServerClosed) {
		serveErr = nil
	}
	return errors.Join(serveErr, shutdownErr)
}

// newHTTPServer creates the HTTP server with
// explicit security and connection timeouts.
func newHTTPServer(
	address string,
	handler http.Handler,
) *http.Server {
	return &http.Server{
		Addr:    address,
		Handler: handler,

		// Maximum time to receive request headers.
		ReadHeaderTimeout: 5 * time.Second,

		// Maximum time to read the entire request.
		ReadTimeout: 15 * time.Second,

		// Maximum time to write the response.
		WriteTimeout: 45 * time.Second,

		// Maximum idle keep-alive time.
		IdleTimeout: 60 * time.Second,

		// Maximum HTTP header size: 64 KiB.
		MaxHeaderBytes: 64 * 1024,
	}
}
