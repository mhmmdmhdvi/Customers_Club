package otpdb

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

type fakeFailedAttemptExec struct {
	sql   string
	args  []any
	calls int
	tag   string
	err   error
}

func (f *fakeFailedAttemptExec) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	f.calls++
	f.sql = sql
	f.args = append([]any(nil), args...)

	if f.err != nil {
		return pgconn.CommandTag{}, f.err
	}

	tag := f.tag

	if tag == "" {
		tag = "UPDATE 1"
	}

	return pgconn.NewCommandTag(tag), nil
}

func TestIncrementOTPFailedAttemptsTargetsUnusedOTP(t *testing.T) {
	db := &fakeFailedAttemptExec{}

	err := IncrementOTPFailedAttempts(
		context.Background(),
		db,
		42,
	)

	if err != nil {
		t.Fatalf(
			"expected failed attempt increment to succeed, got %v",
			err,
		)
	}

	if db.calls != 1 {
		t.Fatalf(
			"expected exactly one UPDATE, got %d",
			db.calls,
		)
	}

	checks := []string{
		`UPDATE "OTPCode"`,
		`SET "failedAttempts" = "failedAttempts" + 1`,
		`WHERE "id" = $1`,
		`AND "used" = FALSE`,
	}

	for _, expected := range checks {
		if !strings.Contains(db.sql, expected) {
			t.Fatalf(
				"expected SQL to contain %q",
				expected,
			)
		}
	}

	if len(db.args) != 1 {
		t.Fatalf(
			"expected one query argument, got %d",
			len(db.args),
		)
	}

	if db.args[0] != int64(42) {
		t.Fatalf(
			"expected OTP ID 42, got %v",
			db.args[0],
		)
	}
}

func TestIncrementOTPFailedAttemptsAllowsZeroRows(t *testing.T) {
	db := &fakeFailedAttemptExec{
		tag: "UPDATE 0",
	}

	err := IncrementOTPFailedAttempts(
		context.Background(),
		db,
		42,
	)

	if err != nil {
		t.Fatalf(
			"expected no database error, got %v",
			err,
		)
	}

	if db.calls != 1 {
		t.Fatalf(
			"expected one update attempt, got %d",
			db.calls,
		)
	}
}

func TestIncrementOTPFailedAttemptsPropagatesDatabaseError(t *testing.T) {
	failure := errors.New(
		"synthetic failed attempt database error",
	)

	db := &fakeFailedAttemptExec{
		err: failure,
	}

	err := IncrementOTPFailedAttempts(
		context.Background(),
		db,
		42,
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected database error, got %v",
			err,
		)
	}

	if db.calls != 1 {
		t.Fatalf(
			"expected one update attempt, got %d",
			db.calls,
		)
	}
}
