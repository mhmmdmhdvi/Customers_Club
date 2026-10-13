package phoneverification

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const verificationTTL = 5 * time.Minute

type StoredProof struct {
	Purpose   string
	ExpiresAt time.Time
}

type proofStore interface {
	QueryRow(
		ctx context.Context,
		sql string,
		args ...any,
	) pgx.Row

	Exec(
		ctx context.Context,
		sql string,
		args ...any,
	) (pgconn.CommandTag, error)
}

func StoreProof(
	ctx context.Context,
	db proofStore,
	phone string,
	tokenHash string,
	now time.Time,
) (StoredProof, error) {
	var userID int32

	// Check whether this phone is already registered.
	err := db.QueryRow(
		ctx,
		`SELECT "id" FROM "User" `+
			`WHERE "phone" = $1 `+
			`LIMIT 1`,
		phone,
	).Scan(&userID)

	purpose := "LOGIN"

	if errors.Is(err, pgx.ErrNoRows) {
		// No existing user: this proof is for registration.
		purpose = "REGISTER"
	} else if err != nil {
		// Unexpected database errors must propagate.
		return StoredProof{}, err
	}

	expiresAt := now.Add(verificationTTL)

	// Store the token hash, never the raw token.
	_, err = db.Exec(
		ctx,
		`INSERT INTO "PhoneVerification" `+
			`("phone", "tokenHash", "purpose", "expiresAt") `+
			`VALUES ($1, $2, $3, $4)`,
		phone,
		tokenHash,
		purpose,
		expiresAt,
	)

	if err != nil {
		return StoredProof{}, err
	}

	return StoredProof{
		Purpose:   purpose,
		ExpiresAt: expiresAt,
	}, nil
}
