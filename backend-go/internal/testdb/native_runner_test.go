package testdb

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestNativeFailedStartupStopsItsOwnedChild(t *testing.T) {
	if testURL() == "" || testOptIn() != "1" {
		t.Skip("native database fixture requires explicit migration test opt-in")
	}
	if runtime.GOOS != "windows" {
		t.Skip("native PowerShell PostgreSQL fixture is Windows-specific")
	}
	if _, err := os.Stat(`C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe`); err != nil {
		t.Skip("native PostgreSQL 18 binaries unavailable")
	}
	_, source, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("fixture source unavailable")
	}
	script := filepath.Join(filepath.Dir(source), "..", "..", "..", "scripts", "tests", "test-postgres-startup-failure.ps1")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	output, err := exec.CommandContext(ctx, "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script).CombinedOutput()
	if err != nil {
		t.Fatalf("native startup failure fixture: %v: %s", err, output)
	}
	t.Log(string(output))
}
