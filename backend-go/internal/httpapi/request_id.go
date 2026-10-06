package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
)

type requestIDContextKey struct{}

func RequestIDFromContext(
	ctx context.Context,
) string {
	requestID, _ :=
		ctx.Value(
			requestIDContextKey{},
		).(string)

	return requestID
}

func requestIDMiddleware(
	next http.Handler,
	generateRequestID func() string,
) http.Handler {
	return http.HandlerFunc(
		func(
			w http.ResponseWriter,
			r *http.Request,
		) {
			requestID :=
				generateRequestID()

			ctx := context.WithValue(
				r.Context(),
				requestIDContextKey{},
				requestID,
			)

			w.Header().Set(
				"X-Request-Id",
				requestID,
			)

			next.ServeHTTP(
				w,
				r.WithContext(ctx),
			)
		},
	)
}

func newRequestID() string {
	var bytes [16]byte

	if _, err := rand.Read(
		bytes[:],
	); err != nil {
		panic(
			"failed to generate request id",
		)
	}

	bytes[6] =
		(bytes[6] & 0x0f) | 0x40

	bytes[8] =
		(bytes[8] & 0x3f) | 0x80

	return hex.EncodeToString(bytes[0:4]) +
		"-" +
		hex.EncodeToString(bytes[4:6]) +
		"-" +
		hex.EncodeToString(bytes[6:8]) +
		"-" +
		hex.EncodeToString(bytes[8:10]) +
		"-" +
		hex.EncodeToString(bytes[10:16])
}
