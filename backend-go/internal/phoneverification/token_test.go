package phoneverification

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"testing"
)

func TestGenerateTokenHashesHexRepresentation(t *testing.T) {
	// Use predictable random bytes for this test.
	randomBytes := make([]byte, 32)

	for i := range randomBytes {
		randomBytes[i] = byte(i)
	}

	randomCalled := false

	token, tokenHash, err := GenerateToken(
		func(size int) ([]byte, error) {
			randomCalled = true

			if size != 32 {
				t.Fatalf(
					"expected 32 random bytes, got %d",
					size,
				)
			}

			return randomBytes, nil
		},
	)

	if err != nil {
		t.Fatalf(
			"expected token generation success, got %v",
			err,
		)
	}

	if !randomCalled {
		t.Fatal("expected secure random provider to be called")
	}

	expectedToken := hex.EncodeToString(randomBytes)

	if token != expectedToken {
		t.Fatalf(
			"expected token %q, got %q",
			expectedToken,
			token,
		)
	}

	if len(token) != 64 {
		t.Fatalf(
			"expected 64-character token, got %d",
			len(token),
		)
	}

	// Node.js hashes the hexadecimal token STRING,
	// not the original 32 random bytes.
	expectedDigest := sha256.Sum256(
		[]byte(expectedToken),
	)

	expectedHash := hex.EncodeToString(
		expectedDigest[:],
	)

	if tokenHash != expectedHash {
		t.Fatalf(
			"expected token hash %q, got %q",
			expectedHash,
			tokenHash,
		)
	}

	if tokenHash == token {
		t.Fatal(
			"database token hash must differ from raw token",
		)
	}
}

func TestGenerateTokenRejectsInvalidRandomness(t *testing.T) {
	randomFailure := errors.New(
		"synthetic random provider failure",
	)

	tests := []struct {
		name        string
		randomBytes RandomBytes
	}{
		{
			name:        "missing random provider",
			randomBytes: nil,
		},
		{
			name: "random provider failure",
			randomBytes: func(size int) ([]byte, error) {
				return nil, randomFailure
			},
		},
		{
			name: "too few random bytes",
			randomBytes: func(size int) ([]byte, error) {
				return make([]byte, size-1), nil
			},
		},
		{
			name: "too many random bytes",
			randomBytes: func(size int) ([]byte, error) {
				return make([]byte, size+1), nil
			},
		},
		{
			name: "bytes returned with an error",
			randomBytes: func(size int) ([]byte, error) {
				return make([]byte, size), randomFailure
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token, tokenHash, err := GenerateToken(
				tt.randomBytes,
			)

			if !errors.Is(err, ErrTokenUnavailable) {
				t.Fatalf(
					"expected ErrTokenUnavailable, got %v",
					err,
				)
			}

			if token != "" {
				t.Fatal(
					"failed generation must not return a token",
				)
			}

			if tokenHash != "" {
				t.Fatal(
					"failed generation must not return a token hash",
				)
			}
		})
	}
}

func TestGenerateSecureTokenProducesFreshHashedProof(
	t *testing.T,
) {
	token, tokenHash, err := GenerateSecureToken()

	if err != nil {
		t.Fatalf(
			"expected secure token generation, got %v",
			err,
		)
	}

	if len(token) != 64 {
		t.Fatalf(
			"expected 64-character token, got %d",
			len(token),
		)
	}

	rawBytes, err := hex.DecodeString(token)

	if err != nil {
		t.Fatalf(
			"expected hexadecimal token, got %v",
			err,
		)
	}

	if len(rawBytes) != 32 {
		t.Fatalf(
			"expected 32 random bytes, got %d",
			len(rawBytes),
		)
	}

	expectedDigest := sha256.Sum256(
		[]byte(token),
	)

	expectedHash := hex.EncodeToString(
		expectedDigest[:],
	)

	if tokenHash != expectedHash {
		t.Fatal(
			"expected SHA-256 hash of hexadecimal token",
		)
	}

	// A second secure generation should produce
	// a different verification token.
	secondToken, _, err := GenerateSecureToken()

	if err != nil {
		t.Fatalf(
			"expected second token generation, got %v",
			err,
		)
	}

	if secondToken == token {
		t.Fatal(
			"two secure tokens must not be identical",
		)
	}
}
