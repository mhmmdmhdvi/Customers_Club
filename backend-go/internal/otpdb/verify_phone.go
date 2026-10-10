package otpdb

import (
	"context"
	"errors"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpcrypto"
)

var ErrInvalidOTP = errors.New("invalid OTP")
var ErrOTPExpired = errors.New("OTP expired")

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

				if !otp.ExpiresAt.After(now) {
					// Record a phone-level failure.
					// Do not increment the expired OTP's counter.
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

					phoneWait := phoneWaitAfterFailure(
						budget.Events,
						now,
					)

					if phoneWait > 0 {
						rejection = &RateLimitError{
							RetryAfter: phoneWait,
						}
					} else {
						rejection = ErrOTPExpired
					}

					// Commit the failure event before returning.
					return nil
				}

				// An OTP with five failed attempts cannot
				// be verified again, even with the correct code.
				if otp.FailedAttempts >= 5 {
					retryAfter := ceilSeconds(
						otp.ExpiresAt.Sub(now),
					)

					rejection = &RateLimitError{
						RetryAfter: retryAfter,
					}

					// Commit without changing failure counters.
					return nil
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

				phoneWait := phoneWaitAfterFailure(
					budget.Events,
					now,
				)

				// Calculate the individual OTP lockout.
				// FailedAttempts is the value BEFORE this request.
				otpWait := 0

				if otp.FailedAttempts+1 >= 5 {
					otpWait = ceilSeconds(
						otp.ExpiresAt.Sub(now),
					)
				}

				// Apply whichever restriction lasts longer.
				retryAfter := maxInt(
					phoneWait,
					otpWait,
				)

				if retryAfter > 0 {
					rejection = &RateLimitError{
						RetryAfter: retryAfter,
					}
				} else {
					rejection = ErrInvalidOTP
				}

				// Commit the failure counters before returning.
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

			phoneWait := phoneWaitAfterFailure(
				budget.Events,
				now,
			)

			if phoneWait > 0 {
				rejection = &RateLimitError{
					RetryAfter: phoneWait,
				}
			} else {
				rejection = ErrInvalidOTP
			}

			// Commit the failure event before returning.
			return nil
		},
	)

	if err != nil {
		return err
	}

	return rejection
}

func phoneWaitAfterFailure(
	events []time.Time,
	now time.Time,
) int {
	updatedEvents := append(
		append([]time.Time(nil), events...),
		now,
	)

	return WaitFor(
		updatedEvents,
		verificationFailureLimit,
		phoneQuarterWindow,
		now,
	)
}
