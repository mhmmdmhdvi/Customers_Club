package otpdb

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type eventsQuery interface {
	QueryRow(
		ctx context.Context,
		sql string,
		args ...any,
	) pgx.Row
}

func Events(
	ctx context.Context,
	db eventsQuery,
	key string,
	now time.Time,
	window time.Duration,
) ([]time.Time, error) {
	var events []time.Time

	err := db.QueryRow(
		ctx,
		`SELECT "events" FROM "OtpRateBucket" WHERE "key" = $1`,
		key,
	).Scan(&events)

	if errors.Is(
		err,
		pgx.ErrNoRows,
	) {
		return []time.Time{}, nil
	}

	if err != nil {
		return nil, err
	}

	return FilterEvents(
		events,
		now,
		window,
	), nil
}
