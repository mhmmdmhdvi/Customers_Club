package otpdb

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

type fakeAppendExec struct {
	sql  string
	args []any
}

func (f *fakeAppendExec) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	f.sql = sql
	f.args = append(
		[]any(nil),
		args...,
	)

	return pgconn.NewCommandTag(
		"INSERT 0 1",
	), nil
}

func TestAppendUpsertRateBucket(t *testing.T) {
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

	window := 15 * time.Minute

	previous := []time.Time{
		now.Add(-2 * time.Minute),
		now.Add(-1 * time.Minute),
	}

	db := &fakeAppendExec{}

	err := Append(
		context.Background(),
		db,
		"test-bucket",
		previous,
		now,
		window,
	)

	if err != nil {
		t.Fatalf(
			"expected append to succeed, got %v",
			err,
		)
	}

	const expectedSQL = `INSERT INTO "OtpRateBucket" ("key", "events", "expiresAt") ` +
		`VALUES ($1, $2, $3) ` +
		`ON CONFLICT ("key") DO UPDATE SET ` +
		`"events" = EXCLUDED."events", ` +
		`"expiresAt" = EXCLUDED."expiresAt"`

	if db.sql != expectedSQL {
		t.Fatalf(
			"unexpected append SQL: %q",
			db.sql,
		)
	}

	if len(db.args) != 3 {
		t.Fatalf(
			"expected 3 SQL arguments, got %d",
			len(db.args),
		)
	}

	if db.args[0] != "test-bucket" {
		t.Errorf(
			"expected bucket eky, got %v",
			db.args[0],
		)
	}

	events, ok :=
		db.args[1].([]time.Time)

	if !ok {
		t.Fatalf(
			"expected []time.Time events, got %T",
			db.args[1],
		)
	}

	if len(events) != 3 {
		t.Fatalf(
			"expected 3 stored events, got %d",
			len(events),
		)
	}

	if !events[2].Equal(now) {
		t.Errorf(
			"expeected current event %v, got %v",
			now,
			events[2],
		)
	}

	expiresAt, ok :=
		db.args[2].(time.Time)

	if !ok {
		t.Fatalf(
			"expected time.Time expiary, got %T",
			db.args[2],
		)
	}

	expectedExpiry :=
		now.Add(window)

	if !expiresAt.Equal(expectedExpiry) {
		t.Errorf(
			"expected expiry %v, got %v",
			expectedExpiry,
			expiresAt,
		)
	}

	if len(previous) != 2 {
		t.Fatalf(
			"Append must not modify the caller's slice",
		)
	}
}

func TestAppendPropagatesDatabaseFailure(t *testing.T) {
	failure := errors.New("synthetic append failure")

	db := &failingAppendExec{
		err: failure,
	}

	err := Append(
		context.Background(),
		db,
		"test-bucket",
		[]time.Time{},
		time.Now(),
		15*time.Minute,
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected database failure, got %v",
			err,
		)
	}
}

type failingAppendExec struct {
	err error
}

func (f *failingAppendExec) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, f.err
}
