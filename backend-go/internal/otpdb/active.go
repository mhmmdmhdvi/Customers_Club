package otpdb

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type ActiveOTP struct {
	ID             int64
	CodeHash       *string
	Nonce          *string
	FailedAttempts int
	ExpiresAt      time.Time
}

type activeQuery interface {
	QueryRow(
		ctx context.Context,
		sql string,
		args ...any,
	) pgx.Row
}

func LatestActiveOTP(
	ctx context.Context,
	db activeQuery,
	phone string,
) (*ActiveOTP, error) {
	var otp ActiveOTP

	err := db.QueryRow(
		ctx,
		`SELECT "id", "codeHash", "nonce", "failedAttempts", "expiresAt" `+
			`FROM "OTPCode" `+
			`WHERE "phone" = $1 `+
			`AND "used" = FALSE `+
			`AND "deliveryState" = 'ACTIVE' `+
			`ORDER BY "id" DESC `+
			`LIMIT 1`,
		phone,
	).Scan(
		&otp.ID,
		&otp.CodeHash,
		&otp.Nonce,
		&otp.FailedAttempts,
		&otp.ExpiresAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	return &otp, nil
}
