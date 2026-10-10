package otpdb

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

type fakeVerificationBudgetQuery struct {
	events []time.Time
	sql    string
	key    string
	err    error
}

func (f *fakeVerificationBudgetQuery) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	f.sql = sql

	if len(args) == 1 {
		f.key, _ = args[0].(string)
	}

	return fakeVerificationBudgetRow{
		events: f.events,
		err:    f.err,
	}
}

type fakeVerificationBudgetRow struct {
	events []time.Time
	err    error
}

func (f fakeVerificationBudgetRow) Scan(
	dest ...any,
) error {
	if f.err != nil {
		return f.err
	}

	*dest[0].(*[]time.Time) = append(
		[]time.Time(nil),
		f.events...,
	)

	return nil
}

func TestVerificationFailureBudgetBlocksTenFailures(t *testing.T) {
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

	events := make([]time.Time, 0, 10)

	for minutesAgo := 10; minutesAgo >= 1; minutesAgo-- {
		events = append(
			events,
			now.Add(
				-time.Duration(minutesAgo)*time.Minute,
			),
		)
	}

	db := &fakeVerificationBudgetQuery{
		events: events,
	}

	secret := make([]byte, 32)
	phone := "09121234567"

	budget, err := VerificationFailureBudget(
		context.Background(),
		db,
		secret,
		phone,
		now,
	)

	if err != nil {
		t.Fatalf(
			"expected budget lookup to succeed, got %v",
			err,
		)
	}

	if budget.RetryAfter != 300 {
		t.Fatalf(
			"expected 300 seconds wait, got %d",
			budget.RetryAfter,
		)
	}

	if len(budget.Events) != 10 {
		t.Fatalf(
			"expected 10 failure events, got %d",
			len(budget.Events),
		)
	}

	expectedKey, err := BucketKey(
		secret,
		"phone:failure",
		phone,
	)

	if err != nil {
		t.Fatalf(
			"expected bucket key, got %v",
			err,
		)
	}

	if db.key != expectedKey {
		t.Fatal(
			"expected phone verification failure bucket key",
		)
	}

	if !strings.Contains(
		db.sql,
		`"OtpRateBucket"`,
	) {
		t.Fatal(
			"expected verification budget database query",
		)
	}
}

func TestVerificationFailureBudgetAllowsNineFailures(t *testing.T) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	events := make([]time.Time, 0, 9)

	for minutesAgo := 10; minutesAgo >= 2; minutesAgo-- {
		events = append(
			events,
			now.Add(-time.Duration(minutesAgo)*time.Minute),
		)
	}

	db := &fakeVerificationBudgetQuery{
		events: events,
	}

	budget, err := VerificationFailureBudget(
		context.Background(),
		db,
		make([]byte, 32),
		"09121234567",
		now,
	)

	if err != nil {
		t.Fatalf(
			"expected budget lookup to succeed, got %v",
			err,
		)
	}

	if budget.RetryAfter != 0 {
		t.Fatalf(
			"expected no wait, got %d",
			budget.RetryAfter,
		)
	}

	if len(budget.Events) != 9 {
		t.Fatalf(
			"expected 9 events, got %d",
			len(budget.Events),
		)
	}
}

func TestVerificationFailureBudgetPropagatesDatabaseError(t *testing.T) {
	failure := errors.New(
		"synthetic verification budget database failure",
	)

	db := &fakeVerificationBudgetQuery{
		err: failure,
	}

	budget, err := VerificationFailureBudget(
		context.Background(),
		db,
		make([]byte, 32),
		"09121234567",
		time.Now(),
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected database failure, got %v",
			err,
		)
	}

	if len(budget.Events) != 0 {
		t.Fatal(
			"expected no usable events on database failure",
		)
	}
}
