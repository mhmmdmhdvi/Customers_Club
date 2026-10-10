package otpdb

import (
	"context"
	"errors"
)

var ErrActivationRejected = errors.New("OTP activation rejected")

func Activate(
	ctx context.Context,
	begin BeginTransaction,
	phone string,
	otpID int64,
) error {
	return RunTransaction(
		ctx,
		begin,
		func(tx Transaction) error {
			if err := Lock(
				ctx,
				tx,
				"phone:"+phone,
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

			claimed, err := tx.Exec(
				ctx,
				`UPDATE "OTPCode" `+
					`SET "deliveryState" = 'ACTIVE' `+
					`WHERE "id" = $1 `+
					`AND "used" = FALSE `+
					`AND "deliveryState" = 'PENDING' `+
					`AND "expiresAt" > $2`,
				otpID,
				now,
			)

			if err != nil {
				return err
			}

			if claimed.RowsAffected() != 1 {
				return ErrActivationRejected
			}

			_, err = tx.Exec(
				ctx,
				`UPDATE "OTPCode" `+
					`SET "used" = TRUE `+
					`WHERE "phone" = $1 `+
					`AND "used" = FALSE `+
					`AND "id" <> $2`,
				phone,
				otpID,
			)
			if err != nil {
				return err
			}
			return nil
		},
	)
}
