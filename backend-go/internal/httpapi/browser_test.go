package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
)

func TestBrowserPolicyExactCredentialedOrigins(t *testing.T) {
	for _, tc := range []struct {
		name    string
		origins []string
		status  int
	}{
		{"allowed", []string{"https://club.example"}, 200},
		{"no origin", nil, 200},
		{"lookalike", []string{"https://club.example.evil"}, 403},
		{"null", []string{"null"}, 403},
		{"case differs", []string{"https://CLUB.example"}, 403},
		{"trailing slash", []string{"https://club.example/"}, 403},
		{"duplicate", []string{"https://club.example", "https://club.example"}, 403},
		{"empty", []string{""}, 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			called := false
			h := WithBrowserPolicy(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true; w.WriteHeader(200) }), authconfig.Config{AllowedOrigins: []string{"https://club.example"}})
			r := httptest.NewRequest("GET", "/health", nil)
			for _, origin := range tc.origins {
				r.Header.Add("Origin", origin)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tc.status || called != (tc.status == 200) {
				t.Fatalf("origin dispatched incorrectly: %d called=%v", w.Code, called)
			}
			allow := w.Header().Get("Access-Control-Allow-Origin")
			if tc.name == "allowed" {
				if allow != tc.origins[0] || w.Header().Get("Access-Control-Allow-Credentials") != "true" {
					t.Fatal("missing exact credentialed CORS")
				}
			} else if allow != "" {
				t.Fatalf("unexpected CORS grant: %q", allow)
			}
			if !strings.Contains(w.Header().Get("Vary"), "Origin") {
				t.Fatal("responses must vary by Origin, including rejections")
			}
			if w.Header().Get("X-Content-Type-Options") != "nosniff" || w.Header().Get("X-Frame-Options") != "SAMEORIGIN" || w.Header().Get("Referrer-Policy") != "no-referrer" || w.Header().Get("X-Request-Id") == "" {
				t.Fatal("missing security headers or request ID")
			}
			if tc.status != 200 && !json.Valid(w.Body.Bytes()) {
				t.Fatal("rejection is not JSON")
			}
		})
	}
}

func TestBrowserPolicyPreflight(t *testing.T) {
	for _, tc := range []struct {
		method, headers string
		status          int
	}{
		{"POST", "content-type, X-CSRF-Protection, authorization", 204},
		{"PATCH", "", 204}, {"GET", "", 204}, {"OPTIONS", "", 204},
		{"DELETE", "", 403}, {"POST", "X-Untrusted", 403}, {"POST", "Content-Type,", 403},
	} {
		t.Run(tc.method+tc.headers, func(t *testing.T) {
			h := WithBrowserPolicy(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Error("preflight reached business handler") }), authconfig.Config{AllowedOrigins: []string{"https://club.example"}})
			r := httptest.NewRequest("OPTIONS", "/auth/request-code", nil)
			r.Header.Set("Origin", "https://club.example")
			r.Header.Set("Access-Control-Request-Method", tc.method)
			if tc.headers != "" {
				r.Header.Set("Access-Control-Request-Headers", tc.headers)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("status %d, want %d", w.Code, tc.status)
			}
			if tc.status == 204 {
				for key, value := range map[string]string{
					"Access-Control-Allow-Methods":  "GET,POST,PATCH,OPTIONS",
					"Access-Control-Allow-Headers":  "Content-Type,Authorization,X-CSRF-Protection",
					"Access-Control-Max-Age":        "600",
					"Access-Control-Expose-Headers": "X-Request-Id",
				} {
					if w.Header().Get(key) != value {
						t.Fatalf("%s: %q", key, w.Header().Get(key))
					}
				}
				if w.Body.Len() != 0 {
					t.Fatal("204 body must be empty")
				}
			} else if !json.Valid(w.Body.Bytes()) {
				t.Fatal("invalid preflight error JSON")
			}
		})
	}
}

func TestBrowserPolicyBoundsAndPropagatesRequestContext(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	for _, requestCtx := range []context.Context{context.Background(), ctx} {
		var seen context.Context
		h := WithBrowserPolicy(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			seen = r.Context()
			deadline, ok := seen.Deadline()
			if !ok || time.Until(deadline) > 30*time.Second {
				t.Error("unbounded request context")
			}
			if parentDeadline, ok := requestCtx.Deadline(); ok && deadline.After(parentDeadline) {
				t.Error("extended parent deadline")
			}
			if RequestIDFromContext(seen) == "" {
				t.Error("request ID not propagated")
			}
		}), authconfig.Config{AllowedOrigins: []string{"https://club.example"}})
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/health", nil).WithContext(requestCtx))
		if !errorsIsCanceled(seen) {
			t.Error("request context not released after response")
		}
	}
}

func errorsIsCanceled(ctx context.Context) bool { return ctx.Err() == context.Canceled }

func TestRouterUsesJSONForRoutingErrors(t *testing.T) {
	for _, tc := range []struct {
		method, path string
		status       int
	}{{"GET", "/missing", 404}, {"GET", "/auth/request-code", 405}, {"POST", "/health", 405}} {
		w := httptest.NewRecorder()
		NewRouter().ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
		if w.Code != tc.status || w.Header().Get("Content-Type") != "application/json" || !json.Valid(w.Body.Bytes()) {
			t.Fatalf("routing error must be JSON: %d %s", w.Code, w.Body.String())
		}
		if tc.status == 405 && w.Header().Get("Allow") == "" {
			t.Fatal("405 must advertise allowed methods")
		}
	}
}
