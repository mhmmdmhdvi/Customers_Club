package database

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrUnavailable = errors.New("database unavailable")

func Open(
	ctx context.Context,
	config Config,
) (*pgxpool.Pool, error) {
	poolConfig, err :=
		pgxpool.ParseConfig(
			config.URL,
		)

	if err != nil {
		return nil, ErrUnavailable
	}

	pool, err :=
		pgxpool.NewWithConfig(
			ctx,
			poolConfig,
		)

	if err != nil {
		return nil, ErrUnavailable
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, ErrUnavailable
	}
	return pool, nil
}
