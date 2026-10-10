package otpdb

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

type fakeConsumeOTPExec struct {
	sql  string
	args []any
	tag  string
	err  error
}

func (f *fakeConsumeOTPExec) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
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

func TestConsumeActiveOTPAtomicallyClaimsChallenge(t *testing.T) {
	now := time.Date(
		2026,
		time.October,
		10,
		12,
		0,
		0,
		0,
		time.UTC,
	)

	db := &fakeConsumeOTPExec{}

	claimed, err := ConsumeActiveOTP(
		context.Background(),
		db,
		42,
		now,
	)

	if err != nil {
		t.Fatalf(
			"expected OTP consumption to succeed, got %v",
			err,
		)
	}

	if !claimed {
		t.Fatal(
			"expected OTP to be claimed",
		)
	}

	checks := []string{
		`UPDATE "OTPCode"`,
		`SET "used" = TRUE`,
		`"id" = $1`,
		`"used" = FALSE`,
		`"deliveryState" = 'ACTIVE'`,
		`"failedAttempts" < 5`,
		`"expiresAt" > $2`,
	}

	for _, expected := range checks {
		if !strings.Contains(db.sql, expected) {
			t.Fatalf(
				"expected SQL to contain %q",
				expected,
			)
		}
	}

	if len(db.args) != 2 {
		t.Fatalf(
			"expected 2 query arguments, got %d",
			len(db.args),
		)
	}

	if db.args[0] != int64(42) {
		t.Fatalf(
			"expected OTP ID 42, got %v",
			db.args[0],
		)
	}

	queryTime, ok := db.args[1].(time.Time)

	if !ok {
		t.Fatalf(
			"expected time.Time, got %T",
			db.args[1],
		)
	}

	if !queryTime.Equal(now) {
		t.Fatalf(
			"expected database time %v, got %v",
			now,
			queryTime,
		)
	}
}

func TestConsumeActiveOTPReturnsFalseWhenNotClaimed(t *testing.T) {
	db := &fakeConsumeOTPExec{
		tag: "UPDATE 0",
	}

	claimed, err := ConsumeActiveOTP(
		context.Background(),
		db,
		42,
		time.Now(),
	)

	if err != nil {
		t.Fatalf(
			"expected no database error, got %v",
			err,
		)
	}

	if claimed {
		t.Fatal(
			"OTP must not be claimed when zero rows were updated",
		)
	}
}

func TestConsumeActiveOTPPropagatesDatabaseFailure(t *testing.T) {
	failure := errors.New(
		"synthetic OTP consumption database failure",
	)

	db := &fakeConsumeOTPExec{
		err: failure,
	}

	claimed, err := ConsumeActiveOTP(
		context.Background(),
		db,
		42,
		time.Now(),
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected database failure, got %v",
			err,
		)
	}

	if claimed {
		t.Fatal(
			"OTP must not be claimed when database update fails",
		)
	}
}
