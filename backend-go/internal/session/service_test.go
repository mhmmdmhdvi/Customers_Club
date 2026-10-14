package session

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/accesstoken"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/adminmfa"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func fixture(t *testing.T) (*Service, *pgxpool.Pool) {
	t.Helper()
	p := testdb.Open(t)
	s, e := New(p, authconfig.Config{Secret: []byte(strings.Repeat("s", 32)), Issuer: "test", Audience: "web", AccessTTLSeconds: 900}, []byte(strings.Repeat("m", 32)))
	if e != nil {
		t.Fatal(e)
	}
	return s, p
}
func proof(t *testing.T, p *pgxpool.Pool, token, phone, purpose string) {
	t.Helper()
	_, e := p.Exec(context.Background(), `INSERT INTO "PhoneVerification" (phone,"tokenHash",purpose,"expiresAt") VALUES ($1,$2,$3, $4)`, phone, digest(token), purpose, time.Now().UTC().Add(5*time.Minute))
	if e != nil {
		t.Fatal(e)
	}
}
func registration(token string) map[string]any {
	return map[string]any{"verificationToken": token, "firstName": " e\u0301 ", "lastName": "Test", "birthYear": float64(1370), "birthMonth": float64(1), "birthDay": float64(1)}
}
func TestRegisterRotateReplayLogoutAndLiveRole(t *testing.T) {
	s, p := fixture(t)
	ctx := context.Background()
	token := strings.Repeat("a", 64)
	proof(t, p, token, "09121234567", "REGISTER")
	g, e := s.Register(ctx, registration(token))
	if e != nil {
		t.Fatal(e)
	}
	if *g.User.FirstName != "é" || g.ExpiresIn != 900 {
		t.Fatalf("invalid grant %+v", g.User)
	}
	a, e := s.Authenticate(ctx, g.AccessToken)
	if e != nil || a.User.Role != "MEMBER" {
		t.Fatal(e)
	}
	_, e = p.Exec(ctx, `UPDATE "User" SET role='ADMIN' WHERE id=$1`, g.User.ID)
	if e != nil {
		t.Fatal(e)
	}
	a, e = s.Authenticate(ctx, g.AccessToken)
	if e != nil || a.User.Role != "ADMIN" {
		t.Fatal("role must be live", e)
	}
	g2, e := s.Refresh(ctx, g.RefreshToken)
	if e != nil {
		t.Fatal(e)
	}
	if !g2.RefreshExpiresAt.Equal(g.RefreshExpiresAt) {
		t.Fatalf("expiry changed: issued=%s persisted=%s", g.RefreshExpiresAt.Format(time.RFC3339Nano), g2.RefreshExpiresAt.Format(time.RFC3339Nano))
	}
	if _, e = s.Refresh(ctx, g.RefreshToken); e == nil {
		t.Fatal("replay accepted")
	}
	if _, e = s.Authenticate(ctx, g2.AccessToken); e == nil {
		t.Fatal("replay did not revoke")
	}
	if e = s.Logout(ctx, g.RefreshToken); e != nil {
		t.Fatal(e)
	}
	if e = s.Logout(ctx, ""); e != nil {
		t.Fatal(e)
	}
}
func TestConcurrentProofAndRefresh(t *testing.T) {
	s, p := fixture(t)
	ctx := context.Background()
	token := strings.Repeat("a", 64)
	proof(t, p, token, "09121234567", "REGISTER")
	var winners atomic.Int32
	var g Grant
	var mu sync.Mutex
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Go(func() {
			v, e := s.Register(ctx, registration(token))
			if e == nil {
				winners.Add(1)
				mu.Lock()
				g = v
				mu.Unlock()
			}
		})
	}
	wg.Wait()
	if winners.Load() != 1 {
		t.Fatalf("proof winners %d", winners.Load())
	}
	winners.Store(0)
	for i := 0; i < 8; i++ {
		wg.Go(func() {
			_, e := s.Refresh(ctx, g.RefreshToken)
			if e == nil {
				winners.Add(1)
			}
		})
	}
	wg.Wait()
	if winners.Load() != 1 {
		t.Fatalf("refresh winners %d", winners.Load())
	}
	if _, e := s.Authenticate(ctx, g.AccessToken); e == nil {
		t.Fatal("family not revoked")
	}
}

type failingSigner struct{}

func (failingSigner) Issue(int64, string, time.Time) (accesstoken.IssueResult, error) {
	return accesstoken.IssueResult{}, errors.New("sign failure")
}
func (failingSigner) Verify(string) (accesstoken.VerifiedClaims, error) {
	return accesstoken.VerifiedClaims{}, errors.New("verify failure")
}
func TestSigningRollback(t *testing.T) {
	s, p := fixture(t)
	ctx := context.Background()
	token := strings.Repeat("a", 64)
	proof(t, p, token, "09121234567", "REGISTER")
	s.tokens = failingSigner{}
	if _, e := s.Register(ctx, registration(token)); e == nil {
		t.Fatal("sign failure ignored")
	}
	var count int
	var used *time.Time
	if e := p.QueryRow(ctx, `SELECT count(*) FROM "User"`).Scan(&count); e != nil {
		t.Fatal(e)
	}
	if e := p.QueryRow(ctx, `SELECT "usedAt" FROM "PhoneVerification"`).Scan(&used); e != nil {
		t.Fatal(e)
	}
	if count != 0 || used != nil {
		t.Fatal("registration not rolled back")
	}
}
func TestValidationNamesAndTehranBirthday(t *testing.T) {
	now := time.Date(2026, 3, 20, 20, 30, 0, 0, time.UTC)
	for _, tt := range []struct {
		y, m, d int
		valid   bool
	}{{1405, 1, 1, false}, {1404, 12, 29, true}, {1394, 12, 30, false}, {1395, 12, 30, true}, {3178, 1, 1, false}, {-61, 1, 1, true}} {
		if pastBirthday(tt.y, tt.m, tt.d, now) != tt.valid {
			t.Fatalf("birthday %+v", tt)
		}
	}
	for _, name := range []string{"", "\nX", strings.Repeat("x", 81)} {
		if _, e := normalizeName(name, "First name"); e == nil {
			t.Fatal("invalid name accepted")
		}
	}
}
func TestMFAFailedAttemptsConcurrencyReplayAndAdminSessions(t *testing.T) {
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
	secret := "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	enc, e := s.mfa.Encrypt(secret)
	if e != nil {
		t.Fatal(e)
	}
	_, e = p.Exec(ctx, `INSERT INTO "AdminMfaCredential" ("userId","secretCiphertext","secretIv","secretTag","updatedAt") VALUES ($1,$2,$3,$4,$5)`, g.User.ID, enc.Ciphertext, enc.IV, enc.Tag, time.Now().UTC())
	if e != nil {
		t.Fatal(e)
	}
	begin := func(n string) Grant {
		t.Helper()
		proof(t, p, n, "09121234567", "LOGIN")
		v, e := s.Login(ctx, map[string]any{"verificationToken": n})
		if e != nil || !v.MFARequired || v.RefreshToken != "" {
			t.Fatal("challenge", e)
		}
		return v
	}
	c := begin(strings.Repeat("b", 64))
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Go(func() {
			_, e := s.CompleteMFA(ctx, map[string]any{"mfaChallengeToken": c.MFAChallengeToken, "code": "invalid"})
			if e == nil {
				t.Error("malformed code accepted")
			}
		})
	}
	wg.Wait()
	code, _ := adminmfa.Generate(secret, time.Now().UTC())
	bad := "000000"
	if code == bad {
		bad = "111111"
	}
	for i := 0; i < 8; i++ {
		wg.Go(func() {
			_, e := s.CompleteMFA(ctx, map[string]any{"mfaChallengeToken": c.MFAChallengeToken, "code": bad})
			if e == nil {
				t.Error("wrong code accepted")
			}
		})
	}
	wg.Wait()
	var count int
	e = p.QueryRow(ctx, `SELECT "failedAttempts" FROM "AdminMfaChallenge" WHERE "tokenHash"=$1`, digest(c.MFAChallengeToken)).Scan(&count)
	if e != nil || count != 5 {
		t.Fatal("failed attempts", count, e)
	}
	if _, e = s.CompleteMFA(ctx, map[string]any{"mfaChallengeToken": c.MFAChallengeToken, "code": code}); e == nil {
		t.Fatal("exhausted challenge accepted")
	}
	c = begin(strings.Repeat("c", 64))
	var winners atomic.Int32
	var admin Grant
	var mu sync.Mutex
	for i := 0; i < 6; i++ {
		wg.Go(func() {
			v, e := s.CompleteMFA(ctx, map[string]any{"mfaChallengeToken": c.MFAChallengeToken, "code": code})
			if e == nil {
				winners.Add(1)
				mu.Lock()
				admin = v
				mu.Unlock()
			}
		})
	}
	wg.Wait()
	if winners.Load() != 1 {
		t.Fatalf("MFA winners %d", winners.Load())
	}
	if delta := time.Until(admin.RefreshExpiresAt); delta < 7*time.Hour || delta > 8*time.Hour {
		t.Fatal("admin ttl", delta)
	}
	if _, e = s.Authenticate(ctx, g.AccessToken); e == nil {
		t.Fatal("old session not revoked")
	}
	c = begin(strings.Repeat("d", 64))
	if _, e = s.CompleteMFA(ctx, map[string]any{"mfaChallengeToken": c.MFAChallengeToken, "code": code}); e == nil {
		t.Fatal("TOTP counter reused")
	}
	// A later code issues a new absolute admin session and revokes the former one.
	later := time.Now().UTC().Add(60 * time.Second)
	s.now = func() time.Time { return later }
	laterCode, e := adminmfa.Generate(secret, later)
	if e != nil {
		t.Fatal(e)
	}
	newAdmin, e := s.CompleteMFA(ctx, map[string]any{"mfaChallengeToken": c.MFAChallengeToken, "code": laterCode})
	if e != nil {
		t.Fatal("later MFA code", e)
	}
	if _, e = s.Authenticate(ctx, admin.AccessToken); e == nil {
		t.Fatal("older admin session still live")
	}
	if _, e = s.Authenticate(ctx, newAdmin.AccessToken); e != nil {
		t.Fatal("new admin session", e)
	}
}
