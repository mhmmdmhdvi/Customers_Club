package admin

import (
	"context"
	"errors"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/session"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

func TestReadValidation(t *testing.T) {
	s := New(nil)
	for _, c := range []struct{ resource, key, value, message string }{{"users", "page", "0", "Invalid page"}, {"users", "pageSize", "101", "Invalid page size"}, {"users", "search", "\x00", "Invalid search"}, {"messages", "status", "bad", "Invalid status"}, {"messages", "subject", "bad", "Invalid subject"}, {"audit", "action", " ", "Invalid action"}, {"audit", "actorUserId", "1e1", "Invalid actor user id"}, {"security", "statusCode", "600", "Invalid status code"}, {"security", "outcome", "bad", "Invalid outcome"}} {
		_, e := s.List(context.Background(), c.resource, url.Values{c.key: {c.value}})
		var ae *session.Error
		if !errors.As(e, &ae) || ae.Message != c.message {
			t.Errorf("%+v: %v", c, e)
		}
	}
	for _, r := range []string{"users", "messages", "audit", "security"} {
		_, e := s.List(context.Background(), r, url.Values{"page": {"1", "2"}})
		if e == nil {
			t.Error("duplicate accepted", r)
		}
	}
	for _, r := range []string{"messages", "audit", "security"} {
		_, e := s.Detail(context.Background(), r, "-1")
		if e == nil {
			t.Error("invalid id accepted", r)
		}
	}
}
func TestDatabaseReadsConcurrentTransitionsAndAuditRollback(t *testing.T) {
	p := testdb.Open(t)
	s := New(p)
	ctx := context.Background()
	if _, e := p.Exec(ctx, `INSERT INTO "User" (phone,role,"updatedAt") VALUES ('09121234567','MEMBER',now()); INSERT INTO "ContactMessage" (name,phone,subject,message,"updatedAt") VALUES ('Test','09121234567','SUPPORT','private body',now())`); e != nil {
		t.Fatal(e)
	}
	for _, r := range []string{"users", "messages", "audit", "security"} {
		v, e := s.List(ctx, r, url.Values{})
		if e != nil {
			t.Fatal(r, e)
		}
		if v["items"] == nil {
			t.Fatal("null items", r)
		}
	}
	u, e := s.List(ctx, "users", url.Values{"search": {"test"}})
	if e != nil || u["pagination"].(map[string]any)["total"] != int64(0) {
		t.Fatal(u, e)
	}
	overview, e := s.Overview(ctx)
	if e != nil || overview["members"].(map[string]any)["total"] != int64(1) {
		t.Fatal(overview, e)
	}
	var wg sync.WaitGroup
	var wins atomic.Int32
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, e := s.UpdateStatus(ctx, "1", "READ", 1, "request-id")
			if e == nil {
				wins.Add(1)
			} else {
				var ae *session.Error
				if !errors.As(e, &ae) || ae.Status != 409 {
					t.Errorf("transition: %v", e)
				}
			}
		}()
	}
	wg.Wait()
	if wins.Load() != 1 {
		t.Fatalf("wins=%d", wins.Load())
	}
	audit, e := s.Detail(ctx, "audit", "1")
	if e != nil || audit["requestId"] != "request-id" || audit["details"].(map[string]any)["fromStatus"] != "NEW" {
		t.Fatal(audit, e)
	}
	if _, e = p.Exec(ctx, `ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT reject_audit CHECK (action <> 'CONTACT_MESSAGE_STATUS_CHANGED') NOT VALID`); e != nil {
		t.Fatal(e)
	}
	if _, e = s.UpdateStatus(ctx, "1", "RESOLVED", 1, "request-id"); e == nil {
		t.Fatal("audit failure accepted")
	}
	m, e := s.Detail(ctx, "messages", "1")
	if e != nil || m["status"] != "READ" {
		t.Fatal("status did not rollback", m, e)
	}
}
