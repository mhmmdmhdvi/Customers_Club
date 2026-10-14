package main

import (
	"errors"
	"net/http"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otp"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

// newDatabaseAPIHandler builds an HTTP API
// backed by the PostgreSQL OTP implementation.
func newDatabaseAPIHandler(
	secret []byte,
	begin otpdb.BeginTransaction,
	sendOTP otp.SendOTPFunc,
) (http.Handler, error) {

	// Connect OTP creation and verification
	// to the PostgreSQL transaction provider.
	otpService := otp.NewDatabaseOTPService(
		secret,
		begin,
		sendOTP,
	)

	// Never create an HTTP API when required
	// OTP dependencies are unavailable.
	if otpService == nil {
		return nil, errors.New(
			"OTP service unavailable",
		)
	}

	// Reuse the application HTTP wiring
	// that we already tested.
	return newAPIHandler(otpService)
}
