package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequestIDMiddleware(t *testing.T) {
	const generatedID = "2bcf5c08-48b9-44a3-9a09-b28101be5bfd"

	var receivedRequestID string

	next := http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			receivedRequestID =
				RequestIDFromContext(r.Context())

			w.WriteHeader(http.StatusOK)
		},
	)

	handler := requestIDMiddleware(
		next,
		func() string {
			return generatedID
		},
	)

	request := httptest.NewRequest(
		http.MethodGet,
		"/health",
		nil,
	)

	request.Header.Set(
		"X-Request-Id",
		"attacker-controlled-id",
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(
		response,
		request,
	)

	if response.Code != http.StatusOK {
		t.Fatalf(
			"expected status %d, got %d",
			http.StatusOK,
			response.Code,
		)
	}

	if receivedRequestID != generatedID {
		t.Errorf(
			"expected request context id %q, got %q",
			generatedID,
			receivedRequestID,
		)
	}

	if got := response.Header().Get(
		"X-Request-Id",
	); got != generatedID {
		t.Errorf(
			"expected response request id %q, got %q",
			generatedID,
			got,
		)
	}

	if receivedRequestID ==
		"attacker-controlled-id" {
		t.Error(
			"client-supplied request id must not be trusted",
		)
	}
}

func TestNestedRequestIDMiddlewarePreservesServerGeneratedID(t *testing.T) {
	var receivedID string
	inner := requestIDMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedID = RequestIDFromContext(r.Context())
	}), func() string { return "inner-generated" })
	outer := requestIDMiddleware(inner, func() string { return "outer-generated" })
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/health", nil)
	r.Header.Set("X-Request-Id", "client-controlled")
	outer.ServeHTTP(w, r)
	if receivedID != "outer-generated" || w.Header().Get("X-Request-Id") != "outer-generated" {
		t.Fatalf("middleware replaced the server request ID: context=%q header=%q", receivedID, w.Header().Get("X-Request-Id"))
	}
}
