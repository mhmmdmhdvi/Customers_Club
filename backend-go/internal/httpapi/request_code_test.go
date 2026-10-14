package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otp"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

type fakeRequestCodeService struct {
	calls int
	phone string
	ip    string
	err   error
}

func (f *fakeRequestCodeService) Create(
	ctx context.Context,
	phone string,
	ip string,
) error {
	f.calls++
	f.phone = phone
	f.ip = ip

	return f.err
}

func TestRequestCodeReturnsSuccess(t *testing.T) {
	service := &fakeRequestCodeService{}

	router := NewRouterWithDependencies(
		RouterDependencies{
			RequestCode: service,
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/auth/request-code",
		strings.NewReader(
			`{"phone":"+98 912-123-4567"}`,
		),
	)

	request.Header.Set(
		"Content-Type",
		"application/json",
	)

	// Simulate the actual connected client.
	request.RemoteAddr = "192.0.2.1:43123"

	// Untrusted forwarded headers must not
	// override the actual peer address.
	request.Header.Set(
		"X-Forwarded-For",
		"203.0.113.77",
	)

	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf(
			"expected status 200, got %d: %s",
			response.Code,
			response.Body.String(),
		)
	}

	var body struct {
		Message string `json:"message"`
	}

	if err := json.NewDecoder(
		response.Body,
	).Decode(&body); err != nil {
		t.Fatalf(
			"failed to decode response: %v",
			err,
		)
	}

	if body.Message != "Code sent" {
		t.Fatalf(
			"expected Code sent, got %q",
			body.Message,
		)
	}

	if service.calls != 1 {
		t.Fatalf(
			"expected one OTP request, got %d",
			service.calls,
		)
	}

	if service.phone != "09121234567" {
		t.Fatalf(
			"expected normalized phone, got %q",
			service.phone,
		)
	}

	if service.ip != "192.0.2.1" {
		t.Fatalf(
			"expected actual client IP, got %q",
			service.ip,
		)
	}

	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(
			"OTP response must not be cached",
		)
	}

	if response.Header().Get("X-Request-Id") == "" {
		t.Fatal(
			"expected server-generated request ID",
		)
	}

	if response.Header().Get("Content-Type") != "application/json" {
		t.Fatal(
			"expected JSON response",
		)
	}
}

func TestRequestCodeRejectsInvalidPhoneBeforeService(
	t *testing.T,
) {
	tests := []struct {
		name        string
		body        string
		wantMessage string
	}{
		{
			name:        "missing phone",
			body:        `{}`,
			wantMessage: "Phone is required",
		},
		{
			name:        "empty phone",
			body:        `{"phone":""}`,
			wantMessage: "Phone is required",
		},
		{
			name:        "null phone",
			body:        `{"phone":null}`,
			wantMessage: "Phone is required",
		},
		{
			name:        "invalid phone",
			body:        `{"phone":"12345"}`,
			wantMessage: "Invalid phone number",
		},
		{
			name:        "whitespace phone",
			body:        `{"phone":"   "}`,
			wantMessage: "Invalid phone number",
		},
		{
			name:        "numeric phone",
			body:        `{"phone":123}`,
			wantMessage: "Invalid phone number",
		},
		{
			name:        "zero phone",
			body:        `{"phone":0}`,
			wantMessage: "Phone is required",
		},
		{
			name:        "false phone",
			body:        `{"phone":false}`,
			wantMessage: "Phone is required",
		},
		{
			name:        "boolean true phone",
			body:        `{"phone":true}`,
			wantMessage: "Invalid phone number",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := &fakeRequestCodeService{}

			router := NewRouterWithDependencies(
				RouterDependencies{
					RequestCode: service,
				},
			)

			request := httptest.NewRequest(
				http.MethodPost,
				"/auth/request-code",
				strings.NewReader(tt.body),
			)

			request.Header.Set(
				"Content-Type",
				"application/json",
			)

			request.RemoteAddr =
				"192.0.2.1:43123"

			response := httptest.NewRecorder()

			router.ServeHTTP(response, request)

			if response.Code != http.StatusBadRequest {
				t.Fatalf(
					"expected HTTP 400, got %d: %s",
					response.Code,
					response.Body.String(),
				)
			}

			var result struct {
				Message string `json:"message"`
			}

			if err := json.NewDecoder(
				response.Body,
			).Decode(&result); err != nil {
				t.Fatalf(
					"failed to decode response: %v",
					err,
				)
			}

			if result.Message != tt.wantMessage {
				t.Fatalf(
					"expected message %q, got %q",
					tt.wantMessage,
					result.Message,
				)
			}

			if service.calls != 0 {
				t.Fatal(
					"invalid phone must not reach OTP service",
				)
			}

			if response.Header().Get(
				"Cache-Control",
			) != "no-store" {
				t.Fatal(
					"OTP response must not be cached",
				)
			}
		})
	}
}

func TestRequestCodeReturnsRateLimit(t *testing.T) {
	service := &fakeRequestCodeService{
		err: &otpdb.RateLimitError{
			RetryAfter: 73,
		},
	}

	router := NewRouterWithDependencies(
		RouterDependencies{
			RequestCode: service,
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/auth/request-code",
		strings.NewReader(
			`{"phone":"09121234567"}`,
		),
	)

	request.Header.Set(
		"Content-Type",
		"application/json",
	)

	request.RemoteAddr = "192.0.2.1:43123"

	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusTooManyRequests {
		t.Fatalf(
			"expected HTTP 429, got %d: %s",
			response.Code,
			response.Body.String(),
		)
	}

	if got := response.Header().Get("Retry-After"); got != "73" {
		t.Fatalf(
			"expected Retry-After 73, got %q",
			got,
		)
	}

	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf(
			"expected Cache-Control no-store, got %q",
			got,
		)
	}

	if got := response.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf(
			"expected JSON Content-Type, got %q",
			got,
		)
	}

	var body struct {
		Message string `json:"message"`
	}

	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf(
			"failed to decode response: %v",
			err,
		)
	}

	if body.Message != "Too many attempts. Try again later" {
		t.Fatalf(
			"unexpected message: %q",
			body.Message,
		)
	}

	if service.calls != 1 {
		t.Fatalf(
			"expected one service call, got %d",
			service.calls,
		)
	}
}

func TestRequestCodeHandlesServiceFailures(t *testing.T) {
	tests := []struct {
		name           string
		missingService bool
		serviceError   error
		wantStatus     int
		wantMessage    string
	}{
		{
			name:           "missing service dependency",
			missingService: true,
			wantStatus:     http.StatusServiceUnavailable,
			wantMessage:    "OTP service unavailable",
		},
		{
			name:         "OTP service unavailable",
			serviceError: otp.ErrUnavailable,
			wantStatus:   http.StatusServiceUnavailable,
			wantMessage:  "OTP service unavailable",
		},
		{
			name: "unexpected database failure",
			serviceError: errors.New(
				"private database connection failure",
			),
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "Internal server error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var service RequestCodeService
			var fake *fakeRequestCodeService

			if !tt.missingService {
				fake = &fakeRequestCodeService{
					err: tt.serviceError,
				}

				service = fake
			}

			router := NewRouterWithDependencies(
				RouterDependencies{
					RequestCode: service,
				},
			)

			request := httptest.NewRequest(
				http.MethodPost,
				"/auth/request-code",
				strings.NewReader(
					`{"phone":"09121234567"}`,
				),
			)

			request.Header.Set(
				"Content-Type",
				"application/json",
			)

			request.RemoteAddr = "192.0.2.1:43123"

			response := httptest.NewRecorder()

			router.ServeHTTP(response, request)

			if response.Code != tt.wantStatus {
				t.Fatalf(
					"expected HTTP %d, got %d: %s",
					tt.wantStatus,
					response.Code,
					response.Body.String(),
				)
			}

			var body struct {
				Message string `json:"message"`
			}

			if err := json.NewDecoder(
				response.Body,
			).Decode(&body); err != nil {
				t.Fatalf(
					"failed to decode response: %v",
					err,
				)
			}

			if body.Message != tt.wantMessage {
				t.Fatalf(
					"expected message %q, got %q",
					tt.wantMessage,
					body.Message,
				)
			}

			if response.Header().Get(
				"Cache-Control",
			) != "no-store" {
				t.Fatal(
					"authentication errors must not be cached",
				)
			}

			if fake != nil && fake.calls != 1 {
				t.Fatalf(
					"expected one service call, got %d",
					fake.calls,
				)
			}
		})
	}
}

func TestRequestCodeRejectsMalformedBodiesAndInvalidPeerIPs(
	t *testing.T,
) {
	tests := []struct {
		name        string
		body        string
		remoteAddr  string
		wantStatus  int
		wantMessage string
	}{
		{
			name:        "malformed JSON",
			body:        `{"phone":`,
			remoteAddr:  "192.0.2.1:43123",
			wantStatus:  http.StatusBadRequest,
			wantMessage: "Invalid request body",
		},
		{
			name: "multiple JSON values",
			body: `{"phone":"09121234567"}` +
				`{"phone":"09121234567"}`,
			remoteAddr:  "192.0.2.1:43123",
			wantStatus:  http.StatusBadRequest,
			wantMessage: "Invalid request body",
		},
		{
			name: "oversized JSON body",
			body: `{"phone":"` +
				strings.Repeat("9", 101*1024) +
				`"}`,
			remoteAddr:  "192.0.2.1:43123",
			wantStatus:  http.StatusRequestEntityTooLarge,
			wantMessage: "Request body too large",
		},
		{
			name:        "invalid connection IP",
			body:        `{"phone":"09121234567"}`,
			remoteAddr:  "not-an-ip:43123",
			wantStatus:  http.StatusServiceUnavailable,
			wantMessage: "OTP service unavailable",
		},
		{
			name:        "connection address missing port",
			body:        `{"phone":"09121234567"}`,
			remoteAddr:  "192.0.2.1",
			wantStatus:  http.StatusServiceUnavailable,
			wantMessage: "OTP service unavailable",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := &fakeRequestCodeService{}

			router := NewRouterWithDependencies(
				RouterDependencies{
					RequestCode: service,
				},
			)

			request := httptest.NewRequest(
				http.MethodPost,
				"/auth/request-code",
				strings.NewReader(tt.body),
			)

			request.Header.Set(
				"Content-Type",
				"application/json",
			)

			request.Header.Set(
				"X-Forwarded-For",
				"203.0.113.77",
			)

			request.RemoteAddr = tt.remoteAddr

			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)

			if response.Code != tt.wantStatus {
				t.Fatalf(
					"expected HTTP %d, got %d: %s",
					tt.wantStatus,
					response.Code,
					response.Body.String(),
				)
			}

			var result struct {
				Message string `json:"message"`
			}

			if err := json.NewDecoder(
				response.Body,
			).Decode(&result); err != nil {
				t.Fatalf(
					"could not decode response: %v",
					err,
				)
			}

			if result.Message != tt.wantMessage {
				t.Fatalf(
					"expected %q, got %q",
					tt.wantMessage,
					result.Message,
				)
			}

			if service.calls != 0 {
				t.Fatal(
					"rejected request must not reach OTP service",
				)
			}

			if response.Header().Get(
				"Cache-Control",
			) != "no-store" {
				t.Fatal(
					"OTP response must not be cached",
				)
			}
		})
	}
}
