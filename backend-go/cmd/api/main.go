package main

import (
	"log"
	"net/http"
	"os"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/httpapi"
)

func main() {
	port := os.Getenv("PORT")

	if port == "" {
		port = "3000"
	}

	address := ":" + port

	log.Printf(
		"Server running on port %s",
		port,
	)

	err := http.ListenAndServe(
		address,
		httpapi.NewRouter(),
	)

	if err != nil {
		log.Fatal(err)
	}
}
