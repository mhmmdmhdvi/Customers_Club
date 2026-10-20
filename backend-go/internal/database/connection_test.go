package database

import (
	"context"
	"errors"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
	"net/url"
	"os"
	"testing"
	"time"
)

func TestOpenFailsClosedForInvalidConnection(t *testing.T) {
	config := Config{
		URL: "postgresql://%",
	}

	pool, err := Open(
		context.Background(),
		config,
	)

	if pool != nil {
		pool.Close()
		t.Fatal(
			"expected no pool for invalid database configuration",
		)
	}

	if !errors.Is(
		err,
		ErrUnavailable,
	) {
		t.Fatalf(
			"expected database unavailable error, got %v",
			err,
		)
	}
}

func TestProductionPoolUsesUTCForTimestampDefaults(t *testing.T) {
	child := testdb.Open(t)
	u, e := url.Parse(os.Getenv("MIGRATION_TEST_DATABASE_URL"))
	if e != nil {
		t.Fatal("test target")
	}
	u.Path = "/" + child.Config().ConnConfig.Database
	q := u.Query()
	q.Set("timezone", "Asia/Tehran")
	u.RawQuery = q.Encode()
	p, e := Open(context.Background(), Config{URL: u.String()})
	if e != nil {
		t.Fatal(e)
	}
	defer p.Close()
	ctx := context.Background()
	var zone string
	if e = p.QueryRow(ctx, `SHOW timezone`).Scan(&zone); e != nil {
		t.Fatal(e)
	}
	if zone != "UTC" {
		t.Fatalf("pool timezone %q", zone)
	}
	conn, e := p.Acquire(ctx)
	if e != nil {
		t.Fatal(e)
	}
	defer conn.Release()
	tx, e := conn.Begin(ctx)
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback(ctx)
	var expected, actual time.Time
	e = tx.QueryRow(ctx, `SELECT now() AT TIME ZONE 'UTC'`).Scan(&expected)
	if e != nil {
		t.Fatal(e)
	}
	e = tx.QueryRow(ctx, `INSERT INTO "PhoneVerification" (phone,"tokenHash",purpose,"expiresAt") VALUES ('09121234567',repeat('a',64),'REGISTER',TIMESTAMP '2026-10-14 00:00:00') RETURNING "createdAt"`).Scan(&actual)
	if e != nil {
		t.Fatal(e)
	}
	if delta := actual.Sub(expected); delta < -time.Millisecond || delta > time.Millisecond {
		t.Fatal("timestamp default shifted from UTC", delta)
	}
	var boundary time.Time
	e = tx.QueryRow(ctx, `SELECT "expiresAt" FROM "PhoneVerification"`).Scan(&boundary)
	if e != nil || !boundary.Equal(time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)) {
		t.Fatal("timestamp boundary shifted", e)
	}
}
