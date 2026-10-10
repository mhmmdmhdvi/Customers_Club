package otp

import (
	"context"
	"errors"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpcrypto"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpip"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/phone"
)

const otpTTL = 2 * time.Minute

var ErrUnavailable = errors.New("OTP unavailable")

type ChargeIPFunc func(
	ctx context.Context,
	secret []byte,
	ip string,
	operation string,
) error

type SendOTPFunc func(
	ctx context.Context,
	phone string,
	code string,
	expiresAt time.Time,
) error

type MarkDeliveryFailedFunc func(
	ctx context.Context,
	phone string,
	otpID int64,
) error

type ReserveFunc func(
	ctx context.Context,
	secret []byte,
	phone string,
	codeHash string,
	nonce string,
	ttl time.Duration,
) (otpdb.ReservedOTP, error)

type Service struct {
	Secret             []byte
	RandomInt          RandomInt
	RandomBytes        RandomBytes
	ChargeIP           ChargeIPFunc
	Reserve            ReserveFunc
	SendOTP            SendOTPFunc
	MarkDeliveryFailed MarkDeliveryFailedFunc
	Activate           ActivateFunc
}

type ActivateFunc func(
	ctx context.Context,
	phone string,
	otpID int64,
) error

func (s *Service) Create(
	ctx context.Context,
	rawPhone string,
	rawIP string,
) error {
	if len(s.Secret) != 32 ||
		s.RandomInt == nil ||
		s.RandomBytes == nil ||
		s.ChargeIP == nil ||
		s.Reserve == nil ||
		s.SendOTP == nil ||
		s.MarkDeliveryFailed == nil ||
		s.Activate == nil {
		return ErrUnavailable
	}
	normalizedPhone :=
		phone.Normalize(rawPhone)

	if !phone.IsValidIranianMobile(
		normalizedPhone,
	) {
		return ErrUnavailable
	}

	normalizedIP, err := otpip.Normalize(rawIP)

	if err != nil {
		return ErrUnavailable
	}

	if err := s.ChargeIP(
		ctx,
		s.Secret,
		normalizedIP,
		"request",
	); err != nil {
		return err
	}

	code, err :=
		GenerateCode(
			s.RandomInt,
		)

	if err != nil {
		return ErrUnavailable
	}

	nonce, err :=
		GenerateNonce(
			s.RandomBytes,
		)

	if err != nil {
		return ErrUnavailable
	}

	codeHash, err :=
		otpcrypto.HashCode(
			s.Secret,
			normalizedPhone,
			nonce,
			code,
		)

	if err != nil {
		return ErrUnavailable
	}

	reserved, err := s.Reserve(
		ctx,
		s.Secret,
		normalizedPhone,
		codeHash,
		nonce,
		otpTTL,
	)

	if err != nil {
		return err
	}

	if err := s.SendOTP(
		ctx,
		normalizedPhone,
		code,
		reserved.ExpiresAt,
	); err != nil {
		if cleanupErr :=
			s.MarkDeliveryFailed(
				ctx,
				normalizedPhone,
				reserved.ID,
			); cleanupErr != nil {
			return cleanupErr
		}

		return ErrUnavailable
	}

	if err := s.Activate(
		ctx,
		normalizedPhone,
		reserved.ID,
	); err != nil {
		return err
	}

	return nil
}
