package main

import (
	"errors"
	"net/http"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/httpapi"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otp"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/phoneverification"
)

// newAPIHandler connects the OTP service
// to the HTTP authentication endpoints.
func newAPIHandler(
	otpService *otp.Service,
) (http.Handler, error) {
	// Build the phone-verification service using
	// the existing OTP verification dependencies.
	proofService := phoneverification.NewOTPBackedService(
		otpService,
	)

	// Refuse to construct the HTTP handler if
	// required security dependencies are missing.
	if proofService == nil {
		return nil, errors.New(
			"phone verification service unavailable",
		)
	}

	// Both OTP endpoints must be fully configured
	// before the HTTP server can start.
	if otpService.RandomInt == nil ||
		otpService.RandomBytes == nil ||
		otpService.Reserve == nil ||
		otpService.SendOTP == nil ||
		otpService.MarkDeliveryFailed == nil ||
		otpService.Activate == nil {
		return nil, errors.New(
			"OTP creation service unavailable",
		)
	}

	// Adapt phone-verification results to the
	// HTTP handler's expected return type.
	verifyAdapter := httpapi.NewVerifyCodeAdapter(
		proofService,
	)

	return httpapi.NewRouterWithDependencies(
		httpapi.RouterDependencies{
			RequestCode: otpService,
			VerifyCode:  verifyAdapter,
		},
	), nil

}
