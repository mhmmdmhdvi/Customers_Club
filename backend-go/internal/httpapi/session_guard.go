package httpapi

import (
	"encoding/json"
	"mime"
	"net/http"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
)

func sessionGuard(
	next http.Handler,
	getConfig func() (authconfig.Config, error),
) http.Handler {
	return sessionGuardWithEvents(next, getConfig, RouterDependencies{})
}
func sessionGuardWithEvents(next http.Handler, getConfig func() (authconfig.Config, error), deps RouterDependencies) http.Handler {
	reject := func(w http.ResponseWriter, r *http.Request, status int, message, eventType, reason string) {
		a := requestAuthentication(r)
		var actor *int64
		if a.User.ID > 0 {
			actor = &a.User.ID
		}
		securityEvent(r, deps, eventType, status, actor, map[string]any{"reason": reason})
		writeSecurityError(w, status, message)
	}
	return http.HandlerFunc(
		func(
			w http.ResponseWriter,
			r *http.Request,
		) {
			w.Header().Set(
				"Cache-Control",
				"no-store",
			)

			config, err := getConfig()
			if err != nil {
				securityEvent(r, deps, "REQUEST_SECURITY_REJECTED", 403, nil, map[string]any{"reason": "SECURITY_POLICY_REJECTED"})
				writeSecurityError(
					w,
					http.StatusServiceUnavailable,
					"Authentication unavailable",
				)
				return
			}

			origins :=
				r.Header.Values("Origin")

			if len(origins) > 1 {
				reject(w, r, http.StatusForbidden, "Request origin is not allowed", "ORIGIN_REJECTED", "UNTRUSTED_ORIGIN")
				return
			}

			if len(origins) == 1 &&
				!originAllowed(
					origins[0],
					config.AllowedOrigins,
				) {
				reject(w, r, http.StatusForbidden, "Request origin is not allowed", "ORIGIN_REJECTED", "UNTRUSTED_ORIGIN")
				return
			}

			csrfValues :=
				r.Header.Values(
					"X-CSRF-Protection",
				)

			if len(csrfValues) != 1 ||
				csrfValues[0] != "1" {
				reject(w, r, http.StatusForbidden, "CSRF protection header required", "CSRF_REJECTED", "MISSING_OR_INVALID_CSRF_HEADER")
				return
			}

			contentType :=
				r.Header.Get(
					"Content-Type",
				)

			mediaType, _, err :=
				mime.ParseMediaType(
					contentType,
				)

			if err != nil ||
				mediaType !=
					"application/json" {
				reject(w, r, http.StatusUnsupportedMediaType, "JSON request required", "CONTENT_TYPE_REJECTED", "NON_JSON_REQUEST")
				return
			}

			next.ServeHTTP(w, r)
		},
	)
}

func originAllowed(
	origin string,
	allowedOrigins []string,
) bool {
	for _, allowed := range allowedOrigins {
		if origin == allowed {
			return true
		}
	}

	return false
}

func writeSecurityError(
	w http.ResponseWriter,
	status int,
	message string,
) {
	w.Header().Set(
		"Content-Type",
		"application/json",
	)

	w.WriteHeader(status)

	_ = json.NewEncoder(w).Encode(
		struct {
			Message string `json:"message"`
		}{
			Message: message,
		},
	)
}
