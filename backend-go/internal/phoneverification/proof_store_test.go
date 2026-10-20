package phoneverification

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type fakeProofStore struct {
	lookupSQL  string
	lookupArgs []any
	insertSQL  string
	insertArgs []any
	lookups    int
	inserts    int
	userExists bool
	lookupErr  error
	insertErr  error
}

func (f *fakeProofStore) QueryRow(
	ctx context.Context,
	sql string,
	args ...any,
) pgx.Row {
	f.lookups++
	f.lookupSQL = sql
	f.lookupArgs = append([]any(nil), args...)

	if f.lookupErr != nil {
		return failedProofLookupRow{
			err: f.lookupErr,
		}
	}

	if f.userExists {
		return existingProofUserRow{}
	}

	return missingProofUserRow{}
}

type failedProofLookupRow struct {
	err error
}

func (f failedProofLookupRow) Scan(
	dest ...any,
) error {
	return f.err
}

type missingProofUserRow struct{}

func (missingProofUserRow) Scan(
	dest ...any,
) error {
	return pgx.ErrNoRows
}

type existingProofUserRow struct{}

func (existingProofUserRow) Scan(
	dest ...any,
) error {
	*dest[0].(*int32) = 42
	return nil
}

func (f *fakeProofStore) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	f.inserts++
	f.insertSQL = sql
	f.insertArgs = append([]any(nil), args...)

	if f.insertErr != nil {
		return pgconn.CommandTag{}, f.insertErr
	}

	return pgconn.NewCommandTag("INSERT 0 1"), nil
}

func TestStoreProofCreatesRegistrationProofForNewPhone(
	t *testing.T,
) {
	now := time.Date(
		2026, time.October, 13,
		12, 0, 0, 0, time.UTC,
	)

	phone := "09121234567"
	tokenHash := strings.Repeat("a", 64)

	db := &fakeProofStore{}

	proof, err := StoreProof(
		context.Background(),
		db,
		phone,
		tokenHash,
		now,
	)

	if err != nil {
		t.Fatalf(
			"expected proof creation to succeed, got %v",
			err,
		)
	}

	if proof.Purpose != "REGISTER" {
		t.Fatalf(
			"expected REGISTER purpose, got %q",
			proof.Purpose,
		)
	}

	expectedExpiry := now.Add(5 * time.Minute)

	if !proof.ExpiresAt.Equal(expectedExpiry) {
		t.Fatalf(
			"expected expiry %v, got %v",
			expectedExpiry,
			proof.ExpiresAt,
		)
	}

	if db.lookups != 1 {
		t.Fatalf(
			"expected one user lookup, got %d",
			db.lookups,
		)
	}

	if !strings.Contains(
		db.lookupSQL,
		`FROM "User"`,
	) {
		t.Fatal("expected lookup in User table")
	}

	if len(db.lookupArgs) != 1 ||
		db.lookupArgs[0] != phone {
		t.Fatalf(
			"unexpected user lookup arguments: %v",
			db.lookupArgs,
		)
	}

	if db.inserts != 1 {
		t.Fatalf(
			"expected one proof insertion, got %d",
			db.inserts,
		)
	}

	if !strings.Contains(
		db.insertSQL,
		`INSERT INTO "PhoneVerification"`,
	) {
		t.Fatal(
			"expected PhoneVerification insertion",
		)
	}

	if len(db.insertArgs) != 4 {
		t.Fatalf(
			"expected four insert arguments, got %d",
			len(db.insertArgs),
		)
	}

	if db.insertArgs[0] != phone {
		t.Fatal("unexpected proof phone")
	}

	if db.insertArgs[1] != tokenHash {
		t.Fatal("expected hashed verification token")
	}

	if db.insertArgs[2] != "REGISTER" {
		t.Fatal("expected REGISTER database purpose")
	}

	expiry, ok := db.insertArgs[3].(time.Time)

	if !ok || !expiry.Equal(expectedExpiry) {
		t.Fatal("unexpected stored proof expiry")
	}
}

func TestStoreProofCreatesLoginProofForExistingPhone(
	t *testing.T,
) {
	now := time.Date(
		2026, time.October, 13,
		12, 0, 0, 0, time.UTC,
	)

	phone := "09121234567"
	tokenHash := strings.Repeat("b", 64)

	db := &fakeProofStore{
		userExists: true,
	}

	proof, err := StoreProof(
		context.Background(),
		db,
		phone,
		tokenHash,
		now,
	)

	if err != nil {
		t.Fatalf(
			"expected LOGIN proof creation, got %v",
			err,
		)
	}

	if proof.Purpose != "LOGIN" {
		t.Fatalf(
			"expected LOGIN purpose, got %q",
			proof.Purpose,
		)
	}

	expectedExpiry := now.Add(5 * time.Minute)

	if !proof.ExpiresAt.Equal(expectedExpiry) {
		t.Fatalf(
			"expected expiry %v, got %v",
			expectedExpiry,
			proof.ExpiresAt,
		)
	}

	if db.lookups != 1 {
		t.Fatalf(
			"expected one user lookup, got %d",
			db.lookups,
		)
	}

	if db.inserts != 1 {
		t.Fatalf(
			"expected one proof insertion, got %d",
			db.inserts,
		)
	}

	if len(db.insertArgs) != 4 {
		t.Fatalf(
			"expected four insert arguments, got %d",
			len(db.insertArgs),
		)
	}

	if db.insertArgs[0] != phone {
		t.Fatal("unexpected proof phone")
	}

	if db.insertArgs[1] != tokenHash {
		t.Fatal("expected hashed verification token")
	}

	if db.insertArgs[2] != "LOGIN" {
		t.Fatal("expected LOGIN database purpose")
	}

	expiry, ok := db.insertArgs[3].(time.Time)

	if !ok || !expiry.Equal(expectedExpiry) {
		t.Fatal("unexpected stored proof expiry")
	}
}

func TestStoreProofRejectsDatabaseLookupFailure(
	t *testing.T,
) {
	failure := errors.New(
		"synthetic user lookup failure",
	)

	db := &fakeProofStore{
		lookupErr: failure,
	}

	proof, err := StoreProof(
		context.Background(),
		db,
		"09121234567",
		strings.Repeat("a", 64),
		time.Now(),
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected lookup failure, got %v",
			err,
		)
	}

	if db.lookups != 1 {
		t.Fatalf(
			"expected one lookup, got %d",
			db.lookups,
		)
	}

	if db.inserts != 0 {
		t.Fatal(
			"database lookup failure must not create a proof",
		)
	}

	if proof.Purpose != "" ||
		!proof.ExpiresAt.IsZero() {
		t.Fatal(
			"failed lookup must not return a usable proof",
		)
	}
}

func TestStoreProofPropagatesInsertionFailure(
	t *testing.T,
) {
	failure := errors.New(
		"synthetic verification proof insertion failure",
	)

	db := &fakeProofStore{
		insertErr: failure,
	}

	now := time.Date(
		2026,
		time.October,
		13,
		12,
		0,
		0,
		0,
		time.UTC,
	)

	proof, err := StoreProof(
		context.Background(),
		db,
		"09121234567",
		strings.Repeat("a", 64),
		now,
	)

	if !errors.Is(err, failure) {
		t.Fatalf(
			"expected insertion failure, got %v",
			err,
		)
	}

	if db.lookups != 1 {
		t.Fatalf(
			"expected one user lookup, got %d",
			db.lookups,
		)
	}

	if db.inserts != 1 {
		t.Fatalf(
			"expected one insertion attempt, got %d",
			db.inserts,
		)
	}

	if !strings.Contains(
		db.insertSQL,
		`INSERT INTO "PhoneVerification"`,
	) {
		t.Fatal(
			"expected PhoneVerification insertion attempt",
		)
	}

	if proof.Purpose != "" ||
		!proof.ExpiresAt.IsZero() {
		t.Fatal(
			"insertion failure must not return a usable proof",
		)
	}
}
