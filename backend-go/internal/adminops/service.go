// Package adminops provides explicit, transactional administrator operations.
package adminops

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"errors"
	"fmt"
	"net/url"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/adminmfa"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/events"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/phone"
)

type Service struct {
	pool   *pgxpool.Pool
	crypto *adminmfa.Crypto
}
type Enrollment struct {
	UserID int64  `json:"userId"`
	Secret string `json:"secret,omitempty"`
	URI    string `json:"uri,omitempty"`
}

func New(p *pgxpool.Pool, c *adminmfa.Crypto) *Service { return &Service{p, c} }
func (s *Service) Promote(ctx context.Context, rawPhone string) (int64, error) {
	v, e := s.apply(ctx, rawPhone, "promote")
	return v.UserID, e
}
func (s *Service) Enroll(ctx context.Context, rawPhone string) (Enrollment, error) {
	return s.apply(ctx, rawPhone, "mfa-enroll")
}
func (s *Service) Reset(ctx context.Context, rawPhone string) (Enrollment, error) {
	return s.apply(ctx, rawPhone, "mfa-reset")
}

func (s *Service) apply(ctx context.Context, rawPhone, operation string) (Enrollment, error) {
	number := phone.Normalize(rawPhone)
	if !phone.IsValidIranianMobile(number) {
		return Enrollment{}, errors.New("invalid Iranian mobile number")
	}
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return Enrollment{}, errors.New("admin transaction failed")
	}
	defer tx.Rollback(context.Background())
	var id int64
	var role string
	if e = tx.QueryRow(ctx, `SELECT id,role FROM "User" WHERE phone=$1 FOR UPDATE`, number).Scan(&id, &role); e != nil {
		return Enrollment{}, errors.New("target user not found")
	}
	result := Enrollment{UserID: id}
	eventType := "ADMIN_PROMOTED"
	if operation == "promote" {
		if role != "MEMBER" {
			return Enrollment{}, errors.New("target user is already an administrator")
		}
		if _, e = tx.Exec(ctx, `UPDATE "User" SET role='ADMIN',"updatedAt"=now() WHERE id=$1`, id); e != nil {
			return Enrollment{}, errors.New("promotion failed")
		}
	} else {
		if role != "ADMIN" {
			return Enrollment{}, errors.New("target user is not an administrator")
		}
		if s.crypto == nil {
			return Enrollment{}, errors.New("MFA encryption key required")
		}
		var enrolled bool
		if e = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "AdminMfaCredential" WHERE "userId"=$1)`, id).Scan(&enrolled); e != nil {
			return Enrollment{}, errors.New("MFA credential lookup failed")
		}
		if operation == "mfa-enroll" && enrolled {
			return Enrollment{}, errors.New("administrator already enrolled")
		}
		if operation == "mfa-reset" && !enrolled {
			return Enrollment{}, errors.New("administrator is not enrolled")
		}
		raw := make([]byte, 20)
		if _, e = rand.Read(raw); e != nil {
			return Enrollment{}, errors.New("MFA secret generation failed")
		}
		result.Secret = base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(raw)
		encrypted, e := s.crypto.Encrypt(result.Secret)
		if e != nil {
			return Enrollment{}, errors.New("MFA secret encryption failed")
		}
		if operation == "mfa-enroll" {
			eventType = "ADMIN_MFA_ENROLLED"
			_, e = tx.Exec(ctx, `INSERT INTO "AdminMfaCredential" ("userId","secretCiphertext","secretIv","secretTag","updatedAt") VALUES ($1,$2,$3,$4,now())`, id, encrypted.Ciphertext, encrypted.IV, encrypted.Tag)
		} else {
			eventType = "ADMIN_MFA_RESET"
			_, e = tx.Exec(ctx, `UPDATE "AdminMfaCredential" SET "secretCiphertext"=$2,"secretIv"=$3,"secretTag"=$4,"lastUsedCounter"=NULL,"updatedAt"=now() WHERE "userId"=$1`, id, encrypted.Ciphertext, encrypted.IV, encrypted.Tag)
		}
		if e != nil {
			return Enrollment{}, errors.New("MFA credential write failed")
		}
		issuer := "Megatite Customer Club"
		result.URI = "otpauth://totp/" + url.PathEscape(fmt.Sprintf("%s:admin-%d", issuer, id)) + "?" + url.Values{"secret": {result.Secret}, "issuer": {issuer}, "algorithm": {"SHA1"}, "digits": {"6"}, "period": {"30"}}.Encode()
	}
	if _, e = tx.Exec(ctx, `UPDATE "AuthSession" SET "revokedAt"=now(),version=version+1 WHERE "userId"=$1 AND "revokedAt" IS NULL`, id); e != nil {
		return Enrollment{}, errors.New("session revocation failed")
	}
	if _, e = tx.Exec(ctx, `UPDATE "AdminMfaChallenge" SET "usedAt"=now() WHERE "userId"=$1 AND "usedAt" IS NULL`, id); e != nil {
		return Enrollment{}, errors.New("challenge revocation failed")
	}
	if e = events.RecordTx(ctx, tx, events.Security{EventType: eventType, Outcome: "SUCCESS", ActorUserID: &id, Route: "cli/admin/" + operation, StatusCode: 200}); e != nil {
		return Enrollment{}, errors.New("admin security event write failed")
	}
	if e = tx.Commit(ctx); e != nil {
		return Enrollment{}, errors.New("admin transaction commit failed")
	}
	return result, nil
}
