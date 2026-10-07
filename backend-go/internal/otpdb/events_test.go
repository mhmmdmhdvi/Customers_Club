package otpdb

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

type fakeEventsQuery struct {
	sql    string
	key    string
	events []time.Time
	err    error
}

func (f *fakeEventsQuery) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	f.sql = sql

	if len(args) == 1 {
		f.key, _ = args[0].(string)
	}

	return fakeEventsRow{
		events: f.events,
		err:    f.err,
	}
}

type fakeEventsRow struct {
	events []time.Time
	err    error
}

func (f fakeEventsRow) Scan(
	dest ...any,
) error {
	if f.err != nil {
		return f.err
	}

	target :=
		dest[0].(*[]time.Time)

	*target = append(
		[]time.Time(nil),
		f.events...,
	)
	return nil
}

func TestEventsReadsAndFiltersRateBucket(t *testing.T) {
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

	key := "test-rate-bucket"

	db := &fakeEventsQuery{
		events: []time.Time{
			now.Add(-20 * time.Minute),
			now.Add(-2 * time.Minute),
			now.Add(-10 * time.Minute),
		},
	}

	got, err := Events(
		context.Background(),
		db,
		key,
		now,
		15*time.Minute,
	)

	if err != nil {
		t.Fatalf(
			"expected events read to succeed, got %v",
			err,
		)
	}

	const expectedSQL = `SELECT "events" FROM "OtpRateBucket" WHERE "key" = $1`

	if db.sql != expectedSQL {
		t.Fatalf(
			"unexpected events SQL: %q",
			db.sql,
		)
	}

	if db.key != key {
		t.Fatalf(
			"expected key %q, got %q",
			key,
			db.key,
		)
	}

	if len(got) != 2 {
		t.Fatalf(
			"expected 2 active events, got %d",
			len(got),
		)
	}

	if !got[0].Equal(
		now.Add(-10 * time.Minute),
	) {
		t.Errorf(
			"unexpected first event: %v",
			got[0],
		)
	}

	if !got[1].Equal(
		now.Add(-2 * time.Minute),
	) {
		t.Errorf(
			"unexpected second event: %v",
			got[1],
		)
	}
}

func TestEventsReturnsEmptyForMissingBucket(t *testing.T) {
	db := &fakeEventsQuery{
		err: pgx.ErrNoRows,
	}

	got, err := Events(
		context.Background(),
		db,
		"missing-bucket",
		time.Now(),
		15*time.Minute,
	)

	if err != nil {
		t.Fatalf(
			"expected missing bucket to succeed, got %v",
			err,
		)
	}

	if len(got) != 0 {
		t.Fatalf(
			"expected empty events, got %d",
			len(got),
		)
	}
}

func TestEventsPropagatesDatabaseFailure(t *testing.T) {
	failure :=
		errors.New(
			"synthetic database failure",
		)

	db := &fakeEventsQuery{
		err: failure,
	}

	_, err := Events(
		context.Background(),
		db,
		"test-bucket",
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
