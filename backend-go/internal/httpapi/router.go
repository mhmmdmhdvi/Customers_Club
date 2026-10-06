package httpapi

import (
	"encoding/json"
	"net/http"
)

func NewRouter() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc(
		"GET /health",
		func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set(
				"Content-Type",
				"application/json",
			)

			w.WriteHeader(http.StatusOK)

			_ = json.NewEncoder(w).Encode(
				struct {
					Status  string `json:"status"`
					Service string `json:"service"`
				}{
					Status:  "ok",
					Service: "customer-club-api",
				},
			)

		},
	)

	return requestIDMiddleware(
		mux,
		newRequestID,
	)
}
