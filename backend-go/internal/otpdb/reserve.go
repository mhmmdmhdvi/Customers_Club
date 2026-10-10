package otpdb

import (
	"context"
	"time"
)

const insertPendingOTPSQL = `INSERT INTO "OTPCode" ` +
	`("phone", "expiresAt", "code", "codeHash", "nonce", "failedAttempts", "deliveryState") ` +
	`VALUES ($1, $2, NULL, $3, $4, 0, 'PENDING') ` +
	`RETURNING "id", "expiresAt"`

type ReservedOTP struct {
	ID        int64
	ExpiresAt time.Time
}

func ReservePhoneOTP(
	ctx context.Context,
	begin BeginTransaction,
	secret []byte,
	phone string,
	codeHash string,
	nonce string,
	ttl time.Duration,
) (ReservedOTP, error) {
	key, err := BucketKey(
		secret,
		"phone:request",
		phone,
	)

	if err != nil {
		return ReservedOTP{}, err
	}

	var reserved ReservedOTP
	retryAfter := 0

	err = RunTransaction(
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

			now, err := Now(
				ctx,
				tx,
			)

			if err != nil {
				return err
			}

			events, err := Events(
				ctx,
				tx,
				key,
				now,
				phoneDayWindow,
			)

			if err != nil {
				return err
			}

			pendingExpiresAt, err :=
				PendingOTPExpiry(
					ctx,
					tx,
					phone,
					now,
				)

			if err != nil {
				return err
			}

			retryAfter =
				PhoneRequestWait(
					events,
					pendingExpiresAt,
					now,
				)

			if retryAfter > 0 {
				return nil
			}

			if err := Append(
				ctx,
				tx,
				key,
				events,
				now,
				phoneDayWindow,
			); err != nil {
				return err
			}

			expiresAt :=
				now.Add(ttl)

			err = tx.QueryRow(
				ctx,
				insertPendingOTPSQL,
				phone,
				expiresAt,
				codeHash,
				nonce,
			).Scan(
				&reserved.ID,
				&reserved.ExpiresAt,
			)

			if err != nil {
				return err
			}

			return nil
		},
	)

	if err != nil {
		return ReservedOTP{}, err
	}

	if retryAfter > 0 {
		return ReservedOTP{},
			&RateLimitError{
				RetryAfter: retryAfter,
			}
	}

	return reserved, nil
}
