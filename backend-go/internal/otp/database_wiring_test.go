package otp

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

func TestNewDatabaseOTPServiceWiresCreateAndVerify(
	t *testing.T,
) {
	failure := errors.New(
		"synthetic transaction start failure",
	)

	beginCalls := 0
	sendCalled := false

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (otpdb.Transaction, error) {
		beginCalls++

		if options.IsoLevel != pgx.ReadCommitted {
			t.Fatalf(
				"expected ReadCommitted, got %v",
				options.IsoLevel,
			)
		}

		return nil, failure
	}

	sender := func(
		ctx context.Context,
		phone string,
		code string,
		expiresAt time.Time,
	) error {
		sendCalled = true
		return nil
	}

	service := NewDatabaseOTPService(
		make([]byte, 32),
		begin,
		sender,
	)

	if service == nil {
		t.Fatal("expected complete OTP service")
	}

	createErr := service.Create(
		context.Background(),
		"09121234567",
		"192.0.2.1",
	)

	if !errors.Is(createErr, failure) {
		t.Fatalf(
			"expected create transaction failure, got %v",
			createErr,
		)
	}

	verifyErr := service.Verify(
		context.Background(),
		"09121234567",
		"123456",
		"192.0.2.1",
		nil,
	)

	if !errors.Is(verifyErr, failure) {
		t.Fatalf(
			"expected verify transaction failure, got %v",
			verifyErr,
		)
	}

	if beginCalls != 2 {
		t.Fatalf(
			"expected two IP transaction attempts, got %d",
			beginCalls,
		)
	}

	if sendCalled {
		t.Fatal(
			"SMS must not be sent when OTP creation fails",
		)
	}
}

func TestNewDatabaseOTPServiceRejectsInvalidDependencies(
	t *testing.T,
) {
	validSecret := make([]byte, 32)

	validBegin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (otpdb.Transaction, error) {
		t.Fatal("constructor must not start a transaction")
		return nil, errors.New("unexpected transaction")
	}

	validSender := func(
		ctx context.Context,
		phone string,
		code string,
		expiresAt time.Time,
	) error {
		t.Fatal("constructor must not send SMS")
		return nil
	}

	tests := []struct {
		name   string
		secret []byte
		begin  otpdb.BeginTransaction
		sender SendOTPFunc
	}{
		{
			name:   "missing secret",
			secret: nil,
			begin:  validBegin,
			sender: validSender,
		},
		{
			name:   "short secret",
			secret: make([]byte, 16),
			begin:  validBegin,
			sender: validSender,
		},
		{
			name:   "missing transaction starter",
			secret: validSecret,
			begin:  nil,
			sender: validSender,
		},
		{
			name:   "missing SMS sender",
			secret: validSecret,
			begin:  validBegin,
			sender: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := NewDatabaseOTPService(
				tt.secret,
				tt.begin,
				tt.sender,
			)

			if service != nil {
				t.Fatal(
					"expected invalid dependencies to be rejected",
				)
			}
		})
	}
}
