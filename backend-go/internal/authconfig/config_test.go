package authconfig

import "testing"

func validEnv() map[string]string {
	return map[string]string{
		"NODE_ENV":             "test",
		"ACCESS_TOKEN_SECRET":  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"JWT_ISSUER":           "test-api",
		"JWT_AUDIENCE":         "test-client",
		"AUTH_ALLOWED_ORIGINS": "http://localhost:5173",
	}
}

func TestReadAcceptsLocalConfiguration(t *testing.T) {
	config, err := Read(validEnv())

	if err != nil {
		t.Fatalf(
			"expected valid configuration, got %v",
			err,
		)
	}

	if len(config.Secret) != 32 {
		t.Fatalf(
			"expected 32-byte secret, got %d",
			len(config.Secret),
		)
	}

	if config.AccessTTLSeconds != 900 {
		t.Errorf(
			"expected access TTL 900, got %d",
			config.AccessTTLSeconds,
		)
	}

	if len(config.AllowedOrigins) != 1 ||
		config.AllowedOrigins[0] != "http://localhost:5173" {
		t.Errorf(
			"unexpected allowed origins: %v",
			config.AllowedOrigins,
		)
	}

	if config.Cookie.Secure {
		t.Error(
			"expected local refresh cookie to be non-secure",
		)
	}

	if config.Cookie.Name != "club_refresh" {
		t.Errorf(
			"expected cookie name %q, got %q",
			"club_refresh",
			config.Cookie.Name,
		)
	}
}

func TestReadUsesSecureProductionCookie(t *testing.T) {
	env := validEnv()

	env["NODE_ENV"] = "production"
	env["AUTH_ALLOWED_ORIGINS"] =
		"https://club.example.test"

	config, err := Read(env)

	if err != nil {
		t.Fatalf(
			"expected valid production configuration, got %v",
			err,
		)
	}

	if !config.Cookie.Secure {
		t.Error(
			"expected production cookie to be secure",
		)
	}

	if config.Cookie.Name != "__Host-club_refresh" {
		t.Errorf(
			"expected production cookie name %q, got %q",
			"__Host-club_refresh",
			config.Cookie.Name,
		)
	}
}

func TestReadRejectsUnknownEnvironment(t *testing.T) {
	env := validEnv()
	env["NODE_ENV"] = "staging"

	_, err := Read(env)

	if err == nil {
		t.Fatal(
			"expected configuration error",
		)
	}
}

func TestReadRejectsMissingRequiredValues(t *testing.T) {
	required := []string{
		"NODE_ENV",
		"ACCESS_TOKEN_SECRET",
		"JWT_ISSUER",
		"JWT_AUDIENCE",
		"AUTH_ALLOWED_ORIGINS",
	}

	for _, key := range required {
		t.Run(
			key,
			func(t *testing.T) {
				env := validEnv()
				delete(env, key)

				if _, err := Read(env); err == nil {
					t.Fatalf(
						"expected missing %s to fail",
						key,
					)
				}
			},
		)
	}
}

func TestReadRejectsInvalidSecrets(t *testing.T) {
	secrets := []string{
		"",
		"abc",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}

	for _, secret := range secrets {
		env := validEnv()
		env["ACCESS_TOKEN_SECRET"] = secret

		if _, err := Read(env); err == nil {
			t.Errorf(
				"expected invalid secret length %d to fail",
				len(secret),
			)
		}
	}
}

func TestReadRejectsUnsafeOrigins(t *testing.T) {
	origins := []string{
		"*",
		"null",
		"https://good.test/path",
		"https://a:b@good.test",
		"https://good.test?x=1",
		"https://good.test#x",
		"https://good.test,",
		"ftp://localhost",
		"http://example.test",
	}

	for _, origin := range origins {
		t.Run(
			origin,
			func(t *testing.T) {
				env := validEnv()
				env["AUTH_ALLOWED_ORIGINS"] = origin

				if _, err := Read(env); err == nil {
					t.Fatalf(
						"expected unsafe origin %q to fail",
						origin,
					)
				}
			},
		)
	}
}

func TestReadProductionRejectsLocalHTTP(t *testing.T) {
	env := validEnv()
	env["NODE_ENV"] = "production"

	if _, err := Read(env); err == nil {
		t.Fatal(
			"expected production localhost HTTP origin to fail",
		)
	}
}
