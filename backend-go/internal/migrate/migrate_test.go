package migrate_test

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/migrate"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

func TestFreshIdempotentAndConcurrent(t *testing.T) {
	p := testdb.OpenEmpty(t)
	ctx := context.Background()
	var wg sync.WaitGroup
	for range 4 {
		wg.Go(func() {
			if err := migrate.Apply(ctx, p); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	if err := migrate.Apply(ctx, p); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := p.QueryRow(ctx, `SELECT count(*) FROM public.go_migrations`).Scan(&count); err != nil || count != 14 {
		t.Fatalf("ledger: %d %v", count, err)
	}
	if _, err := p.Exec(ctx, `INSERT INTO "User" (phone,"updatedAt") VALUES ('09120000001',now())`); err != nil {
		t.Fatal(err)
	}
	if err := migrate.Apply(ctx, p); err != nil {
		t.Fatal(err)
	}
	if err := p.QueryRow(ctx, `SELECT count(*) FROM "User"`).Scan(&count); err != nil || count != 1 {
		t.Fatal("idempotence lost data", err)
	}
}

func TestRejectLedgerDrift(t *testing.T) {
	for _, sql := range []string{
		`UPDATE public.go_migrations SET checksum=repeat('0',64) WHERE position=1`,
		`DELETE FROM public.go_migrations WHERE position=2`,
		`UPDATE public.go_migrations SET name='unknown_migration' WHERE position=1`,
		`INSERT INTO public.go_migrations (position,name,checksum) VALUES (15,'future',repeat('0',64))`,
		`DELETE FROM public.go_migrations`,
	} {
		t.Run(sql, func(t *testing.T) {
			p := testdb.OpenEmpty(t)
			ctx := context.Background()
			if err := migrate.Apply(ctx, p); err != nil {
				t.Fatal(err)
			}
			if _, err := p.Exec(ctx, sql); err != nil {
				t.Fatal(err)
			}
			if err := migrate.Apply(ctx, p); err == nil {
				t.Fatal("ledger drift accepted")
			}
		})
	}
}

func TestCanceledLockWaitCanRetry(t *testing.T) {
	p := testdb.OpenEmpty(t)
	ctx := context.Background()
	blocker, e := p.Acquire(ctx)
	if e != nil {
		t.Fatal(e)
	}
	defer blocker.Release()
	if _, e = blocker.Exec(ctx, `SELECT pg_advisory_lock(730164867648117001)`); e != nil {
		t.Fatal(e)
	}
	timeout, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	if e = migrate.Apply(timeout, p); e == nil {
		t.Fatal("canceled migration succeeded")
	}
	if _, e = blocker.Exec(ctx, `SELECT pg_advisory_unlock(730164867648117001)`); e != nil {
		t.Fatal(e)
	}
	if e = migrate.Apply(ctx, p); e != nil {
		t.Fatal("retry after cancellation failed", e)
	}
}

func TestRejectUntrackedSchemaWithoutMutation(t *testing.T) {
	for _, sql := range []string{`CREATE TABLE keep_data (value text); INSERT INTO keep_data VALUES ('keep')`, `CREATE TYPE existing_enum AS ENUM ('keep')`, `CREATE FUNCTION existing_fn() RETURNS int LANGUAGE SQL AS 'SELECT 1'`, `CREATE SCHEMA existing_schema`, `CREATE COLLATION existing_collation FROM pg_catalog."C"`} {
		t.Run(sql, func(t *testing.T) {
			p := testdb.OpenEmpty(t)
			ctx := context.Background()
			if _, err := p.Exec(ctx, sql); err != nil {
				t.Fatal(err)
			}
			if err := migrate.Apply(ctx, p); err == nil {
				t.Fatal("untracked schema accepted")
			}
			var ledger *string
			if err := p.QueryRow(ctx, `SELECT to_regclass('public.go_migrations')::text`).Scan(&ledger); err != nil || ledger != nil {
				t.Fatal("refusal mutated schema", err)
			}
			if strings.Contains(sql, "keep_data") {
				var value string
				if err := p.QueryRow(ctx, `SELECT value FROM keep_data`).Scan(&value); err != nil || value != "keep" {
					t.Fatal("existing data changed", err)
				}
			}
		})
	}
}

func TestMigrationRollbackKeepsLedgerAndEarlierSchema(t *testing.T) {
	p := testdb.OpenEmpty(t)
	ctx := context.Background()
	if err := migrate.Apply(ctx, p); err != nil {
		t.Fatal(err)
	}
	// Rewind only the owned fixture to the boundary before migration three.
	if _, err := p.Exec(ctx, `DELETE FROM public.go_migrations WHERE position>=3; DROP TABLE "PhoneVerification"; DROP TYPE "PhoneVerificationPurpose"; CREATE TABLE "PhoneVerification" (sentinel text)`); err != nil {
		t.Fatal(err)
	}
	if err := migrate.Apply(ctx, p); err == nil {
		t.Fatal("conflicting migration accepted")
	}
	var count int
	if err := p.QueryRow(ctx, `SELECT count(*) FROM pg_type WHERE typname='PhoneVerificationPurpose'`).Scan(&count); err != nil || count != 0 {
		t.Fatal("partial migration committed", err)
	}
	if err := p.QueryRow(ctx, `SELECT count(*) FROM public.go_migrations`).Scan(&count); err != nil || count != 2 {
		t.Fatal("failed migration recorded", err)
	}
}
