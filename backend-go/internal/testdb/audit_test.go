package testdb

import (
	"context"
	"testing"
)

func TestAuditRejectsUnselectedTargets(t *testing.T) {
	for _, tc := range []struct{ raw, optin string }{{"", "1"}, {validTestURL, ""}, {"postgresql://localhost:5432/developer", "1"}} {
		if Audit(context.Background(), tc.raw, tc.optin) == nil {
			t.Fatal("audit accepted unsafe target")
		}
	}
}

func TestAuditRejectsLeakedOwnedChildren(t *testing.T) {
	// The allocated child deliberately exists during audit, then normal cleanup
	// removes it. The parent itself remains untouched.
	OpenEmpty(t)
	if Audit(context.Background(), testURL(), testOptIn()) == nil {
		t.Fatal("audit accepted live owned child")
	}
}
