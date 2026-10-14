package testdb

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var validTestURL = "postgresql://mig_owner_0123456789abcdef:" + strings.Repeat("0123456789abcdef", 4) + "@127.0.0.1:25432/mig_parent_0123456789abcdef?sslmode=disable"

func TestTargetGuards(t *testing.T) {
	for _, tc := range []struct {
		name, url, optin string
		valid            bool
	}{
		{"explicit opt in", validTestURL, "1", true},
		{"missing opt in", validTestURL, "", false},
		{"wrong opt in", validTestURL, "true", false},
		{"ordinary development database", strings.Replace(validTestURL, "mig_parent_0123456789abcdef", "customers_club", 1), "1", false},
		{"ordinary test database", strings.Replace(validTestURL, "mig_parent_0123456789abcdef", "customers_club_test", 1), "1", false},
		{"wrong user", strings.Replace(validTestURL, "mig_owner_0123456789abcdef", "postgres", 1), "1", false},
		{"different cluster ID", strings.Replace(validTestURL, "mig_parent_0123456789abcdef", "mig_parent_ffffffffffffffff", 1), "1", false},
		{"remote host", strings.Replace(validTestURL, "127.0.0.1", "192.0.2.1", 1), "1", false},
		{"default port", strings.Replace(validTestURL, "25432", "5432", 1), "1", false},
		{"URI options", validTestURL + "&options=-csearch_path%3Dother", "1", false},
		{"missing URL", "", "1", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := targetConfig(tc.url, tc.optin)
			if (err == nil) != tc.valid {
				t.Fatalf("target accepted=%v want %v", err == nil, tc.valid)
			}
		})
	}
}

func TestPostgresDisposableLifecycle(t *testing.T) {
	// Open must skip when either explicit environment opt-in is absent.
	first := Open(t)
	cfg, err := targetConfig(testURL(), testOptIn())
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	parent, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal("parent connection failed")
	}
	defer parent.Close()
	var firstName string
	if err := first.QueryRow(ctx, "SELECT current_database()").Scan(&firstName); err != nil {
		t.Fatal(err)
	}
	var schemaTables int
	if err := first.QueryRow(ctx, `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`).Scan(&schemaTables); err != nil {
		t.Fatal(err)
	}
	if schemaTables < 10 {
		t.Fatalf("checked-in schema missing: %d tables", schemaTables)
	}
	if _, err := first.Exec(ctx, `INSERT INTO "User" (phone,"updatedAt","birthYear","birthMonth","birthDay") VALUES ('09121234567',now(),1375,7,12)`); err != nil {
		t.Fatal(err)
	}
	var secondName string
	t.Run("second isolated migrated database", func(t *testing.T) {
		second := Open(t)
		if err := second.QueryRow(ctx, "SELECT current_database()").Scan(&secondName); err != nil {
			t.Fatal(err)
		}
		if secondName == firstName {
			t.Fatal("database reused")
		}
		var users int
		if err := second.QueryRow(ctx, `SELECT count(*) FROM "User"`).Scan(&users); err != nil {
			t.Fatal(err)
		}
		if users != 0 {
			t.Fatal("test data leaked between owned databases")
		}
	})
	assertRemoved(t, ctx, parent, secondName)
	var emptyName string
	t.Run("empty database supports migration rehearsal", func(t *testing.T) {
		empty := OpenEmpty(t)
		if err := empty.QueryRow(ctx, "SELECT current_database()").Scan(&emptyName); err != nil {
			t.Fatal(err)
		}
		var users *string
		if err := empty.QueryRow(ctx, `SELECT to_regclass('public."User"')::text`).Scan(&users); err != nil {
			t.Fatal(err)
		}
		if users != nil {
			t.Fatal("OpenEmpty applied migrations")
		}
	})
	assertRemoved(t, ctx, parent, emptyName)
	t.Run("actual parent identity", func(t *testing.T) {
		wrong := cfg.Copy()
		wrong.ConnConfig.Database = "postgres"
		pool, err := pgxpool.NewWithConfig(ctx, wrong)
		if err != nil {
			t.Fatal("identity probe connection failed")
		}
		defer pool.Close()
		if validateParent(ctx, pool, cfg.ConnConfig.Database, cfg.ConnConfig.User) == nil {
			t.Fatal("wrong actual parent accepted")
		}
	})
	t.Run("drop refuses parent and unowned databases", func(t *testing.T) {
		for _, name := range []string{cfg.ConnConfig.Database, "postgres", firstName} {
			if dropOwned(ctx, parent, name, cfg.ConnConfig.User, "incorrect-marker") == nil {
				t.Fatal(fmt.Sprintf("unowned drop accepted: %s", name))
			}
		}
	})
}

func assertRemoved(t *testing.T, ctx context.Context, parent *pgxpool.Pool, name string) {
	t.Helper()
	var exists bool
	if err := parent.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1)", name).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists {
		t.Fatal("owned database not cleaned up")
	}
}
