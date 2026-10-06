package otpdb

import (
	"context"
	"crypto/sha256"
	"encoding/binary"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func LockKey(
	scope string,
) int64 {
	sum := sha256.Sum256(
		[]byte(
			"club-otp-lock-v1:" +
				scope,
		),
	)

	unsigned :=
		binary.BigEndian.Uint64(
			sum[:8],
		)

	return int64(unsigned)
}

type lockTransaction interface {
	Exec(
		ctx context.Context,
		sql string,
		args ...any,
	) (pgconn.CommandTag, error)

	QueryRow(
		ctx context.Context,
		sql string,
		args ...any,
	) pgx.Row
}

func Lock(
	ctx context.Context,
	tx lockTransaction,
	scope string,
) error {
	if _, err := tx.Exec(
		ctx,
		"SET LOCAL lock_timeout = '3s'",
	); err != nil {
		return err
	}

	var ignored string

	err := tx.QueryRow(
		ctx,
		"SELECT pg_advisory_xact_lock($1::bigint)::text AS lock",
		LockKey(scope),
	).Scan(&ignored)

	if err != nil {
		return err
	}

	return nil
}
