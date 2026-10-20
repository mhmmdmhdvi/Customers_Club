package phoneverification

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
)

const tokenBytes = 32

var ErrTokenUnavailable = errors.New(
	"verification token unavailable",
)

type RandomBytes func(
	size int,
) ([]byte, error)

func GenerateToken(
	randomBytes RandomBytes,
) (string, string, error) {
	if randomBytes == nil {
		return "", "", ErrTokenUnavailable
	}

	// Generate 32 random bytes.
	rawBytes, err := randomBytes(tokenBytes)

	if err != nil || len(rawBytes) != tokenBytes {
		return "", "", ErrTokenUnavailable
	}

	// Convert the bytes into a 64-character
	// hexadecimal verification token.
	token := hex.EncodeToString(rawBytes)

	// Hash the hexadecimal STRING, matching Node.js.
	digest := sha256.Sum256(
		[]byte(token),
	)

	tokenHash := hex.EncodeToString(
		digest[:],
	)

	return token, tokenHash, nil
}

func GenerateSecureToken() (string, string, error) {
	return GenerateToken(
		func(size int) ([]byte, error) {
			randomBytes := make([]byte, size)

			if _, err := rand.Read(randomBytes); err != nil {
				return nil, err
			}

			return randomBytes, nil
		},
	)
}
