package database

import (
	"context"
	"errors"
	"testing"
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
