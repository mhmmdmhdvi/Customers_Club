package main

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/database"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
	"net"
	"net/url"
	"strconv"
	"strings"
	"testing"
)

func TestCommandRequiresOnlyApplicableConfiguration(t *testing.T) {
	p := testdb.Open(t)
	ctx := context.Background()
	if _, e := p.Exec(ctx, `INSERT INTO "User" (phone,"updatedAt") VALUES ('09120000001',now())`); e != nil {
		t.Fatal(e)
	}
	cfg := p.Config().ConnConfig
	target := url.URL{Scheme: "postgresql", Host: net.JoinHostPort(cfg.Host, strconv.Itoa(int(cfg.Port))), Path: "/" + cfg.Database, User: url.UserPassword(cfg.User, cfg.Password), RawQuery: "sslmode=disable"}
	probe, e := database.Open(ctx, database.Config{URL: target.String()})
	if e != nil {
		t.Fatal(e)
	}
	var actual string
	e = probe.QueryRow(ctx, `SELECT current_database()`).Scan(&actual)
	probe.Close()
	if e != nil || actual != cfg.Database || !strings.HasPrefix(actual, "mig_test_") {
		t.Fatal("CLI fixture is not the owned child")
	}
	env := map[string]string{"DATABASE_URL": target.String(), "ADMIN_MFA_ENCRYPTION_KEY": "invalid-ignored-for-promotion"}
	var out bytes.Buffer
	if e := run(ctx, []string{"promote", "+989120000001"}, env, &out); e != nil {
		t.Fatal(e)
	}
	if strings.Contains(out.String(), "secret") || strings.Contains(out.String(), "otpauth") {
		t.Fatal("promotion exposed MFA output")
	}
	out.Reset()
	if e := run(ctx, []string{"mfa-enroll", "09120000001"}, env, &out); e == nil || out.Len() != 0 {
		t.Fatal("bad key accepted or failure wrote output")
	}
	env["ADMIN_MFA_ENCRYPTION_KEY"] = strings.Repeat("c", 64)
	for _, op := range []string{"mfa-enroll", "mfa-reset"} {
		out.Reset()
		if e := run(ctx, []string{op, "09120000001"}, env, &out); e != nil {
			t.Fatal(e)
		}
		var result struct {
			UserID      int64 `json:"userId"`
			Secret, URI string
		}
		if e := json.Unmarshal(out.Bytes(), &result); e != nil || result.UserID != 1 || len(result.Secret) != 32 || !strings.HasPrefix(result.URI, "otpauth://totp/") {
			t.Fatal("missing explicit enrollment output")
		}
	}
	out.Reset()
	if e := run(ctx, []string{"mfa-enroll", "09120000001"}, env, &out); e == nil || out.Len() != 0 {
		t.Fatal("duplicate enrollment output leaked")
	}
}

func TestCommandRejectsBadArgumentsWithoutOutput(t *testing.T) {
	for _, args := range [][]string{nil, {"unknown", "09120000001"}, {"promote"}, {"promote", "bad-phone"}, {"promote", "09120000001", "extra"}} {
		var out bytes.Buffer
		if e := run(context.Background(), args, map[string]string{}, &out); e == nil || out.Len() != 0 {
			t.Fatal("bad arguments accepted")
		}
	}
}
