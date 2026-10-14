package otpdb

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type fakeTransaction struct {
	committed  bool
	rolledBack bool
}

type cleanupTransaction struct {
	fakeTransaction
	rollbackContext      context.Context
	rollbackContextError error
	commitError          error
}

func (tx *cleanupTransaction) Commit(ctx context.Context) error {
	if tx.commitError != nil {
		return tx.commitError
	}
	return ctx.Err()
}

func (tx *cleanupTransaction) Rollback(ctx context.Context) error {
	tx.rolledBack = true
	tx.rollbackContext = ctx
	tx.rollbackContextError = ctx.Err()
	return ctx.Err()
}

func TestRunTransactionCleansUpPanicsAndCancellation(t *testing.T) {
	for _, mode := range []string{"panic", "cancel-work", "cancel-commit", "commit-error"} {
		t.Run(mode, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			tx := &cleanupTransaction{}
			failure := errors.New("work or commit failure")
			if mode == "commit-error" {
				tx.commitError = failure
			}
			var recovered any
			var err error
			func() {
				defer func() { recovered = recover() }()
				err = RunTransaction(ctx, func(context.Context, pgx.TxOptions) (Transaction, error) { return tx, nil }, func(Transaction) error {
					if mode == "panic" {
						panic(failure)
					}
					if mode == "cancel-work" || mode == "cancel-commit" {
						cancel()
					}
					if mode == "cancel-work" {
						return failure
					}
					return nil
				})
			}()
			if mode == "panic" && recovered != failure {
				t.Fatalf("panic not preserved: %v", recovered)
			}
			if mode != "panic" && err == nil {
				t.Fatal("lost failure")
			}
			if !tx.rolledBack || tx.rollbackContext == nil {
				t.Fatal("transaction was not cleaned up")
			}
			if tx.rollbackContextError != nil {
				t.Fatalf("cleanup reused canceled context: %v", tx.rollbackContextError)
			}
			// The cleanup context is canceled when cleanup finishes; check it during Rollback below instead.
			if deadline, ok := tx.rollbackContext.Deadline(); !ok || time.Until(deadline) > 5*time.Second {
				t.Fatal("rollback must have an independent bounded cleanup context")
			}
		})
	}
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
