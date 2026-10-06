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
				writeSecurityError(
					w,
					http.StatusForbidden,
					"Request origin is not allowed",
				)
				return
			}

			if len(origins) == 1 &&
				!originAllowed(
					origins[0],
					config.AllowedOrigins,
				) {
				writeSecurityError(
					w,
					http.StatusForbidden,
					"Request origin is not allowed",
				)
				return
			}

			csrfValues :=
				r.Header.Values(
					"X-CSRF-Protection",
				)

			if len(csrfValues) != 1 ||
				csrfValues[0] != "1" {
				writeSecurityError(
					w,
					http.StatusForbidden,
					"CSRF protection header required",
				)
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
				writeSecurityError(
					w,
					http.StatusUnsupportedMediaType,
					"JSON request required",
				)
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
