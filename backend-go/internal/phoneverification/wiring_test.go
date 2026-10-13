package phoneverification

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otp"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

func TestNewOTPBackedServiceDelegatesVerification(t *testing.T) {
	failure := errors.New(
		"synthetic OTP verification failure",
	)

	chargeCalls := 0
	verifyCalls := 0

	otpService := &otp.Service{
		Secret: make([]byte, 32),

		ChargeIP: func(
			ctx context.Context,
			secret []byte,
			ip string,
			operation string,
		) error {
			chargeCalls++

			if ip != "192.0.2.1" {
				t.Fatalf("unexpected IP: %q", ip)
			}

			if operation != "verify" {
				t.Fatalf(
					"expected verify operation, got %q",
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
				t.Fatalf("unexpected phone: %q", phone)
			}

			if code != "123456" {
				t.Fatalf("unexpected code: %q", code)
			}

			if onVerified == nil {
				t.Fatal(
					"expected proof creation callback",
				)
			}

			return failure
		},
	}

	service := NewOTPBackedService(otpService)

	if service == nil {
		t.Fatal("expected phone-verification service")
	}

	if service.GenerateToken == nil ||
		service.VerifyOTP == nil ||
		service.StoreProof == nil {
		t.Fatal("expected all dependencies to be wired")
	}

	result, err := service.VerifyPhone(
		context.Background(),
		"+98 912-123-4567",
		" 123456 ",
		"::ffff:192.0.2.1",
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected OTP verification failure, got %v",
			err,
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

	if result != (VerificationResult{}) {
		t.Fatal(
			"failed verification must not return proof data",
		)
	}
}

type proofCallbackTx struct {
	otpdb.Transaction
	store *fakeProofStore
}

func (f *proofCallbackTx) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	return f.store.QueryRow(ctx, sql, args...)
}

func (f *proofCallbackTx) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	return f.store.Exec(ctx, sql, args...)
}

func TestNewOTPBackedServiceCreatesRegistrationProof(
	t *testing.T,
) {
	now := time.Date(
		2026, time.October, 13,
		12, 0, 0, 0, time.UTC,
	)

	store := &fakeProofStore{}

	tx := &proofCallbackTx{
		store: store,
	}

	chargeCalled := false
	verifyCalled := false

	otpService := &otp.Service{
		Secret: make([]byte, 32),

		ChargeIP: func(
			ctx context.Context,
			secret []byte,
			ip string,
			operation string,
		) error {
			chargeCalled = true

			if ip != "192.0.2.1" {
				t.Fatalf("unexpected IP: %q", ip)
			}

			if operation != "verify" {
				t.Fatalf(
					"expected verify operation, got %q",
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
			verifyCalled = true

			if !chargeCalled {
				t.Fatal("IP charging must happen first")
			}

			if phone != "09121234567" {
				t.Fatalf("unexpected phone: %q", phone)
			}

			if code != "123456" {
				t.Fatalf("unexpected code: %q", code)
			}

			if onVerified == nil {
				t.Fatal("expected proof callback")
			}

			// Simulate successful OTP verification.
			return onVerified(ctx, tx, now)
		},
	}

	service := NewOTPBackedService(otpService)

	if service == nil {
		t.Fatal("expected phone-verification service")
	}

	result, err := service.VerifyPhone(
		context.Background(),
		"+98 912-123-4567",
		" 123456 ",
		"::ffff:192.0.2.1",
	)

	if err != nil {
		t.Fatalf(
			"expected successful verification, got %v",
			err,
		)
	}

	if !chargeCalled || !verifyCalled {
		t.Fatal("expected IP charging and OTP verification")
	}

	if result.NextStep != "REGISTER" {
		t.Fatalf(
			"expected REGISTER, got %q",
			result.NextStep,
		)
	}

	if result.Authenticated {
		t.Fatal("proof must not authenticate the user")
	}

	if len(result.VerificationToken) != 64 {
		t.Fatal("expected 64-character verification token")
	}

	if _, err := hex.DecodeString(
		result.VerificationToken,
	); err != nil {
		t.Fatalf("expected hexadecimal token: %v", err)
	}

	if result.VerificationExpiresAt !=
		"2026-10-13T12:05:00.000Z" {
		t.Fatalf(
			"unexpected proof expiry: %q",
			result.VerificationExpiresAt,
		)
	}

	if store.lookups != 1 || store.inserts != 1 {
		t.Fatalf(
			"expected one lookup and insertion, got %d and %d",
			store.lookups,
			store.inserts,
		)
	}

	if len(store.insertArgs) != 4 {
		t.Fatalf(
			"expected four insert arguments, got %d",
			len(store.insertArgs),
		)
	}

	if store.insertArgs[0] != "09121234567" {
		t.Fatal("unexpected stored phone")
	}

	if store.insertArgs[2] != "REGISTER" {
		t.Fatal("expected REGISTER proof in database")
	}

	// Confirm only the token's hash is stored.
	digest := sha256.Sum256(
		[]byte(result.VerificationToken),
	)

	expectedHash := hex.EncodeToString(digest[:])

	if store.insertArgs[1] != expectedHash {
		t.Fatal("expected SHA-256 token hash in database")
	}

	if store.insertArgs[1] == result.VerificationToken {
		t.Fatal("raw verification token must not be stored")
	}

	expiry, ok := store.insertArgs[3].(time.Time)

	if !ok || !expiry.Equal(
		now.Add(5*time.Minute),
	) {
		t.Fatal("unexpected stored verification expiry")
	}
}

func TestNewOTPBackedServiceRejectsInvalidDependencies(
	t *testing.T,
) {
	chargeIP := func(
		ctx context.Context,
		secret []byte,
		ip string,
		operation string,
	) error {
		return nil
	}

	verifyOTP := func(
		ctx context.Context,
		secret []byte,
		phone string,
		code string,
		onVerified otpdb.OnVerifiedFunc,
	) error {
		return nil
	}

	tests := []struct {
		name    string
		service *otp.Service
	}{
		{
			name:    "nil OTP service",
			service: nil,
		},
		{
			name:    "empty OTP service",
			service: &otp.Service{},
		},
		{
			name: "secret too short",
			service: &otp.Service{
				Secret:    make([]byte, 31),
				ChargeIP:  chargeIP,
				VerifyOTP: verifyOTP,
			},
		},
		{
			name: "secret too long",
			service: &otp.Service{
				Secret:    make([]byte, 33),
				ChargeIP:  chargeIP,
				VerifyOTP: verifyOTP,
			},
		},
		{
			name: "missing IP rate limiter",
			service: &otp.Service{
				Secret:    make([]byte, 32),
				VerifyOTP: verifyOTP,
			},
		},
		{
			name: "missing database verifier",
			service: &otp.Service{
				Secret:   make([]byte, 32),
				ChargeIP: chargeIP,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NewOTPBackedService(tt.service)

			if got != nil {
				t.Fatal(
					"expected invalid dependencies to be rejected",
				)
			}
		})
	}
}
