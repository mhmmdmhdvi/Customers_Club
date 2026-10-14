package admin

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

type overviewTrace struct {
	sql  string
	args []any
}

func (r *overviewTrace) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	r.sql = data.SQL
	r.args = append([]any(nil), data.Args...)
	return ctx
}
func (*overviewTrace) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

// The measured query budget is one logical scan of User and ContactMessage,
// independent of timing. Reintroducing separate counts fails this regression.
func TestOverviewSinglePassRetainsExactCountPredicates(t *testing.T) {
	owned := testdb.Open(t)
	ctx := context.Background()
	if _, err := owned.Exec(ctx, `
 INSERT INTO "User" (phone,role,"createdAt","updatedAt") VALUES
 ('09120000001','MEMBER',now()-interval '1 day',now()),
 ('09120000002','MEMBER',now()-interval '8 days',now()),
 ('09120000003','ADMIN',now(),now());
 INSERT INTO "ContactMessage" (name,phone,subject,message,status,"updatedAt") VALUES
 ('Example','09120000001','SUPPORT','Synthetic','NEW',now()),
 ('Example','09120000001','SUPPORT','Synthetic','READ',now());
 INSERT INTO "AuthSession" (id,"userId","expiresAt","revokedAt") VALUES
 ('00000000-0000-0000-0000-000000000001',1,now()+interval '1 day',NULL),
 ('00000000-0000-0000-0000-000000000002',1,now()-interval '1 day',NULL),
 ('00000000-0000-0000-0000-000000000003',1,now()+interval '1 day',now()),
 ('00000000-0000-0000-0000-000000000004',1,now(),NULL);`); err != nil {
		t.Fatal(err)
	}
	trace := &overviewTrace{}
	cfg := owned.Config().Copy()
	cfg.ConnConfig.Tracer = trace
	p, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	got, err := New(p).Overview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"members": map[string]any{"total": int64(2), "newLast7Days": int64(1)}, "messages": map[string]any{"total": int64(2), "new": int64(1)}, "sessions": map[string]any{"active": int64(1)}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("exact overview predicates changed: %+v", got)
	}
	// Explain the actual emitted query and arguments through the original pool.
	var raw []byte
	if err = owned.QueryRow(ctx, "EXPLAIN (FORMAT JSON) "+trace.sql, trace.args...).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var plan any
	if err = json.Unmarshal(raw, &plan); err != nil {
		t.Fatal(err)
	}
	scans := map[string]int{}
	var visit func(any)
	visit = func(node any) {
		switch n := node.(type) {
		case map[string]any:
			if table, ok := n["Relation Name"].(string); ok {
				scans[table]++
			}
			for _, child := range n {
				visit(child)
			}
		case []any:
			for _, child := range n {
				visit(child)
			}
		}
	}
	visit(plan)
	if scans["User"] != 1 || scans["ContactMessage"] != 1 {
		t.Fatalf("overview repeats table passes: %+v", scans)
	}
}
