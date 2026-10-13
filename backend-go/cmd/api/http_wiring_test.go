package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otp"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

func TestNewAPIHandlerWiresVerifyCode(t *testing.T) {
	chargeCalls := 0
	verifyCalls := 0

	otpService := &otp.Service{
		// Test-only secret. Production must use
		// a securely configured random secret.
		Secret: make([]byte, 32),

		RandomInt: func(min, max int) (int, error) {
			t.Fatal("verification test must not generate an OTP")
			return 0, nil
		},

		RandomBytes: func(size int) ([]byte, error) {
			t.Fatal("verification test must not generate a nonce")
			return nil, nil
		},

		Reserve: func(
			ctx context.Context,
			secret []byte,
			phone string,
			codeHash string,
			nonce string,
			ttl time.Duration,
		) (otpdb.ReservedOTP, error) {
			t.Fatal("verification test must not reserve an OTP")
			return otpdb.ReservedOTP{}, nil
		},

		SendOTP: func(
			ctx context.Context,
			phone string,
			code string,
			expiresAt time.Time,
		) error {
			t.Fatal("verification test must not send SMS")
			return nil
		},

		MarkDeliveryFailed: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			t.Fatal("unexpected OTP delivery cleanup")
			return nil
		},

		Activate: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			t.Fatal("verification test must not activate an OTP")
			return nil
		},

		ChargeIP: func(
			ctx context.Context,
			secret []byte,
			ip string,
			operation string,
		) error {
			chargeCalls++

			if ip != "192.0.2.19" {
				t.Fatalf(
					"unexpected IP: %q",
					ip,
				)
			}

			if operation != "verify" {
				t.Fatalf(
					"unexpected operation: %q",
					operation,
				)
			}

			return nil
		},

		VerifyOTP: func(
			ctx context.Context,
			secret []byte,
			phone string,
			code string,
			onVerified otpdb.OnVerifiedFunc,
		) error {
			verifyCalls++

			if phone != "09121234567" {
				t.Fatalf(
					"unexpected phone: %q",
					phone,
				)
			}

			if code != "123456" {
				t.Fatalf(
					"unexpected code: %q",
					code,
				)
			}

			if onVerified == nil {
				t.Fatal(
					"expected verification proof callback",
				)
			}

			// Simulate an incorrect OTP.
			return otpdb.ErrInvalidOTP
		},
	}

	// This function does not exist yet.
	// It will assemble our HTTP dependencies.
	handler, err := newAPIHandler(otpService)

	if err != nil {
		t.Fatalf(
			"expected HTTP handler, got %v",
			err,
		)
	}

	req := httptest.NewRequest(
		http.MethodPost,
		"/auth/verify-code",
		strings.NewReader(
			`{"phone":"+98 912-123-4567","code":" 123456 "}`,
		),
	)

	req.Header.Set(
		"Content-Type",
		"application/json",
	)
	req.RemoteAddr = "192.0.2.19:52100"

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf(
			"expected HTTP 400, got %d: %s",
			recorder.Code,
			recorder.Body.String(),
		)
	}

	if chargeCalls != 1 {
		t.Fatalf(
			"expected one IP charge, got %d",
			chargeCalls,
		)
	}

	if verifyCalls != 1 {
		t.Fatalf(
			"expected one OTP verification, got %d",
			verifyCalls,
		)
	}

	if strings.Contains(
		recorder.Body.String(),
		"verificationToken",
	) {
		t.Fatal(
			"failed OTP must not expose a token",
		)
	}
}

func TestNewAPIHandlerWiresRequestCode(t *testing.T) {
	chargeCalls := 0

	otpService := &otp.Service{
		// Test-only secret.
		Secret: make([]byte, 32),

		RandomInt: func(min, max int) (int, error) {
			t.Fatal("rate-limited request must not generate OTP")
			return 0, nil
		},

		RandomBytes: func(size int) ([]byte, error) {
			t.Fatal("rate-limited request must not generate nonce")
			return nil, nil
		},

		ChargeIP: func(
			ctx context.Context,
			secret []byte,
			ip string,
			operation string,
		) error {
			chargeCalls++

			if ip != "192.0.2.19" {
				t.Fatalf("unexpected IP: %q", ip)
			}

			if operation != "request" {
				t.Fatalf(
					"expected request operation, got %q",
					operation,
				)
			}

			return &otpdb.RateLimitError{
				RetryAfter: 19,
			}
		},

		Reserve: func(
			ctx context.Context,
			secret []byte,
			phone string,
			codeHash string,
			nonce string,
			ttl time.Duration,
		) (otpdb.ReservedOTP, error) {
			t.Fatal("rate-limited request must not reserve OTP")
			return otpdb.ReservedOTP{}, nil
		},

		SendOTP: func(
			ctx context.Context,
			phone string,
			code string,
			expiresAt time.Time,
		) error {
			t.Fatal("rate-limited request must not send SMS")
			return nil
		},

		MarkDeliveryFailed: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			t.Fatal("unexpected delivery cleanup")
			return nil
		},

		Activate: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			t.Fatal("rate-limited request must not activate OTP")
			return nil
		},

		VerifyOTP: func(
			ctx context.Context,
			secret []byte,
			phone string,
			code string,
			onVerified otpdb.OnVerifiedFunc,
		) error {
			t.Fatal("request-code must not verify an OTP")
			return nil
		},
	}

	handler, err := newAPIHandler(otpService)

	if err != nil {
		t.Fatalf("expected HTTP handler, got %v", err)
	}

	req := httptest.NewRequest(
		http.MethodPost,
		"/auth/request-code",
		strings.NewReader(
			`{"phone":"+98 912-123-4567"}`,
		),
	)

	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.19:52100"

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf(
			"expected HTTP 429, got %d: %s",
			recorder.Code,
			recorder.Body.String(),
		)
	}

	if chargeCalls != 1 {
		t.Fatalf(
			"expected one request IP charge, got %d",
			chargeCalls,
		)
	}

	if recorder.Header().Get("Retry-After") != "19" {
		t.Fatalf(
			"expected Retry-After 19, got %q",
			recorder.Header().Get("Retry-After"),
		)
	}

	if recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("response must not be cached")
	}
}

func TestNewAPIHandlerRejectsMissingRequestCodeDependencies(
	t *testing.T,
) {
	// Verification dependencies are valid,
	// but OTP creation dependencies are missing.
	otpService := &otp.Service{
		Secret: make([]byte, 32),

		ChargeIP: func(
			ctx context.Context,
			secret []byte,
			ip string,
			operation string,
		) error {
			return nil
		},

		VerifyOTP: func(
			ctx context.Context,
			secret []byte,
			phone string,
			code string,
			onVerified otpdb.OnVerifiedFunc,
		) error {
			return otpdb.ErrInvalidOTP
		},

		// Deliberately missing:
		// RandomInt
		// RandomBytes
		// Reserve
		// SendOTP
		// MarkDeliveryFailed
		// Activate
	}

	handler, err := newAPIHandler(otpService)

	if err == nil {
		t.Fatal(
			"expected startup error for missing " +
				"OTP creation dependencies",
		)
	}

	if handler != nil {
		t.Fatal(
			"invalid dependencies must not " +
				"produce an HTTP handler",
		)
	}
}

func TestNewAPIHandlerWiresSuccessfulRequestCode(
	t *testing.T,
) {
	expiresAt := time.Date(
		2026, time.October, 13,
		12, 2, 0, 0, time.UTC,
	)

	var steps []string

	otpService := &otp.Service{
		// Test-only secret and deterministic randomness.
		Secret: make([]byte, 32),

		ChargeIP: func(
			ctx context.Context,
			secret []byte,
			ip string,
			operation string,
		) error {
			steps = append(steps, "charge")

			if ip != "192.0.2.19" ||
				operation != "request" {
				t.Fatalf(
					"unexpected IP charge: %q, %q",
					ip, operation,
				)
			}

			return nil
		},

		RandomInt: func(min, max int) (int, error) {
			steps = append(steps, "random-int")

			if min != 100000 || max != 1000000 {
				t.Fatal("unexpected OTP random range")
			}

			return 123456, nil
		},

		RandomBytes: func(size int) ([]byte, error) {
			steps = append(steps, "random-bytes")

			if size != 32 {
				t.Fatal("expected 32 nonce bytes")
			}

			return make([]byte, size), nil
		},

		Reserve: func(
			ctx context.Context,
			secret []byte,
			phone string,
			codeHash string,
			nonce string,
			ttl time.Duration,
		) (otpdb.ReservedOTP, error) {
			steps = append(steps, "reserve")

			if phone != "09121234567" {
				t.Fatalf(
					"unexpected phone: %q",
					phone,
				)
			}

			if ttl != 2*time.Minute {
				t.Fatalf(
					"unexpected OTP TTL: %v",
					ttl,
				)
			}

			if len(codeHash) != 64 ||
				codeHash == "123456" {
				t.Fatal("expected hashed OTP code")
			}

			if len(nonce) != 64 {
				t.Fatal("expected hexadecimal nonce")
			}

			return otpdb.ReservedOTP{
				ID:        42,
				ExpiresAt: expiresAt,
			}, nil
		},

		SendOTP: func(
			ctx context.Context,
			phone string,
			code string,
			gotExpiry time.Time,
		) error {
			steps = append(steps, "send")

			if phone != "09121234567" {
				t.Fatal("unexpected SMS recipient")
			}

			if code != "123456" {
				t.Fatal("unexpected SMS code")
			}

			if !gotExpiry.Equal(expiresAt) {
				t.Fatal("unexpected SMS expiry")
			}

			return nil
		},

		MarkDeliveryFailed: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			t.Fatal("successful delivery must not trigger cleanup")
			return nil
		},

		Activate: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			steps = append(steps, "activate")

			if phone != "09121234567" ||
				otpID != 42 {
				t.Fatal("unexpected OTP activation")
			}

			return nil
		},

		VerifyOTP: func(
			ctx context.Context,
			secret []byte,
			phone string,
			code string,
			onVerified otpdb.OnVerifiedFunc,
		) error {
			t.Fatal("request-code must not verify an OTP")
			return nil
		},
	}

	handler, err := newAPIHandler(otpService)

	if err != nil {
		t.Fatalf("expected handler, got %v", err)
	}

	req := httptest.NewRequest(
		http.MethodPost,
		"/auth/request-code",
		strings.NewReader(
			`{"phone":"+98 912-123-4567"}`,
		),
	)

	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.19:52100"

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf(
			"expected HTTP 200, got %d: %s",
			recorder.Code,
			recorder.Body.String(),
		)
	}

	expectedSteps := "charge,random-int,random-bytes,reserve,send,activate"

	if strings.Join(steps, ",") != expectedSteps {
		t.Fatalf(
			"unexpected operation order: %v",
			steps,
		)
	}

	if !strings.Contains(
		recorder.Body.String(),
		`"message":"Code sent"`,
	) {
		t.Fatal("expected Code sent response")
	}

	if strings.Contains(
		recorder.Body.String(),
		"123456",
	) {
		t.Fatal("OTP must not appear in HTTP response")
	}

	if recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("OTP response must not be cached")
	}
}
