package main

import (
	"strings"
	"testing"
)

func TestReadStartupConfigAcceptsCompleteEnvironment(
	t *testing.T,
) {
	// These are fake credentials for an offline test.
	// The database URL points to an unused local port.
	env := map[string]string{
		"NODE_ENV": "test",

		"DATABASE_URL": "postgresql://fake:fake@127.0.0.1:1/offline_no_connection",

		"OTP_HMAC_SECRET": strings.Repeat("a", 64),

		"ACCESS_TOKEN_SECRET": strings.Repeat("b", 64),

		"JWT_ISSUER":           "customer-club-tests",
		"JWT_AUDIENCE":         "customer-club-web-tests",
		"AUTH_ALLOWED_ORIGINS": "http://localhost:5173",

		"FARAZSMS_API_KEY":      "fake-sms-api-key",
		"FARAZSMS_LINE_NUMBER":  "50002178584000",
		"FARAZSMS_PATTERN_CODE": "fake-pattern",
	}

	config, err := readStartupConfig(env)

	if err != nil {
		t.Fatalf(
			"expected valid startup configuration, got %v",
			err,
		)
	}

	if config.Database.URL != env["DATABASE_URL"] {
		t.Fatal("unexpected database configuration")
	}

	if len(config.OTP.Secret) != 32 ||
		config.OTP.Secret[0] != 0xaa {
		t.Fatal("expected decoded 32-byte OTP secret")
	}

	if len(config.Auth.Secret) != 32 ||
		config.Auth.Secret[0] != 0xbb {
		t.Fatal("expected separate authentication secret")
	}

	if len(config.Auth.AllowedOrigins) != 1 ||
		config.Auth.AllowedOrigins[0] !=
			"http://localhost:5173" {
		t.Fatal("unexpected allowed origins")
	}

	if config.SMS.APIKey != "fake-sms-api-key" {
		t.Fatal("unexpected SMS API key")
	}

	if config.SMS.LineNumber != "50002178584000" {
		t.Fatal("unexpected SMS line number")
	}

	if config.SMS.PatternCode != "fake-pattern" {
		t.Fatal("unexpected SMS pattern")
	}
}

func TestReadStartupConfigRejectsInvalidEnvironment(
	t *testing.T,
) {
	tests := []struct {
		name   string
		change func(map[string]string)
	}{
		{
			name: "missing database URL",
			change: func(env map[string]string) {
				delete(env, "DATABASE_URL")
			},
		},
		{
			name: "invalid database URL",
			change: func(env map[string]string) {
				env["DATABASE_URL"] = "not-a-database-url"
			},
		},
		{
			name: "missing OTP secret",
			change: func(env map[string]string) {
				delete(env, "OTP_HMAC_SECRET")
			},
		},
		{
			name: "OTP secret too short",
			change: func(env map[string]string) {
				env["OTP_HMAC_SECRET"] = "short"
			},
		},
		{
			name: "OTP and JWT secrets reused",
			change: func(env map[string]string) {
				env["OTP_HMAC_SECRET"] =
					env["ACCESS_TOKEN_SECRET"]
			},
		},
		{
			name: "missing JWT issuer",
			change: func(env map[string]string) {
				delete(env, "JWT_ISSUER")
			},
		},
		{
			name: "invalid allowed origin",
			change: func(env map[string]string) {
				env["AUTH_ALLOWED_ORIGINS"] =
					"https://example.com/path"
			},
		},
		{
			name: "missing SMS API key",
			change: func(env map[string]string) {
				delete(env, "FARAZSMS_API_KEY")
			},
		},
		{
			name: "blank SMS line number",
			change: func(env map[string]string) {
				env["FARAZSMS_LINE_NUMBER"] = "   "
			},
		},
		{
			name: "missing SMS pattern",
			change: func(env map[string]string) {
				delete(env, "FARAZSMS_PATTERN_CODE")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Fresh fake environment for each case.
			env := map[string]string{
				"NODE_ENV": "test",

				"DATABASE_URL": "postgresql://fake:fake@127.0.0.1:1/offline_no_connection",

				"OTP_HMAC_SECRET": strings.Repeat("a", 64),

				"ACCESS_TOKEN_SECRET": strings.Repeat("b", 64),

				"JWT_ISSUER":           "customer-club-tests",
				"JWT_AUDIENCE":         "customer-club-web-tests",
				"AUTH_ALLOWED_ORIGINS": "http://localhost:5173",

				"FARAZSMS_API_KEY":      "fake-sms-api-key",
				"FARAZSMS_LINE_NUMBER":  "50002178584000",
				"FARAZSMS_PATTERN_CODE": "fake-pattern",
			}

			// Make one setting invalid.
			tt.change(env)

			config, err := readStartupConfig(env)

			if err == nil {
				t.Fatal(
					"expected invalid configuration to fail",
				)
			}

			// Failure must not expose any
			// partially validated configuration.
			if config.Database.URL != "" ||
				len(config.OTP.Secret) != 0 ||
				len(config.Auth.Secret) != 0 ||
				config.SMS.APIKey != "" {
				t.Fatal(
					"invalid startup must return empty configuration",
				)
			}
		})
	}
}
