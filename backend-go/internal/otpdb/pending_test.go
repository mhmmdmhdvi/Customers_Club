package otpdb

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

type fakePendingQuery struct {
	sql       string
	phone     string
	now       time.Time
	expiresAt *time.Time
	err       error
}

func (f *fakePendingQuery) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	f.sql = sql

	if len(args) == 2 {
		f.phone, _ = args[0].(string)
		f.now, _ = args[1].(time.Time)
	}

	return fakePendingRow{
		expiresAt: f.expiresAt,
		err:       f.err,
	}
}

type fakePendingRow struct {
	expiresAt *time.Time
	err       error
}

func (f fakePendingRow) Scan(
	dest ...any,
) error {
	if f.err != nil {
		return f.err
	}

	target := dest[0].(*time.Time)
	*target = *f.expiresAt

	return nil
}

func TestPendingOTPExpiryReturnsActivePendingOTP(t *testing.T) {
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

	expiresAt := now.Add(90 * time.Second)

	db := &fakePendingQuery{
		expiresAt: &expiresAt,
	}

	got, err := PendingOTPExpiry(
		context.Background(),
		db,
		"09121234567",
		now,
	)

	if err != nil {
		t.Fatalf(
			"expected pending OTP lookup to succeed, got %v",
			err,
		)
	}

	if got == nil {
		t.Fatal(
			"expected pending OTP expiry",
		)
	}

	if !got.Equal(expiresAt) {
		t.Fatalf(
			"expected xpiry %v, got %v",
			expiresAt,
			*got,
		)
	}

	if db.phone != "09121234567" {
		t.Fatalf(
			"expected phone %q, got %q",
			"09121234567",
			db.phone,
		)
	}

	if !db.now.Equal(now) {
		t.Fatalf(
			"expected now %v, got %v",
			now,
			db.now,
		)
	}
}

func TestPendingOTPExpiryReturnsNilWhenMissing(t *testing.T) {
	db := &fakePendingQuery{
		err: pgx.ErrNoRows,
	}

	got, err := PendingOTPExpiry(
		context.Background(),
		db,
		"09121234567",
		time.Now(),
	)

	if err != nil {
		t.Fatalf(
			"expected missing pending OTP to succeed, got %v",
			err,
		)
	}

	if got != nil {
		t.Fatalf(
			"expected no pending OTP, got %v",
			*got,
		)
	}
}

func TestPendingOTPExpiryPropagatesDatabaseFailure(t *testing.T) {
	failure :=
		errors.New(
			"synthetic pending lookup failure",
		)

	db := &fakePendingQuery{
		err: failure,
	}

	_, err := PendingOTPExpiry(
		context.Background(),
		db,
		"09121234567",
		time.Now(),
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected database failure, got %v",
			err,
		)
	}
}
