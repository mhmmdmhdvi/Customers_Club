package otpdb

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type activationUpdate struct {
	sql  string
	args []any
}

type activateTx struct {
	now        time.Time
	lockKey    int64
	updates    []activationUpdate
	claimTag   string
	committed  bool
	rolledBack bool
}

func (f *activateTx) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	if strings.HasPrefix(
		sql,
		`UPDATE "OTPCode"`,
	) {
		f.updates = append(
			f.updates,
			activationUpdate{
				sql: sql,
				args: append(
					[]any(nil),
					args...,
				),
			},
		)

		if len(f.updates) == 1 &&
			f.claimTag != "" {
			return pgconn.NewCommandTag(
				f.claimTag,
			), nil
		}

		return pgconn.NewCommandTag(
			"UPDATE 1",
		), nil
	}

	return pgconn.NewCommandTag(
		"OK",
	), nil
}

func (f *activateTx) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	if sql == "SELECT clock_timestamp()" {
		return activateRow{
			now: &f.now,
		}
	}

	if len(args) == 1 {
		if value, ok :=
			args[0].(int64); ok {
			f.lockKey = value
		}
	}

	return activateRow{}
}

func (f *activateTx) Commit(
	ctx context.Context,
) error {
	f.committed = true
	return nil
}

func (f *activateTx) Rollback(
	ctx context.Context,
) error {
	f.rolledBack = true
	return nil
}

type activateRow struct {
	now *time.Time
}

func (f activateRow) Scan(
	dest ...any,
) error {
	if f.now != nil {
		*dest[0].(*time.Time) = *f.now
	}

	return nil
}

func TestActivateClaimsPendingOTPAndInvalidatesOthers(t *testing.T) {
	now := time.Date(
		2026,
		time.October,
		7,
		12,
		0,
		0,
		0,
		time.UTC,
	)

	tx := &activateTx{
		now: now,
	}

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		return tx, nil
	}

	err := Activate(
		context.Background(),
		begin,
		"09121234567",
		42,
	)

	if err != nil {
		t.Fatalf(
			"expected activation to succeed, got %v",
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

	if len(tx.updates) != 2 {
		t.Fatalf(
			"expected two OTP updates, got %d",
			len(tx.updates),
		)
	}

	claim := tx.updates[0]

	if !strings.Contains(
		claim.sql,
		`"deliveryState" = 'ACTIVE'`,
	) {
		t.Fatal(
			"expected reserved OTP to become ACTIVE",
		)
	}

	if !strings.Contains(
		claim.sql,
		`"id" = $1`,
	) {
		t.Fatal(
			"expected activation to target exact OTP id",
		)
	}

	if !strings.Contains(
		claim.sql,
		`"used" = FALSE`,
	) {
		t.Fatal(
			"expected activation to require unused OTP",
		)
	}

	if !strings.Contains(
		claim.sql,
		`"deliveryState" = 'PENDING'`,
	) {
		t.Fatal(
			"expected activation to require PENDING state",
		)
	}

	if !strings.Contains(
		claim.sql,
		`"expiresAt" > $2`,
	) {
		t.Fatal(
			"expected activation to require unexpired OTP",
		)
	}

	if len(claim.args) != 2 {
		t.Fatalf(
			"expected two activation arguments, got %d",
			len(claim.args),
		)
	}

	if claim.args[0] != int64(42) {
		t.Fatalf(
			"expected OTP id 42, got %v",
			claim.args[0],
		)
	}

	claimNow, ok :=
		claim.args[1].(time.Time)

	if !ok {
		t.Fatalf(
			"expected database time argument, got %T",
			claim.args[1],
		)
	}

	if !claimNow.Equal(now) {
		t.Fatalf(
			"expected database time %v, got %v",
			now,
			claimNow,
		)
	}

	invalidate := tx.updates[1]

	if !strings.Contains(
		invalidate.sql,
		`"used" = TRUE`,
	) {
		t.Fatal(
			"expected older unused OTPs to become used",
		)
	}

	if !strings.Contains(
		invalidate.sql,
		`"phone" = $1`,
	) {
		t.Fatal(
			"expected invalidation to target same phone",
		)
	}

	if !strings.Contains(
		invalidate.sql,
		`"id" <> $2`,
	) {
		t.Fatal(
			"expected activated OTP to be excluded from invalidation",
		)
	}

	if !tx.committed {
		t.Fatal(
			"expected activation transaction to commit",
		)
	}

	if tx.rolledBack {
		t.Fatal(
			"successful activation must not roll back",
		)
	}
}

func TestActivateRejectsUnclaimableOTPWithoutInvalidatingOthers(t *testing.T) {
	now := time.Date(
		2026,
		time.October,
		7,
		12,
		0,
		0,
		0,
		time.UTC,
	)

	tx := &activateTx{
		now:      now,
		claimTag: "UPDATE 0",
	}

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		return tx, nil
	}

	err := Activate(
		context.Background(),
		begin,
		"09121234567",
		42,
	)

	if !errors.Is(
		err,
		ErrActivationRejected,
	) {
		t.Fatalf(
			"expected ErrActivationRejected, got %v",
			err,
		)
	}

	if len(tx.updates) != 1 {
		t.Fatalf(
			"expected only activation attemp, got %d updates",
			len(tx.updates),
		)
	}

	if tx.committed {
		t.Fatal(
			"rejected activation must not commit",
		)
	}

	if !tx.rolledBack {
		t.Fatal(
			"rejected acitvation must roll back",
		)
	}
}
