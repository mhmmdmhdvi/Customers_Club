package otpdb

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type fakeTransaction struct {
	committed  bool
	rolledBack bool
}

func (f *fakeTransaction) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func (f *fakeTransaction) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	return fakeLockRow{}
}

func (f *fakeTransaction) Commit(
	ctx context.Context,
) error {
	f.committed = true
	return nil
}

func (f *fakeTransaction) Rollback(
	ctx context.Context,
) error {
	f.rolledBack = true
	return nil
}

func TestRunTransactionCommitsSuccessfulWork(t *testing.T) {
	tx := &fakeTransaction{}

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		if options.IsoLevel != pgx.ReadCommitted {
			t.Fatalf(
				"expected ReadCommitted isolation, got %v",
				options.IsoLevel,
			)
		}

		return tx, nil
	}

	err := RunTransaction(
		context.Background(),
		begin,
		func(tx Transaction) error {
			return nil
		},
	)

	if err != nil {
		t.Fatalf(
			"expected transaction success, got %v",
			err,
		)
	}

	if !tx.committed {
		t.Fatal(
			"expected transaction to commit",
		)
	}

	if tx.rolledBack {
		t.Fatal(
			"successful transaction must not roll back",
		)
	}
}

func TestRunTransactionRollsBackFailedWork(t *testing.T) {
	tx := &fakeTransaction{}

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		return tx, nil
	}

	failure :=
		errors.New(
			"synthetic transaction failure",
		)

	err := RunTransaction(
		context.Background(),
		begin,
		func(tx Transaction) error {
			return failure
		},
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected work failure, got %v",
			err,
		)
	}

	if tx.committed {
		t.Fatal(
			"failed transaction must not commit",
		)
	}

	if !tx.rolledBack {
		t.Fatal(
			"expected failed transaction to roll back",
		)
	}
}
