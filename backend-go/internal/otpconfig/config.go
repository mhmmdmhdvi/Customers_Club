package otpconfig

import (
	"encoding/hex"
	"errors"
	"strings"
)

var ErrUnavailable = errors.New("OTP configuration unavailable")

type Config struct {
	Secret []byte
}

func Read(
	env map[string]string,
) (Config, error) {
	nodeEnv := env["NODE_ENV"]

	if nodeEnv != "development" &&
		nodeEnv != "test" &&
		nodeEnv != "production" {
		return Config{}, ErrUnavailable
	}

	otpSecretHex :=
		env["OTP_HMAC_SECRET"]

	if len(otpSecretHex) != 64 {
		return Config{}, ErrUnavailable
	}

	secret, err :=
		hex.DecodeString(
			otpSecretHex,
		)

	if err != nil ||
		len(secret) != 32 {
		return Config{}, ErrUnavailable
	}

	accessSecretHex :=
		env["ACCESS_TOKEN_SECRET"]

	if accessSecretHex != "" &&
		strings.EqualFold(
			otpSecretHex,
			accessSecretHex,
		) {
		return Config{}, ErrUnavailable
	}

	return Config{
		Secret: secret,
	}, nil
}
