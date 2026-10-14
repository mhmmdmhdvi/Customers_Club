package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
)

const requestTimeout = 30 * time.Second

// WithBrowserPolicy applies the configured runtime's browser boundary. The bare
// router remains usable by transport tests without environment configuration.
func WithBrowserPolicy(next http.Handler, config authconfig.Config) http.Handler {
	allowedOrigins := append([]string(nil), config.AllowedOrigins...)
	return requestIDMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		securityHeaders(w.Header())
		w.Header().Add("Vary", "Origin")
		origins := r.Header.Values("Origin")
		if len(origins) > 1 || (len(origins) == 1 && !originAllowed(origins[0], allowedOrigins)) {
			writeSecurityError(w, http.StatusForbidden, "Request origin is not allowed")
			return
		}
		if len(origins) == 1 {
			w.Header().Set("Access-Control-Allow-Origin", origins[0])
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Expose-Headers", "X-Request-Id")
		}
		if r.Method == http.MethodOptions && len(origins) == 1 {
			w.Header().Add("Vary", "Access-Control-Request-Method")
			w.Header().Add("Vary", "Access-Control-Request-Headers")
			if !validPreflight(r) {
				writeSecurityError(w, http.StatusForbidden, "CORS preflight is not allowed")
				return
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-CSRF-Protection")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	}), newRequestID)
}

func validPreflight(r *http.Request) bool {
	methods := r.Header.Values("Access-Control-Request-Method")
	if len(methods) != 1 {
		return false
	}
	switch methods[0] {
	case "GET", "POST", "PATCH", "OPTIONS":
	default:
		return false
	}
	for _, value := range r.Header.Values("Access-Control-Request-Headers") {
		for _, header := range strings.Split(value, ",") {
			switch strings.ToLower(strings.TrimSpace(header)) {
			case "content-type", "authorization", "x-csrf-protection":
			default:
				return false
			}
		}
	}
	return true
}

func securityHeaders(header http.Header) {
	header.Set("Content-Security-Policy", "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests")
	header.Set("Cross-Origin-Opener-Policy", "same-origin")
	header.Set("Cross-Origin-Resource-Policy", "same-origin")
	header.Set("Origin-Agent-Cluster", "?1")
	header.Set("Referrer-Policy", "no-referrer")
	header.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("X-DNS-Prefetch-Control", "off")
	header.Set("X-Download-Options", "noopen")
	header.Set("X-Frame-Options", "SAMEORIGIN")
	header.Set("X-Permitted-Cross-Domain-Policies", "none")
	header.Set("X-XSS-Protection", "0")
}
