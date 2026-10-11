package otp

import (
	"context"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

func NewDatabaseVerificationService(
	secret []byte,
	begin otpdb.BeginTransaction,
) *Service {
	if len(secret) != 32 || begin == nil {
		return nil
	}

	return &Service{
		Secret: append([]byte(nil), secret...),

		ChargeIP: func(
			ctx context.Context,
			secret []byte,
			ip string,
			operation string,
		) error {
			return otpdb.ChargeIP(
				ctx,
				begin,
				secret,
				ip,
				operation,
			)
		},

		VerifyOTP: func(
			ctx context.Context,
			secret []byte,
			phone string,
			code string,
			onVerified otpdb.OnVerifiedFunc,
		) error {
			return otpdb.VerifyPhoneOTP(
				ctx,
				begin,
				secret,
				phone,
				code,
				onVerified,
			)
		},
	}
}
