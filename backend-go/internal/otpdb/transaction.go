package otpdb

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type Transaction interface {
	Exec(
		ctx context.Context,
		sql string,
		args ...any,
	) (pgconn.CommandTag, error)

	QueryRow(
		ctx context.Context,
		sql string,
		args ...any,
	) pgx.Row

	Commit(
		ctx context.Context,
	) error

	Rollback(
		ctx context.Context,
	) error
}

type BeginTransaction func(
	ctx context.Context,
	options pgx.TxOptions,
) (Transaction, error)

func RunTransaction(
	ctx context.Context,
	begin BeginTransaction,
	work func(Transaction) error,
) error {
	tx, err := begin(
		ctx,
		pgx.TxOptions{
			IsoLevel: pgx.ReadCommitted,
		},
	)

	if err != nil {
		return err
	}

	if err := work(tx); err != nil {
		_ = tx.Rollback(ctx)

		return err
	}

	if err := tx.Commit(ctx); err != nil {
		_ = tx.Rollback(ctx)

		return err
	}

	return nil
}
