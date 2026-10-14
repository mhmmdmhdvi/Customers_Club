package httpapi

import (
	"encoding/json"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
	"net/http"
	"strings"
)

func NewRouter() http.Handler {
	return NewRouterWithDependencies(RouterDependencies{})
}

func NewRouterWithDependencies(deps RouterDependencies) http.Handler {
	// Dispatch explicitly rather than ServeMux's path cleaning/redirects: Express
	// matches these routes case-insensitively with an optional trailing slash and
	// never redirects credential POSTs. Match the escaped path so encoded static
	// route letters do not accidentally become a different accepted endpoint.
	router := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := asciiLower(strings.TrimSuffix(r.URL.EscapedPath(), "/"))
		methods := ""
		switch path {
		case "/health":
			methods = "GET, HEAD"
			if r.Method == http.MethodGet || r.Method == http.MethodHead {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				if r.Method != http.MethodHead {
					_ = json.NewEncoder(w).Encode(struct {
						Status  string `json:"status"`
						Service string `json:"service"`
					}{Status: "ok", Service: "customer-club-api"})
				}
				return
			}
		case "/auth/request-code":
			methods = "POST"
			if r.Method == http.MethodPost {
				handleRequestCode(w, r, deps.RequestCode)
				return
			}
		case "/auth/verify-code":
			methods = "POST"
			if r.Method == http.MethodPost {
				handleVerifyCode(w, r, deps.VerifyCode)
				return
			}
		case "/auth/register", "/auth/login", "/auth/login/mfa", "/auth/refresh", "/auth/logout":
			methods = "POST"
			if r.Method == http.MethodPost {
				sessionGuard(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { handleSession(w, r, deps, path) }), func() (authconfig.Config, error) { return deps.Auth, nil }).ServeHTTP(w, r)
				return
			}
		case "/auth/me":
			methods = "GET, HEAD"
			if r.Method == http.MethodGet || r.Method == http.MethodHead {
				handleSession(w, r, deps, path)
				return
			}
		}
		if methods != "" && r.Method == http.MethodOptions {
			w.Header().Set("Allow", methods)
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write([]byte(methods))
			return
		}
		writeSecurityError(w, http.StatusNotFound, "Not found")
	})
	return requestIDMiddleware(withJSONBoundary(router), newRequestID)
}

func asciiLower(s string) string {
	data := []byte(s)
	for i, c := range data {
		if c >= 'A' && c <= 'Z' {
			data[i] = c + ('a' - 'A')
		}
	}
	return string(data)
}
