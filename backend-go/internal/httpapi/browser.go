package httpapi

import (
	"context"
	"net/http"
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
		// Like Node's CORS middleware, public requests without an exact origin
		// grant still reach their handler. Session guards reject unsafe mutations.
		allowedOrigin := len(origins) == 1 && originAllowed(origins[0], allowedOrigins)
		if allowedOrigin {
			w.Header().Set("Access-Control-Allow-Origin", origins[0])
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Expose-Headers", "X-Request-Id")
		}
		if r.Method == http.MethodOptions && allowedOrigin {
			w.Header().Add("Vary", "Access-Control-Request-Method")
			w.Header().Add("Vary", "Access-Control-Request-Headers")
			// Advertise the fixed configured allowlist even when requested metadata
			// is unsupported; the browser performs preflight enforcement.
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
