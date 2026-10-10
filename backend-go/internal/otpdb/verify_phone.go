package otpdb

import (
	"context"
	"errors"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpcrypto"
)

var ErrInvalidOTP = errors.New("invalid OTP")

var errActiveVerificationNotImplemented = errors.New("ACTIVE OTP verification not implemented yet")

type OnVerifiedFunc func(
	ctx context.Context,
	tx Transaction,
	now time.Time,
) error

func VerifyPhoneOTP(
	ctx context.Context,
	begin BeginTransaction,
	secret []byte,
	phone string,
	code string,
	onVerified OnVerifiedFunc,
) error {
	var rejection error

	err := RunTransaction(
		ctx,
		begin,
		func(tx Transaction) error {
			if err := Lock(
				ctx,
				tx,
				"phone:"+phone,
			); err != nil {
				return err
			}

			now, err := Now(ctx, tx)

			if err != nil {
				return err
			}

			budget, err := VerificationFailureBudget(
				ctx,
				tx,
				secret,
				phone,
				now,
			)

			if err != nil {
				return err
			}

			if budget.RetryAfter > 0 {
				rejection = &RateLimitError{
					RetryAfter: budget.RetryAfter,
				}

				return nil
			}

			otp, err := LatestActiveOTP(
				ctx,
				tx,
				phone,
			)

			if err != nil {
				return err
			}

			if otp != nil {
				// Only consider an unexpired OTP with
				// fewer than five failed attempts.
				if otp.ExpiresAt.After(now) &&
					otp.FailedAttempts < 5 &&
					otp.CodeHash != nil &&
					otp.Nonce != nil &&
					otpcrypto.MatchesCode(
						secret,
						*otp.CodeHash,
						*otp.Nonce,
						phone,
						code,
					) {

					// Atomically mark the OTP as used.
					claimed, err := ConsumeActiveOTP(
						ctx,
						tx,
						otp.ID,
						now,
					)

					if err != nil {
						return err
					}

					if !claimed {
						rejection = ErrInvalidOTP
						return nil
					}

					// Run the verification callback inside
					// the same database transaction.
					if onVerified != nil {
						if err := onVerified(
							ctx,
							tx,
							now,
						); err != nil {
							return err
						}
					}

					return nil
				}

				// Expired or exhausted OTP handling will
				// be completed in the next TDD steps.
				if !otp.ExpiresAt.After(now) ||
					otp.FailedAttempts >= 5 {
					return errActiveVerificationNotImplemented
				}

				// The OTP exists and is unexpired, but
				// the submitted code did not match.
				otpID := otp.ID

				if err := RecordVerificationFailure(
					ctx,
					tx,
					secret,
					phone,
					budget.Events,
					now,
					&otpID,
				); err != nil {
					return err
				}

				// Return the rejection only after
				// the transaction has committed.
				rejection = ErrInvalidOTP

				return nil
			}

			if err := RecordVerificationFailure(
				ctx,
				tx,
				secret,
				phone,
				budget.Events,
				now,
				nil,
			); err != nil {
				return err
			}

			rejection = ErrInvalidOTP

			return nil
		},
	)

	if err != nil {
		return err
	}

	return rejection
}
