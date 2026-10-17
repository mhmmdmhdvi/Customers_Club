package main

import (
	"bytes"
	"context"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/database"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
	"net"
	"net/url"
	"strconv"
	"strings"
	"testing"
)

func TestCommandMigratesWithDatabaseOnly(t *testing.T) {
	p := testdb.OpenEmpty(t)
	var out bytes.Buffer
	cfg := p.Config().ConnConfig
	target := url.URL{Scheme: "postgresql", Host: net.JoinHostPort(cfg.Host, strconv.Itoa(int(cfg.Port))), Path: "/" + cfg.Database, User: url.UserPassword(cfg.User, cfg.Password), RawQuery: "sslmode=disable"}
	probe, e := database.Open(context.Background(), database.Config{URL: target.String()})
	if e != nil {
		t.Fatal(e)
	}
	var actual string
	e = probe.QueryRow(context.Background(), `SELECT current_database()`).Scan(&actual)
	probe.Close()
	if e != nil || actual != cfg.Database || !strings.HasPrefix(actual, "mig_test_") {
		t.Fatal("CLI fixture is not the owned child")
	}
	if e := run(context.Background(), map[string]string{"DATABASE_URL": target.String()}, &out); e != nil {
		t.Fatal(e)
	}
	var count int
	if e := p.QueryRow(context.Background(), `SELECT count(*) FROM public.go_migrations`).Scan(&count); e != nil || count != 14 {
		t.Fatal("command did not migrate", e)
	}
	if out.String() != "Migrations applied.\n" {
		t.Fatal("missing sanitized completion output")
	}
}
func TestCommandRejectsMissingDatabaseWithoutOutput(t *testing.T) {
	var out bytes.Buffer
	if e := run(context.Background(), map[string]string{}, &out); e == nil || out.Len() != 0 {
		t.Fatal("missing config accepted")
	}
}
