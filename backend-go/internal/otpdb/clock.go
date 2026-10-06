package otpdb

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

type clockQuery interface {
	QueryRow(
		ctx context.Context,
		sql string,
		args ...any,
	) pgx.Row
}

func Now(
	ctx context.Context,
	db clockQuery,
) (time.Time, error) {
	var current time.Time

	err := db.QueryRow(
		ctx,
		"SELECT clock_timestamp()",
	).Scan(&current)

	if err != nil {
		return time.Time{}, err
	}

	return current.UTC(), nil
}
