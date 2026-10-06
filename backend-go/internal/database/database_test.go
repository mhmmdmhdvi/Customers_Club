package database

import "testing"

func TestConfigRejectsMissingDatabaseURL(t *testing.T) {
	_, err := ConfigFromEnv(
		map[string]string{},
	)

	if err == nil {
		t.Fatal(
			"expected missing DATABASE_URL to fail",
		)
	}
}

func TestConfigAcceptsPostgresURL(t *testing.T) {
	config, err := ConfigFromEnv(
		map[string]string{
			"DATABASE_URL": "postgresql://user:pass@localhost:5432/customer_club_db",
		},
	)

	if err != nil {
		t.Fatalf(
			"expected valid database config, got %v",
			err,
		)
	}

	if config.URL == "" {
		t.Fatal(
			"expected database URL",
		)
	}
}
