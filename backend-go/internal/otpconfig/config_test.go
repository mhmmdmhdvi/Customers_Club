package otpconfig

import "testing"

func validEnv() map[string]string {
	return map[string]string{
		"NODE_ENV":            "test",
		"OTP_HMAC_SECRET":     "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"ACCESS_TOKEN_SECRET": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	}
}

func TestReadAcceptsValidConfiguration(t *testing.T) {
	config, err := Read(validEnv())

	if err != nil {
		t.Fatalf(
			"expected valid OTP configuration, got %v",
			err,
		)
	}

	if len(config.Secret) != 32 {
		t.Fatalf(
			"expected 32-byte OTP secret, got %d",
			len(config.Secret),
		)
	}
}

func TestReadRejectsInvalidConfiguration(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(map[string]string)
	}{
		{
			name: "missing environment",
			mutate: func(env map[string]string) {
				delete(env, "NODE_ENV")
			},
		},
		{
			name: "unknown environment",
			mutate: func(env map[string]string) {
				env["NODE_ENV"] = "staging"
			},
		},
		{
			name: "missing OTP secret",
			mutate: func(env map[string]string) {
				delete(env, "OTP_HMAC_SECRET")
			},
		},
		{
			name: "short OTP secret",
			mutate: func(env map[string]string) {
				env["OTP_HMAC_SECRET"] =
					"a"
			},
		},
		{
			name: "non-hex OTP secret",
			mutate: func(env map[string]string) {
				env["OTP_HMAC_SECRET"] =
					"gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg"
			},
		},
		{
			name: "reuses access token secret",
			mutate: func(env map[string]string) {
				env["OTP_HMAC_SECRET"] =
					env["ACCESS_TOKEN_SECRET"]
			},
		},
		{
			name: "reuses access token secret with different case",
			mutate: func(env map[string]string) {
				env["ACCESS_TOKEN_SECRET"] =
					"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

				env["OTP_HMAC_SECRET"] =
					"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
			},
		},
	}

	for _, tt := range tests {
		t.Run(
			tt.name,
			func(t *testing.T) {
				env := validEnv()
				tt.mutate(env)

				if _, err := Read(env); err == nil {
					t.Fatal(
						"expected OTP configuration to fail",
					)
				}
			},
		)
	}
}
