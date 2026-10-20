package phoneverification

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

func TestVerifyPhoneCreatesProofInsideOTPTransaction(t *testing.T) {
	now := time.Date(
		2026, time.October, 13,
		12, 0, 0, 0, time.UTC,
	)

	token := strings.Repeat("a", 64)
	tokenHash := strings.Repeat("b", 64)

	// This fake transaction is passed between
	// the OTP verifier and proof storage.
	// Its database methods are not called here.
	tx := &struct {
		otpdb.Transaction
	}{}

	var steps []string

	service := Service{
		GenerateToken: func() (string, string, error) {
			steps = append(steps, "generate")
			return token, tokenHash, nil
		},

		VerifyOTP: func(
			ctx context.Context,
			phone string,
			code string,
			ip string,
			onVerified otpdb.OnVerifiedFunc,
		) error {
			steps = append(steps, "verify")

			if phone != "09121234567" {
				t.Fatalf("unexpected phone: %q", phone)
			}

			if code != "123456" {
				t.Fatalf("unexpected code: %q", code)
			}

			if ip != "192.0.2.1" {
				t.Fatalf("unexpected IP: %q", ip)
			}

			if onVerified == nil {
				t.Fatal("expected verification callback")
			}

			return onVerified(ctx, tx, now)
		},

		StoreProof: func(
			ctx context.Context,
			gotTx otpdb.Transaction,
			phone string,
			gotHash string,
			gotNow time.Time,
		) (StoredProof, error) {
			steps = append(steps, "store")

			if gotTx != tx {
				t.Fatal(
					"proof must use the OTP transaction",
				)
			}

			if phone != "09121234567" {
				t.Fatalf(
					"unexpected proof phone: %q",
					phone,
				)
			}

			if gotHash != tokenHash {
				t.Fatal(
					"expected token hash, not raw token",
				)
			}

			if !gotNow.Equal(now) {
				t.Fatal(
					"expected PostgreSQL time",
				)
			}

			return StoredProof{
				Purpose:   "REGISTER",
				ExpiresAt: now.Add(5 * time.Minute),
			}, nil
		},
	}

	result, err := service.VerifyPhone(
		context.Background(),
		"+98 912-123-4567",
		" 123456 ",
		"192.0.2.1",
	)

	if err != nil {
		t.Fatalf(
			"expected successful verification, got %v",
			err,
		)
	}

	if strings.Join(steps, ",") !=
		"generate,verify,store" {
		t.Fatalf(
			"unexpected operation order: %v",
			steps,
		)
	}

	if result.NextStep != "REGISTER" {
		t.Fatalf(
			"expected REGISTER, got %q",
			result.NextStep,
		)
	}

	if result.Authenticated {
		t.Fatal(
			"phone proof must not authenticate user",
		)
	}

	if result.VerificationToken != token {
		t.Fatal(
			"expected raw token in response",
		)
	}

	if result.VerificationExpiresAt !=
		"2026-10-13T12:05:00.000Z" {
		t.Fatalf(
			"unexpected proof expiry: %q",
			result.VerificationExpiresAt,
		)
	}
}

func TestVerifyPhoneDoesNotReturnProofWhenOTPInvalid(
	t *testing.T,
) {
	storeCalled := false
	verifyCalled := false

	service := Service{
		GenerateToken: func() (string, string, error) {
			return strings.Repeat("a", 64),
				strings.Repeat("b", 64),
				nil
		},

		VerifyOTP: func(
			ctx context.Context,
			phone string,
			code string,
			ip string,
			onVerified otpdb.OnVerifiedFunc,
		) error {
			verifyCalled = true

			// Simulate incorrect OTP verification.
			// The success callback must not run.
			return otpdb.ErrInvalidOTP
		},

		StoreProof: func(
			ctx context.Context,
			tx otpdb.Transaction,
			phone string,
			tokenHash string,
			now time.Time,
		) (StoredProof, error) {
			storeCalled = true
			return StoredProof{}, nil
		},
	}

	result, err := service.VerifyPhone(
		context.Background(),
		"09121234567",
		"123456",
		"192.0.2.1",
	)

	if !errors.Is(err, otpdb.ErrInvalidOTP) {
		t.Fatalf(
			"expected ErrInvalidOTP, got %v",
			err,
		)
	}

	if !verifyCalled {
		t.Fatal("expected OTP verification attempt")
	}

	if storeCalled {
		t.Fatal(
			"invalid OTP must not create a verification proof",
		)
	}

	if result != (VerificationResult{}) {
		t.Fatalf(
			"invalid OTP must not return proof data: %+v",
			result,
		)
	}
}

func TestVerifyPhonePropagatesProofStorageFailure(
	t *testing.T,
) {
	failure := errors.New(
		"synthetic verification proof insertion failure",
	)

	token := strings.Repeat("a", 64)
	tokenHash := strings.Repeat("b", 64)

	// The OTP verifier provides this transaction
	// to the proof-storage callback.
	tx := &struct {
		otpdb.Transaction
	}{}

	storeCalled := false

	service := Service{
		GenerateToken: func() (string, string, error) {
			return token, tokenHash, nil
		},

		VerifyOTP: func(
			ctx context.Context,
			phone string,
			code string,
			ip string,
			onVerified otpdb.OnVerifiedFunc,
		) error {
			now := time.Date(
				2026, time.October, 13,
				12, 0, 0, 0, time.UTC,
			)

			// Simulate successful OTP validation.
			// Execute proof creation in the same
			// transaction and propagate its error.
			return onVerified(ctx, tx, now)
		},

		StoreProof: func(
			ctx context.Context,
			gotTx otpdb.Transaction,
			phone string,
			gotHash string,
			now time.Time,
		) (StoredProof, error) {
			storeCalled = true

			if gotTx != tx {
				t.Fatal(
					"proof must use OTP transaction",
				)
			}

			if gotHash != tokenHash {
				t.Fatal(
					"expected hashed token, not raw token",
				)
			}

			return StoredProof{}, failure
		},
	}

	result, err := service.VerifyPhone(
		context.Background(),
		"09121234567",
		"123456",
		"192.0.2.1",
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected proof storage failure, got %v",
			err,
		)
	}

	if !storeCalled {
		t.Fatal(
			"expected proof storage attempt",
		)
	}

	if result != (VerificationResult{}) {
		t.Fatalf(
			"failed proof creation must not return token: %+v",
			result,
		)
	}
}
