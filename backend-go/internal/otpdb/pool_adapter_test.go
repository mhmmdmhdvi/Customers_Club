package otpdb

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
)

type fakeBeginTxPool struct {
	calls   int
	options pgx.TxOptions
	err     error
	tx      pgx.Tx
}

func (f *fakeBeginTxPool) BeginTx(
	ctx context.Context,
	options pgx.TxOptions,
) (pgx.Tx, error) {
	f.calls++
	f.options = options

	return f.tx, f.err
}

func TestBeginFromPoolPropagatesTransactionStartFailure(
	t *testing.T,
) {
	failure := errors.New(
		"synthetic PostgreSQL pool failure",
	)

	pool := &fakeBeginTxPool{
		err: failure,
	}

	begin := BeginFromPool(pool)

	if begin == nil {
		t.Fatal("expected transaction starter")
	}

	workCalled := false

	err := RunTransaction(
		context.Background(),
		begin,
		func(tx Transaction) error {
			workCalled = true
			return nil
		},
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected pool failure, got %v",
			err,
		)
	}

	if pool.calls != 1 {
		t.Fatalf(
			"expected one BeginTx call, got %d",
			pool.calls,
		)
	}

	if pool.options.IsoLevel != pgx.ReadCommitted {
		t.Fatalf(
			"expected ReadCommitted, got %v",
			pool.options.IsoLevel,
		)
	}

	if workCalled {
		t.Fatal(
			"transaction work must not run if BeginTx fails",
		)
	}
}

type fakePoolTransaction struct {
	pgx.Tx

	commits   int
	rollbacks int
}

func (f *fakePoolTransaction) Commit(
	ctx context.Context,
) error {
	f.commits++
	return nil
}

func (f *fakePoolTransaction) Rollback(
	ctx context.Context,
) error {
	f.rollbacks++
	return nil
}

func TestBeginFromPoolCommitsSuccessfulWork(t *testing.T) {
	fakeTx := &fakePoolTransaction{}

	pool := &fakeBeginTxPool{
		tx: fakeTx,
	}

	begin := BeginFromPool(pool)

	workCalled := false

	err := RunTransaction(
		context.Background(),
		begin,
		func(tx Transaction) error {
			workCalled = true

			if tx != fakeTx {
				t.Fatal(
					"expected the transaction returned by the pool",
				)
			}

			return nil
		},
	)

	if err != nil {
		t.Fatalf(
			"expected successful transaction, got %v",
			err,
		)
	}

	if !workCalled {
		t.Fatal("expected transaction work to execute")
	}

	if pool.calls != 1 {
		t.Fatalf(
			"expected one BeginTx call, got %d",
			pool.calls,
		)
	}

	if fakeTx.commits != 1 {
		t.Fatalf(
			"expected one commit, got %d",
			fakeTx.commits,
		)
	}

	if fakeTx.rollbacks != 0 {
		t.Fatal(
			"successful transaction must not roll back",
		)
	}
}

func TestBeginFromPoolRollsBackFailedWork(t *testing.T) {
	fakeTx := &fakePoolTransaction{}

	pool := &fakeBeginTxPool{
		tx: fakeTx,
	}

	begin := BeginFromPool(pool)

	failure := errors.New(
		"synthetic transaction work failure",
	)

	err := RunTransaction(
		context.Background(),
		begin,
		func(tx Transaction) error {
			if tx != fakeTx {
				t.Fatal(
					"expected the transaction returned by the pool",
				)
			}

			return failure
		},
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected work failure, got %v",
			err,
		)
	}

	if pool.calls != 1 {
		t.Fatalf(
			"expected one BeginTx call, got %d",
			pool.calls,
		)
	}

	if fakeTx.commits != 0 {
		t.Fatal(
			"failed transaction must not commit",
		)
	}

	if fakeTx.rollbacks != 1 {
		t.Fatalf(
			"expected one rollback, got %d",
			fakeTx.rollbacks,
		)
	}
}
