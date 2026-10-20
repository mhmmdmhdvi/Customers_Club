package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	env := map[string]string{"DATABASE_URL": os.Getenv("DATABASE_URL"), "ADMIN_MFA_ENCRYPTION_KEY": os.Getenv("ADMIN_MFA_ENCRYPTION_KEY")}
	err := run(ctx, os.Args[1:], env, os.Stdout)
	stop()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
