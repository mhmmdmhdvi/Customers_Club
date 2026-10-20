package otp

import (
	"context"
	"errors"
	"regexp"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/jsstring"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpip"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/phone"
)

var ErrInvalidPhone = errors.New("invalid phone number")

var ErrInvalidCode = errors.New(
	"code must contain exactly 6 digits",
)

var sixDigitPattern = regexp.MustCompile(
	`^[0-9]{6}$`,
)

type VerifyOTPFunc func(
	ctx context.Context,
	secret []byte,
	phone string,
	code string,
	onVerified otpdb.OnVerifiedFunc,
) error

func (s *Service) Verify(
	ctx context.Context,
	rawPhone string,
	rawCode string,
	rawIP string,
	onVerified otpdb.OnVerifiedFunc,
) error {
	//Verification has its own dependencies.
	if s == nil ||
		len(s.Secret) != 32 ||
		s.ChargeIP == nil ||
		s.VerifyOTP == nil {
		return ErrUnavailable
	}

	normalizedPhone := phone.Normalize(rawPhone)

	if !phone.IsValidIranianMobile(
		normalizedPhone,
	) {
		return ErrInvalidPhone
	}

	//Match node.js behavior:
	//trim whitespace before validating the code.
	code := jsstring.Trim(rawCode)

	if !sixDigitPattern.MatchString(code) {
		return ErrInvalidCode
	}

	normalizedIP, err := otpip.Normalize(rawIP)

	if err != nil {
		return ErrUnavailable
	}

	//Charge the verification IP budget first.
	if err := s.ChargeIP(
		ctx,
		s.Secret,
		normalizedIP,
		"verify",
	); err != nil {
		return err
	}

	//Continue to the phone-locked database verifier.
	return s.VerifyOTP(
		ctx,
		s.Secret,
		normalizedPhone,
		code,
		onVerified,
	)
}
