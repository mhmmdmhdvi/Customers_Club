package otpdb

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type fakeLockTx struct {
	execSQL  string
	querySQL string
	queryArg any
}

func (f *fakeLockTx) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	f.execSQL = sql
	return pgconn.NewCommandTag("SET"), nil
}

func (f *fakeLockTx) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	f.querySQL = sql

	if len(args) == 1 {
		f.queryArg = args[0]
	}

	return fakeLockRow{}
}

type fakeLockRow struct{}

func (fakeLockRow) Scan(
	dest ...any,
) error {
	if len(dest) == 1 {
		if value, ok := dest[0].(*string); ok {
			*value = ""
		}
	}
	return nil
}

func TestLockUsesNodeCompatiblePostgresLock(t *testing.T) {
	tx := &fakeLockTx{}

	scope := "phone:09121234567"

	err := Lock(
		context.Background(),
		tx,
		scope,
	)

	if err != nil {
		t.Fatalf(
			"expected lock to succeed, got %v",
			err,
		)
	}

	if tx.execSQL !=
		"SET LOCAL lock_timeout = '3s'" {
		t.Errorf(
			"unexpected lock timeout SQL: %q",
			tx.execSQL,
		)
	}

	const expectedQuery = "SELECT pg_advisory_xact_lock($1::bigint)::text AS lock"

	if tx.querySQL != expectedQuery {
		t.Errorf(
			"unexpected advisory lock SQL: %q",
			tx.querySQL,
		)
	}

	expectedKey := LockKey(scope)

	if tx.queryArg != expectedKey {
		t.Errorf(
			"expected lock key %d, got %v",
			expectedKey,
			tx.queryArg,
		)
	}
}
