package otpdb

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

type consumeOTPExec interface {
	Exec(
		ctx context.Context,
		sql string,
		args ...any,
	) (pgconn.CommandTag, error)
}

func ConsumeActiveOTP(
	ctx context.Context,
	db consumeOTPExec,
	otpID int64,
	now time.Time,
) (bool, error) {
	result, err := db.Exec(
		ctx,
		`UPDATE "OTPCode" `+
			`SET "used" = TRUE `+
			`WHERE "id" = $1 `+
			`AND "used" = FALSE `+
			`AND "deliveryState" = 'ACTIVE' `+
			`AND "failedAttempts" < 5 `+
			`AND "expiresAt" > $2`,
		otpID,
		now,
	)

	if err != nil {
		return false, err
	}

	return result.RowsAffected() == 1, nil
}
