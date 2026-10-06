package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/database"
)

func main() {
	config, err := database.ConfigFromEnv(
		map[string]string{
			"DATABASE_URL": os.Getenv("DATABASE_URL"),
		},
	)

	if err != nil {
		fmt.Println(
			"Database configuration is invalid.",
		)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(
		context.Background(),
		5*time.Second,
	)
	defer cancel()

	pool, err := database.Open(
		ctx,
		config,
	)

	if err != nil {
		fmt.Println(
			"Database connection failed.",
		)
		os.Exit(1)
	}
	defer pool.Close()

	fmt.Println(
		"Database connection OK.",
	)
}
