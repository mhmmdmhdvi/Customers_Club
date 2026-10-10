package otpdb

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

type fakeActiveOTPQuery struct {
	sql  string
	args []any
	row  fakeActiveOTPRow
}

func (f *fakeActiveOTPQuery) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	f.sql = sql
	f.args = append([]any(nil), args...)

	return f.row
}

type fakeActiveOTPRow struct {
	id            int64
	codeHash      *string
	nonce         *string
	failedAttemps int
	expiresAt     time.Time
	err           error
}

func (f fakeActiveOTPRow) Scan(
	dest ...any,
) error {
	if f.err != nil {
		return f.err
	}

	*dest[0].(*int64) = f.id
	*dest[1].(**string) = f.codeHash
	*dest[2].(**string) = f.nonce
	*dest[3].(*int) = f.failedAttemps
	*dest[4].(*time.Time) = f.expiresAt

	return nil
}

func TestLatestActiveOTPReturnsChallenge(t *testing.T) {
	hash := strings.Repeat("a", 64)
	nonce := strings.Repeat("b", 64)

	expiresAt := time.Date(
		2026,
		time.October,
		10,
		12,
		2,
		0,
		0,
		time.UTC,
	)

	db := &fakeActiveOTPQuery{
		row: fakeActiveOTPRow{
			id:            42,
			codeHash:      &hash,
			nonce:         &nonce,
			failedAttemps: 2,
			expiresAt:     expiresAt,
		},
	}

	got, err := LatestActiveOTP(
		context.Background(),
		db,
		"09121234567",
	)

	if err != nil {
		t.Fatalf(
			"expected lookup success, got %v",
			err,
		)
	}

	if got == nil {
		t.Fatal("expected active OTP")
	}

	if got.ID != 42 {
		t.Fatalf(
			"expected ID 42, got %d",
			got.ID,
		)
	}

	if got.CodeHash == nil ||
		*got.CodeHash != hash {
		t.Fatal("unexpected OTP hash")
	}

	if got.Nonce == nil ||
		*got.Nonce != nonce {
		t.Fatal("unexpected OTP nonce")
	}

	if got.FailedAttempts != 2 {
		t.Fatalf(
			"expected 2 failed attemps, got %d",
			got.FailedAttempts,
		)
	}

	if !got.ExpiresAt.Equal(expiresAt) {
		t.Fatal("unexpected OTP expiry")
	}

	if len(db.args) != 1 ||
		db.args[0] != "09121234567" {
		t.Fatalf(
			"unexpected query arguments: %v",
			db.args,
		)
	}

	if !strings.Contains(
		db.sql,
		`"deliveryState" = 'ACTIVE'`,
	) {
		t.Fatal("expected ACTIVE OTP filter")
	}

	if !strings.Contains(
		db.sql,
		`"used" = FALSE`,
	) {
		t.Fatal("expected unused OTP filter")
	}

	if !strings.Contains(
		db.sql,
		`ORDER BY "id" DESC`,
	) {
		t.Fatal("expected newest OTP first")
	}

	if strings.Contains(
		db.sql,
		`"expiresAt" >`,
	) {
		t.Fatal(
			"expiry must be handled during verification",
		)
	}
}

func TestLatestActiveOTPReturnsNilWhenMissing(t *testing.T) {
	db := &fakeActiveOTPQuery{
		row: fakeActiveOTPRow{
			err: pgx.ErrNoRows,
		},
	}

	got, err := LatestActiveOTP(
		context.Background(),
		db,
		"09121234567",
	)

	if err != nil {
		t.Fatalf(
			"expected missing OTP lookup to succeed, got %v",
			err,
		)
	}

	if got != nil {
		t.Fatalf(
			"expected no active OTP, got %+v",
			got,
		)
	}
}

func TestLatestActiveOTPPropagatesDatabaesFailure(t *testing.T) {
	failure := errors.New(
		"synthetic active OTP lookup failure",
	)

	db := &fakeActiveOTPQuery{
		row: fakeActiveOTPRow{
			err: failure,
		},
	}

	got, err := LatestActiveOTP(
		context.Background(),
		db,
		"09121234567",
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected database failure, got %v",
			err,
		)
	}

	if got != nil {
		t.Fatalf(
			"expected nil OTP on database failure, got %+v",
			got,
		)
	}
}
