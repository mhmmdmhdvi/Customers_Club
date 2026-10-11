package otpdb

import (
	"context"

	"github.com/jackc/pgx/v5"
)

type beginTxPool interface {
	BeginTx(
		ctx context.Context,
		options pgx.TxOptions,
	) (pgx.Tx, error)
}

func BeginFromPool(
	pool beginTxPool,
) BeginTransaction {
	if pool == nil {
		return nil
	}

	return func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		tx, err := pool.BeginTx(
			ctx,
			options,
		)

		if err != nil {
			return nil, err
		}

		return tx, nil
	}
}
