package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otp"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpip"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/phone"
)

type VerifyCodeResult struct {
	NextStep              string `json:"nextStep"`
	Authenticated         bool   `json:"authenticated"`
	VerificationToken     string `json:"verificationToken"`
	VerificationExpiresAt string `json:"verificationExpiresAt"`
}

type VerifyCodeService interface {
	VerifyPhone(
		ctx context.Context,
		phone string,
		code string,
		ip string,
	) (VerifyCodeResult, error)
}

var httpSixDigitPattern = regexp.MustCompile(`^[0-9]{6}$`)

func handleVerifyCode(
	w http.ResponseWriter,
	r *http.Request,
	service VerifyCodeService,
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

	r.Body = http.MaxBytesReader(
		w,
		r.Body,
		100*1024,
	)

	var body struct {
		Phone any `json:"phone"`
		Code  any `json:"code"`
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

	// Reject multiple JSON values.
	var extra any

	if err := decoder.Decode(&extra); err != io.EOF {
		writeOTPMessage(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)
		return
	}

	if missingAuthValue(body.Phone) {
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

	if missingAuthValue(body.Code) {
		writeOTPMessage(
			w,
			http.StatusBadRequest,
			"Code is required",
		)
		return
	}

	rawCode, ok := body.Code.(string)

	if !ok {
		writeOTPMessage(
			w,
			http.StatusBadRequest,
			"Code must contain exactly 6 digits",
		)
		return
	}

	code := strings.TrimSpace(rawCode)

	if !httpSixDigitPattern.MatchString(code) {
		writeOTPMessage(
			w,
			http.StatusBadRequest,
			"Code must contain exactly 6 digits",
		)
		return
	}

	// Use the connection peer IP, not a client-supplied
	// X-Forwarded-For header.
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

	result, err := service.VerifyPhone(
		r.Context(),
		normalizedPhone,
		code,
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

		case errors.Is(err, otpdb.ErrInvalidOTP):
			writeOTPMessage(
				w,
				http.StatusBadRequest,
				"Invalid OTP",
			)

		case errors.Is(err, otpdb.ErrOTPExpired):
			writeOTPMessage(
				w,
				http.StatusBadRequest,
				"OTP expired",
			)

		case errors.Is(err, otp.ErrInvalidPhone):
			writeOTPMessage(
				w,
				http.StatusBadRequest,
				"Invalid phone number",
			)

		case errors.Is(err, otp.ErrInvalidCode):
			writeOTPMessage(
				w,
				http.StatusBadRequest,
				"Code must contain exactly 6 digits",
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

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	_ = json.NewEncoder(w).Encode(
		struct {
			Message string `json:"message"`
			VerifyCodeResult
		}{
			Message:          "OTP verified",
			VerifyCodeResult: result,
		},
	)
}

// Match the missing-value checks used by the Node.js
// controller for required JSON fields.
func missingAuthValue(value any) bool {
	switch v := value.(type) {
	case nil:
		return true

	case string:
		return v == ""

	case float64:
		return v == 0

	case bool:
		return !v

	default:
		return false
	}
}
