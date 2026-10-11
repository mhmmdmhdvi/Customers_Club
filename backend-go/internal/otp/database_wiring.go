package otp

import (
	"context"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

func NewDatabaseOTPService(
	secret []byte,
	begin otpdb.BeginTransaction,
	sender SendOTPFunc,
) *Service {
	if sender == nil {
		return nil
	}

	// Reuse our existing verification dependencies.
	service := NewDatabaseVerificationService(
		secret,
		begin,
	)

	if service == nil {
		return nil
	}

	// Secure OTP generation.
	service.RandomInt = CryptoRandomInt
	service.RandomBytes = CryptoRandomBytes

	// SMS delivery dependency.
	service.SendOTP = sender

	// Reserve a PENDING OTP.
	service.Reserve = func(
		ctx context.Context,
		secret []byte,
		phone string,
		codeHash string,
		nonce string,
		ttl time.Duration,
	) (otpdb.ReservedOTP, error) {
		return otpdb.ReservePhoneOTP(
			ctx,
			begin,
			secret,
			phone,
			codeHash,
			nonce,
			ttl,
		)
	}

	// Clean up a failed SMS delivery.
	service.MarkDeliveryFailed = func(
		ctx context.Context,
		phone string,
		otpID int64,
	) error {
		return otpdb.MarkDeliveryFailed(
			ctx,
			begin,
			phone,
			otpID,
		)
	}

	// Activate after successful delivery.
	service.Activate = func(
		ctx context.Context,
		phone string,
		otpID int64,
	) error {
		return otpdb.Activate(
			ctx,
			begin,
			phone,
			otpID,
		)
	}

	return service
}
