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
	failureEvents  []time.Time
	consumeTag     string
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

		if strings.Contains(
			sql,
			`SET "used" = TRUE`,
		) && f.consumeTag != "" {
			return pgconn.NewCommandTag(
				f.consumeTag,
			), nil
		}

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
		return verifyMissingRow{
			kind:   "events",
			events: f.failureEvents,
		}

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
	kind   string
	now    time.Time
	otp    *ActiveOTP
	events []time.Time
}

func (r verifyMissingRow) Scan(dest ...any) error {
	switch r.kind {
	case "clock":
		*dest[0].(*time.Time) = r.now

	case "events":
		*dest[0].(*[]time.Time) = append(
			[]time.Time(nil),
			r.events...,
		)

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

func TestVerifyPhoneOTPRecordsExpiredCodeAndCommits(t *testing.T) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	secret := make([]byte, 32)
	phone := "09121234567"
	nonce := strings.Repeat("1", 64)

	hash, err := otpcrypto.HashCode(
		secret,
		phone,
		nonce,
		"123456",
	)

	if err != nil {
		t.Fatalf("hashing failed: %v", err)
	}

	fake := &verifyMissingOTPTx{
		now: now,
		activeOTP: &ActiveOTP{
			ID:             42,
			CodeHash:       &hash,
			Nonce:          &nonce,
			FailedAttempts: 0,
			ExpiresAt:      now,
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
		"123456",
		func(
			ctx context.Context,
			tx Transaction,
			callbackNow time.Time,
		) error {
			callbackCalled = true
			return nil
		},
	)

	if !errors.Is(err, ErrOTPExpired) {
		t.Fatalf(
			"expected ErrOTPExpired, got %v",
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
			"expected one phone failure event, got %d",
			fake.bucketWrites,
		)
	}

	if len(fake.recordedEvents) != 1 ||
		!fake.recordedEvents[0].Equal(now) {
		t.Fatal("expected expired-code failure event")
	}

	if fake.otpUpdates != 0 {
		t.Fatal(
			"expired OTP must not increment failedAttemps",
		)
	}

	if callbackCalled {
		t.Fatal(
			"expired OTP must not run verification callback",
		)
	}

	if !fake.committed {
		t.Fatal(
			"failure event must commit",
		)
	}

	if fake.rolledBack {
		t.Fatal(
			"expired OTP rejection must not roll back failure event",
		)
	}
}

func TestVerifyPhoneOTPRejectsExhaustedOTPWithoutNewFailure(t *testing.T) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	secret := make([]byte, 32)
	phone := "09121234567"
	nonce := strings.Repeat("1", 64)

	hash, err := otpcrypto.HashCode(
		secret,
		phone,
		nonce,
		"123456",
	)

	if err != nil {
		t.Fatalf(
			"expected hashing to succeed, got %v",
			err,
		)
	}

	fake := &verifyMissingOTPTx{
		now: now,
		activeOTP: &ActiveOTP{
			ID:             42,
			CodeHash:       &hash,
			Nonce:          &nonce,
			FailedAttempts: 5,
			ExpiresAt:      now.Add(90 * time.Second),
		},
	}

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		return fake, nil
	}

	callbackCalled := false

	//Even the correct code must be rejected
	//after five failed attemps.
	err = VerifyPhoneOTP(
		context.Background(),
		begin,
		secret,
		phone,
		"123456",

		func(
			ctx context.Context,
			tx Transaction,
			callbackNow time.Time,
		) error {
			callbackCalled = true
			return nil
		},
	)

	var rateError *RateLimitError

	if !errors.As(err, &rateError) {
		t.Fatalf(
			"expected RateLimitError, got %v",
			err,
		)
	}

	if rateError.RetryAfter != 90 {
		t.Fatalf(
			"expected RetryAfter 90, got %d",
			rateError.RetryAfter,
		)
	}

	if !fake.phoneLocked {
		t.Fatal("expected phone advisory lock")
	}

	if !fake.activeQueried {
		t.Fatal("expected ACTIVE OTP lookup")
	}

	if fake.bucketWrites != 0 {
		t.Fatal("exhausted OTP must not add a phone failure event")
	}

	if fake.otpUpdates != 0 {
		t.Fatal(
			"exhausted OTP must not be updated or consumed",
		)
	}

	if callbackCalled {
		t.Fatal(
			"verification callback must not run",
		)
	}

	if !fake.committed {
		t.Fatal("rate-limit decision should commit cleanly")
	}

	if fake.rolledBack {
		t.Fatal("rate-limit decision must not roll back")
	}
}

func TestVerifyPhoneOTPReturnsRateLimitOnTenthFailure(
	t *testing.T,
) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	secret := make([]byte, 32)
	phone := "09121234567"
	nonce := strings.Repeat("1", 64)

	hash, err := otpcrypto.HashCode(
		secret,
		phone,
		nonce,
		"123456",
	)

	if err != nil {
		t.Fatalf("hashing failed: %v", err)
	}

	// Nine previous failures.
	previous := make([]time.Time, 0, 9)

	for minutesAgo := 10; minutesAgo >= 2; minutesAgo-- {
		previous = append(
			previous,
			now.Add(
				-time.Duration(minutesAgo)*time.Minute,
			),
		)
	}

	fake := &verifyMissingOTPTx{
		now:           now,
		failureEvents: previous,

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

	// The tenth failure: user enters wrong code.
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

	var rateError *RateLimitError

	if !errors.As(err, &rateError) {
		t.Fatalf(
			"expected RateLimitError on tenth failure, got %v",
			err,
		)
	}

	if rateError.RetryAfter != 300 {
		t.Fatalf(
			"expected RetryAfter 300, got %d",
			rateError.RetryAfter,
		)
	}

	if !fake.phoneLocked || !fake.activeQueried {
		t.Fatal(
			"expected locked verification and ACTIVE OTP lookup",
		)
	}

	if fake.bucketWrites != 1 {
		t.Fatalf(
			"expected one failure bucket write, got %d",
			fake.bucketWrites,
		)
	}

	if len(fake.recordedEvents) != 10 {
		t.Fatalf(
			"expected 10 recorded failures, got %d",
			len(fake.recordedEvents),
		)
	}

	if !fake.recordedEvents[9].Equal(now) {
		t.Fatal(
			"expected tenth failure to be recorded at database time",
		)
	}

	if fake.otpUpdates != 1 {
		t.Fatalf(
			"expected one OTP counter update, got %d",
			fake.otpUpdates,
		)
	}

	if len(fake.otpUpdateSQLs) != 1 ||
		!strings.Contains(
			fake.otpUpdateSQLs[0],
			`SET "failedAttempts" = "failedAttempts" + 1`,
		) {
		t.Fatal(
			"expected failedAttempts increment, not OTP consumption",
		)
	}

	if callbackCalled {
		t.Fatal(
			"verification callback must not run",
		)
	}

	if !fake.committed {
		t.Fatal(
			"tenth failure must commit its counters",
		)
	}

	if fake.rolledBack {
		t.Fatal(
			"tenth failure must not roll back",
		)
	}
}

func TestVerifyPhoneOTPReturnsRateLimitOnFifthOTPFailure(
	t *testing.T,
) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	secret := make([]byte, 32)
	phone := "09121234567"
	nonce := strings.Repeat("1", 64)

	hash, err := otpcrypto.HashCode(
		secret,
		phone,
		nonce,
		"123456",
	)

	if err != nil {
		t.Fatalf("hashing failed: %v", err)
	}

	fake := &verifyMissingOTPTx{
		now: now,
		activeOTP: &ActiveOTP{
			ID:             42,
			CodeHash:       &hash,
			Nonce:          &nonce,
			FailedAttempts: 4,
			ExpiresAt:      now.Add(90 * time.Second),
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

	var rateError *RateLimitError

	if !errors.As(err, &rateError) {
		t.Fatalf(
			"expected RateLimitError on fifth failure, got %v",
			err,
		)
	}

	if rateError.RetryAfter != 90 {
		t.Fatalf(
			"expected RetryAfter 90, got %d",
			rateError.RetryAfter,
		)
	}

	if fake.bucketWrites != 1 {
		t.Fatalf(
			"expected one phone failure write, got %d",
			fake.bucketWrites,
		)
	}

	if fake.otpUpdates != 1 {
		t.Fatalf(
			"expected one OTP failed-attempt increment, got %d",
			fake.otpUpdates,
		)
	}

	if len(fake.otpUpdateSQLs) != 1 ||
		!strings.Contains(
			fake.otpUpdateSQLs[0],
			`SET "failedAttempts" = "failedAttempts" + 1`,
		) {
		t.Fatal(
			"expected failedAttempts increment, not OTP consumption",
		)
	}

	if callbackCalled {
		t.Fatal(
			"verification callback must not run",
		)
	}

	if !fake.committed {
		t.Fatal(
			"fifth failure counters must commit",
		)
	}

	if fake.rolledBack {
		t.Fatal(
			"fifth failure must not roll back",
		)
	}
}

func TestVerifyPhoneOTPReturnsRateLimitWithoutActiveOTP(
	t *testing.T,
) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	secret := make([]byte, 32)
	phone := "09121234567"

	// Nine failures already exist within 15 minutes.
	previous := make([]time.Time, 0, 9)

	for minutesAgo := 10; minutesAgo >= 2; minutesAgo-- {
		previous = append(
			previous,
			now.Add(
				-time.Duration(minutesAgo)*time.Minute,
			),
		)
	}

	// No ACTIVE OTP is present.
	fake := &verifyMissingOTPTx{
		now:           now,
		failureEvents: previous,
	}

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (Transaction, error) {
		return fake, nil
	}

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
			callbackNow time.Time,
		) error {
			callbackCalled = true
			return nil
		},
	)

	var rateError *RateLimitError

	if !errors.As(err, &rateError) {
		t.Fatalf(
			"expected RateLimitError on tenth failure, got %v",
			err,
		)
	}

	if rateError.RetryAfter != 300 {
		t.Fatalf(
			"expected RetryAfter 300, got %d",
			rateError.RetryAfter,
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
			"expected one phone failure bucket write, got %d",
			fake.bucketWrites,
		)
	}

	if len(fake.recordedEvents) != 10 {
		t.Fatalf(
			"expected 10 recorded failures, got %d",
			len(fake.recordedEvents),
		)
	}

	if !fake.recordedEvents[9].Equal(now) {
		t.Fatal(
			"expected tenth failure at database time",
		)
	}

	if fake.otpUpdates != 0 {
		t.Fatal(
			"must not update a nonexistent OTP",
		)
	}

	if callbackCalled {
		t.Fatal(
			"verification callback must not run",
		)
	}

	if !fake.committed {
		t.Fatal(
			"tenth failure must commit",
		)
	}

	if fake.rolledBack {
		t.Fatal(
			"tenth failure must not roll back",
		)
	}
}

func TestVerifyPhoneOTPReturnsRateLimitForTenthExpiredAttempt(
	t *testing.T,
) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	secret := make([]byte, 32)
	phone := "09121234567"
	nonce := strings.Repeat("1", 64)

	hash, err := otpcrypto.HashCode(
		secret,
		phone,
		nonce,
		"123456",
	)

	if err != nil {
		t.Fatalf("hashing failed: %v", err)
	}

	// Nine previous phone failures.
	previous := make([]time.Time, 0, 9)

	for minutesAgo := 10; minutesAgo >= 2; minutesAgo-- {
		previous = append(
			previous,
			now.Add(
				-time.Duration(minutesAgo)*time.Minute,
			),
		)
	}

	fake := &verifyMissingOTPTx{
		now:           now,
		failureEvents: previous,

		activeOTP: &ActiveOTP{
			ID:             42,
			CodeHash:       &hash,
			Nonce:          &nonce,
			FailedAttempts: 2,
			ExpiresAt:      now,
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
		"123456",
		func(
			ctx context.Context,
			tx Transaction,
			callbackNow time.Time,
		) error {
			callbackCalled = true
			return nil
		},
	)

	var rateError *RateLimitError

	if !errors.As(err, &rateError) {
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

	if !fake.phoneLocked || !fake.activeQueried {
		t.Fatal(
			"expected locked verification and ACTIVE OTP lookup",
		)
	}

	if fake.bucketWrites != 1 {
		t.Fatalf(
			"expected one failure bucket write, got %d",
			fake.bucketWrites,
		)
	}

	if len(fake.recordedEvents) != 10 {
		t.Fatalf(
			"expected 10 recorded failures, got %d",
			len(fake.recordedEvents),
		)
	}

	if !fake.recordedEvents[9].Equal(now) {
		t.Fatal(
			"expected tenth failure at database time",
		)
	}

	if fake.otpUpdates != 0 {
		t.Fatal(
			"expired OTP must not be updated or consumed",
		)
	}

	if callbackCalled {
		t.Fatal(
			"expired OTP must not run callback",
		)
	}

	if !fake.committed {
		t.Fatal(
			"failure event must commit",
		)
	}

	if fake.rolledBack {
		t.Fatal(
			"failure event must not roll back",
		)
	}
}

func TestVerifyPhoneOTPRollsBackWhenCallbackFails(t *testing.T) {
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
		t.Fatalf("hashing failed: %v", err)
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

	callbackFailure := errors.New(
		"synthetic verification proof failure",
	)

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
					"OTP consumption must be attempted before callback",
				)
			}

			if fake.committed {
				t.Fatal(
					"callback must execute before commit",
				)
			}

			return callbackFailure
		},
	)

	if !errors.Is(err, callbackFailure) {
		t.Fatalf(
			"expected callback failure, got %v",
			err,
		)
	}

	if !callbackCalled {
		t.Fatal(
			"expected verification callback to execute",
		)
	}

	if fake.otpUpdates != 1 {
		t.Fatalf(
			"expected one attempted OTP consumption, got %d",
			fake.otpUpdates,
		)
	}

	if fake.bucketWrites != 0 {
		t.Fatal(
			"correct OTP must not record a failure event",
		)
	}

	if fake.committed {
		t.Fatal(
			"callback failure must not commit",
		)
	}

	if !fake.rolledBack {
		t.Fatal(
			"callback failure must roll back OTP consumption",
		)
	}
}

func TestVerifyPhoneOTPRejectsMissingOrMalformedHMAC(
	t *testing.T,
) {
	now := time.Date(
		2026, time.October, 10,
		12, 0, 0, 0, time.UTC,
	)

	secret := make([]byte, 32)
	phone := "09121234567"
	code := "123456"
	validNonce := strings.Repeat("1", 64)

	validHash, err := otpcrypto.HashCode(
		secret,
		phone,
		validNonce,
		code,
	)

	if err != nil {
		t.Fatalf("hashing failed: %v", err)
	}

	malformedHash := "not-a-valid-hash"
	malformedNonce := "invalid-nonce"

	tests := []struct {
		name     string
		codeHash *string
		nonce    *string
	}{
		{
			name:     "missing hash",
			codeHash: nil,
			nonce:    &validNonce,
		},
		{
			name:     "missing nonce",
			codeHash: &validHash,
			nonce:    nil,
		},
		{
			name:     "malformed hash",
			codeHash: &malformedHash,
			nonce:    &validNonce,
		},
		{
			name:     "malformed nonce",
			codeHash: &validHash,
			nonce:    &malformedNonce,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fake := &verifyMissingOTPTx{
				now: now,
				activeOTP: &ActiveOTP{
					ID:             42,
					CodeHash:       tt.codeHash,
					Nonce:          tt.nonce,
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

			err := VerifyPhoneOTP(
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
					return nil
				},
			)

			if !errors.Is(err, ErrInvalidOTP) {
				t.Fatalf(
					"expected ErrInvalidOTP, got %v",
					err,
				)
			}

			if fake.bucketWrites != 1 {
				t.Fatalf(
					"expected one failure bucket write, got %d",
					fake.bucketWrites,
				)
			}

			if fake.otpUpdates != 1 {
				t.Fatalf(
					"expected one failed-attempt update, got %d",
					fake.otpUpdates,
				)
			}

			if len(fake.otpUpdateSQLs) != 1 ||
				!strings.Contains(
					fake.otpUpdateSQLs[0],
					`SET "failedAttempts" = "failedAttempts" + 1`,
				) {
				t.Fatal(
					"expected failedAttempts increment, not OTP consumption",
				)
			}

			if callbackCalled {
				t.Fatal(
					"invalid HMAC data must not run callback",
				)
			}

			if !fake.committed {
				t.Fatal(
					"failure counters must commit",
				)
			}

			if fake.rolledBack {
				t.Fatal(
					"invalid HMAC must not roll back failure counters",
				)
			}
		})
	}
}

func TestVerifyPhoneOTPRejectsUnclaimableValidCode(t *testing.T) {
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
		t.Fatalf("hashing failed: %v", err)
	}

	fake := &verifyMissingOTPTx{
		now:        now,
		consumeTag: "UPDATE 0",

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
			return nil
		},
	)

	if !errors.Is(err, ErrInvalidOTP) {
		t.Fatalf(
			"expected ErrInvalidOTP, got %v",
			err,
		)
	}

	if !fake.phoneLocked || !fake.activeQueried {
		t.Fatal(
			"expected locked verification and ACTIVE OTP lookup",
		)
	}

	if fake.otpUpdates != 1 {
		t.Fatalf(
			"expected one consumption attempt, got %d",
			fake.otpUpdates,
		)
	}

	if len(fake.otpUpdateSQLs) != 1 ||
		!strings.Contains(
			fake.otpUpdateSQLs[0],
			`SET "used" = TRUE`,
		) {
		t.Fatal(
			"expected an OTP consumption attempt",
		)
	}

	if fake.bucketWrites != 0 {
		t.Fatal(
			"valid code with failed claim must not record a guessing failure",
		)
	}

	if callbackCalled {
		t.Fatal(
			"callback must not run when OTP was not claimed",
		)
	}

	if !fake.committed {
		t.Fatal(
			"expected transaction to complete cleanly",
		)
	}

	if fake.rolledBack {
		t.Fatal(
			"UPDATE 0 rejection must not cause rollback",
		)
	}
}
