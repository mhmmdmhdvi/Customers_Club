package otpdb

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type markDeliveryFailedTx struct {
	lockKey    int64
	updateSQL  string
	updateArgs []any
	committed  bool
	rolledBack bool
}

func (f *markDeliveryFailedTx) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	if strings.HasPrefix(
		sql,
		`UPDATE "OTPCode"`,
	) {
		f.updateSQL = sql
		f.updateArgs = append(
			[]any(nil),
			args...,
		)

		return pgconn.NewCommandTag(
			"UPDATE 1",
		), nil
	}

	return pgconn.NewCommandTag(
		"OK",
	), nil
}

func (f *markDeliveryFailedTx) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	if len(args) == 1 {
		if value, ok :=
			args[0].(int64); ok {
			f.lockKey = value
		}
	}

	return markDeliveryFailedRow{}
}

func (f *markDeliveryFailedTx) Commit(
	ctx context.Context,
) error {
	f.committed = true
	return nil
}

func (f *markDeliveryFailedTx) Rollback(
	ctx context.Context,
) error {
	f.rolledBack = true
	return nil
}

type markDeliveryFailedRow struct{}

func (
	markDeliveryFailedRow,
) Scan(
	dest ...any,
) error {
	return nil
}

func TestMarkDeliveryFailedMarksExactPendingOTPUsed(t *testing.T) {
	tx := &markDeliveryFailedTx{}

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		return tx, nil
	}

	err := MarkDeliveryFailed(
		context.Background(),
		begin,
		"09121234567",
		42,
	)

	if err != nil {
		t.Fatalf(
			"expected delivery failure cleanup to succeed, got %v",
			err,
		)
	}

	expectedLockKey :=
		LockKey(
			"phone:09121234567",
		)

	if tx.lockKey != expectedLockKey {
		t.Fatalf(
			"expected phone lock key %d, got %d",
			expectedLockKey,
			tx.lockKey,
		)
	}

	if len(tx.updateArgs) != 1 {
		t.Fatalf(
			"expected one update argument, got %d",
			len(tx.updateArgs),
		)
	}

	if tx.updateArgs[0] != int64(42) {
		t.Fatalf(
			"expected OTP id 42, got %v",
			tx.updateArgs[0],
		)
	}

	if !strings.Contains(
		tx.updateSQL,
		`"deliveryState" = 'FAILED'`,
	) {
		t.Fatal(
			"expected delivery state to become FAILED",
		)
	}

	if !strings.Contains(
		tx.updateSQL,
		`"used" = TRUE`,
	) {
		t.Fatal(
			"expected failed OTP to become used",
		)
	}

	if !strings.Contains(
		tx.updateSQL,
		`"id" = $1`,
	) {
		t.Fatal(
			"expected update to target exact OTP id",
		)
	}

	if !strings.Contains(
		tx.updateSQL,
		`"deliveryState" = 'PENDING'`,
	) {
		t.Fatal(
			"expected update to require PENDING state",
		)
	}

	if !tx.committed {
		t.Fatal(
			"expected cleanup transaction to commit",
		)
	}

	if tx.rolledBack {
		t.Fatal(
			"successful cleanup must not roll back",
		)
	}
}
