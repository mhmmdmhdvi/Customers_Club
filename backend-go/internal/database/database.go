package database

import (
	"errors"
	"net/url"
)

var errInvalidConfig = errors.New("database configuration error")

type Config struct {
	URL string
}

func ConfigFromEnv(
	env map[string]string,
) (Config, error) {
	rawURL := env["DATABASE_URL"]

	if rawURL == "" {
		return Config{}, errInvalidConfig
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return Config{}, errInvalidConfig
	}

	if parsed.Scheme != "postgresql" &&
		parsed.Scheme != "postgres" {
		return Config{}, errInvalidConfig
	}

	if parsed.Host == "" ||
		parsed.User == nil {
		return Config{}, errInvalidConfig
	}

	databaseName := parsed.Path

	if databaseName == "" ||
		databaseName == "/" {
		return Config{}, errInvalidConfig
	}

	return Config{
		URL: rawURL,
	}, nil
}
