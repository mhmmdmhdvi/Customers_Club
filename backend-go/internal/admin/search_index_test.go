package admin

import (
	"context"
	"encoding/json"
	"net/url"
	"testing"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

// This catches an absent/wrong operator-class migration: PostgreSQL must be
// able to use our GIN index for the exact existing OR/LIKE/ILIKE predicate.
func TestUserSubstringIndexSupportsExistingSearchPredicate(t *testing.T) {
	p := testdb.Open(t)
	ctx := context.Background()
	if _, err := p.Exec(ctx, `INSERT INTO "User" (phone,"firstName","lastName","updatedAt") VALUES ('09120000001','Needle',NULL,now()),('09120000002',NULL,'Other',now()),('09120000003',NULL,NULL,now())`); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		search string
		total  int64
	}{{"nEeDlE", 1}, {"N", 1}, {"%", 3}, {"_", 3}, {"\\%", 0}} {
		got, err := New(p).List(ctx, "users", url.Values{"search": {c.search}})
		if err != nil {
			t.Fatal(c.search, err)
		}
		if got["pagination"].(map[string]any)["total"] != c.total {
			t.Fatalf("search %q: %+v", c.search, got)
		}
	}
	tx, err := p.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	// Tiny regression populations naturally prefer sequential scans; forcing
	// that path's cost high tests index eligibility, never production settings.
	if _, err = tx.Exec(ctx, `SET LOCAL enable_seqscan=off`); err != nil {
		t.Fatal(err)
	}
	var raw []byte
	if err = tx.QueryRow(ctx, `EXPLAIN (FORMAT JSON) SELECT count(*) FROM "User" WHERE phone LIKE $1 OR "firstName" ILIKE $1 OR "lastName" ILIKE $1`, "%Needle%").Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var plan any
	if err = json.Unmarshal(raw, &plan); err != nil {
		t.Fatal(err)
	}
	var usesIndex func(any) bool
	usesIndex = func(node any) bool {
		switch n := node.(type) {
		case map[string]any:
			if n["Index Name"] == "User_search_trgm_idx" {
				return true
			}
			for _, child := range n {
				if usesIndex(child) {
					return true
				}
			}
		case []any:
			for _, child := range n {
				if usesIndex(child) {
					return true
				}
			}
		}
		return false
	}
	if !usesIndex(plan) {
		t.Fatal("existing user search predicate cannot use migration-owned trigram index")
	}
}
