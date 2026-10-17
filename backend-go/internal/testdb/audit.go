package testdb

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Audit verifies the selected owned parent has no leaked children or tables.
func Audit(ctx context.Context, raw, optin string) error {
	cfg, err := targetConfig(raw, optin)
	if err != nil {
		return err
	}
	p, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return errors.New("owned audit connection failed")
	}
	defer p.Close()
	if err = validateParent(ctx, p, cfg.ConnConfig.Database, cfg.ConnConfig.User); err != nil {
		return err
	}
	id := parentPattern.FindStringSubmatch(cfg.ConnConfig.Database)[1]
	var children, tables int
	// Prefix comparison avoids LIKE's underscore wildcard matching other names.
	err = p.QueryRow(ctx, `SELECT (SELECT count(*) FROM pg_database WHERE starts_with(datname,$1)),(SELECT count(*) FROM pg_tables WHERE schemaname='public')`, "mig_test_"+id+"_").Scan(&children, &tables)
	if err != nil {
		return errors.New("owned catalog audit failed")
	}
	if children != 0 || tables != 0 {
		return fmt.Errorf("owned catalog not clean: children=%d, parent_tables=%d", children, tables)
	}
	return nil
}
