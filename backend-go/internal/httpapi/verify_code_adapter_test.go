package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/phoneverification"
)

type fakePhoneProofVerifier struct {
	calls    int
	gotPhone string
	gotCode  string
	gotIP    string
}

func (f *fakePhoneProofVerifier) VerifyPhone(
	ctx context.Context,
	phone string,
	code string,
	ip string,
) (phoneverification.VerificationResult, error) {
	f.calls++
	f.gotPhone = phone
	f.gotCode = code
	f.gotIP = ip

	return phoneverification.VerificationResult{
		NextStep:              "REGISTER",
		Authenticated:         false,
		VerificationToken:     strings.Repeat("a", 64),
		VerificationExpiresAt: "2026-10-13T12:05:00.000Z",
	}, nil
}

func TestVerifyCodeAdapterConnectsPhoneVerificationToHTTP(
	t *testing.T,
) {
	verifier := &fakePhoneProofVerifier{}

	router := NewRouterWithDependencies(
		RouterDependencies{
			VerifyCode: NewVerifyCodeAdapter(verifier),
		},
	)

	body := strings.NewReader(
		`{"phone":"+98 912-123-4567","code":" 123456 "}`,
	)

	req := httptest.NewRequest(
		http.MethodPost,
		"/auth/verify-code",
		body,
	)

	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.7:54400"

	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf(
			"expected HTTP 200, got %d: %s",
			recorder.Code,
			recorder.Body.String(),
		)
	}

	if verifier.calls != 1 {
		t.Fatalf(
			"expected one verification call, got %d",
			verifier.calls,
		)
	}

	if verifier.gotPhone != "09121234567" {
		t.Fatalf(
			"unexpected normalized phone: %q",
			verifier.gotPhone,
		)
	}

	if verifier.gotCode != "123456" {
		t.Fatalf(
			"unexpected OTP code: %q",
			verifier.gotCode,
		)
	}

	if verifier.gotIP != "192.0.2.7" {
		t.Fatalf(
			"unexpected client IP: %q",
			verifier.gotIP,
		)
	}

	var response map[string]any

	if err := json.Unmarshal(
		recorder.Body.Bytes(),
		&response,
	); err != nil {
		t.Fatalf(
			"expected valid JSON response: %v",
			err,
		)
	}

	if response["message"] != "OTP verified" {
		t.Fatal("unexpected success message")
	}

	if response["nextStep"] != "REGISTER" {
		t.Fatal("expected REGISTER next step")
	}

	if response["authenticated"] != false {
		t.Fatal(
			"phone verification must not create a session",
		)
	}

	if response["verificationToken"] !=
		strings.Repeat("a", 64) {
		t.Fatal("unexpected verification token")
	}

	if response["verificationExpiresAt"] !=
		"2026-10-13T12:05:00.000Z" {
		t.Fatal("unexpected verification expiry")
	}

	if recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(
			"verification responses must not be cached",
		)
	}
}

type failingPhoneProofVerifier struct {
	calls int
}

func (f *failingPhoneProofVerifier) VerifyPhone(
	ctx context.Context,
	phone string,
	code string,
	ip string,
) (phoneverification.VerificationResult, error) {
	f.calls++

	// Deliberately return proof data AND an error.
	// The adapter must never expose this proof.
	return phoneverification.VerificationResult{
		NextStep:              "LOGIN",
		Authenticated:         false,
		VerificationToken:     strings.Repeat("a", 64),
		VerificationExpiresAt: "2026-10-13T12:05:00.000Z",
	}, otpdb.ErrInvalidOTP
}

func TestVerifyCodeAdapterDoesNotExposeProofOnError(
	t *testing.T,
) {
	verifier := &failingPhoneProofVerifier{}

	router := NewRouterWithDependencies(
		RouterDependencies{
			VerifyCode: NewVerifyCodeAdapter(verifier),
		},
	)

	req := httptest.NewRequest(
		http.MethodPost,
		"/auth/verify-code",
		strings.NewReader(
			`{"phone":"09121234567","code":"123456"}`,
		),
	)

	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.7:54400"

	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf(
			"expected HTTP 400, got %d: %s",
			recorder.Code,
			recorder.Body.String(),
		)
	}

	if verifier.calls != 1 {
		t.Fatalf(
			"expected one verification call, got %d",
			verifier.calls,
		)
	}

	var response map[string]any

	if err := json.Unmarshal(
		recorder.Body.Bytes(),
		&response,
	); err != nil {
		t.Fatalf(
			"expected valid error JSON: %v",
			err,
		)
	}

	if _, exists := response["verificationToken"]; exists {
		t.Fatal(
			"invalid OTP must not expose verification token",
		)
	}

	if _, exists := response["verificationExpiresAt"]; exists {
		t.Fatal(
			"invalid OTP must not expose proof expiry",
		)
	}

	if _, exists := response["nextStep"]; exists {
		t.Fatal(
			"invalid OTP must not expose LOGIN or REGISTER",
		)
	}

	if strings.Contains(
		recorder.Body.String(),
		strings.Repeat("a", 64),
	) {
		t.Fatal(
			"raw verification token leaked into response",
		)
	}

	if recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(
			"error responses must not be cached",
		)
	}
}
