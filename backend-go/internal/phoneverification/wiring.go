package phoneverification

import (
	"context"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otp"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

func NewOTPBackedService(
	otpService *otp.Service,
) *Service {
	if otpService == nil ||
		len(otpService.Secret) != 32 ||
		otpService.ChargeIP == nil ||
		otpService.VerifyOTP == nil {
		return nil
	}

	return &Service{
		// Generate a cryptographically secure
		// verification token and its SHA-256 hash.
		GenerateToken: GenerateSecureToken,

		// Delegate OTP verification to our
		// existing OTP service.
		VerifyOTP: func(
			ctx context.Context,
			phone string,
			code string,
			ip string,
			onVerified otpdb.OnVerifiedFunc,
		) error {
			return otpService.Verify(
				ctx,
				phone,
				code,
				ip,
				onVerified,
			)
		},

		// Store the verification proof using
		// the SAME transaction that consumed
		// the OTP.
		StoreProof: func(
			ctx context.Context,
			tx otpdb.Transaction,
			phone string,
			tokenHash string,
			now time.Time,
		) (StoredProof, error) {
			return StoreProof(
				ctx,
				tx,
				phone,
				tokenHash,
				now,
			)
		},
	}
}
