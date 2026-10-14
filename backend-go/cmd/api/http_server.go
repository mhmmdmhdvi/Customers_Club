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
	result := make(chan error, 1)
	go func() { result <- server.Serve(listener) }()
	select {
	case err := <-result:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		shutdownErr := server.Shutdown(shutdownCtx)
		if shutdownErr != nil {
			shutdownErr = errors.Join(shutdownErr, server.Close())
		}
		serveErr := <-result
		if errors.Is(serveErr, http.ErrServerClosed) {
			serveErr = nil
		}
		return errors.Join(shutdownErr, serveErr)
	}
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
