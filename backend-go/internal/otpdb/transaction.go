package otpdb

import (
	"context"
	"time"

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
	committed := false
	defer func() {
		if committed {
			return
		}
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		_ = tx.Rollback(cleanupCtx)
	}()

	if err := work(tx); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	committed = true

	return nil
}
