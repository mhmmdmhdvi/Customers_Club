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

	// Express answers unmatched methods with 404, and automatically advertises
	// existing route methods for OPTIONS even when CORS withholds browser grants.
	for path, methods := range map[string]string{
		"/health":            "GET, HEAD",
		"/auth/request-code": "POST",
		"/auth/verify-code":  "POST",
	} {
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				w.Header().Set("Allow", methods)
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				_, _ = w.Write([]byte(methods))
				return
			}
			writeSecurityError(w, http.StatusNotFound, "Not found")
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
