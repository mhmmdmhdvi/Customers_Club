package otpdb

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

type appendExecutor interface {
	Exec(
		ctx context.Context,
		sql string,
		args ...any,
	) (pgconn.CommandTag, error)
}

func Append(
	ctx context.Context,
	db appendExecutor,
	key string,
	events []time.Time,
	now time.Time,
	window time.Duration,
) error {
	nextEvents := append(
		[]time.Time(nil),
		events...,
	)

	nextEvents = append(nextEvents, now)
	expiresAt := now.Add(window)

	const query = `INSERT INTO "OtpRateBucket" ("key", "events", "expiresAt") ` +
		`VALUES ($1, $2, $3) ` +
		`ON CONFLICT ("key") DO UPDATE SET ` +
		`"events" = EXCLUDED."events", ` +
		`"expiresAt" = EXCLUDED."expiresAt"`

	_, err := db.Exec(
		ctx,
		query,
		key,
		nextEvents,
		expiresAt,
	)
	return err
}
