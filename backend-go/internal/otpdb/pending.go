package otpdb

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type pendingQuery interface {
	QueryRow(
		ctx context.Context,
		sql string,
		args ...any,
	) pgx.Row
}

func PendingOTPExpiry(
	ctx context.Context,
	db pendingQuery,
	phone string,
	now time.Time,
) (*time.Time, error) {
	var expiresAt time.Time

	err := db.QueryRow(
		ctx,
		`SELECT "expiresAt" FROM "OTPCode" `+
			`WHERE "phone" = $1 `+
			`AND "used" = FALSE `+
			`AND "deliveryState" = 'PENDING' `+
			`AND "expiresAt" > $2 `+
			`ORDER BY "id" DESC `+
			`LIMIT 1`,
		phone,
		now,
	).Scan(&expiresAt)

	if errors.Is(
		err, pgx.ErrNoRows,
	) {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	return &expiresAt, nil
}
