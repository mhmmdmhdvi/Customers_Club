package httpapi

import (
	"encoding/json"
	"net/http"
)

func NewRouter() http.Handler {
	return NewRouterWithDependencies(
		RouterDependencies{},
	)
}

func NewRouterWithDependencies(
	deps RouterDependencies,
) http.Handler {
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

	mux.HandleFunc(
		"POST /auth/request-code",
		func(w http.ResponseWriter, r *http.Request) {
			handleRequestCode(
				w,
				r,
				deps.RequestCode,
			)
		},
	)

	mux.HandleFunc(
		"POST /auth/verify-code",
		func(w http.ResponseWriter, r *http.Request) {
			handleVerifyCode(
				w,
				r,
				deps.VerifyCode,
			)
		},
	)

	// net/http's default routing errors are plain text; keep the API's JSON
	// boundary for unknown paths and known paths with the wrong method.
	for path, methods := range map[string]string{
		"/health":            "GET, HEAD",
		"/auth/request-code": "POST",
		"/auth/verify-code":  "POST",
	} {
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Allow", methods)
			writeSecurityError(w, http.StatusMethodNotAllowed, "Method not allowed")
		})
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeSecurityError(w, http.StatusNotFound, "Not found")
	})
	return requestIDMiddleware(
		mux,
		newRequestID,
	)
}
