package session

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/adminmfa"
)

// Callers hold the user row before touching challenges/credentials. The same
// order serializes beginning/completing challenges and admin session issuance.
func (s *Service) beginMFA(ctx context.Context, tx pgx.Tx, uid int64) (Grant, error) {
	var enrolled int
	e := tx.QueryRow(ctx, `SELECT "userId" FROM "AdminMfaCredential" WHERE "userId"=$1`, uid).Scan(&enrolled)
	if errors.Is(e, pgx.ErrNoRows) {
		return Grant{}, failure(403, "Admin MFA is not enrolled")
	}
	if e != nil {
		return Grant{}, e
	}
	now := s.now().UTC().Truncate(time.Millisecond)
	token, e := s.randomToken()
	if e != nil {
		return Grant{}, e
	}
	id, e := s.uuid()
	if e != nil {
		return Grant{}, e
	}
	expiry := now.Add(5 * time.Minute)
	_, e = tx.Exec(ctx, `UPDATE "AdminMfaChallenge" SET "usedAt"=$2 WHERE "userId"=$1 AND "usedAt" IS NULL AND "expiresAt">$2`, uid, now)
	if e != nil {
		return Grant{}, e
	}
	_, e = tx.Exec(ctx, `INSERT INTO "AdminMfaChallenge" (id,"userId","tokenHash","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5)`, id, uid, digest(token), expiry, now)
	if e != nil {
		return Grant{}, e
	}
	return Grant{MFARequired: true, MFAChallengeToken: token, MFAExpiresAt: expiry}, nil
}
func (s *Service) CompleteMFA(ctx context.Context, input map[string]any) (Grant, error) {
	token, _ := input["mfaChallengeToken"].(string)
	code, _ := input["code"].(string)
	if !tokenPattern.MatchString(token) || !codePattern.MatchString(code) {
		return Grant{}, ErrUnauthorized
	}
	g, e := s.transaction(ctx, func(tx pgx.Tx) (Grant, error) {
		var uid int64
		e := tx.QueryRow(ctx, `SELECT "userId" FROM "AdminMfaChallenge" WHERE "tokenHash"=$1`, digest(token)).Scan(&uid)
		if errors.Is(e, pgx.ErrNoRows) {
			return Grant{}, ErrUnauthorized
		}
		if e != nil {
			return Grant{}, e
		}
		u, e := scanUser(tx.QueryRow(ctx, `SELECT `+userFields+` FROM "User" WHERE id=$1 FOR UPDATE`, uid))
		if errors.Is(e, pgx.ErrNoRows) {
			return Grant{}, ErrUnauthorized
		}
		if e != nil {
			return Grant{}, e
		}
		if u.Role != "ADMIN" {
			return Grant{}, ErrUnauthorized
		}
		var id string
		var expiry time.Time
		var used *time.Time
		var attempts int
		e = tx.QueryRow(ctx, `SELECT id,"expiresAt","usedAt","failedAttempts" FROM "AdminMfaChallenge" WHERE "tokenHash"=$1 FOR UPDATE`, digest(token)).Scan(&id, &expiry, &used, &attempts)
		if e != nil {
			return Grant{}, e
		}
		now := s.now().UTC().Truncate(time.Millisecond)
		if used != nil || !expiry.After(now) || attempts >= 5 {
			return Grant{}, ErrUnauthorized
		}
		var enc adminmfa.Encrypted
		var last *int64
		e = tx.QueryRow(ctx, `SELECT "secretCiphertext","secretIv","secretTag","lastUsedCounter" FROM "AdminMfaCredential" WHERE "userId"=$1 FOR UPDATE`, uid).Scan(&enc.Ciphertext, &enc.IV, &enc.Tag, &last)
		if errors.Is(e, pgx.ErrNoRows) {
			return Grant{}, ErrUnauthorized
		}
		if e != nil {
			return Grant{}, e
		}
		secret, e := s.mfa.Decrypt(enc)
		if e != nil {
			return Grant{}, e
		}
		counter, valid, e := adminmfa.Verify(secret, code, now)
		if e != nil {
			return Grant{}, e
		}
		if !valid {
			_, e = tx.Exec(ctx, `UPDATE "AdminMfaChallenge" SET "failedAttempts"="failedAttempts"+1 WHERE id=$1`, id)
			return Grant{}, e
		} // Commit rejected guesses before returning 401.
		if last != nil && counter <= *last {
			return Grant{}, ErrUnauthorized
		}
		_, e = tx.Exec(ctx, `UPDATE "AdminMfaChallenge" SET "usedAt"=$2 WHERE id=$1`, id, now)
		if e != nil {
			return Grant{}, e
		}
		_, e = tx.Exec(ctx, `UPDATE "AdminMfaCredential" SET "lastUsedCounter"=$2,"updatedAt"=$3 WHERE "userId"=$1`, uid, counter, now)
		if e != nil {
			return Grant{}, e
		}
		return s.issue(ctx, tx, u)
	})
	if e == nil && g.RefreshToken == "" {
		e = ErrUnauthorized
	}
	return g, e
}
