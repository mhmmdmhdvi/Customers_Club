package events

import (
	"bytes"
	"context"
	"log"
	"strings"
	"testing"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

func TestSecurityEventPersistenceRejectsSecretsAndBoundsFailures(t *testing.T) {
	p := testdb.Open(t)
	s := New(p)
	ctx := context.Background()
	id := int64(1)
	v := Security{EventType: "ADMIN_LOGIN", Outcome: "SUCCESS", ActorUserID: &id, Route: "/auth/login/mfa", RequestID: "server-id", StatusCode: 200}
	if e := s.Record(ctx, v); e != nil {
		t.Fatal(e)
	}
	var details any
	var actor int64
	if e := p.QueryRow(ctx, `SELECT details,"actorUserId" FROM "SecurityEvent" WHERE id=1`).Scan(&details, &actor); e != nil || details != nil || actor != id {
		t.Fatal("event DTO", details, actor, e)
	}
	v.Details = map[string]any{"nested": map[string]any{"Access-Token": "private"}}
	if e := s.Record(ctx, v); e == nil {
		t.Fatal("secret accepted")
	}
	v.Details = nil
	if _, e := p.Exec(ctx, `CREATE FUNCTION slow_security_event() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_sleep(5);RETURN NEW;END$$;CREATE TRIGGER slow_security_event BEFORE INSERT ON "SecurityEvent" FOR EACH ROW EXECUTE FUNCTION slow_security_event()`); e != nil {
		t.Fatal(e)
	}
	var diagnostic bytes.Buffer
	previous := log.Writer()
	log.SetOutput(&diagnostic)
	defer log.SetOutput(previous)
	start := time.Now()
	BestEffort(ctx, s, v)
	if time.Since(start) > 2*time.Second {
		t.Fatal("best effort was unbounded")
	}
	if !strings.HasSuffix(diagnostic.String(), "Security event recording failed\n") || strings.Contains(diagnostic.String(), "private") {
		t.Fatal("unsanitized diagnostic")
	}
	var count int
	if e := p.QueryRow(ctx, `SELECT count(*) FROM "SecurityEvent"`).Scan(&count); e != nil || count != 1 {
		t.Fatal("failed event persisted", count, e)
	}
}
