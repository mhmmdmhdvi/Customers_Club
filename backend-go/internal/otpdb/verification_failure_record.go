package otpdb

import (
	"context"
	"time"
)

func RecordVerificationFailure(
	ctx context.Context,
	tx Transaction,
	secret []byte,
	phone string,
	previousEvents []time.Time,
	now time.Time,
	otpID *int64,
) error {
	key, err := BucketKey(
		secret,
		"phone:failure",
		phone,
	)

	if err != nil {
		return err
	}

	if err := Append(
		ctx,
		tx,
		key,
		previousEvents,
		now,
		phoneQuarterWindow,
	); err != nil {
		return err
	}

	if otpID != nil {
		if err := IncrementOTPFailedAttempts(
			ctx,
			tx,
			*otpID,
		); err != nil {
			return err
		}
	}

	return nil
}
