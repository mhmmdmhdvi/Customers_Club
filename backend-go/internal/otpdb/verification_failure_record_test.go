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

type failureWrite struct {
	sql  string
	args []any
}

type fakeFailureRecordTx struct {
	writes      []failureWrite
	failOnWrite int
	failure     error
	committed   bool
	rolledBack  bool
}

func (f *fakeFailureRecordTx) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	f.writes = append(
		f.writes,
		failureWrite{
			sql:  sql,
			args: append([]any(nil), args...),
		},
	)

	if f.failOnWrite > 0 &&
		len(f.writes) == f.failOnWrite {
		return pgconn.CommandTag{}, f.failure
	}

	return pgconn.NewCommandTag("UPDATE 1"), nil
}

func (f *fakeFailureRecordTx) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	panic("unexpected QueryRow")
}

func (f *fakeFailureRecordTx) Commit(
	ctx context.Context,
) error {
	f.committed = true
	return nil
}

func (f *fakeFailureRecordTx) Rollback(
	ctx context.Context,
) error {
	f.rolledBack = true
	return nil
}

func TestRecordVerificationFailureWritesBothCounters(t *testing.T) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	secret := make([]byte, 32)
	phone := "09121234567"
	otpID := int64(42)

	previousEvents := []time.Time{
		now.Add(-5 * time.Minute),
	}

	tx := &fakeFailureRecordTx{}

	err := RecordVerificationFailure(
		context.Background(),
		tx,
		secret,
		phone,
		previousEvents,
		now,
		&otpID,
	)

	if err != nil {
		t.Fatalf(
			"expected failure recording to succeed, got %v",
			err,
		)
	}

	if len(tx.writes) != 2 {
		t.Fatalf(
			"expected 2 database writes, got %d",
			len(tx.writes),
		)
	}

	// First write: append the phone failure event.
	bucketWrite := tx.writes[0]

	if !strings.Contains(
		bucketWrite.sql,
		`INSERT INTO "OtpRateBucket"`,
	) {
		t.Fatal("expected rate bucket write first")
	}

	expectedKey, err := BucketKey(
		secret,
		"phone:failure",
		phone,
	)

	if err != nil {
		t.Fatalf("expected bucket key, got %v", err)
	}

	if len(bucketWrite.args) != 3 {
		t.Fatalf(
			"expected 3 bucket arguments, got %d",
			len(bucketWrite.args),
		)
	}

	if bucketWrite.args[0] != expectedKey {
		t.Fatal("unexpected phone failure bucket key")
	}

	recordedEvents, ok :=
		bucketWrite.args[1].([]time.Time)

	if !ok {
		t.Fatal("expected timestamp events")
	}

	if len(recordedEvents) != 2 {
		t.Fatalf(
			"expected 2 events, got %d",
			len(recordedEvents),
		)
	}

	if !recordedEvents[0].Equal(previousEvents[0]) ||
		!recordedEvents[1].Equal(now) {
		t.Fatal("expected previous event followed by new failure")
	}

	expiresAt, ok :=
		bucketWrite.args[2].(time.Time)

	if !ok || !expiresAt.Equal(
		now.Add(15*time.Minute),
	) {
		t.Fatal("unexpected failure bucket expiry")
	}

	// Second write: increment the individual OTP counter.
	otpWrite := tx.writes[1]

	if !strings.Contains(
		otpWrite.sql,
		`UPDATE "OTPCode"`,
	) {
		t.Fatal("expected OTP update second")
	}

	if !strings.Contains(
		otpWrite.sql,
		`SET "failedAttempts" = "failedAttempts" + 1`,
	) {
		t.Fatal("expected failedAttempts increment")
	}

	if len(otpWrite.args) != 1 ||
		otpWrite.args[0] != otpID {
		t.Fatalf(
			"unexpected OTP update arguments: %v",
			otpWrite.args,
		)
	}

	if tx.committed || tx.rolledBack {
		t.Fatal(
			"helper must not control transaction completion",
		)
	}
}

func TestRecordVerificationFailureWithoutOTP(t *testing.T) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	tx := &fakeFailureRecordTx{}

	err := RecordVerificationFailure(
		context.Background(),
		tx,
		make([]byte, 32),
		"09121234567",
		nil,
		now,
		nil,
	)

	if err != nil {
		t.Fatalf(
			"expected failure recording to succeed, got %v",
			err,
		)
	}

	if len(tx.writes) != 1 {
		t.Fatalf(
			"expected only phone failure bucket write, got %d",
			len(tx.writes),
		)
	}

	if !strings.Contains(
		tx.writes[0].sql,
		`INSERT INTO "OtpRateBucket"`,
	) {
		t.Fatal(
			"expected phone failure event to be recorded",
		)
	}

	if tx.committed || tx.rolledBack {
		t.Fatal(
			"helper must not complete the transaction",
		)
	}
}

func TestRecordVerificationFailurePropagatesWriteError(t *testing.T) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	failure := errors.New(
		"synthetic OTP failure counter update error",
	)

	tx := &fakeFailureRecordTx{
		failOnWrite: 2,
		failure:     failure,
	}

	otpID := int64(42)

	err := RecordVerificationFailure(
		context.Background(),
		tx,
		make([]byte, 32),
		"09121234567",
		nil,
		now,
		&otpID,
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected database failure, got %v",
			err,
		)
	}

	if len(tx.writes) != 2 {
		t.Fatalf(
			"expected two attempted writes, got %d",
			len(tx.writes),
		)
	}

	if tx.committed || tx.rolledBack {
		t.Fatal(
			"transaction completion belongs to caller",
		)
	}
}
