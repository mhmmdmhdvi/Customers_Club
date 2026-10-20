// Package session owns atomic account, proof, refresh and live session operations.
package session

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/accesstoken"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/adminmfa"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
)

type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string                 { return e.Message }
func failure(status int, message string) error { return &Error{status, message} }

var ErrUnauthorized = failure(401, "Invalid or expired session")

type User struct {
	ID         int64     `json:"id"`
	Phone      string    `json:"phone"`
	FirstName  *string   `json:"firstName"`
	LastName   *string   `json:"lastName"`
	Role       string    `json:"role"`
	BirthYear  *int      `json:"birthYear"`
	BirthMonth *int      `json:"birthMonth"`
	BirthDay   *int      `json:"birthDay"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func (u User) MarshalJSON() ([]byte, error) {
	type fields User
	return json.Marshal(struct {
		fields
		CreatedAt string `json:"createdAt"`
		UpdatedAt string `json:"updatedAt"`
	}{fields(u), u.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z"), u.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000Z")})
}

type Grant struct {
	accesstoken.IssueResult
	User              User
	RefreshToken      string
	RefreshExpiresAt  time.Time
	MFARequired       bool
	MFAChallengeToken string
	MFAExpiresAt      time.Time
}
type Authentication struct {
	User      User
	SessionID string
}
type tokenService interface {
	Issue(int64, string, time.Time) (accesstoken.IssueResult, error)
	Verify(string) (accesstoken.VerifiedClaims, error)
}
type Service struct {
	pool   *pgxpool.Pool
	tokens tokenService
	mfa    *adminmfa.Crypto
	now    func() time.Time
	random func([]byte) (int, error)
}

func New(pool *pgxpool.Pool, auth authconfig.Config, mfaKey []byte) (*Service, error) {
	if pool == nil {
		return nil, errors.New("session database unavailable")
	}
	tokens, e := accesstoken.New(accesstoken.Config{Secret: auth.Secret, Issuer: auth.Issuer, Audience: auth.Audience, AccessTTLSeconds: auth.AccessTTLSeconds})
	if e != nil {
		return nil, e
	}
	mfa, e := adminmfa.New(mfaKey)
	if e != nil {
		return nil, e
	}
	return &Service{pool: pool, tokens: tokens, mfa: mfa, now: time.Now, random: rand.Read}, nil
}
func digest(raw string) string { v := sha256.Sum256([]byte(raw)); return hex.EncodeToString(v[:]) }
func (s *Service) randomToken() (string, error) {
	b := make([]byte, 32)
	n, e := s.random(b)
	if e != nil || n != len(b) {
		return "", errors.New("credential randomness unavailable")
	}
	return hex.EncodeToString(b), nil
}
func (s *Service) uuid() (string, error) {
	b := make([]byte, 16)
	n, e := s.random(b)
	if e != nil || n != len(b) {
		return "", errors.New("session randomness unavailable")
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
func rollback(tx pgx.Tx) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = tx.Rollback(ctx)
}
func (s *Service) transaction(ctx context.Context, f func(pgx.Tx) (Grant, error)) (Grant, error) {
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return Grant{}, e
	}
	defer rollback(tx)
	g, e := f(tx)
	if e != nil {
		return Grant{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		return Grant{}, e
	}
	return g, nil
}

const userFields = `id,phone,"firstName","lastName",role,"birthYear","birthMonth","birthDay","createdAt","updatedAt"`

func scanUser(row pgx.Row) (User, error) {
	var u User
	e := row.Scan(&u.ID, &u.Phone, &u.FirstName, &u.LastName, &u.Role, &u.BirthYear, &u.BirthMonth, &u.BirthDay, &u.CreatedAt, &u.UpdatedAt)
	return u, e
}
func (s *Service) credentials(ctx context.Context, tx pgx.Tx, id string, expiry time.Time, u User) (Grant, error) {
	raw, e := s.randomToken()
	if e != nil {
		return Grant{}, e
	}
	_, e = tx.Exec(ctx, `INSERT INTO "RefreshToken" ("sessionId","tokenHash","createdAt") VALUES ($1,$2,$3)`, id, digest(raw), s.now().UTC().Truncate(time.Millisecond))
	if e != nil {
		return Grant{}, e
	}
	access, e := s.tokens.Issue(u.ID, id, expiry)
	if e != nil {
		return Grant{}, e
	}
	return Grant{IssueResult: access, User: u, RefreshToken: raw, RefreshExpiresAt: expiry}, nil
}
func (s *Service) issue(ctx context.Context, tx pgx.Tx, u User) (Grant, error) {
	now := s.now().UTC().Truncate(time.Millisecond)
	ttl := 7 * 24 * time.Hour
	if u.Role == "ADMIN" {
		ttl = 8 * time.Hour
		_, e := tx.Exec(ctx, `UPDATE "AuthSession" SET "revokedAt"=$2,version=version+1 WHERE "userId"=$1 AND "revokedAt" IS NULL AND "expiresAt">$2`, u.ID, now)
		if e != nil {
			return Grant{}, e
		}
	}
	id, e := s.uuid()
	if e != nil {
		return Grant{}, e
	}
	expiry := now.Add(ttl)
	_, e = tx.Exec(ctx, `INSERT INTO "AuthSession" (id,"userId","createdAt","expiresAt") VALUES ($1,$2,$3,$4)`, id, u.ID, now, expiry)
	if e != nil {
		return Grant{}, e
	}
	return s.credentials(ctx, tx, id, expiry, u)
}
func (s *Service) claimProof(ctx context.Context, tx pgx.Tx, token, purpose string) (string, error) {
	var phone string
	now := s.now().UTC().Truncate(time.Millisecond)
	e := tx.QueryRow(ctx, `UPDATE "PhoneVerification" SET "usedAt"=$3 WHERE "tokenHash"=$1 AND purpose=$2 AND "usedAt" IS NULL AND "expiresAt">$3 RETURNING phone`, digest(token), purpose, now).Scan(&phone)
	if errors.Is(e, pgx.ErrNoRows) {
		return "", failure(401, "Invalid or expired verification")
	}
	return phone, e
}
func (s *Service) Register(ctx context.Context, input map[string]any) (Grant, error) {
	if input == nil {
		return Grant{}, failure(400, "Registration details are required")
	}
	for key := range input {
		switch key {
		case "verificationToken", "firstName", "lastName", "birthYear", "birthMonth", "birthDay":
		default:
			return Grant{}, failure(400, "Only verificationToken, firstName and lastName are allowed")
		}
	}
	token, _ := input["verificationToken"].(string)
	if !tokenPattern.MatchString(token) {
		return Grant{}, failure(400, "Invalid or expired verification")
	}
	y, yok := integer(input["birthYear"])
	m, mok := integer(input["birthMonth"])
	d, dok := integer(input["birthDay"])
	if !yok || !mok || !dok || !pastBirthday(y, m, d, s.now()) {
		return Grant{}, failure(400, "Invalid birth date")
	}
	first, e := normalizeName(input["firstName"], "First name")
	if e != nil {
		return Grant{}, e
	}
	last, e := normalizeName(input["lastName"], "Last name")
	if e != nil {
		return Grant{}, e
	}
	g, e := s.transaction(ctx, func(tx pgx.Tx) (Grant, error) {
		phone, e := s.claimProof(ctx, tx, token, "REGISTER")
		if e != nil {
			var ae *Error
			if errors.As(e, &ae) {
				return Grant{}, failure(400, ae.Message)
			}
			return Grant{}, e
		}
		now := s.now().UTC().Truncate(time.Millisecond)
		u, e := scanUser(tx.QueryRow(ctx, `INSERT INTO "User" (phone,"firstName","lastName",role,"birthYear","birthMonth","birthDay","createdAt","updatedAt") VALUES ($1,$2,$3,'MEMBER',$4,$5,$6,$7,$7) RETURNING `+userFields, phone, first, last, y, m, d, now))
		if e != nil {
			return Grant{}, e
		}
		return s.issue(ctx, tx, u)
	})
	var pe *pgconn.PgError
	if errors.As(e, &pe) && pe.Code == "23505" && pe.ConstraintName == "User_phone_key" {
		return Grant{}, failure(409, "Phone already registered")
	}
	return g, e
}
func (s *Service) Login(ctx context.Context, input map[string]any) (Grant, error) {
	token, _ := input["verificationToken"].(string)
	if len(input) != 1 || !tokenPattern.MatchString(token) {
		return Grant{}, failure(401, "Invalid or expired verification")
	}
	return s.transaction(ctx, func(tx pgx.Tx) (Grant, error) {
		phone, e := s.claimProof(ctx, tx, token, "LOGIN")
		if e != nil {
			return Grant{}, e
		}
		u, e := scanUser(tx.QueryRow(ctx, `SELECT `+userFields+` FROM "User" WHERE phone=$1 FOR UPDATE`, phone))
		if errors.Is(e, pgx.ErrNoRows) {
			return Grant{}, failure(401, "Invalid or expired verification")
		}
		if e != nil {
			return Grant{}, e
		}
		if u.Role == "ADMIN" {
			return s.beginMFA(ctx, tx, u.ID)
		}
		return s.issue(ctx, tx, u)
	})
}
func revoke(ctx context.Context, tx pgx.Tx, id string, now time.Time) error {
	_, e := tx.Exec(ctx, `UPDATE "AuthSession" SET "revokedAt"=$2,version=version+1 WHERE id=$1 AND "revokedAt" IS NULL`, id, now)
	return e
}
func (s *Service) Refresh(ctx context.Context, raw string) (Grant, error) {
	if !tokenPattern.MatchString(raw) {
		return Grant{}, ErrUnauthorized
	}
	g, e := s.transaction(ctx, func(tx pgx.Tx) (Grant, error) {
		var id string
		e := tx.QueryRow(ctx, `SELECT "sessionId" FROM "RefreshToken" WHERE "tokenHash"=$1`, digest(raw)).Scan(&id)
		if errors.Is(e, pgx.ErrNoRows) {
			return Grant{}, nil
		}
		if e != nil {
			return Grant{}, e
		}
		// Lock family before token in every refresh/logout transaction.
		var uid int64
		var expiry time.Time
		var revoked *time.Time
		e = tx.QueryRow(ctx, `SELECT "userId","expiresAt","revokedAt" FROM "AuthSession" WHERE id=$1 FOR UPDATE`, id).Scan(&uid, &expiry, &revoked)
		if errors.Is(e, pgx.ErrNoRows) {
			return Grant{}, nil
		}
		if e != nil {
			return Grant{}, e
		}
		now := s.now().UTC().Truncate(time.Millisecond)
		if revoked != nil || !expiry.After(now) {
			return Grant{}, nil
		}
		var used *time.Time
		e = tx.QueryRow(ctx, `SELECT "usedAt" FROM "RefreshToken" WHERE "tokenHash"=$1 FOR UPDATE`, digest(raw)).Scan(&used)
		if e != nil {
			return Grant{}, e
		}
		if used != nil {
			return Grant{}, revoke(ctx, tx, id, now)
		}
		_, e = tx.Exec(ctx, `UPDATE "RefreshToken" SET "usedAt"=$2 WHERE "tokenHash"=$1`, digest(raw), now)
		if e != nil {
			return Grant{}, e
		}
		_, e = tx.Exec(ctx, `UPDATE "AuthSession" SET version=version+1 WHERE id=$1`, id)
		if e != nil {
			return Grant{}, e
		}
		u, e := scanUser(tx.QueryRow(ctx, `SELECT `+userFields+` FROM "User" WHERE id=$1`, uid))
		if errors.Is(e, pgx.ErrNoRows) {
			return Grant{}, revoke(ctx, tx, id, now)
		}
		if e != nil {
			return Grant{}, e
		}
		return s.credentials(ctx, tx, id, expiry, u)
	})
	if e == nil && g.RefreshToken == "" {
		e = ErrUnauthorized
	}
	return g, e
}
func (s *Service) Logout(ctx context.Context, raw string) error {
	if !tokenPattern.MatchString(raw) {
		return nil
	}
	_, e := s.transaction(ctx, func(tx pgx.Tx) (Grant, error) {
		var id string
		e := tx.QueryRow(ctx, `SELECT "sessionId" FROM "RefreshToken" WHERE "tokenHash"=$1`, digest(raw)).Scan(&id)
		if errors.Is(e, pgx.ErrNoRows) {
			return Grant{}, nil
		}
		if e != nil {
			return Grant{}, e
		}
		return Grant{}, revoke(ctx, tx, id, s.now().UTC().Truncate(time.Millisecond))
	})
	return e
}
func (s *Service) Authenticate(ctx context.Context, raw string) (Authentication, error) {
	claims, e := s.tokens.Verify(raw)
	if e != nil {
		return Authentication{}, ErrUnauthorized
	}
	var uid int64
	var expiry time.Time
	var revoked *time.Time
	e = s.pool.QueryRow(ctx, `SELECT "userId","expiresAt","revokedAt" FROM "AuthSession" WHERE id=$1`, claims.SessionID).Scan(&uid, &expiry, &revoked)
	if errors.Is(e, pgx.ErrNoRows) {
		return Authentication{}, ErrUnauthorized
	}
	if e != nil {
		return Authentication{}, e
	}
	if uid != claims.UserID || revoked != nil || !expiry.After(s.now().UTC().Truncate(time.Millisecond)) {
		return Authentication{}, ErrUnauthorized
	}
	u, e := scanUser(s.pool.QueryRow(ctx, `SELECT `+userFields+` FROM "User" WHERE id=$1`, uid))
	if errors.Is(e, pgx.ErrNoRows) {
		return Authentication{}, ErrUnauthorized
	}
	return Authentication{u, claims.SessionID}, e
}
