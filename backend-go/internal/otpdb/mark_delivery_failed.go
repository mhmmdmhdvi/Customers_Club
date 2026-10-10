package otpdb

import (
	"context"
)

func MarkDeliveryFailed(
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

			_, err := tx.Exec(
				ctx,
				`UPDATE "OTPCode" `+
					`SET "deliveryState" = 'FAILED', `+
					`"used" = TRUE `+
					`WHERE "id" = $1 `+
					`AND "deliveryState" = 'PENDING'`,
				otpID,
			)

			if err != nil {
				return err
			}

			return nil
		},
	)
}
