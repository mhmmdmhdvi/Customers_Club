package otpdb

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type reserveOTPTx struct {
	now        time.Time
	events     []time.Time
	appended   []time.Time
	insertArgs []any
	committed  bool
	rolledBack bool
}

func (f *reserveOTPTx) Exec(
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

func (f *reserveOTPTx) QueryRow(
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

	case `SELECT "expiresAt" FROM "OTPCode" ` +
		`WHERE "phone" = $1 ` +
		`AND "used" = FALSE ` +
		`AND "deliveryState" = 'PENDING' ` +
		`AND "expiresAt" > $2 ` +
		`ORDER BY "id" DESC ` +
		`LIMIT 1`:
		return fakePendingRow{
			err: pgx.ErrNoRows,
		}

	case insertPendingOTPSQL:
		f.insertArgs = append(
			[]any(nil),
			args...,
		)

		return reserveOTPRow{
			id:        42,
			expiresAt: f.now.Add(2 * time.Minute),
		}

	default:
		return fakeLockRow{}
	}
}

func (f *reserveOTPTx) Commit(
	ctx context.Context,
) error {
	f.committed = true
	return nil
}

func (f *reserveOTPTx) Rollback(
	ctx context.Context,
) error {
	f.rolledBack = true
	return nil
}

type reserveOTPRow struct {
	id        int64
	expiresAt time.Time
}

func (f reserveOTPRow) Scan(
	dest ...any,
) error {
	*dest[0].(*int64) = f.id
	*dest[1].(*time.Time) = f.expiresAt

	return nil
}

func TestReservePhoneOTPStoresPendingChallenge(t *testing.T) {
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

	tx := &reserveOTPTx{
		now: now,
	}

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		return tx, nil
	}

	secret := make([]byte, 32)

	codeHash :=
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

	nonce :=
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

	reserved, err := ReservePhoneOTP(
		context.Background(),
		begin,
		secret,
		"09121234567",
		codeHash,
		nonce,
		2*time.Minute,
	)

	if err != nil {
		t.Fatalf(
			"expected OTP reservation to succeed, got %v",
			err,
		)
	}

	if reserved.ID != 42 {
		t.Fatalf(
			"expected OTP id 42, got %d",
			reserved.ID,
		)
	}

	expectedExpiry :=
		now.Add(2 * time.Minute)

	if !reserved.ExpiresAt.Equal(
		expectedExpiry,
	) {
		t.Fatalf(
			"expected expiry %v, got %v",
			expectedExpiry,
			reserved.ExpiresAt,
		)
	}

	if !tx.committed {
		t.Fatal(
			"expected reservation transaction to commit",
		)
	}

	if tx.rolledBack {
		t.Fatal(
			"successful reservation must not roll back",
		)
	}

	if len(tx.insertArgs) != 4 {
		t.Fatalf(
			"expected 4 OTP insert arguments, got %d",
			len(tx.insertArgs),
		)
	}

	if tx.insertArgs[0] != "09121234567" {
		t.Fatalf(
			"unexpected stored phone: %v",
			tx.insertArgs[0],
		)
	}

	if tx.insertArgs[2] != codeHash {
		t.Fatal(
			"expected OTP hash to be stored",
		)
	}

	if tx.insertArgs[3] != nonce {
		t.Fatal(
			"expected nonce to be stored",
		)
	}
}

func TestReservePhoneOTPRejectsPhoneOverBudget(t *testing.T) {
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

	events := []time.Time{
		now.Add(-10 * time.Minute),
		now.Add(-8 * time.Minute),
		now.Add(-6 * time.Minute),
		now.Add(-4 * time.Minute),
		now.Add(-2 * time.Minute),
	}

	tx := &reserveOTPTx{
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

	_, err := ReservePhoneOTP(
		context.Background(),
		begin,
		secret,
		"09121234567",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		2*time.Minute,
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

	if rateError.RetryAfter != 300 {
		t.Fatalf(
			"expected RetryAfter 300, got %d",
			rateError.RetryAfter,
		)
	}

	if !tx.committed {
		t.Fatal(
			"expected blocked reservation transaction to commit",
		)
	}

	if tx.rolledBack {
		t.Fatal(
			"rate-limit rejection must not roll back",
		)
	}

	if len(tx.appended) != 0 {
		t.Fatal(
			"blocked request must not extend phone rate-limit events",
		)
	}

	if len(tx.insertArgs) != 0 {
		t.Fatal(
			"blocked request must not insert an OTP",
		)
	}
}
