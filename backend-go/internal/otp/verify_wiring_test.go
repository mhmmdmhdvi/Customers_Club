package otp

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

func TestNewDatabaseVerificationServiceUsesIPTransaction(
	t *testing.T,
) {
	failure := errors.New(
		"synthetic database transaction failure",
	)

	beginCalls := 0

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (otpdb.Transaction, error) {
		beginCalls++

		if options.IsoLevel != pgx.ReadCommitted {
			t.Fatalf(
				"expected ReadCommitted isolation, got %v",
				options.IsoLevel,
			)
		}

		return nil, failure
	}

	service := NewDatabaseVerificationService(
		make([]byte, 32),
		begin,
	)

	if service == nil {
		t.Fatal("expected verification service")
	}

	err := service.Verify(
		context.Background(),
		"09121234567",
		"123456",
		"192.0.2.1",
		nil,
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected transaction failure, got %v",
			err,
		)
	}

	if beginCalls != 1 {
		t.Fatalf(
			"expected one IP transaction attempt, got %d",
			beginCalls,
		)
	}
}

type successfulIPChargeTx struct {
	now          time.Time
	locked       bool
	bucketWrites int
	committed    bool
	rolledBack   bool
}

func (f *successfulIPChargeTx) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	switch {
	case sql == "SET LOCAL lock_timeout = '3s'":
		return pgconn.NewCommandTag("SET"), nil

	case strings.HasPrefix(sql, `INSERT INTO "OtpRateBucket"`):
		f.bucketWrites++
		return pgconn.NewCommandTag("INSERT 0 1"), nil

	default:
		panic("unexpected SQL: " + sql)
	}
}

func (f *successfulIPChargeTx) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	switch {
	case strings.Contains(sql, "pg_advisory_xact_lock"):
		f.locked = true
		return successfulIPChargeRow{kind: "lock"}

	case sql == "SELECT clock_timestamp()":
		return successfulIPChargeRow{
			kind: "clock",
			now:  f.now,
		}

	case strings.Contains(sql, `FROM "OtpRateBucket"`):
		return successfulIPChargeRow{kind: "events"}

	default:
		panic("unexpected query: " + sql)
	}
}

func (f *successfulIPChargeTx) Commit(
	ctx context.Context,
) error {
	f.committed = true
	return nil
}

func (f *successfulIPChargeTx) Rollback(
	ctx context.Context,
) error {
	f.rolledBack = true
	return nil
}

type successfulIPChargeRow struct {
	kind string
	now  time.Time
}

func (r successfulIPChargeRow) Scan(
	dest ...any,
) error {
	switch r.kind {
	case "lock":
		*dest[0].(*string) = "ok"

	case "clock":
		*dest[0].(*time.Time) = r.now

	case "events":
		*dest[0].(*[]time.Time) = nil

	default:
		panic("unexpected row kind")
	}

	return nil
}

func TestNewDatabaseVerificationServiceUsesSeparateTransactions(
	t *testing.T,
) {
	now := time.Date(
		2026, time.October, 11,
		12, 0, 0, 0, time.UTC,
	)

	ipTx := &successfulIPChargeTx{
		now: now,
	}

	phoneFailure := errors.New(
		"synthetic phone transaction failure",
	)

	beginCalls := 0

	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (otpdb.Transaction, error) {
		beginCalls++

		if options.IsoLevel != pgx.ReadCommitted {
			t.Fatalf(
				"expected ReadCommitted, got %v",
				options.IsoLevel,
			)
		}

		if beginCalls == 1 {
			return ipTx, nil
		}

		if beginCalls == 2 {
			if !ipTx.committed {
				t.Fatal(
					"IP transaction must commit before phone verification begins",
				)
			}

			return nil, phoneFailure
		}

		t.Fatalf(
			"unexpected transaction attempt %d",
			beginCalls,
		)

		return nil, phoneFailure
	}

	service := NewDatabaseVerificationService(
		make([]byte, 32),
		begin,
	)

	if service == nil {
		t.Fatal("expected verification service")
	}

	err := service.Verify(
		context.Background(),
		"09121234567",
		"123456",
		"192.0.2.1",
		nil,
	)

	if !errors.Is(err, phoneFailure) {
		t.Fatalf(
			"expected phone transaction failure, got %v",
			err,
		)
	}

	if beginCalls != 2 {
		t.Fatalf(
			"expected two separate transactions, got %d",
			beginCalls,
		)
	}

	if !ipTx.locked {
		t.Fatal("expected IP advisory lock")
	}

	if ipTx.bucketWrites != 1 {
		t.Fatalf(
			"expected one committed IP event write, got %d",
			ipTx.bucketWrites,
		)
	}

	if !ipTx.committed {
		t.Fatal("expected IP transaction to commit")
	}

	if ipTx.rolledBack {
		t.Fatal(
			"IP transaction must not roll back when phone verification fails",
		)
	}
}
