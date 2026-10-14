package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/database"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	env := make(map[string]string)
	for _, entry := range os.Environ() {
		key, value, ok := strings.Cut(entry, "=")
		if ok {
			env[key] = value
		}
	}
	err := runAPI(ctx, env, database.Open, &http.Client{Timeout: 10 * time.Second}, serveHTTP)
	stop()
	if err != nil {
		// Dependency errors can contain addresses or credentials. Keep startup logs sanitized.
		log.Print("API startup failed")
		os.Exit(1)
	}
}
