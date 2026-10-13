package phoneverification

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otp"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/phone"
)

type VerificationResult struct {
	NextStep              string `json:"nextStep"`
	Authenticated         bool   `json:"authenticated"`
	VerificationToken     string `json:"verificationToken"`
	VerificationExpiresAt string `json:"verificationExpiresAt"`
}

type GenerateTokenFunc func() (string, string, error)

type VerifyOTPFunc func(
	ctx context.Context,
	phone string,
	code string,
	ip string,
	onVerified otpdb.OnVerifiedFunc,
) error

type StoreProofFunc func(
	ctx context.Context,
	tx otpdb.Transaction,
	phone string,
	tokenHash string,
	now time.Time,
) (StoredProof, error)

type Service struct {
	GenerateToken GenerateTokenFunc
	VerifyOTP     VerifyOTPFunc
	StoreProof    StoreProofFunc
}

var verificationCodePattern = regexp.MustCompile(`^[0-9]{6}$`)

func (s *Service) VerifyPhone(
	ctx context.Context,
	rawPhone string,
	rawCode string,
	ip string,
) (VerificationResult, error) {
	if s == nil ||
		s.GenerateToken == nil ||
		s.VerifyOTP == nil ||
		s.StoreProof == nil {
		return VerificationResult{}, otp.ErrUnavailable
	}

	normalizedPhone := phone.Normalize(rawPhone)

	if !phone.IsValidIranianMobile(normalizedPhone) {
		return VerificationResult{}, otp.ErrInvalidPhone
	}

	code := strings.TrimSpace(rawCode)

	if !verificationCodePattern.MatchString(code) {
		return VerificationResult{}, otp.ErrInvalidCode
	}

	// Generate the token before OTP verification,
	// matching the Node.js service.
	token, tokenHash, err := s.GenerateToken()

	if err != nil {
		return VerificationResult{}, err
	}

	var result VerificationResult
	proofStored := false

	// The injected OTP verifier owns the transaction.
	err = s.VerifyOTP(
		ctx,
		normalizedPhone,
		code,
		ip,
		func(
			ctx context.Context,
			tx otpdb.Transaction,
			now time.Time,
		) error {
			// This runs inside the OTP-consumption
			// transaction, before COMMIT.
			proof, err := s.StoreProof(
				ctx,
				tx,
				normalizedPhone,
				tokenHash,
				now,
			)

			if err != nil {
				return err
			}

			if proof.Purpose != "REGISTER" &&
				proof.Purpose != "LOGIN" {
				return otp.ErrUnavailable
			}

			result = VerificationResult{
				NextStep:          proof.Purpose,
				Authenticated:     false,
				VerificationToken: token,
				VerificationExpiresAt: proof.ExpiresAt.UTC().Format(
					"2006-01-02T15:04:05.000Z",
				),
			}

			proofStored = true
			return nil
		},
	)

	if err != nil {
		return VerificationResult{}, err
	}

	if !proofStored {
		return VerificationResult{}, otp.ErrUnavailable
	}

	return result, nil
}
