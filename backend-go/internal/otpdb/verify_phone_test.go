package otpdb

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpcrypto"
)

type verifyMissingOTPTx struct {
	now            time.Time
	phoneLocked    bool
	activeQueried  bool
	bucketWrites   int
	bucketKey      string
	recordedEvents []time.Time
	otpUpdates     int
	committed      bool
	rolledBack     bool
	activeOTP      *ActiveOTP
	otpUpdateSQLs  []string
}

func (f *verifyMissingOTPTx) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	if strings.HasPrefix(sql, `INSERT INTO "OtpRateBucket"`) {
		f.bucketWrites++

		if len(args) == 3 {
			f.bucketKey, _ = args[0].(string)
			f.recordedEvents, _ = args[1].([]time.Time)
		}
	}

	if strings.HasPrefix(sql, `UPDATE "OTPCode"`) {
		f.otpUpdates++

		f.otpUpdateSQLs = append(
			f.otpUpdateSQLs,
			sql,
		)

		return pgconn.NewCommandTag("UPDATE 1"), nil
	}

	return pgconn.NewCommandTag("OK"), nil
}

func (f *verifyMissingOTPTx) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	switch {
	case sql == "SELECT clock_timestamp()":
		return verifyMissingRow{
			kind: "clock",
			now:  f.now,
		}

	case strings.Contains(sql, `FROM "OtpRateBucket"`):
		return verifyMissingRow{kind: "events"}

	case strings.Contains(sql, `FROM "OTPCode"`):
		f.activeQueried = true

		if f.activeOTP != nil {
			return verifyMissingRow{
				kind: "active",
				otp:  f.activeOTP,
			}
		}

		return verifyMissingRow{kind: "missing"}

	case strings.Contains(sql, "pg_advisory_xact_lock"):
		f.phoneLocked = true
		return verifyMissingRow{kind: "lock"}

	default:
		panic("unexpected query: " + sql)
	}
}

func (f *verifyMissingOTPTx) Commit(ctx context.Context) error {
	f.committed = true
	return nil
}

func (f *verifyMissingOTPTx) Rollback(ctx context.Context) error {
	f.rolledBack = true
	return nil
}

type verifyMissingRow struct {
	kind string
	now  time.Time
	otp  *ActiveOTP
}

func (r verifyMissingRow) Scan(dest ...any) error {
	switch r.kind {
	case "clock":
		*dest[0].(*time.Time) = r.now

	case "events":
		*dest[0].(*[]time.Time) = nil

	case "missing":
		return pgx.ErrNoRows

	case "lock":
		return nil

	case "active":
		*dest[0].(*int64) = r.otp.ID
		*dest[1].(**string) = r.otp.CodeHash
		*dest[2].(**string) = r.otp.Nonce
		*dest[3].(*int) = r.otp.FailedAttempts
		*dest[4].(*time.Time) = r.otp.ExpiresAt

	default:
		panic("unexpected row kind")
	}

	return nil
}

func TestVerifyPhoneOTPCommitsFailureWhenNoActiveOTP(t *testing.T) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	tx := &verifyMissingOTPTx{
		now: now,
	}

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		return tx, nil
	}

	secret := make([]byte, 32)
	phone := "09121234567"

	callbackCalled := false

	err := VerifyPhoneOTP(
		context.Background(),
		begin,
		secret,
		phone,
		"123456",
		func(
			ctx context.Context,
			tx Transaction,
			now time.Time,
		) error {
			callbackCalled = true
			return nil
		},
	)

	if !errors.Is(err, ErrInvalidOTP) {
		t.Fatalf(
			"expected ErrInvalidOTP, got %v",
			err,
		)
	}

	if !tx.phoneLocked {
		t.Fatal("expected phone advisory lock")
	}

	if !tx.activeQueried {
		t.Fatal("expected ACTIVE OTP lookup")
	}

	if tx.bucketWrites != 1 {
		t.Fatalf(
			"expected one failure bucket write, got %d",
			tx.bucketWrites,
		)
	}

	expectedKey, err := BucketKey(
		secret,
		"phone:failure",
		phone,
	)

	if err != nil {
		t.Fatalf("bucket key failure: %v", err)
	}

	if tx.bucketKey != expectedKey {
		t.Fatal("unexpected failure bucket key")
	}

	if len(tx.recordedEvents) != 1 ||
		!tx.recordedEvents[0].Equal(now) {
		t.Fatal("expected one new failure event")
	}

	if tx.otpUpdates != 0 {
		t.Fatal("must not update a nonexistent OTP")
	}

	if callbackCalled {
		t.Fatal("verification callback must not run")
	}

	if !tx.committed {
		t.Fatal("failure counter must commit")
	}

	if tx.rolledBack {
		t.Fatal("invalid OTP must not roll back recorded failure")
	}
}

func TestVerifyPhoneOTPConsumesValidCodeAndRunsCallback(t *testing.T) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	secret := make([]byte, 32)
	phone := "09121234567"
	code := "123456"
	nonce := strings.Repeat("1", 64)

	hash, err := otpcrypto.HashCode(
		secret,
		phone,
		nonce,
		code,
	)

	if err != nil {
		t.Fatalf(
			"expected OTP hashing to succeed, got %v",
			err,
		)
	}

	fake := &verifyMissingOTPTx{
		now: now,

		activeOTP: &ActiveOTP{
			ID:             42,
			CodeHash:       &hash,
			Nonce:          &nonce,
			FailedAttempts: 0,
			ExpiresAt:      now.Add(2 * time.Minute),
		},
	}

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		return fake, nil
	}

	callbackCalled := false

	err = VerifyPhoneOTP(
		context.Background(),
		begin,
		secret,
		phone,
		code,
		func(
			ctx context.Context,
			tx Transaction,
			callbackNow time.Time,
		) error {
			callbackCalled = true

			if tx != fake {
				t.Fatal(
					"callback must use the same transaction",
				)
			}

			if !callbackNow.Equal(now) {
				t.Fatal(
					"callback must receive database time",
				)
			}

			if fake.otpUpdates != 1 {
				t.Fatal(
					"OTP must be consumed before callback",
				)
			}

			if fake.committed {
				t.Fatal(
					"callback must run before transaction commits",
				)
			}

			return nil
		},
	)

	if err != nil {
		t.Fatalf(
			"expected valid OTP verification, got %v",
			err,
		)
	}

	if !fake.phoneLocked {
		t.Fatal("expected phone advisory lock")
	}

	if !fake.activeQueried {
		t.Fatal("expected ACTIVE OTP lookup")
	}

	if fake.otpUpdates != 1 {
		t.Fatalf(
			"expected one OTP consumption, got %d",
			fake.otpUpdates,
		)
	}

	if fake.bucketWrites != 0 {
		t.Fatal(
			"valid OTP must not record a failure",
		)
	}

	if !callbackCalled {
		t.Fatal(
			"expected verification callback",
		)
	}

	if !fake.committed {
		t.Fatal(
			"expected transaction to commit",
		)
	}

	if fake.rolledBack {
		t.Fatal(
			"valid verification must not roll back",
		)
	}
}

func TestVerifyPhoneOTPRecordsWrongCodeAndCommits(t *testing.T) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	secret := make([]byte, 32)
	phone := "09121234567"
	nonce := strings.Repeat("1", 64)

	// The correct code stored through its HMAC is 123456.
	hash, err := otpcrypto.HashCode(
		secret,
		phone,
		nonce,
		"123456",
	)

	if err != nil {
		t.Fatalf("expected hashing to succeed, got %v", err)
	}

	fake := &verifyMissingOTPTx{
		now: now,
		activeOTP: &ActiveOTP{
			ID:             42,
			CodeHash:       &hash,
			Nonce:          &nonce,
			FailedAttempts: 0,
			ExpiresAt:      now.Add(2 * time.Minute),
		},
	}

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		return fake, nil
	}

	callbackCalled := false

	// User submits the WRONG code.
	err = VerifyPhoneOTP(
		context.Background(),
		begin,
		secret,
		phone,
		"654321",
		func(
			ctx context.Context,
			tx Transaction,
			callbackNow time.Time,
		) error {
			callbackCalled = true
			return nil
		},
	)

	if !errors.Is(err, ErrInvalidOTP) {
		t.Fatalf(
			"expected ErrInvalidOTP, got %v",
			err,
		)
	}

	if !fake.phoneLocked {
		t.Fatal("expected phone advisory lock")
	}

	if !fake.activeQueried {
		t.Fatal("expected ACTIVE OTP lookup")
	}

	if fake.bucketWrites != 1 {
		t.Fatalf(
			"expected one phone failure event write, got %d",
			fake.bucketWrites,
		)
	}

	if len(fake.recordedEvents) != 1 ||
		!fake.recordedEvents[0].Equal(now) {
		t.Fatal(
			"expected incorrect attempt to be recorded",
		)
	}

	if fake.otpUpdates != 1 {
		t.Fatalf(
			"expected one OTP counter update, got %d",
			fake.otpUpdates,
		)
	}

	if len(fake.otpUpdateSQLs) != 1 {
		t.Fatal(
			"expected exactly one OTP update statement",
		)
	}

	if !strings.Contains(
		fake.otpUpdateSQLs[0],
		`SET "failedAttempts" = "failedAttempts" + 1`,
	) {
		t.Fatal(
			"expected failedAttempts increment, not OTP consumption",
		)
	}

	if callbackCalled {
		t.Fatal(
			"verification callback must not run for wrong code",
		)
	}

	if !fake.committed {
		t.Fatal(
			"incorrect OTP counters must commit",
		)
	}

	if fake.rolledBack {
		t.Fatal(
			"incorrect OTP must not roll back failure counters",
		)
	}
}
