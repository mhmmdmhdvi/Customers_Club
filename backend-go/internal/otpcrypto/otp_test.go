package otpcrypto

import (
	"crypto/rand"
	"encoding/hex"
	"testing"
)

func TestHashCodeBindsPhoneNonceAndCode(t *testing.T) {
	secret := make([]byte, 32)

	if _, err := rand.Read(secret); err != nil {
		t.Fatalf(
			"generate secret: %v",
			err,
		)
	}

	nonceBytes := make([]byte, 32)

	if _, err := rand.Read(nonceBytes); err != nil {
		t.Fatalf(
			"generate nonce: %v",
			err,
		)
	}

	nonce := hex.EncodeToString(
		nonceBytes,
	)

	phone := "09121234567"
	code := "123456"

	hash, err := HashCode(
		secret,
		phone,
		nonce,
		code,
	)

	if err != nil {
		t.Fatalf(
			"hash OTP: %v",
			err,
		)
	}

	if !MatchesCode(
		secret,
		hash,
		nonce,
		phone,
		code,
	) {
		t.Fatal(
			"expected valid OTP to match",
		)
	}

	if MatchesCode(
		secret,
		hash,
		nonce,
		"09129876543",
		code,
	) {
		t.Fatal(
			"OTP hash must be bound to phone",
		)
	}

	if MatchesCode(
		secret,
		hash,
		nonce,
		phone,
		"654321",
	) {
		t.Fatal(
			"OTP hash must be bound to code",
		)
	}

	otherNonce := make(
		[]byte,
		32,
	)

	if _, err := rand.Read(
		otherNonce,
	); err != nil {
		t.Fatalf(
			"generate second nonce: %v",
			err,
		)
	}

	if MatchesCode(
		secret,
		hash,
		hex.EncodeToString(otherNonce),
		phone,
		code,
	) {
		t.Fatal(
			"OTP hash must be bound to nonce",
		)
	}
}

func TestHashCodeMatchesNodeCompatibilityVector(t *testing.T) {
	secret := make([]byte, 32)

	nonce :=
		"1111111111111111111111111111111111111111111111111111111111111111"

	got, err := HashCode(
		secret,
		"09121234567",
		nonce,
		"123456",
	)

	if err != nil {
		t.Fatalf(
			"hash OTP: %v",
			err,
		)
	}

	const expected = "575b76c6bafaecff700f235d22375cc9234d37b719c811481bca63e525d05f68"

	if got != expected {
		t.Fatalf(
			"expected Node-compatible hash %q, got %q",
			expected,
			got,
		)
	}
}
