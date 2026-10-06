package otpdb

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

type fakeClockQuery struct {
	sql  string
	time time.Time
	err  error
}

func (f *fakeClockQuery) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	f.sql = sql

	return fakeClockRow{
		time: f.time,
		err:  f.err,
	}
}

type fakeClockRow struct {
	time time.Time
	err  error
}

func (f fakeClockRow) Scan(
	dest ...any,
) error {
	if f.err != nil {
		return f.err
	}

	target :=
		dest[0].(*time.Time)

	*target = f.time

	return nil
}

func TestNowUsesPostgresClock(t *testing.T) {
	expected := time.Date(
		2026,
		time.September,
		12,
		12,
		0,
		0,
		123000000,
		time.FixedZone(
			"Tehran",
			3*60*60+30*60,
		),
	)

	db := &fakeClockQuery{
		time: expected,
	}

	got, err := Now(
		context.Background(),
		db,
	)

	if err != nil {
		t.Fatalf(
			"expected database clock read to succeed, got %v",
			err,
		)
	}

	if db.sql !=
		"SELECT clock_timestamp()" {
		t.Fatalf(
			"unexpected clock SQL: %q",
			db.sql,
		)
	}

	if !got.Equal(expected) {
		t.Fatalf(
			"expected same instant %v, got %v",
			expected,
			got,
		)
	}

	if got.Location() != time.UTC {
		t.Fatalf(
			"expected UTC result, got %v",
			got.Location(),
		)
	}
}

func TestNowProgatesDatabaseFailure(t *testing.T) {
	failure :=
		errors.New(
			"synthetic clock failure",
		)
	db := &fakeClockQuery{
		err: failure,
	}

	_, err := Now(
		context.Background(),
		db,
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected database failure, got %v",
			err,
		)
	}
}

type advancingClockQuery struct {
	times []time.Time
	index int
}

func (f *advancingClockQuery) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	current :=
		f.times[f.index]

	f.index++

	return fakeClockRow{
		time: current,
	}
}

func TestNowReadsFreshDatabaseTimeEveryCall(t *testing.T) {
	first := time.Date(
		2026,
		time.September,
		12,
		12,
		0,
		0,
		0,
		time.UTC,
	)

	second :=
		first.Add(
			60 * time.Second,
		)

	db := &advancingClockQuery{
		times: []time.Time{
			first,
			second,
		},
	}

	gotFirst, err := Now(
		context.Background(),
		db,
	)

	if err != nil {
		t.Fatalf(
			"first clock read failed: %v",
			err,
		)
	}

	gotSecond, err := Now(
		context.Background(),
		db,
	)

	if err != nil {
		t.Fatalf(
			"second clock read failed: %v",
			err,
		)
	}

	if !gotFirst.Equal(first) {
		t.Fatalf(
			"expected first time %v, got %v",
			first,
			gotFirst,
		)
	}

	if !gotSecond.Equal(second) {
		t.Fatalf(
			"expected second time %v, got %v",
			second,
			gotSecond,
		)
	}

	if db.index != 2 {
		t.Fatalf(
			"expected two database clock reads,got %d",
			db.index,
		)
	}
}
