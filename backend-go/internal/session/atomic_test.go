package session

import (
	"context"
	"errors"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/accesstoken"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/adminmfa"
	"strings"
	"sync"
	"testing"
	"time"
)

func counts(t *testing.T, s *Service, users, sessions, refresh int) {
	t.Helper()
	var u, a, r int
	e := s.pool.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM "User"),(SELECT count(*) FROM "AuthSession"),(SELECT count(*) FROM "RefreshToken")`).Scan(&u, &a, &r)
	if e != nil {
		t.Fatal(e)
	}
	if u != users || a != sessions || r != refresh {
		t.Fatalf("state counts %d,%d,%d want %d,%d,%d", u, a, r, users, sessions, refresh)
	}
}
func TestPersistenceFailureRollsBackRegistrationAndProof(t *testing.T) {
	s, p := fixture(t)
	ctx := context.Background()
	token := strings.Repeat("a", 64)
	proof(t, p, token, "09121234567", "REGISTER")
	_, e := p.Exec(ctx, `CREATE FUNCTION reject_refresh() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic persistence failure'; END $$; CREATE TRIGGER reject_refresh BEFORE INSERT ON "RefreshToken" FOR EACH ROW EXECUTE FUNCTION reject_refresh()`)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Register(ctx, registration(token)); e == nil {
		t.Fatal("persistence failure ignored")
	}
	counts(t, s, 0, 0, 0)
	_, e = p.Exec(ctx, `DROP TRIGGER reject_refresh ON "RefreshToken"`)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Register(ctx, registration(token)); e != nil {
		t.Fatal("proof consumed on failure", e)
	}
}
func TestLoginAndRefreshSigningFailuresRetainCredential(t *testing.T) {
	s, p := fixture(t)
	ctx := context.Background()
	token := strings.Repeat("a", 64)
	proof(t, p, token, "09121234567", "REGISTER")
	g, e := s.Register(ctx, registration(token))
	if e != nil {
		t.Fatal(e)
	}
	real := s.tokens
	s.tokens = failingSigner{}
	if _, e = s.Refresh(ctx, g.RefreshToken); e == nil {
		t.Fatal("refresh sign failure ignored")
	}
	counts(t, s, 1, 1, 1)
	s.tokens = real
	g, e = s.Refresh(ctx, g.RefreshToken)
	if e != nil {
		t.Fatal("refresh claim committed on failure", e)
	}
	token = strings.Repeat("b", 64)
	proof(t, p, token, "09121234567", "LOGIN")
	s.tokens = failingSigner{}
	if _, e = s.Login(ctx, map[string]any{"verificationToken": token}); e == nil {
		t.Fatal("login sign failure ignored")
	}
	s.tokens = real
	if _, e = s.Login(ctx, map[string]any{"verificationToken": token}); e != nil {
		t.Fatal("login proof committed on failure", e)
	}
}

type interruptedSigner struct {
	tokenService
	cancel       context.CancelFunc
	panicOnIssue bool
}

func (s interruptedSigner) Issue(uid int64, sid string, expiry time.Time) (accesstoken.IssueResult, error) {
	if s.panicOnIssue {
		panic("synthetic signer panic")
	}
	s.cancel()
	return s.tokenService.Issue(uid, sid, expiry)
}
func TestCancellationAndPanicReleaseTransaction(t *testing.T) {
	for _, panicking := range []bool{false, true} {
		t.Run(map[bool]string{false: "cancel", true: "panic"}[panicking], func(t *testing.T) {
			s, p := fixture(t)
			token := strings.Repeat("a", 64)
			proof(t, p, token, "09121234567", "REGISTER")
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			real := s.tokens
			s.tokens = interruptedSigner{real, cancel, panicking}
			if panicking {
				func() {
					defer func() {
						if recover() == nil {
							t.Error("expected panic")
						}
					}()
					_, _ = s.Register(ctx, registration(token))
				}()
			} else {
				if _, e := s.Register(ctx, registration(token)); e == nil {
					t.Fatal("canceled commit accepted")
				}
			}
			counts(t, s, 0, 0, 0)
			s.tokens = real
			if _, e := s.Register(context.Background(), registration(token)); e != nil {
				t.Fatal("connection/proof retained after cleanup", e)
			}
		})
	}
}
func TestConcurrentLogoutAndRefreshNeverLeaveLiveFamily(t *testing.T) {
	s, p := fixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	token := strings.Repeat("a", 64)
	proof(t, p, token, "09121234567", "REGISTER")
	g, e := s.Register(ctx, registration(token))
	if e != nil {
		t.Fatal(e)
	}
	var wg sync.WaitGroup
	start := make(chan struct{})
	wg.Go(func() {
		<-start
		_, e := s.Refresh(ctx, g.RefreshToken)
		var ae *Error
		if e != nil && !errors.As(e, &ae) {
			t.Error(e)
		}
	})
	wg.Go(func() {
		<-start
		if e := s.Logout(ctx, g.RefreshToken); e != nil {
			t.Error(e)
		}
	})
	close(start)
	wg.Wait()
	if _, e = s.Authenticate(ctx, g.AccessToken); e == nil {
		t.Fatal("live family after logout overlap")
	}
}
func TestDuplicatePhoneProofPurposeExpiryAndMissingUser(t *testing.T) {
	s, p := fixture(t)
	ctx := context.Background()
	token := strings.Repeat("a", 64)
	proof(t, p, token, "09121234567", "REGISTER")
	if _, e := s.Register(ctx, registration(token)); e != nil {
		t.Fatal(e)
	}
	token = strings.Repeat("b", 64)
	proof(t, p, token, "09121234567", "REGISTER")
	_, e := s.Register(ctx, registration(token))
	var ae *Error
	if !errors.As(e, &ae) || ae.Status != 409 {
		t.Fatal("duplicate", e)
	}
	var used *time.Time
	if e = p.QueryRow(ctx, `SELECT "usedAt" FROM "PhoneVerification" WHERE "tokenHash"=$1`, digest(token)).Scan(&used); e != nil || used != nil {
		t.Fatal("duplicate consumed proof", e)
	}
	if _, e = s.Login(ctx, map[string]any{"verificationToken": token}); e == nil {
		t.Fatal("REGISTER used as LOGIN")
	}
	token = strings.Repeat("c", 64)
	proof(t, p, token, "09129999999", "LOGIN")
	if _, e = s.Login(ctx, map[string]any{"verificationToken": token}); e == nil {
		t.Fatal("missing user accepted")
	}
	if e = p.QueryRow(ctx, `SELECT "usedAt" FROM "PhoneVerification" WHERE "tokenHash"=$1`, digest(token)).Scan(&used); e != nil || used != nil {
		t.Fatal("missing user consumed proof", e)
	}
	_, e = p.Exec(ctx, `UPDATE "PhoneVerification" SET "expiresAt"=$1`, time.Now().UTC().Add(-time.Second))
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Login(ctx, map[string]any{"verificationToken": token}); e == nil {
		t.Fatal("expired proof accepted")
	}
}
func TestLegacyNullableUserAndLiveExpiryDeletion(t *testing.T) {
	s, p := fixture(t)
	ctx := context.Background()
	_, e := p.Exec(ctx, `ALTER TABLE "User" ALTER COLUMN "birthYear" DROP NOT NULL,ALTER COLUMN "birthMonth" DROP NOT NULL,ALTER COLUMN "birthDay" DROP NOT NULL; INSERT INTO "User" (phone,role,"updatedAt") VALUES ('09121234567','MEMBER',now())`)
	if e != nil {
		t.Fatal(e)
	}
	token := strings.Repeat("a", 64)
	proof(t, p, token, "09121234567", "LOGIN")
	g, e := s.Login(ctx, map[string]any{"verificationToken": token})
	if e != nil || g.User.BirthYear != nil || g.User.FirstName != nil {
		t.Fatal("nullable user", e)
	}
	_, e = p.Exec(ctx, `UPDATE "AuthSession" SET "expiresAt"=$1`, time.Now().UTC().Add(-time.Second))
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Authenticate(ctx, g.AccessToken); e == nil {
		t.Fatal("session expiry ignored")
	}
	if _, e = s.Refresh(ctx, g.RefreshToken); e == nil {
		t.Fatal("expired refresh accepted")
	}
	_, e = p.Exec(ctx, `DELETE FROM "User"`)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Authenticate(ctx, g.AccessToken); e == nil {
		t.Fatal("deleted user authenticated")
	}
}
func TestAdminMFASigningRollbackAndChallengeOverlap(t *testing.T) {
	s, p := fixture(t)
	ctx := context.Background()
	token := strings.Repeat("a", 64)
	proof(t, p, token, "09121234567", "REGISTER")
	g, e := s.Register(ctx, registration(token))
	if e != nil {
		t.Fatal(e)
	}
	_, e = p.Exec(ctx, `UPDATE "User" SET role='ADMIN' WHERE id=$1`, g.User.ID)
	if e != nil {
		t.Fatal(e)
	}
	token = strings.Repeat("b", 64)
	proof(t, p, token, "09121234567", "LOGIN")
	if _, e = s.Login(ctx, map[string]any{"verificationToken": token}); e == nil {
		t.Fatal("unenrolled admin allowed")
	}
	secret := "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	enc, e := s.mfa.Encrypt(secret)
	if e != nil {
		t.Fatal(e)
	}
	_, e = p.Exec(ctx, `INSERT INTO "AdminMfaCredential" ("userId","secretCiphertext","secretIv","secretTag","updatedAt") VALUES ($1,$2,$3,$4,$5)`, g.User.ID, enc.Ciphertext, enc.IV, enc.Tag, time.Now().UTC())
	if e != nil {
		t.Fatal(e)
	}
	first, e := s.Login(ctx, map[string]any{"verificationToken": token})
	if e != nil {
		t.Fatal("unenrolled login consumed proof", e)
	}
	for _, n := range []string{strings.Repeat("c", 64), strings.Repeat("d", 64)} {
		proof(t, p, n, "09121234567", "LOGIN")
	}
	var wg sync.WaitGroup
	for _, n := range []string{strings.Repeat("c", 64), strings.Repeat("d", 64)} {
		wg.Go(func() {
			if _, e := s.Login(ctx, map[string]any{"verificationToken": n}); e != nil {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	var live int
	e = p.QueryRow(ctx, `SELECT count(*) FROM "AdminMfaChallenge" WHERE "usedAt" IS NULL`).Scan(&live)
	if e != nil || live != 1 {
		t.Fatal("overlapping challenges", live, e)
	}
	code, _ := adminmfa.Generate(secret, time.Now().UTC())
	if _, e = s.CompleteMFA(ctx, map[string]any{"mfaChallengeToken": first.MFAChallengeToken, "code": code}); e == nil {
		t.Fatal("superseded challenge accepted")
	}
	token = strings.Repeat("e", 64)
	proof(t, p, token, "09121234567", "LOGIN")
	challenge, e := s.Login(ctx, map[string]any{"verificationToken": token})
	if e != nil {
		t.Fatal(e)
	}
	real := s.tokens
	s.tokens = failingSigner{}
	input := map[string]any{"mfaChallengeToken": challenge.MFAChallengeToken, "code": code, "extra": true}
	if _, e = s.CompleteMFA(ctx, input); e == nil {
		t.Fatal("MFA signer failure ignored")
	}
	s.tokens = real
	var last *int64
	e = p.QueryRow(ctx, `SELECT "lastUsedCounter" FROM "AdminMfaCredential"`).Scan(&last)
	if e != nil || last != nil {
		t.Fatal("counter not rolled back", e)
	}
	if _, e = s.Authenticate(ctx, g.AccessToken); e != nil {
		t.Fatal("old session revoked before successful commit", e)
	}
	if _, e = s.CompleteMFA(ctx, input); e != nil {
		t.Fatal("challenge consumed before successful commit", e)
	}
}

func TestCanceledWaitOnProofReleasesPool(t *testing.T) {
	s, p := fixture(t)
	token := strings.Repeat("a", 64)
	proof(t, p, token, "09121234567", "REGISTER")
	ctx := context.Background()
	tx, e := p.Begin(ctx)
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, `SELECT id FROM "PhoneVerification" FOR UPDATE`); e != nil {
		t.Fatal(e)
	}
	short, cancel := context.WithTimeout(ctx, 50*time.Millisecond)
	defer cancel()
	if _, e = s.Register(short, registration(token)); e == nil {
		t.Fatal("blocked claim ignored cancellation")
	}
	if e = tx.Commit(ctx); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Register(ctx, registration(token)); e != nil {
		t.Fatal("claim/connection leaked", e)
	}
}
