package authconfig

import (
	"encoding/hex"
	"errors"
	"net/url"
	"strings"
)

const accessTTLSeconds = 15 * 60

var errInvalidConfig =
	errors.New("authentication configuration error")

type CookieConfig struct {
	Name   string
	Secure bool
}

type Config struct {
	Secret           []byte
	Issuer           string
	Audience         string
	AccessTTLSeconds int
	AllowedOrigins   []string
	Cookie           CookieConfig
}

func Read(env map[string]string) (Config, error) {
	nodeEnv := env["NODE_ENV"]

	if nodeEnv != "development" &&
		nodeEnv != "test" &&
		nodeEnv != "production" {
		return Config{}, errInvalidConfig
	}

	secretHex := env["ACCESS_TOKEN_SECRET"]

	if len(secretHex) != 64 {
		return Config{}, errInvalidConfig
	}

	secret, err := hex.DecodeString(secretHex)
	if err != nil || len(secret) != 32 {
		return Config{}, errInvalidConfig
	}

	issuer := env["JWT_ISSUER"]
	audience := env["JWT_AUDIENCE"]

	if !validPrintableASCII(issuer) ||
		!validPrintableASCII(audience) {
		return Config{}, errInvalidConfig
	}

	origins, err :=
		parseAllowedOrigins(
			env["AUTH_ALLOWED_ORIGINS"],
			nodeEnv,
		)
	if err != nil {
		return Config{}, errInvalidConfig
	}

	secure :=
		nodeEnv == "production"

	cookieName := "club_refresh"

	if secure {
		cookieName =
			"__Host-club_refresh"
	}

	return Config{
		Secret:           secret,
		Issuer:           issuer,
		Audience:         audience,
		AccessTTLSeconds: accessTTLSeconds,
		AllowedOrigins:   origins,
		Cookie: CookieConfig{
			Name:   cookieName,
			Secure: secure,
		},
	}, nil
}

func validPrintableASCII(
	value string,
) bool {
	if len(value) < 1 ||
		len(value) > 128 {
		return false
	}

	for _, r := range value {
		if r < 0x21 || r > 0x7e {
			return false
		}
	}

	return true
}

func parseAllowedOrigins(
	raw string,
	nodeEnv string,
) ([]string, error) {
	if raw == "" {
		return nil, errInvalidConfig
	}

	parts := strings.Split(raw, ",")

	seen := make(map[string]bool)
	origins := make(
		[]string,
		0,
		len(parts),
	)

	for _, part := range parts {
		origin := strings.TrimSpace(part)

		if origin == "" {
			return nil, errInvalidConfig
		}

		parsed, err :=
			url.Parse(origin)

		if err != nil ||
			parsed.Scheme == "" ||
			parsed.Host == "" ||
			parsed.User != nil ||
			parsed.Path != "" ||
			parsed.RawQuery != "" ||
			parsed.Fragment != "" {
			return nil, errInvalidConfig
		}

		isHTTPS :=
			parsed.Scheme == "https"

		isLocalHTTP :=
			nodeEnv != "production" &&
				parsed.Scheme == "http" &&
				isLoopbackHost(
					parsed.Hostname(),
				)

		if !isHTTPS &&
			!isLocalHTTP {
			return nil, errInvalidConfig
		}

		if !seen[origin] {
			seen[origin] = true
			origins =
				append(
					origins,
					origin,
				)
		}
	}

	return origins, nil
}

func isLoopbackHost(
	host string,
) bool {
	return host == "localhost" ||
		host == "127.0.0.1" ||
		host == "::1"
}