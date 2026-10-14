package testdb

import (
	"context"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"
	"time"
)

func TestLegacyPrismaMigrationHistories(t *testing.T) {
	for _, scenario := range []string{"fresh", "populated", "failed", "already-applied", "partial-drift", "history-drift"} {
		t.Run(scenario, func(t *testing.T) {
			pool := OpenEmpty(t)
			cfg := pool.Config().ConnConfig
			target := &url.URL{Scheme: "postgresql", Host: cfg.Host + ":" + strconv.Itoa(int(cfg.Port)), Path: "/" + cfg.Database, User: url.UserPassword(cfg.User, cfg.Password), RawQuery: "sslmode=disable"}
			_, source, _, _ := runtime.Caller(0)
			backend := filepath.Join(filepath.Dir(source), "..", "..", "..", "backend")
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()
			cmd := exec.CommandContext(ctx, "node", "tests/helpers/legacy-migration-rehearsal.js", scenario)
			cmd.Dir = backend
			cmd.Env = append(os.Environ(), "LEGACY_MIGRATION_DATABASE_URL="+target.String(), "LEGACY_MIGRATION_CONFIRM=migrate:"+cfg.Database)
			if output, err := cmd.CombinedOutput(); err != nil {
				// Child diagnostics must never disclose the dedicated URL.
				t.Fatalf("Prisma rehearsal %s failed: %v\n%s", scenario, err, output)
			}
		})
	}
}
