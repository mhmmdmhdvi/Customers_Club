// Package migrate applies the embedded, immutable SQL history to fresh databases.
package migrate

import (
	"bytes"
	"context"
	"crypto/sha256"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*/migration.sql
var history embed.FS

const lockID int64 = 730164867648117001

// Apply serializes runners on one connection and commits each SQL file together
// with its ledger row. It deliberately refuses adoption of untracked schemas.
func Apply(ctx context.Context, pool *pgxpool.Pool) error {
	paths, err := fs.Glob(history, "migrations/*/migration.sql")
	if err != nil || len(paths) == 0 {
		return errors.New("embedded migration history missing")
	}
	sort.Strings(paths)
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return errors.New("migration connection failed")
	}
	defer conn.Release()
	if _, err = conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, lockID); err != nil {
		return errors.New("migration lock failed")
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, e := conn.Exec(cleanup, `SELECT pg_advisory_unlock($1)`, lockID); e != nil {
			_ = conn.Hijack().Close(cleanup)
		}
	}()
	tx, err := conn.Begin(ctx)
	if err != nil {
		return errors.New("migration ledger transaction failed")
	}
	defer tx.Rollback(context.Background())
	var exists bool
	if err = tx.QueryRow(ctx, `SELECT to_regclass('public.go_migrations') IS NOT NULL`).Scan(&exists); err != nil {
		return errors.New("migration ledger inspection failed")
	}
	if !exists {
		var occupied bool
		err = tx.QueryRow(ctx, `SELECT EXISTS (
   SELECT 1 FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg\_%' ESCAPE '\' AND n.nspname <> 'information_schema'
   AND (n.nspname <> 'public' OR EXISTS(SELECT 1 FROM pg_depend d
    WHERE d.refclassid='pg_namespace'::regclass AND d.refobjid=n.oid)))`).Scan(&occupied)
		if err != nil {
			return errors.New("migration schema inspection failed")
		}
		if occupied {
			return errors.New("refusing untracked database schema; provision an empty database")
		}
		if _, err = tx.Exec(ctx, `CREATE TABLE public.go_migrations (position integer PRIMARY KEY CHECK(position>0), name text UNIQUE NOT NULL, checksum varchar(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
			return errors.New("migration ledger creation failed")
		}
	}
	rows, err := tx.Query(ctx, `SELECT position,name,checksum FROM public.go_migrations ORDER BY position`)
	if err != nil {
		return errors.New("migration ledger read failed")
	}
	applied := 0
	for rows.Next() {
		var position int
		var name, storedChecksum string
		if err = rows.Scan(&position, &name, &storedChecksum); err != nil {
			rows.Close()
			return errors.New("migration ledger invalid")
		}
		if applied >= len(paths) {
			rows.Close()
			return errors.New("migration ledger exceeds embedded history")
		}
		sql, _ := history.ReadFile(paths[applied])
		sum := checksum(sql)
		if position != applied+1 || name != strings.Split(paths[applied], "/")[1] || storedChecksum != sum {
			rows.Close()
			return errors.New("migration history prefix or checksum mismatch")
		}
		applied++
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return errors.New("migration ledger read failed")
	}
	rows.Close()
	if exists && applied == 0 {
		return errors.New("refusing empty preexisting migration ledger")
	}
	// Keep ledger initialization with the first migration: an interrupted first
	// run must never leave an empty ledger that looks like an untracked schema.
	if !exists {
		if err = applyOne(ctx, tx, paths[0], 1); err != nil {
			return fmt.Errorf("migration %s failed", strings.Split(paths[0], "/")[1])
		}
		applied = 1
	}
	if err = tx.Commit(ctx); err != nil {
		return errors.New("migration ledger commit failed")
	}
	for i := applied; i < len(paths); i++ {
		name := strings.Split(paths[i], "/")[1]
		if err = func() error {
			tx, e := conn.Begin(ctx)
			if e != nil {
				return e
			}
			defer tx.Rollback(context.Background())
			if e = applyOne(ctx, tx, paths[i], i+1); e != nil {
				return e
			}
			return tx.Commit(ctx)
		}(); err != nil {
			return fmt.Errorf("migration %s failed", name)
		}
	}
	return nil
}

func applyOne(ctx context.Context, tx pgx.Tx, path string, position int) error {
	sql, e := history.ReadFile(path)
	if e != nil {
		return e
	}
	sql = canonicalSQL(sql)
	if _, e = tx.Exec(ctx, `SET LOCAL search_path=public,pg_catalog`); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, string(sql)); e != nil {
		return e
	}
	_, e = tx.Exec(ctx, `INSERT INTO public.go_migrations (position,name,checksum) VALUES ($1,$2,$3)`, position, strings.Split(path, "/")[1], checksum(sql))
	return e
}

func canonicalSQL(sql []byte) []byte { return bytes.ReplaceAll(sql, []byte("\r\n"), []byte("\n")) }
func checksum(sql []byte) string     { return fmt.Sprintf("%x", sha256.Sum256(canonicalSQL(sql))) }
