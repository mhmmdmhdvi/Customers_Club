// testdb-audit is read-only and accepts only explicitly marked disposable targets.
package main

import (
	"context"
	"fmt"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
	"os"
	"time"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := testdb.Audit(ctx, os.Getenv("MIGRATION_TEST_DATABASE_URL"), os.Getenv("ALLOW_MIGRATION_TEST_DATABASE")); err != nil {
		fmt.Fprintln(os.Stderr, "Owned catalog audit refused or failed:", err)
		os.Exit(1)
	}
	fmt.Println("Owned catalog audit: children=0, parent_tables=0")
}
