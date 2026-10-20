package contact

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/session"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

func input() map[string]any {
	return map[string]any{"name": " e\u0301 ", "phone": "+98 912-1234567", "email": " USER@Example.COM ", "subject": "SUPPORT", "message": " Help\nplease "}
}
func TestContactLockWaitCancellationReleasesTransaction(t *testing.T) {
	p := testdb.Open(t)
	ctx := context.Background()
	tx, e := p.Begin(ctx)
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback(ctx)
	// This literal is independently produced by Node's signed big-endian hash.
	if _, e = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(-7626477545502823541)`); e != nil {
		t.Fatal(e)
	}
	bounded, cancel := context.WithTimeout(ctx, 75*time.Millisecond)
	defer cancel()
	if e = New(p).CreateMessage(bounded, input()); e == nil {
		t.Fatal("lock contention did not honor cancellation")
	}
	if e = tx.Rollback(ctx); e != nil {
		t.Fatal(e)
	}
	if e = New(p).CreateMessage(ctx, input()); e != nil {
		t.Fatal("connection/lock leaked", e)
	}
}
func TestValidation(t *testing.T) {
	d, e := Parse(input())
	if e != nil || d.Name != "é" || d.Phone != "09121234567" || *d.Email != "user@example.com" || d.Message != "Help\nplease" {
		t.Fatalf("normalization %v %v", d, e)
	}
	cases := []struct {
		key     string
		value   any
		message string
	}{{"name", "\nname", "Name must not contain control characters"}, {"name", strings.Repeat("😀", 81), "Name must contain 1 to 80 characters"}, {"phone", 123, "Invalid phone number"}, {"subject", "support", "Invalid subject"}, {"message", "\x00", "Message contains invalid characters"}, {"email", "x@x", "Invalid email"}, {"extra", true, "Unexpected contact message field"}}
	for _, c := range cases {
		b := input()
		b[c.key] = c.value
		_, e := Parse(b)
		var ae *session.Error
		if !errors.As(e, &ae) || ae.Message != c.message {
			t.Errorf("%s: %v", c.key, e)
		}
	}
	b := input()
	b["message"] = strings.Repeat("😀", 250)
	b["email"] = ""
	d, e = Parse(b)
	if e != nil || d.Email != nil {
		t.Fatal(e)
	}
	if LockKey("09121234567") != -7626477545502823541 {
		t.Fatalf("lock key %d", LockKey("09121234567"))
	}
}
func TestEmailUsesNodeUnicodeLowercase(t *testing.T) {
	b := input()
	b["email"] = "İ@EXAMPLE.COM"
	d, e := Parse(b)
	if e != nil || d.Email == nil || *d.Email != "i\u0307@example.com" {
		t.Fatal("Node lowercase expansion must survive", d.Email, e)
	}
}
func TestConcurrentQuotaAndCancelledTransaction(t *testing.T) {
	p := testdb.Open(t)
	s := New(p)
	var wg sync.WaitGroup
	var successes, limited atomic.Int32
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			e := s.CreateMessage(context.Background(), input())
			if e == nil {
				successes.Add(1)
			} else {
				var ae *session.Error
				if errors.As(e, &ae) && ae.Status == 429 {
					limited.Add(1)
				} else {
					t.Errorf("create: %v", e)
				}
			}
		}()
	}
	wg.Wait()
	if successes.Load() != 3 || limited.Load() != 9 {
		t.Fatalf("success=%d limited=%d", successes.Load(), limited.Load())
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if e := s.CreateMessage(ctx, input()); e == nil {
		t.Fatal("cancelled accepted")
	}
	var count int
	if e := p.QueryRow(context.Background(), `SELECT count(*) FROM "ContactMessage"`).Scan(&count); e != nil || count != 3 {
		t.Fatalf("count %d %v", count, e)
	}
}
