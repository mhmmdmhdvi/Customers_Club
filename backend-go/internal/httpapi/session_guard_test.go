package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
)

func testAuthConfig() authconfig.Config {
	return authconfig.Config{
		AllowedOrigins: []string{
			"http://localhost:5173",
		},
	}
}

func TestSessionGuardAllowsValidJSONRequest(t *testing.T) {
	nextCalled := false

	next := http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			nextCalled = true
			w.WriteHeader(http.StatusNoContent)
		},
	)

	handler := sessionGuard(
		next,
		func() (authconfig.Config, error) {
			return testAuthConfig(), nil
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/auth/login",
		strings.NewReader(`{}`),
	)

	request.Header.Set(
		"Content-Type",
		"application/json",
	)

	request.Header.Set(
		"X-CSRF-Protection",
		"1",
	)

	request.Header.Set(
		"Origin",
		"http://localhost:5173",
	)

	response := httptest.NewRecorder()

	handler.ServeHTTP(
		response,
		request,
	)

	if response.Code != http.StatusNoContent {
		t.Fatalf(
			"expected %d, got %d",
			http.StatusNoContent,
			response.Code,
		)
	}

	if !nextCalled {
		t.Fatal(
			"expected protected handler to be called",
		)
	}

	if got := response.Header().Get(
		"Cache-Control",
	); got != "no-store" {
		t.Errorf(
			"expected Cache-Control no-store, got %q",
			got,
		)
	}
}

func TestSessionGuardRejectsMissingCSRFHeader(t *testing.T) {
	nextCalled := false

	next := http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			nextCalled = true
		},
	)

	handler := sessionGuard(
		next,
		func() (authconfig.Config, error) {
			return testAuthConfig(), nil
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/auth/login",
		strings.NewReader(`{}`),
	)

	request.Header.Set(
		"Content-Type",
		"application/json",
	)

	response := httptest.NewRecorder()

	handler.ServeHTTP(
		response,
		request,
	)

	if response.Code != http.StatusForbidden {
		t.Fatalf(
			"expected %d, got %d",
			http.StatusForbidden,
			response.Code,
		)
	}

	if nextCalled {
		t.Fatal(
			"protected handler must not be called",
		)
	}
}

func TestSessionGuardRejectsUntrustedOrigin(t *testing.T) {
	nextCalled := false

	next := http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			nextCalled = true
		},
	)

	handler := sessionGuard(
		next,
		func() (authconfig.Config, error) {
			return testAuthConfig(), nil
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/auth/login",
		strings.NewReader(`{}`),
	)

	request.Header.Set(
		"Content-Type",
		"application/json",
	)

	request.Header.Set(
		"X-CSRF-Protection",
		"1",
	)

	request.Header.Set(
		"Origin",
		"https://attacker.test",
	)

	response := httptest.NewRecorder()

	handler.ServeHTTP(
		response,
		request,
	)

	if response.Code != http.StatusForbidden {
		t.Fatalf(
			"expected %d, got %d",
			http.StatusForbidden,
			response.Code,
		)
	}

	if nextCalled {
		t.Fatal(
			"protected handler must not be called",
		)
	}
}

func TestSessionGuardRejectsNonJSONRequest(t *testing.T) {
	next := http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			t.Fatal(
				"protected handler must not be called",
			)
		},
	)

	handler := sessionGuard(
		next,
		func() (authconfig.Config, error) {
			return testAuthConfig(), nil
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/auth/login",
		strings.NewReader("phone=09121234567"),
	)

	request.Header.Set(
		"Content-Type",
		"application/x-www-form-urlencoded",
	)

	request.Header.Set(
		"X-CSRF-Protection",
		"1",
	)

	response := httptest.NewRecorder()

	handler.ServeHTTP(
		response,
		request,
	)

	if response.Code != http.StatusUnsupportedMediaType {
		t.Fatalf(
			"expected %d, got %d",
			http.StatusUnsupportedMediaType,
			response.Code,
		)
	}
}
