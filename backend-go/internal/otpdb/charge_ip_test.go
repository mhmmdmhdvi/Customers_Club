package otpdb

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type chargeIPTx struct {
	now        time.Time
	events     []time.Time
	appended   []time.Time
	committed  bool
	rolledBack bool
}

func (f *chargeIPTx) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	if len(args) == 3 {
		if events, ok :=
			args[1].([]time.Time); ok {
			f.appended = append(
				[]time.Time(nil),
				events...,
			)
		}
	}

	return pgconn.NewCommandTag("OK"), nil
}

func (f *chargeIPTx) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	switch sql {
	case "SELECT clock_timestamp()":
		return fakeClockRow{
			time: f.now,
		}

	case `SELECT "events" FROM "OtpRateBucket" WHERE "key" = $1`:
		return fakeEventsRow{
			events: f.events,
		}

	default:
		return fakeLockRow{}
	}
}

func (f *chargeIPTx) Commit(
	ctx context.Context,
) error {
	f.committed = true
	return nil
}

func (f *chargeIPTx) Rollback(
	ctx context.Context,
) error {
	f.rolledBack = true
	return nil
}

func TestChargeIPAllowsRequestWithinBudget(t *testing.T) {
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

	events := make(
		[]time.Time,
		0,
		29,
	)

	for i := 0; i < 29; i++ {
		events = append(
			events,
			now.Add(
				-time.Duration(
					29-i,
				)*time.Second,
			),
		)
	}

	tx := &chargeIPTx{
		now:    now,
		events: events,
	}

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		return tx, nil
	}

	secret := make([]byte, 32)

	err := ChargeIP(
		context.Background(),
		begin,
		secret,
		"192.0.2.1",
		"request",
	)

	if err != nil {
		t.Fatalf(
			"expected request within budget to succeed, got %v",
			err,
		)
	}

	if !tx.committed {
		t.Fatal(
			"expected rate-limit transaction to commit",
		)
	}

	if tx.rolledBack {
		t.Fatal(
			"successful rate-limit transaction must not roll back",
		)
	}

	if len(tx.appended) != 30 {
		t.Fatalf(
			"expected 30 stored events, got %d",
			len(tx.appended),
		)
	}

	if !tx.appended[29].Equal(now) {
		t.Fatalf(
			"expected newest event %v, got %v",
			now,
			tx.appended[29],
		)
	}
}

func TestChargeIPBlocksRequestOverBudget(t *testing.T) {
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

	events := make(
		[]time.Time,
		0,
		30,
	)

	for i := 0; i < 30; i++ {
		events = append(
			events,
			now.Add(
				-time.Duration(
					30-i,
				)*time.Second,
			),
		)
	}

	tx := &chargeIPTx{
		now:    now,
		events: events,
	}

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		return tx, nil
	}

	secret := make([]byte, 32)

	err := ChargeIP(
		context.Background(),
		begin,
		secret,
		"192.0.2.1",
		"request",
	)

	var rateError *RateLimitError

	if !errors.As(
		err,
		&rateError,
	) {
		t.Fatalf(
			"expected RateLimitError, got %v",
			err,
		)
	}

	if rateError.RetryAfter != 870 {
		t.Fatalf(
			"expected RetryAfter 870, got %d",
			rateError.RetryAfter,
		)
	}

	if !tx.committed {
		t.Fatal(
			"expected blocked rate-limit transaction to commit",
		)
	}

	if tx.rolledBack {
		t.Fatal(
			"rate-limit rejection must not roll back",
		)
	}

	if len(tx.appended) != 0 {
		t.Fatalf(
			"blocked request must not append another event, got %d",
			len(tx.appended),
		)
	}
}
