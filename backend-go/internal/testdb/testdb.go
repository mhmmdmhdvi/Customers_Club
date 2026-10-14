// Package testdb allocates disposable databases only inside an explicitly
// selected, marked loopback migration cluster. Ordinary go test stays offline.
package testdb

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var parentPattern = regexp.MustCompile(`^mig_parent_([a-f0-9]{16})$`)
var ownedPattern = regexp.MustCompile(`^mig_test_[a-f0-9]{16}_[a-f0-9]{32}$`)
var passwordPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var errTarget = errors.New("refusing database target: explicit disposable loopback cluster required")

func testURL() string   { return os.Getenv("MIGRATION_TEST_DATABASE_URL") }
func testOptIn() string { return os.Getenv("ALLOW_MIGRATION_TEST_DATABASE") }

func targetConfig(raw, optin string) (*pgxpool.Config, error) {
	if optin != "1" {
		return nil, errTarget
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "postgresql" || u.User == nil || u.Fragment != "" {
		return nil, errTarget
	}
	if u.Hostname() != "127.0.0.1" && u.Hostname() != "::1" {
		return nil, errTarget
	}
	if u.Port() == "" || u.Port() == "5432" {
		return nil, errTarget
	}
	database := strings.TrimPrefix(u.Path, "/")
	match := parentPattern.FindStringSubmatch(database)
	if match == nil || u.User.Username() != "mig_owner_"+match[1] {
		return nil, errTarget
	}
	password, ok := u.User.Password()
	if !ok || !passwordPattern.MatchString(password) {
		return nil, errTarget
	}
	query, err := url.ParseQuery(u.RawQuery)
	if err != nil || len(query) != 1 || len(query["sslmode"]) != 1 || query.Get("sslmode") != "disable" {
		return nil, errTarget
	}
	cfg, err := pgxpool.ParseConfig(raw)
	if err != nil {
		return nil, errTarget
	}
	// Reject ambient PostgreSQL environment overrides and fallback hosts, then
	// set runtime parameters explicitly. Errors never include the credential URI.
	if cfg.ConnConfig.Host != u.Hostname() || cfg.ConnConfig.Database != database || cfg.ConnConfig.User != u.User.Username() || cfg.ConnConfig.Password != password || len(cfg.ConnConfig.Fallbacks) != 0 || cfg.ConnConfig.TLSConfig != nil {
		return nil, errTarget
	}
	cfg.ConnConfig.RuntimeParams = map[string]string{"timezone": "UTC"}
	cfg.MaxConns = 6
	cfg.ConnConfig.ConnectTimeout = 5 * time.Second
	return cfg, nil
}

// Open creates a new owned database and applies the checked-in Prisma SQL.
func Open(t testing.TB) *pgxpool.Pool { t.Helper(); return open(t, true) }

// OpenEmpty provides the same isolation without applying schema migrations,
// for rehearsing historical/populated-schema upgrades in later stages.
func OpenEmpty(t testing.TB) *pgxpool.Pool { t.Helper(); return open(t, false) }

func open(t testing.TB, migrate bool) *pgxpool.Pool {
	t.Helper()
	raw, optin := testURL(), testOptIn()
	if raw == "" || optin != "1" {
		t.Skip("database test requires MIGRATION_TEST_DATABASE_URL and ALLOW_MIGRATION_TEST_DATABASE=1")
		return nil
	}
	cfg, err := targetConfig(raw, optin)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	parent, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal("migration parent connection failed")
	}
	// Parent is always released, including test panics/failures before CREATE.
	t.Cleanup(parent.Close)
	parentName, owner := cfg.ConnConfig.Database, cfg.ConnConfig.User
	if err := validateParent(ctx, parent, parentName, owner); err != nil {
		t.Fatal(err)
	}
	clusterID := parentPattern.FindStringSubmatch(parentName)[1]
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		t.Fatal("test database randomness failed")
	}
	name := "mig_test_" + clusterID + "_" + hex.EncodeToString(nonce)
	marker := "customers-club-migration:" + clusterID + ":" + hex.EncodeToString(nonce)
	identifier := pgx.Identifier{name}.Sanitize()
	if _, err := parent.Exec(ctx, "CREATE DATABASE "+identifier+" OWNER "+pgx.Identifier{owner}.Sanitize()+" TEMPLATE template0"); err != nil {
		t.Fatal("disposable CREATE DATABASE failed")
	}
	// CREATE DATABASE cannot be transactional. Register cleanup immediately, so
	// a failure during tagging/migration still drops only this newly created DB.
	tagged := false
	var pool *pgxpool.Pool
	t.Cleanup(func() {
		if pool != nil {
			pool.Close()
		}
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cleanupCancel()
		if !tagged {
			// No SQL or pool was handed to callers before tagging; this exact nonce was
			// created by this call. Still validate owner and the expected empty marker.
			if err := dropOwned(cleanupCtx, parent, name, owner, ""); err != nil {
				t.Errorf("disposable database cleanup failed: %v", err)
			}
		} else if err := dropOwned(cleanupCtx, parent, name, owner, marker); err != nil {
			t.Errorf("disposable database cleanup failed: %v", err)
		}
	})
	// Literal is a hex-only marker assembled above, never user supplied.
	if _, err := parent.Exec(ctx, "COMMENT ON DATABASE "+identifier+" IS '"+marker+"'"); err != nil {
		t.Fatal("test database ownership marker failed")
	}
	tagged = true
	childCfg := cfg.Copy()
	childCfg.ConnConfig.Database = name
	pool, err = pgxpool.NewWithConfig(ctx, childCfg)
	if err != nil {
		t.Fatal("disposable database connection failed")
	}
	var actualDB, actualUser string
	if err := pool.QueryRow(ctx, "SELECT current_database(),current_user").Scan(&actualDB, &actualUser); err != nil || actualDB != name || actualUser != owner {
		t.Fatal("disposable database identity mismatch")
	}
	if migrate {
		if err := applyMigrations(ctx, pool); err != nil {
			t.Fatal(err)
		}
	}
	return pool
}

func validateParent(ctx context.Context, pool *pgxpool.Pool, database, user string) error {
	match := parentPattern.FindStringSubmatch(database)
	if match == nil || user != "mig_owner_"+match[1] {
		return errTarget
	}
	var actualDB, actualUser, sessionUser, dbOwner string
	var dbMarker, roleMarker *string
	err := pool.QueryRow(ctx, `SELECT current_database(),current_user,session_user,pg_get_userbyid(d.datdba),shobj_description(d.oid,'pg_database'),shobj_description(r.oid,'pg_authid') FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`).Scan(&actualDB, &actualUser, &sessionUser, &dbOwner, &dbMarker, &roleMarker)
	marker := "customers-club-migration:" + match[1]
	if err != nil || actualDB != database || actualUser != user || sessionUser != user || dbOwner != user || dbMarker == nil || *dbMarker != marker || roleMarker == nil || *roleMarker != marker {
		return errors.New("migration parent database/user identity or ownership marker mismatch")
	}
	return nil
}

func dropOwned(ctx context.Context, parent *pgxpool.Pool, name, owner, marker string) error {
	if !ownedPattern.MatchString(name) {
		return errors.New("refusing to drop a non-owned database name")
	}
	var actualOwner string
	var actualMarker *string
	err := parent.QueryRow(ctx, "SELECT pg_get_userbyid(datdba),shobj_description(oid,'pg_database') FROM pg_database WHERE datname=$1", name).Scan(&actualOwner, &actualMarker)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil || actualOwner != owner || (marker != "" && (actualMarker == nil || *actualMarker != marker)) || (marker == "" && actualMarker != nil) {
		return errors.New("refusing to drop database with unexpected owner or ownership marker")
	}
	if _, err := parent.Exec(ctx, "DROP DATABASE "+pgx.Identifier{name}.Sanitize()+" WITH (FORCE)"); err != nil {
		return errors.New("owned DROP DATABASE failed")
	}
	return nil
}

func applyMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	_, source, _, ok := runtime.Caller(0)
	if !ok {
		return errors.New("cannot locate migration schema")
	}
	root := filepath.Join(filepath.Dir(source), "..", "..", "..", "backend", "prisma", "migrations")
	paths, err := filepath.Glob(filepath.Join(root, "*", "migration.sql"))
	if err != nil || len(paths) == 0 {
		return errors.New("checked-in Prisma migration SQL missing")
	}
	sort.Strings(paths)
	tx, err := pool.Begin(ctx)
	if err != nil {
		return errors.New("migration transaction failed")
	}
	defer tx.Rollback(context.Background())
	for _, path := range paths {
		sql, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read migration %s failed", filepath.Base(filepath.Dir(path)))
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("apply migration %s failed: %w", filepath.Base(filepath.Dir(path)), err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return errors.New("schema migration commit failed")
	}
	return nil
}
