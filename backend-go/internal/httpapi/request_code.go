package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otp"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpip"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/phone"
)

type RequestCodeService interface {
	Create(
		ctx context.Context,
		phone string,
		ip string,
	) error
}

type RouterDependencies struct {
	RequestCode RequestCodeService
	VerifyCode  VerifyCodeService
}

func handleRequestCode(
	w http.ResponseWriter,
	r *http.Request,
	service RequestCodeService,
) {
	w.Header().Set("Cache-Control", "no-store")

	if service == nil {
		writeOTPMessage(
			w,
			http.StatusServiceUnavailable,
			"OTP service unavailable",
		)
		return
	}

	// Limit the size of the incoming JSON body.
	r.Body = http.MaxBytesReader(
		w,
		r.Body,
		100*1024,
	)

	var body struct {
		Phone any `json:"phone"`
	}

	decoder := json.NewDecoder(r.Body)

	if err := decoder.Decode(&body); err != nil {
		writeOTPMessage(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)
		return
	}

	// Reject multiple JSON values in one request.
	var extra any

	if err := decoder.Decode(&extra); err != io.EOF {
		writeOTPMessage(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)
		return
	}

	missingPhone := body.Phone == nil

	switch value := body.Phone.(type) {
	case string:
		missingPhone = value == ""

	case float64:
		missingPhone = value == 0

	case bool:
		missingPhone = !value
	}

	if missingPhone {
		writeOTPMessage(
			w,
			http.StatusBadRequest,
			"Phone is required",
		)
		return
	}

	rawPhone, ok := body.Phone.(string)

	if !ok {
		writeOTPMessage(
			w,
			http.StatusBadRequest,
			"Invalid phone number",
		)
		return
	}

	normalizedPhone := phone.Normalize(rawPhone)

	if !phone.IsValidIranianMobile(normalizedPhone) {
		writeOTPMessage(
			w,
			http.StatusBadRequest,
			"Invalid phone number",
		)
		return
	}

	// Use the connection peer address.
	// Never trust X-Forwarded-For from the client.
	host, _, err := net.SplitHostPort(r.RemoteAddr)

	if err != nil {
		writeOTPMessage(
			w,
			http.StatusServiceUnavailable,
			"OTP service unavailable",
		)
		return
	}

	normalizedIP, err := otpip.Normalize(host)

	if err != nil {
		writeOTPMessage(
			w,
			http.StatusServiceUnavailable,
			"OTP service unavailable",
		)
		return
	}

	err = service.Create(
		r.Context(),
		normalizedPhone,
		normalizedIP,
	)

	if err != nil {
		var rateError *otpdb.RateLimitError

		switch {
		case errors.As(err, &rateError):
			retryAfter := rateError.RetryAfter

			if retryAfter < 1 {
				retryAfter = 1
			}

			w.Header().Set(
				"Retry-After",
				strconv.Itoa(retryAfter),
			)

			writeOTPMessage(
				w,
				http.StatusTooManyRequests,
				"Too many attempts. Try again later",
			)

		case errors.Is(err, otp.ErrUnavailable):
			writeOTPMessage(
				w,
				http.StatusServiceUnavailable,
				"OTP service unavailable",
			)

		default:
			writeOTPMessage(
				w,
				http.StatusInternalServerError,
				"Internal server error",
			)
		}

		return
	}

	writeOTPMessage(
		w,
		http.StatusOK,
		"Code sent",
	)
}

func writeOTPMessage(
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
