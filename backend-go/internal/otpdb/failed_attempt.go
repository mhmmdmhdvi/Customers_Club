package otpdb

import (
	"context"

	"github.com/jackc/pgx/v5/pgconn"
)

type failedAttemptExec interface {
	Exec(
		ctx context.Context,
		sql string,
		args ...any,
	) (pgconn.CommandTag, error)
}

func IncrementOTPFailedAttempts(
	ctx context.Context,
	db failedAttemptExec,
	otpID int64,
) error {
	_, err := db.Exec(
		ctx,
		`UPDATE "OTPCode" `+
			`SET "failedAttempts" = "failedAttempts" + 1 `+
			`WHERE "id" = $1 `+
			`AND "used" = FALSE`,
		otpID,
	)

	return err
}
