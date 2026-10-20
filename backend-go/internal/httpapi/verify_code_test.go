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

type fakeVerifyCodeService struct {
	calls  int
	phone  string
	code   string
	ip     string
	result VerifyCodeResult
	err    error
}

func (f *fakeVerifyCodeService) VerifyPhone(
	ctx context.Context,
	phone string,
	code string,
	ip string,
) (VerifyCodeResult, error) {
	f.calls++
	f.phone = phone
	f.code = code
	f.ip = ip

	return f.result, f.err
}

func TestVerifyCodeReturnsRegistrationProof(t *testing.T) {
	token := strings.Repeat("a", 64)
	expiresAt := "2026-10-13T08:00:00.000Z"

	service := &fakeVerifyCodeService{
		result: VerifyCodeResult{
			NextStep:              "REGISTER",
			Authenticated:         false,
			VerificationToken:     token,
			VerificationExpiresAt: expiresAt,
		},
	}

	router := NewRouterWithDependencies(
		RouterDependencies{
			VerifyCode: service,
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/auth/verify-code",
		strings.NewReader(
			`{"phone":"+98 912-123-4567","code":" 123456 "}`,
		),
	)

	request.Header.Set(
		"Content-Type",
		"application/json",
	)

	request.RemoteAddr = "192.0.2.1:43123"

	// Ignore untrusted forwarded client IPs.
	request.Header.Set(
		"X-Forwarded-For",
		"203.0.113.77",
	)

	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf(
			"expected HTTP 200, got %d: %s",
			response.Code,
			response.Body.String(),
		)
	}

	var body struct {
		Message               string `json:"message"`
		NextStep              string `json:"nextStep"`
		Authenticated         *bool  `json:"authenticated"`
		VerificationToken     string `json:"verificationToken"`
		VerificationExpiresAt string `json:"verificationExpiresAt"`
	}

	if err := json.NewDecoder(
		response.Body,
	).Decode(&body); err != nil {
		t.Fatalf("invalid response JSON: %v", err)
	}

	if body.Message != "OTP verified" {
		t.Fatalf(
			"unexpected message: %q",
			body.Message,
		)
	}

	if body.NextStep != "REGISTER" {
		t.Fatalf(
			"expected REGISTER, got %q",
			body.NextStep,
		)
	}

	if body.Authenticated == nil ||
		*body.Authenticated {
		t.Fatal(
			"OTP proof must explicitly return authenticated=false",
		)
	}

	if body.VerificationToken != token {
		t.Fatal("unexpected verification token")
	}

	if body.VerificationExpiresAt != expiresAt {
		t.Fatal("unexpected proof expiry")
	}

	if service.calls != 1 {
		t.Fatalf(
			"expected one verification call, got %d",
			service.calls,
		)
	}

	if service.phone != "09121234567" {
		t.Fatalf(
			"unexpected normalized phone: %q",
			service.phone,
		)
	}

	if service.code != "123456" {
		t.Fatalf(
			"unexpected trimmed code: %q",
			service.code,
		)
	}

	if service.ip != "192.0.2.1" {
		t.Fatalf(
			"unexpected connection IP: %q",
			service.ip,
		)
	}

	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("verification response must not be cached")
	}

	if response.Header().Get("Content-Type") != "application/json" {
		t.Fatal("expected JSON response")
	}

	if response.Header().Get("X-Request-Id") == "" {
		t.Fatal("expected request ID")
	}
}

func TestVerifyCodeRejectsInvalidInputsBeforeService(
	t *testing.T,
) {
	tests := []struct {
		name        string
		body        string
		wantMessage string
	}{
		{
			name:        "missing phone",
			body:        `{"code":"123456"}`,
			wantMessage: "Phone is required",
		},
		{
			name:        "null phone",
			body:        `{"phone":null,"code":"123456"}`,
			wantMessage: "Phone is required",
		},
		{
			name:        "numeric phone",
			body:        `{"phone":123,"code":"123456"}`,
			wantMessage: "Invalid phone number",
		},
		{
			name:        "invalid phone",
			body:        `{"phone":"12345","code":"123456"}`,
			wantMessage: "Invalid phone number",
		},
		{
			name:        "missing code",
			body:        `{"phone":"09121234567"}`,
			wantMessage: "Code is required",
		},
		{
			name:        "null code",
			body:        `{"phone":"09121234567","code":null}`,
			wantMessage: "Code is required",
		},
		{
			name:        "numeric code",
			body:        `{"phone":"09121234567","code":123456}`,
			wantMessage: "Code must contain exactly 6 digits",
		},
		{
			name:        "short code",
			body:        `{"phone":"09121234567","code":"12345"}`,
			wantMessage: "Code must contain exactly 6 digits",
		},
		{
			name:        "non-digit code",
			body:        `{"phone":"09121234567","code":"12a456"}`,
			wantMessage: "Code must contain exactly 6 digits",
		},
		{
			name:        "whitespace code",
			body:        `{"phone":"09121234567","code":"   "}`,
			wantMessage: "Code must contain exactly 6 digits",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := &fakeVerifyCodeService{}

			router := NewRouterWithDependencies(
				RouterDependencies{
					VerifyCode: service,
				},
			)

			request := httptest.NewRequest(
				http.MethodPost,
				"/auth/verify-code",
				strings.NewReader(tt.body),
			)

			request.Header.Set(
				"Content-Type",
				"application/json",
			)

			request.RemoteAddr = "192.0.2.1:43123"

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
					"invalid request must not reach verification service",
				)
			}

			if response.Header().Get(
				"Cache-Control",
			) != "no-store" {
				t.Fatal(
					"verification response must not be cached",
				)
			}
		})
	}
}

func TestVerifyCodeMapsServiceErrors(t *testing.T) {
	tests := []struct {
		name           string
		serviceError   error
		missingService bool
		wantStatus     int
		wantMessage    string
		wantRetryAfter string
	}{
		{
			name:         "invalid OTP",
			serviceError: otpdb.ErrInvalidOTP,
			wantStatus:   http.StatusBadRequest,
			wantMessage:  "Invalid OTP",
		},
		{
			name:         "expired OTP",
			serviceError: otpdb.ErrOTPExpired,
			wantStatus:   http.StatusBadRequest,
			wantMessage:  "OTP expired",
		},
		{
			name: "rate limited",
			serviceError: &otpdb.RateLimitError{
				RetryAfter: 73,
			},
			wantStatus:     http.StatusTooManyRequests,
			wantMessage:    "Too many attempts. Try again later",
			wantRetryAfter: "73",
		},
		{
			name:         "invalid code from service",
			serviceError: otp.ErrInvalidCode,
			wantStatus:   http.StatusBadRequest,
			wantMessage:  "Code must contain exactly 6 digits",
		},
		{
			name:         "OTP unavailable",
			serviceError: otp.ErrUnavailable,
			wantStatus:   http.StatusServiceUnavailable,
			wantMessage:  "OTP service unavailable",
		},
		{
			name:           "missing service",
			missingService: true,
			wantStatus:     http.StatusServiceUnavailable,
			wantMessage:    "OTP service unavailable",
		},
		{
			name: "unexpected internal failure",
			serviceError: errors.New(
				"private database failure details",
			),
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "Internal server error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var service VerifyCodeService
			var fake *fakeVerifyCodeService

			if !tt.missingService {
				fake = &fakeVerifyCodeService{
					err: tt.serviceError,
				}

				service = fake
			}

			router := NewRouterWithDependencies(
				RouterDependencies{
					VerifyCode: service,
				},
			)

			request := httptest.NewRequest(
				http.MethodPost,
				"/auth/verify-code",
				strings.NewReader(
					`{"phone":"09121234567","code":"123456"}`,
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
					"invalid response JSON: %v",
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

			if got := response.Header().Get(
				"Retry-After",
			); got != tt.wantRetryAfter {
				t.Fatalf(
					"expected Retry-After %q, got %q",
					tt.wantRetryAfter,
					got,
				)
			}

			if response.Header().Get(
				"Cache-Control",
			) != "no-store" {
				t.Fatal(
					"verification errors must not be cached",
				)
			}

			if fake != nil && fake.calls != 1 {
				t.Fatalf(
					"expected one service call, got %d",
					fake.calls,
				)
			}

			if strings.Contains(
				response.Body.String(),
				"private database",
			) {
				t.Fatal(
					"internal error details leaked to client",
				)
			}
		})
	}
}
