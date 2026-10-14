package admin

import (
	"context"
	"net/url"
	"testing"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

// A secondary id order gives rows with equal creation timestamps a stable
// page boundary. Replacing DESC id with no tie order breaks this regression.
func TestUserPagesOrderEqualCreatedAtByDescendingID(t *testing.T) {
	p := testdb.Open(t)
	ctx := context.Background()
	if _, err := p.Exec(ctx, `INSERT INTO "User" (phone,"createdAt","updatedAt") SELECT '0912000000'||i,'2026-01-01','2026-01-01' FROM generate_series(1,5) i`); err != nil {
		t.Fatal(err)
	}
	s := New(p)
	for page, want := range [][]int32{{5, 4}, {3, 2}, {1}} {
		q := url.Values{"page": {[]string{"1", "2", "3"}[page]}, "pageSize": {"2"}}
		got, err := s.List(ctx, "users", q)
		if err != nil {
			t.Fatal(err)
		}
		items := got["items"].([]map[string]any)
		if len(items) != len(want) {
			t.Fatalf("page %d length %d", page+1, len(items))
		}
		for i, id := range want {
			if items[i]["id"] != id {
				t.Fatalf("page %d item %d id=%v want=%d", page+1, i, items[i]["id"], id)
			}
		}
	}
}
