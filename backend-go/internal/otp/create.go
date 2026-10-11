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

const (
	otpTTL             = 2 * time.Minute
	otpDeliveryTimeout = 8 * time.Second
	otpCleanupTimeout  = 5 * time.Second
)

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
	VerifyOTP          VerifyOTPFunc
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

	deliveryCtx, cancelDelivery := context.WithTimeout(
		ctx,
		otpDeliveryTimeout,
	)

	sendErr := s.SendOTP(
		deliveryCtx,
		normalizedPhone,
		code,
		reserved.ExpiresAt,
	)

	// Check whether the delivery context expired or
	// was canceled before releasing its resources.
	deliveryErr := deliveryCtx.Err()
	cancelDelivery()

	if sendErr != nil || deliveryErr != nil {
		// Allow cleanup to continue even if the
		// original HTTP request was canceled.
		cleanupBase := context.WithoutCancel(ctx)

		// But never allow cleanup to run indefinitely.
		cleanupCtx, cancelCleanup := context.WithTimeout(
			cleanupBase,
			otpCleanupTimeout,
		)
		defer cancelCleanup()

		if cleanupErr := s.MarkDeliveryFailed(
			cleanupCtx,
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
