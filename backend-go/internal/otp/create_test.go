package otp

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpcrypto"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

func TestCreateChargesCanonicalIPBeforeReservation(t *testing.T) {
	secret := make([]byte, 32)

	failure :=
		errors.New(
			"synthetic IP rate-limit failure",
		)

	var chargedSecret []byte
	var chargedIP string
	var chargedOperation string

	reserveCalled := false
	sendCalled := false

	service := Service{
		Secret: secret,

		RandomInt: func(
			min int,
			max int,
		) (int, error) {
			return 123456, nil
		},

		RandomBytes: func(
			size int,
		) ([]byte, error) {
			return make(
				[]byte,
				32,
			), nil
		},

		ChargeIP: func(
			ctx context.Context,
			secret []byte,
			ip string,
			operation string,
		) error {
			chargedSecret =
				append(
					[]byte(nil),
					secret...,
				)

			chargedIP = ip
			chargedOperation = operation

			return failure
		},

		Reserve: func(
			ctx context.Context,
			secret []byte,
			phone string,
			codeHash string,
			nonce string,
			ttl time.Duration,
		) (otpdb.ReservedOTP, error) {
			reserveCalled = true

			return otpdb.ReservedOTP{}, nil
		},

		SendOTP: func(
			ctx context.Context,
			phone string,
			code string,
			expiresAt time.Time,
		) error {
			sendCalled = true
			return nil
		},

		MarkDeliveryFailed: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			return nil
		},

		Activate: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			return nil
		},
	}

	err := service.Create(
		context.Background(),
		"09121234567",
		"::ffff:192.0.2.1",
	)

	if !errors.Is(
		err,
		failure,
	) {
		t.Fatalf(
			"expected IP charge failure, got %v",
			err,
		)
	}

	if !bytes.Equal(
		chargedSecret,
		secret,
	) {
		t.Fatal(
			"expected OTP secret to be passed to IP charging",
		)
	}

	if chargedIP != "192.0.2.1" {
		t.Fatalf(
			"expected canonical IP %q, got %q",
			"192.0.2.1",
			chargedIP,
		)
	}

	if chargedOperation != "request" {
		t.Fatalf(
			"expected request operation, got %q",
			chargedOperation,
		)
	}

	if reserveCalled {
		t.Fatal(
			"phone reservation must not run when IP charging fails",
		)
	}

	if sendCalled {
		t.Fatal(
			"OTP delivery must not run when IP charging fails",
		)
	}
}

func TestCreateUsesPhoneReservation(t *testing.T) {
	secret := make([]byte, 32)

	var reservedPhone string
	var reservedHash string
	var reservedNonce string
	var reservedTTL time.Duration
	var reserveCalled bool

	service := Service{
		Secret: secret,

		RandomInt: func(
			min int,
			max int,
		) (int, error) {
			return 123456, nil
		},

		RandomBytes: func(
			size int,
		) ([]byte, error) {
			return make(
				[]byte,
				32,
			), nil
		},

		ChargeIP: func(
			ctx context.Context,
			secret []byte,
			ip string,
			operation string,
		) error {
			return nil
		},

		Reserve: func(
			ctx context.Context,
			secret []byte,
			phone string,
			codeHash string,
			nonce string,
			ttl time.Duration,
		) (otpdb.ReservedOTP, error) {
			reserveCalled = true
			reservedPhone = phone
			reservedHash = codeHash
			reservedNonce = nonce
			reservedTTL = ttl

			return otpdb.ReservedOTP{
				ID: 42,
				ExpiresAt: time.Date(
					2026,
					time.October,
					7,
					12,
					2,
					0,
					0,
					time.UTC,
				),
			}, nil
		},

		SendOTP: func(
			ctx context.Context,
			phone string,
			code string,
			expiresAt time.Time,
		) error {
			return nil
		},

		MarkDeliveryFailed: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			return nil
		},

		Activate: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			return nil
		},
	}

	err := service.Create(
		context.Background(),
		"+98 912-123-4567",
		"192.0.2.1",
	)

	if err != nil {
		t.Fatalf(
			"expected OTP creation to succeed, got %v",
			err,
		)
	}

	if !reserveCalled {
		t.Fatal(
			"expected phone OTP reservation",
		)
	}

	if reservedPhone != "09121234567" {
		t.Fatalf(
			"expected normalized phone %q, got %q",
			"09121234567",
			reservedPhone,
		)
	}

	if reservedTTL != 2*time.Minute {
		t.Fatalf(
			"expected two-minute TTL, got %v",
			reservedTTL,
		)
	}

	const expectedNonce = "0000000000000000000000000000000000000000000000000000000000000000"

	if reservedNonce != expectedNonce {
		t.Fatalf(
			"expected nonce %q, got %q",
			expectedNonce,
			reservedNonce,
		)
	}

	expectedHash, err :=
		otpcrypto.HashCode(
			secret,
			"09121234567",
			expectedNonce,
			"123456",
		)

	if err != nil {
		t.Fatalf(
			"expected OTP hashing to succeed, got %v",
			err,
		)
	}

	if reservedHash != expectedHash {
		t.Fatalf(
			"expected hash %q, got %q",
			expectedHash,
			reservedHash,
		)
	}
}

func TestCreateDeliversOTPAfterReservation(t *testing.T) {
	secret := make([]byte, 32)

	expiresAt := time.Date(
		2026,
		time.October,
		7,
		12,
		2,
		0,
		0,
		time.UTC,
	)

	reserveCalled := false
	sendCalled := false

	service := Service{
		Secret: secret,

		RandomInt: func(
			min int,
			max int,
		) (int, error) {
			return 123456, nil
		},

		RandomBytes: func(
			size int,
		) ([]byte, error) {
			return make(
				[]byte,
				32,
			), nil
		},

		ChargeIP: func(
			ctx context.Context,
			secret []byte,
			ip string,
			operation string,
		) error {
			return nil
		},

		Reserve: func(
			ctx context.Context,
			secret []byte,
			phone string,
			codeHash string,
			nonce string,
			ttl time.Duration,
		) (otpdb.ReservedOTP, error) {
			reserveCalled = true

			return otpdb.ReservedOTP{
				ID:        42,
				ExpiresAt: expiresAt,
			}, nil
		},

		SendOTP: func(
			ctx context.Context,
			phone string,
			code string,
			expiresAt time.Time,
		) error {
			if !reserveCalled {
				t.Fatal(
					"OTP must be reserved before delivery starts",
				)
			}

			sendCalled = true

			if phone != "09121234567" {
				t.Fatalf(
					"expected normalized phone %q, got %q",
					"09121234567",
					phone,
				)
			}

			if code != "123456" {
				t.Fatalf(
					"expected plaintext code %q, got %q",
					"123456",
					code,
				)
			}

			if !expiresAt.Equal(
				time.Date(
					2026,
					time.October,
					7,
					12,
					2,
					0,
					0,
					time.UTC,
				),
			) {
				t.Fatalf(
					"unexpected expiry %v",
					expiresAt,
				)
			}

			return nil
		},

		MarkDeliveryFailed: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			return nil
		},

		Activate: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			return nil
		},
	}

	err := service.Create(
		context.Background(),
		"09121234567",
		"192.0.2.1",
	)

	if err != nil {
		t.Fatalf(
			"expected OTP creation to succeed, got %v",
			err,
		)
	}

	if !sendCalled {
		t.Fatal(
			"expected OTP delivery",
		)
	}
}

func TestCreateMarksPendingOTPFailedWhenDeliveryFails(t *testing.T) {
	secret := make([]byte, 32)

	deliveryFailure :=
		errors.New(
			"synthetic SMS delivery failure",
		)

	var failedPhone string
	var failedID int64
	markFailedCalled := false

	service := Service{
		Secret: secret,

		RandomInt: func(
			min int,
			max int,
		) (int, error) {
			return 123456, nil
		},

		RandomBytes: func(
			size int,
		) ([]byte, error) {
			return make(
				[]byte,
				32,
			), nil
		},

		ChargeIP: func(
			ctx context.Context,
			secret []byte,
			ip string,
			operation string,
		) error {
			return nil
		},

		Reserve: func(
			ctx context.Context,
			secret []byte,
			phone string,
			codeHash string,
			nonce string,
			ttl time.Duration,
		) (otpdb.ReservedOTP, error) {
			return otpdb.ReservedOTP{
				ID: 42,
				ExpiresAt: time.Date(
					2026,
					time.October,
					7,
					12,
					2,
					0,
					0,
					time.UTC,
				),
			}, nil
		},

		SendOTP: func(
			ctx context.Context,
			phone string,
			code string,
			expiresAt time.Time,
		) error {
			return deliveryFailure
		},

		MarkDeliveryFailed: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			markFailedCalled = true
			failedPhone = phone
			failedID = otpID

			return nil
		},

		Activate: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			return nil
		},
	}

	err := service.Create(
		context.Background(),
		"09121234567",
		"192.0.2.1",
	)

	if !errors.Is(
		err,
		ErrUnavailable,
	) {
		t.Fatalf(
			"expected ErrUnavailable, got %v",
			err,
		)
	}

	if !markFailedCalled {
		t.Fatal(
			"expected failed OTP reservation cleanup",
		)
	}

	if failedPhone != "09121234567" {
		t.Fatalf(
			"expected failed phone %q, got %q",
			"09121234567",
			failedPhone,
		)
	}

	if failedID != 42 {
		t.Fatalf(
			"expected failed OTP id 42, got %d",
			failedID,
		)
	}
}

func TestCreateActivatesReservedOTPAfterDelivery(t *testing.T) {
	secret := make([]byte, 32)

	sendCalled := false
	activateCalled := false

	service := Service{
		Secret: secret,

		RandomInt: func(
			min int,
			max int,
		) (int, error) {
			return 123456, nil
		},

		RandomBytes: func(
			size int,
		) ([]byte, error) {
			return make(
				[]byte,
				32,
			), nil
		},

		ChargeIP: func(
			ctx context.Context,
			secret []byte,
			ip string,
			operation string,
		) error {
			return nil
		},

		Reserve: func(
			ctx context.Context,
			secret []byte,
			phone string,
			codeHash string,
			nonce string,
			ttl time.Duration,
		) (otpdb.ReservedOTP, error) {
			return otpdb.ReservedOTP{
				ID: 42,
				ExpiresAt: time.Date(
					2026,
					time.October,
					7,
					12,
					2,
					0,
					0,
					time.UTC,
				),
			}, nil
		},

		SendOTP: func(
			ctx context.Context,
			phone string,
			code string,
			expiresAt time.Time,
		) error {
			sendCalled = true
			return nil
		},

		MarkDeliveryFailed: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			return nil
		},

		Activate: func(
			ctx context.Context,
			phone string,
			otpID int64,
		) error {
			if !sendCalled {
				t.Fatal(
					"OTP must be delivered before activation",
				)
			}

			activateCalled = true

			if phone != "09121234567" {
				t.Fatalf(
					"expected normalized phone %q, got %q",
					"09121234567",
					phone,
				)
			}

			if otpID != 42 {
				t.Fatalf(
					"expected OTP id 42, got %d",
					otpID,
				)
			}

			return nil
		},
	}

	err := service.Create(
		context.Background(),
		"09121234567",
		"192.0.2.1",
	)

	if err != nil {
		t.Fatalf(
			"expected OTP creation to succeed, got %v",
			err,
		)
	}

	if !activateCalled {
		t.Fatal(
			"expected delivered OTP to be activated",
		)
	}
}
