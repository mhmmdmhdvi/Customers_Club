package main

import (
	"context"
	"fmt"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/database"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/migrate"
	"io"
)

func run(ctx context.Context, env map[string]string, out io.Writer) error {
	cfg, e := database.ConfigFromEnv(env)
	if e != nil {
		return e
	}
	pool, e := database.Open(ctx, cfg)
	if e != nil {
		return e
	}
	defer pool.Close()
	if e = migrate.Apply(ctx, pool); e != nil {
		return e
	}
	_, e = fmt.Fprintln(out, "Migrations applied.")
	return e
}
