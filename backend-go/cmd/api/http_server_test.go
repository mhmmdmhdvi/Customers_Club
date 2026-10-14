package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNewHTTPServerConfiguresSafeTimeouts(
	t *testing.T,
) {
	// A simple fake handler. No network listener
	// or PostgreSQL connection is required.
	handler := http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		},
	)

	// This constructor does not exist yet.
	server := newHTTPServer(":3001", handler)

	if server == nil {
		t.Fatal("expected HTTP server")
	}

	if server.Addr != ":3001" {
		t.Fatalf(
			"expected address :3001, got %q",
			server.Addr,
		)
	}

	// Ensure the supplied handler is connected.
	if server.Handler == nil {
		t.Fatal("expected HTTP handler")
	}

	req := httptest.NewRequest(
		http.MethodGet,
		"/health",
		nil,
	)

	recorder := httptest.NewRecorder()
	server.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf(
			"expected HTTP 204, got %d",
			recorder.Code,
		)
	}

	// Require bounded request-header reading.
	if server.ReadHeaderTimeout <= 0 ||
		server.ReadHeaderTimeout > 10*time.Second {
		t.Fatal("expected bounded header timeout")
	}

	// Require bounded request-body reading.
	if server.ReadTimeout <= 0 ||
		server.ReadTimeout > 30*time.Second {
		t.Fatal("expected bounded read timeout")
	}

	// Require bounded response writing.
	if server.WriteTimeout <= 0 ||
		server.WriteTimeout > 60*time.Second {
		t.Fatal("expected bounded write timeout")
	}

	// Require bounded idle connections.
	if server.IdleTimeout <= 0 ||
		server.IdleTimeout > 2*time.Minute {
		t.Fatal("expected bounded idle timeout")
	}

	// Explicitly limit HTTP request headers.
	if server.MaxHeaderBytes <= 0 ||
		server.MaxHeaderBytes > 1024*1024 {
		t.Fatal("expected bounded header size")
	}
}
