package otp

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

func TestVerifyChargesIPBeforeDatabaseVerification(t *testing.T) {
	secret := make([]byte, 32)

	var steps []string

	service := Service{
		Secret: secret,

		ChargeIP: func(
			ctx context.Context,
			gotSecret []byte,
			ip string,
			operation string,
		) error {
			steps = append(steps, "charge")

			if !bytes.Equal(gotSecret, secret) {
				t.Fatal("expected OTP secret")
			}

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
			gotSecret []byte,
			phone string,
			code string,
			onVerified otpdb.OnVerifiedFunc,
		) error {
			steps = append(steps, "verify")

			if !bytes.Equal(gotSecret, secret) {
				t.Fatal("expected OTP secret")
			}

			if phone != "09121234567" {
				t.Fatalf("unexpected phone: %q", phone)
			}

			if code != "123456" {
				t.Fatalf("unexpected code: %q", code)
			}

			if onVerified == nil {
				t.Fatal("expected verification callback")
			}

			return nil
		},
	}

	err := service.Verify(
		context.Background(),
		"+98 912-123-4567",
		" 123456 ",
		"::ffff:192.0.2.1",
		func(
			ctx context.Context,
			tx otpdb.Transaction,
			now time.Time,
		) error {
			return nil
		},
	)

	if err != nil {
		t.Fatalf("expected verification success, got %v", err)
	}

	if len(steps) != 2 ||
		steps[0] != "charge" ||
		steps[1] != "verify" {
		t.Fatalf(
			"expected charge then verify, got %v",
			steps,
		)
	}
}

func TestVerifyRejectsInvalidInputsBeforeChargingIP(
	t *testing.T,
) {
	tests := []struct {
		name    string
		phone   string
		code    string
		ip      string
		wantErr error
	}{
		{
			name:    "invalid phone",
			phone:   "12345",
			code:    "123456",
			ip:      "192.0.2.1",
			wantErr: ErrInvalidPhone,
		},
		{
			name:    "invalid code length",
			phone:   "09121234567",
			code:    "12345",
			ip:      "192.0.2.1",
			wantErr: ErrInvalidCode,
		},
		{
			name:    "non-digit code",
			phone:   "09121234567",
			code:    "12a456",
			ip:      "192.0.2.1",
			wantErr: ErrInvalidCode,
		},
		{
			name:    "invalid IP",
			phone:   "09121234567",
			code:    "123456",
			ip:      "192.0.2.1:8080",
			wantErr: ErrUnavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			chargeCalled := false
			verifyCalled := false

			service := Service{
				Secret: make([]byte, 32),

				ChargeIP: func(
					ctx context.Context,
					secret []byte,
					ip string,
					operation string,
				) error {
					chargeCalled = true
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
					return nil
				},
			}

			err := service.Verify(
				context.Background(),
				tt.phone,
				tt.code,
				tt.ip,
				nil,
			)

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf(
					"expected %v, got %v",
					tt.wantErr,
					err,
				)
			}

			if chargeCalled {
				t.Fatal(
					"invalid input must not charge IP",
				)
			}

			if verifyCalled {
				t.Fatal(
					"invalid input must not reach database verifier",
				)
			}
		})
	}
}

func TestVerifyStopsWhenIPChargeFails(t *testing.T) {
	secret := make([]byte, 32)

	ipFailure := errors.New(
		"synthetic IP rate-limit failure",
	)

	chargeCalled := false
	verifyCalled := false

	service := Service{
		Secret: secret,

		ChargeIP: func(
			ctx context.Context,
			gotSecret []byte,
			ip string,
			operation string,
		) error {
			chargeCalled = true

			if !bytes.Equal(gotSecret, secret) {
				t.Fatal("expected OTP secret")
			}

			if ip != "192.0.2.1" {
				t.Fatalf(
					"expected canonical IP, got %q",
					ip,
				)
			}

			if operation != "verify" {
				t.Fatalf(
					"expected verify operation, got %q",
					operation,
				)
			}

			return ipFailure
		},

		VerifyOTP: func(
			ctx context.Context,
			gotSecret []byte,
			phone string,
			code string,
			onVerified otpdb.OnVerifiedFunc,
		) error {
			verifyCalled = true
			return nil
		},
	}

	err := service.Verify(
		context.Background(),
		"+98 912-123-4567",
		"123456",
		"::ffff:192.0.2.1",
		nil,
	)

	if !errors.Is(err, ipFailure) {
		t.Fatalf(
			"expected IP charging failure, got %v",
			err,
		)
	}

	if !chargeCalled {
		t.Fatal(
			"expected IP budget to be charged",
		)
	}

	if verifyCalled {
		t.Fatal(
			"database verification must not run when IP charging fails",
		)
	}
}
