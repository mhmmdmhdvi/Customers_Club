package httpapi

import (
	"encoding/json"
	"mime"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
)

func TestHealth(t *testing.T) {
	router := NewRouter()

	request := httptest.NewRequest(
		http.MethodGet,
		"/health",
		nil,
	)

	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf(
			"expected status %d, got %d",
			http.StatusOK,
			response.Code,
		)
	}

	contentType := response.Header().Get("Content-Type")

	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		t.Fatalf(
			"invalid Content-Type %q: %v",
			contentType,
			err,
		)
	}

	if mediaType != "application/json" {
		t.Fatalf(
			"expected application/json, got %q",
			mediaType,
		)
	}

	var body struct {
		Status  string `json:"status"`
		Service string `json:"service"`
	}

	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if body.Status != "ok" {
		t.Errorf(
			"expected status ok, got %q",
			body.Status,
		)
	}

	if body.Service != "customer-club-api" {
		t.Errorf(
			"expected service customer-club-api, got %q",
			body.Service,
		)
	}
}

func TestRouterAssignsRequestID(t *testing.T) {
	router := NewRouter()

	request := httptest.NewRequest(
		http.MethodGet,
		"/health",
		nil,
	)

	request.Header.Set(
		"X-Request-Id",
		"client-controlled-id",
	)

	response := httptest.NewRecorder()

	router.ServeHTTP(
		response,
		request,
	)

	requestID :=
		response.Header().Get(
			"X-Request-Id",
		)

	if requestID == "" {
		t.Fatal(
			"expected response request id",
		)
	}

	if requestID ==
		"client-controlled-id" {
		t.Fatal(
			"router must not trust client request id",
		)
	}

	uuidV4 := regexp.MustCompile(
		`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
	)

	if !uuidV4.MatchString(
		requestID,
	) {
		t.Fatalf(
			"expected UUID v4 request id, got %q",
			requestID,
		)
	}
}
