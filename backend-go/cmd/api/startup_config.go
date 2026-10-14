package main

import (
	"encoding/hex"
	"errors"
	"strings"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/database"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/farazsms"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/httpapi"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpconfig"
)

// startupConfig contains the validated settings
// required to initialize the Go API.
type startupConfig struct {
	Database       database.Config
	OTP            otpconfig.Config
	Auth           authconfig.Config
	SMS            farazsms.Config
	MFAKey         []byte
	TrustedProxies httpapi.TrustedProxies
}

// readStartupConfig validates configuration
// without connecting to external services.
func readStartupConfig(
	env map[string]string,
) (startupConfig, error) {
	proxies, err := httpapi.ParseTrustedProxies(env["TRUSTED_PROXY_CIDRS"])
	if err != nil {
		return startupConfig{}, err
	}
	// Validate PostgreSQL connection settings.
	dbConfig, err := database.ConfigFromEnv(env)

	if err != nil {
		return startupConfig{}, err
	}

	// Validate JWT secret, issuer, audience,
	// allowed origins, and authentication settings.
	authConfig, err := authconfig.Read(env)

	if err != nil {
		return startupConfig{}, err
	}

	// Validate the OTP HMAC secret.
	// The existing validator also rejects
	// reuse of the authentication secret.
	otpConfig, err := otpconfig.Read(env)

	if err != nil {
		return startupConfig{}, err
	}

	// Read FarazSMS credentials.
	mfaKey, err := hex.DecodeString(env["ADMIN_MFA_ENCRYPTION_KEY"])
	if err != nil || len(mfaKey) != 32 {
		return startupConfig{}, errors.New("Invalid ADMIN MFA configuration")
	}
	smsConfig := farazsms.Config{
		APIKey: strings.TrimSpace(
			env["FARAZSMS_API_KEY"],
		),
		LineNumber: strings.TrimSpace(
			env["FARAZSMS_LINE_NUMBER"],
		),
		PatternCode: strings.TrimSpace(
			env["FARAZSMS_PATTERN_CODE"],
		),
	}

	// Missing SMS credentials must fail startup.
	if smsConfig.APIKey == "" ||
		smsConfig.LineNumber == "" ||
		smsConfig.PatternCode == "" {
		return startupConfig{}, errors.New(
			"FarazSMS configuration unavailable",
		)
	}

	return startupConfig{
		Database:       dbConfig,
		OTP:            otpConfig,
		Auth:           authConfig,
		SMS:            smsConfig,
		MFAKey:         mfaKey,
		TrustedProxies: proxies,
	}, nil
}
