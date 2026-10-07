package otpdb

import (
	"context"
	"time"
)

const quarterWindow = 15 * time.Minute

type RateLimitError struct {
	RetryAfter int
}

func (e *RateLimitError) Error() string {
	return "rate limited"
}

func ChargeIP(
	ctx context.Context,
	begin BeginTransaction,
	secret []byte,
	ip string,
	operation string,
) error {
	key, err := BucketKey(
		secret,
		"ip:"+operation,
		ip,
	)

	if err != nil {
		return err
	}

	retryAfter := 0

	err = RunTransaction(
		ctx,
		begin,
		func(tx Transaction) error {
			if err := Lock(
				ctx,
				tx,
				"ip:"+key,
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
				quarterWindow,
			)

			if err != nil {
				return err
			}

			limit := 100

			if operation == "request" {
				limit = 30
			}

			retryAfter = WaitFor(
				events,
				limit,
				quarterWindow,
				now,
			)

			if retryAfter > 0 {
				return nil
			}

			return Append(
				ctx,
				tx,
				key,
				events,
				now,
				quarterWindow,
			)
		},
	)

	if err != nil {
		return err
	}

	if retryAfter > 0 {
		return &RateLimitError{
			RetryAfter: retryAfter,
		}
	}

	return nil
}
