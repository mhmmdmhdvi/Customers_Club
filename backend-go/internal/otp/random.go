package otp

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
)

var ErrRandomUnavailable = errors.New("secure OTP randomness unavailable")

type RandomInt func(
	min int,
	max int,
) (int, error)

type RandomBytes func(
	size int,
) ([]byte, error)

func GenerateCode(
	randomInt RandomInt,
) (string, error) {
	if randomInt == nil {
		return "", ErrRandomUnavailable
	}

	value, err := randomInt(
		100000,
		1000000,
	)

	if err != nil {
		return "", ErrRandomUnavailable
	}

	if value < 100000 ||
		value >= 1000000 {
		return "", ErrRandomUnavailable
	}

	return fmt.Sprintf(
		"%06d",
		value,
	), nil
}

func GenerateNonce(
	randomBytes RandomBytes,
) (string, error) {
	if randomBytes == nil {
		return "", ErrRandomUnavailable
	}

	bytes, err :=
		randomBytes(32)

	if err != nil ||
		len(bytes) != 32 {
		return "", ErrRandomUnavailable
	}

	return hex.EncodeToString(
		bytes,
	), nil
}

func CryptoRandomBytes(
	size int,
) ([]byte, error) {
	if size < 1 {
		return nil, ErrRandomUnavailable
	}

	bytes := make(
		[]byte,
		size,
	)

	if _, err := rand.Read(bytes); err != nil {
		return nil, ErrRandomUnavailable
	}

	return bytes, nil
}

func CryptoRandomInt(
	min int,
	max int,
) (int, error) {
	if min >= max {
		return 0, ErrRandomUnavailable
	}

	rangeSize :=
		max - min

	randomValue, err :=
		rand.Int(
			rand.Reader,
			big.NewInt(
				int64(rangeSize),
			),
		)

	if err != nil {
		return 0, ErrRandomUnavailable
	}

	return min +
			int(randomValue.Int64()),
		nil
}
