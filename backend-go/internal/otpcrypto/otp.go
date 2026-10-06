package otpcrypto

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
)

var errUnavailable = errors.New("OTP cryptography unavailable")

var hex64Pattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func HashCode(
	secret []byte,
	phone string,
	nonce string,
	code string,
) (string, error) {
	return KeyedHash(
		secret,
		"club-otp-v1",
		phone,
		nonce,
		code,
	)
}

func KeyedHash(
	secret []byte,
	purpose string,
	parts ...string,
) (string, error) {
	if len(secret) != 32 {
		return "", errUnavailable
	}

	values := make(
		[]string,
		0,
		len(parts)+1,
	)

	values = append(
		values,
		purpose,
	)

	values = append(
		values,
		parts...,
	)

	payload, err :=
		json.Marshal(values)

	if err != nil {
		return "", errUnavailable
	}

	mac :=
		hmac.New(
			sha256.New,
			secret,
		)

	if _, err := mac.Write(payload); err != nil {
		return "", errUnavailable
	}

	return hex.EncodeToString(
		mac.Sum(nil),
	), nil
}

func MatchesCode(
	secret []byte,
	storedHash string,
	nonce string,
	phone string,
	code string,
) bool {
	if len(secret) != 32 ||
		!hex64Pattern.MatchString(storedHash) ||
		!hex64Pattern.MatchString(nonce) {
		return false
	}

	expected, err :=
		HashCode(
			secret,
			phone,
			nonce,
			code,
		)

	if err != nil {
		return false
	}

	storedBytes, err :=
		hex.DecodeString(
			storedHash,
		)

	if err != nil {
		return false
	}

	expectedBytes, err :=
		hex.DecodeString(
			expected,
		)

	if err != nil {
		return false
	}

	return hmac.Equal(
		storedBytes,
		expectedBytes,
	)
}
