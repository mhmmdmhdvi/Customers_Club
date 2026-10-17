package adminops_test

import (
	"context"
	"encoding/base32"
	"errors"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/adminmfa"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/adminops"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

func setup(t *testing.T) (*pgxpool.Pool, *adminops.Service, *adminmfa.Crypto, int64) {
	t.Helper()
	p := testdb.Open(t)
	c, e := adminmfa.New([]byte(strings.Repeat("m", 32)))
	if e != nil {
		t.Fatal(e)
	}
	var id int64
	if e = p.QueryRow(context.Background(), `INSERT INTO "User" (phone,"updatedAt") VALUES ('09120000001',now()) RETURNING id`).Scan(&id); e != nil {
		t.Fatal(e)
	}
	return p, adminops.New(p, c), c, id
}
func activeCredentials(t *testing.T, p *pgxpool.Pool, id int64) {
	t.Helper()
	for _, sql := range []string{`INSERT INTO "AuthSession" (id,"userId","expiresAt") VALUES ('00000000-0000-4000-8000-000000000001',$1,now()+interval '1 day')`, `INSERT INTO "AdminMfaChallenge" (id,"userId","tokenHash","expiresAt") VALUES ('00000000-0000-4000-8000-000000000002',$1,'test-hash',now()+interval '1 hour')`} {
		if _, e := p.Exec(context.Background(), sql, id); e != nil {
			t.Fatal(e)
		}
	}
}
func assertRevocation(t *testing.T, p *pgxpool.Pool, want bool) {
	t.Helper()
	var session, challenge bool
	e := p.QueryRow(context.Background(), `SELECT (SELECT "revokedAt" IS NOT NULL AND version=1 FROM "AuthSession"),(SELECT "usedAt" IS NOT NULL FROM "AdminMfaChallenge")`).Scan(&session, &challenge)
	if e != nil || session != want || challenge != want {
		t.Fatalf("revocation=%v/%v want=%v err=%v", session, challenge, want, e)
	}
}
func TestPromotionRevokesMemberSessionsAndChallenges(t *testing.T) {
	p, s, _, id := setup(t)
	activeCredentials(t, p, id)
	ctx := context.Background()
	got, e := s.Promote(ctx, "+98 912-0000001")
	if e != nil || got != id {
		t.Fatal("promotion", e)
	}
	var role string
	if e = p.QueryRow(ctx, `SELECT role FROM "User" WHERE id=$1`, id).Scan(&role); e != nil || role != "ADMIN" {
		t.Fatal("role", role, e)
	}
	assertRevocation(t, p, true)
	var event string
	if e = p.QueryRow(ctx, `SELECT "eventType" FROM "SecurityEvent"`).Scan(&event); e != nil || event != "ADMIN_PROMOTED" {
		t.Fatal("event", event, e)
	}
	if _, e = s.Promote(ctx, "09120000001"); e == nil {
		t.Fatal("duplicate promotion accepted")
	}
}

func TestLookupFailureIsSanitizedAndDistinctFromMissingUser(t *testing.T) {
	p, s, _, _ := setup(t)
	if _, e := p.Exec(context.Background(), `ALTER TABLE "User" RENAME TO "UserUnavailable"`); e != nil {
		t.Fatal(e)
	}
	_, e := s.Promote(context.Background(), "09120000001")
	if e == nil || e.Error() != "target user lookup failed" || strings.Contains(e.Error(), "UserUnavailable") {
		t.Fatalf("lookup failure misclassified or exposed: %v", e)
	}
}

func TestCanceledLockedLookupRetainsCancellation(t *testing.T) {
	p, s, _, id := setup(t)
	tx, e := p.Begin(context.Background())
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback(context.Background())
	if _, e = tx.Exec(context.Background(), `SELECT id FROM "User" WHERE id=$1 FOR UPDATE`, id); e != nil {
		t.Fatal(e)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_, e = s.Promote(ctx, "09120000001")
	if e == nil || e.Error() != "target user lookup failed" || !errors.Is(e, context.DeadlineExceeded) {
		t.Fatalf("canceled lookup misclassified: %v", e)
	}
}
func TestEnrollAndResetEncryptedTOTP(t *testing.T) {
	p, s, c, id := setup(t)
	ctx := context.Background()
	if _, e := s.Promote(ctx, "09120000001"); e != nil {
		t.Fatal(e)
	}
	first, e := s.Enroll(ctx, "09120000001")
	if e != nil {
		t.Fatal(e)
	}
	validateEnrollment(t, p, c, id, first)
	if _, e = s.Enroll(ctx, "09120000001"); e == nil {
		t.Fatal("duplicate enrollment accepted")
	}
	activeCredentials(t, p, id)
	if _, e = p.Exec(ctx, `UPDATE "AdminMfaCredential" SET "lastUsedCounter"=123 WHERE "userId"=$1`, id); e != nil {
		t.Fatal(e)
	}
	second, e := s.Reset(ctx, "09120000001")
	if e != nil {
		t.Fatal(e)
	}
	if second.Secret == first.Secret {
		t.Fatal("reset reused secret")
	}
	validateEnrollment(t, p, c, id, second)
	assertRevocation(t, p, true)
	var counter *int
	if e = p.QueryRow(ctx, `SELECT "lastUsedCounter" FROM "AdminMfaCredential" WHERE "userId"=$1`, id).Scan(&counter); e != nil || counter != nil {
		t.Fatal("counter not reset", e)
	}
	var count int
	if e = p.QueryRow(ctx, `SELECT count(*) FROM "SecurityEvent" WHERE "eventType" IN ('ADMIN_MFA_ENROLLED','ADMIN_MFA_RESET') AND details IS NULL`).Scan(&count); e != nil || count != 2 {
		t.Fatal("secret-free transactional events", count, e)
	}
}
func validateEnrollment(t *testing.T, p *pgxpool.Pool, c *adminmfa.Crypto, id int64, v adminops.Enrollment) {
	t.Helper()
	var encrypted adminmfa.Encrypted
	if e := p.QueryRow(context.Background(), `SELECT "secretCiphertext","secretIv","secretTag" FROM "AdminMfaCredential" WHERE "userId"=$1`, id).Scan(&encrypted.Ciphertext, &encrypted.IV, &encrypted.Tag); e != nil {
		t.Fatal(e)
	}
	secret, e := c.Decrypt(encrypted)
	if e != nil || secret != v.Secret || encrypted.Ciphertext == secret {
		t.Fatal("encryption mismatch", e)
	}
	raw, e := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if e != nil || len(raw) != 20 {
		t.Fatal("invalid generated secret", e)
	}
	uri, e := url.Parse(v.URI)
	if e != nil || uri.Scheme != "otpauth" || uri.Host != "totp" || uri.Path != "/Megatite Customer Club:admin-"+strconv.FormatInt(id, 10) || uri.Query().Get("secret") != secret || uri.Query().Get("algorithm") != "SHA1" || uri.Query().Get("digits") != "6" || uri.Query().Get("period") != "30" {
		t.Fatal("invalid enrollment URI")
	}
	code, e := adminmfa.Generate(secret, time.Unix(59, 0))
	if e != nil {
		t.Fatal(e)
	}
	counter, ok, e := adminmfa.Verify(secret, code, time.Unix(59, 0))
	if e != nil || !ok || counter != 1 {
		t.Fatal("TOTP unusable", e)
	}
}
func TestIneligibleOperationsDoNotMutate(t *testing.T) {
	p, s, _, _ := setup(t)
	ctx := context.Background()
	for _, number := range []string{"invalid", "09120000002", "09120000001"} {
		if _, e := s.Enroll(ctx, number); e == nil {
			t.Fatal("ineligible enrollment accepted")
		}
		if _, e := s.Reset(ctx, number); e == nil {
			t.Fatal("ineligible reset accepted")
		}
	}
	if _, e := s.Promote(ctx, "09120000001"); e != nil {
		t.Fatal(e)
	}
	if _, e := s.Reset(ctx, "09120000001"); e == nil {
		t.Fatal("reset without enrollment accepted")
	}
	var count int
	if e := p.QueryRow(ctx, `SELECT count(*) FROM "AdminMfaCredential"`).Scan(&count); e != nil || count != 0 {
		t.Fatal("ineligible operation wrote credential", e)
	}
}

func TestCompetingEnrollmentsHaveOneWinner(t *testing.T) {
	p, s, _, _ := setup(t)
	ctx := context.Background()
	if _, e := s.Promote(ctx, "09120000001"); e != nil {
		t.Fatal(e)
	}
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Go(func() { _, e := s.Enroll(ctx, "09120000001"); results <- e })
	}
	wg.Wait()
	close(results)
	successes := 0
	for e := range results {
		if e == nil {
			successes++
		}
	}
	var count int
	if e := p.QueryRow(ctx, `SELECT count(*) FROM "AdminMfaCredential"`).Scan(&count); e != nil || count != 1 || successes != 1 {
		t.Fatal("enrollment was not serialized", e)
	}
}
func TestEventFailureRollsBackEachOperation(t *testing.T) {
	for _, operation := range []string{"promote", "enroll", "reset"} {
		t.Run(operation, func(t *testing.T) {
			p, s, c, id := setup(t)
			ctx := context.Background()
			var old adminops.Enrollment
			if operation != "promote" {
				if _, e := s.Promote(ctx, "09120000001"); e != nil {
					t.Fatal(e)
				}
			}
			if operation == "reset" {
				var e error
				old, e = s.Enroll(ctx, "09120000001")
				if e != nil {
					t.Fatal(e)
				}
				if _, e = p.Exec(ctx, `UPDATE "AdminMfaCredential" SET "lastUsedCounter"=123 WHERE "userId"=$1`, id); e != nil {
					t.Fatal(e)
				}
			}
			activeCredentials(t, p, id)
			if _, e := p.Exec(ctx, `ALTER TABLE "SecurityEvent" ADD CONSTRAINT reject_new_events CHECK (false) NOT VALID`); e != nil {
				t.Fatal(e)
			}
			var e error
			switch operation {
			case "promote":
				_, e = s.Promote(ctx, "09120000001")
			case "enroll":
				_, e = s.Enroll(ctx, "09120000001")
			case "reset":
				_, e = s.Reset(ctx, "09120000001")
			}
			if e == nil {
				t.Fatal("event write failure ignored")
			}
			assertRevocation(t, p, false)
			var role string
			if e = p.QueryRow(ctx, `SELECT role FROM "User" WHERE id=$1`, id).Scan(&role); e != nil {
				t.Fatal(e)
			}
			if operation == "promote" && role != "MEMBER" {
				t.Fatal("failed promotion committed")
			}
			if operation == "reset" {
				validateEnrollment(t, p, c, id, old)
				var counter int
				if e = p.QueryRow(ctx, `SELECT "lastUsedCounter" FROM "AdminMfaCredential" WHERE "userId"=$1`, id).Scan(&counter); e != nil || counter != 123 {
					t.Fatal("failed reset changed counter", e)
				}
			} else {
				var count int
				if e = p.QueryRow(ctx, `SELECT count(*) FROM "AdminMfaCredential"`).Scan(&count); e != nil || count != 0 {
					t.Fatal("failed enrollment committed", e)
				}
			}
		})
	}
}
