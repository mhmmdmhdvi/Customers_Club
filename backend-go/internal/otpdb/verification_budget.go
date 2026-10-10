package otpdb

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

const verificationFailureLimit = 10

type VerificationBudget struct {
	Events     []time.Time
	RetryAfter int
}

type verificationBudgetQuery interface {
	QueryRow(
		ctx context.Context,
		sql string,
		args ...any,
	) pgx.Row
}

func VerificationFailureBudget(
	ctx context.Context,
	db verificationBudgetQuery,
	secret []byte,
	phone string,
	now time.Time,
) (VerificationBudget, error) {
	key, err := BucketKey(
		secret,
		"phone:failure",
		phone,
	)

	if err != nil {
		return VerificationBudget{}, err
	}

	events, err := Events(
		ctx,
		db,
		key,
		now,
		phoneQuarterWindow,
	)

	if err != nil {
		return VerificationBudget{}, err
	}

	retryAfter := WaitFor(
		events,
		verificationFailureLimit,
		phoneQuarterWindow,
		now,
	)

	return VerificationBudget{
		Events:     events,
		RetryAfter: retryAfter,
	}, nil
}
