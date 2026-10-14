// This executable is built only by the Windows failure-injection fixture.
// It delegates to the installed native tools, then makes a successful startup
// controller fail or time out after PostgreSQL is actually accepting requests.
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	tool := strings.ToLower(filepath.Base(os.Args[0]))
	actual := filepath.Join(`C:\Program Files\PostgreSQL\18\bin`, tool)
	cmd := exec.Command(actual, os.Args[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		if exit, ok := err.(*exec.ExitError); ok {
			os.Exit(exit.ExitCode())
		}
		os.Exit(90)
	}
	if tool == "pg_ctl.exe" && len(os.Args) > 1 && os.Args[len(os.Args)-1] == "start" {
		switch os.Getenv("MIGRATION_STARTUP_FIXTURE_MODE") {
		case "nonzero":
			os.Exit(7)
		case "timeout":
			time.Sleep(90 * time.Second)
		}
	}
}
