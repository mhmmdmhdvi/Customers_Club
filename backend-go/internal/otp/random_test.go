package otp

import (
	"fmt"
	"testing"
)

func TestGenerateCodeUsesSixDigitRange(t *testing.T) {
	tests := []struct {
		name     string
		random   int
		expected string
	}{
		{
			name:     "minimum",
			random:   100000,
			expected: "100000",
		},
		{
			name:     "maximum",
			random:   999999,
			expected: "999999",
		},
	}

	for _, tt := range tests {
		t.Run(
			tt.name,
			func(t *testing.T) {
				randomInt := func(
					min int,
					max int,
				) (int, error) {
					if min != 100000 {
						t.Fatalf(
							"expected minimum 100000, got %d",
							min,
						)
					}

					if max != 1000000 {
						t.Fatalf(
							"expected maximum 1000000, got %d",
							max,
						)
					}

					return tt.random, nil
				}

				got, err := GenerateCode(
					randomInt,
				)

				if err != nil {
					t.Fatalf(
						"generate OTP code: %v",
						err,
					)
				}

				if got != tt.expected {
					t.Fatalf(
						"expected %q, got %q",
						tt.expected,
						got,
					)
				}

				if len(got) != 6 {
					t.Fatalf(
						"expected six-digit code, got %q",
						got,
					)
				}

				if got != fmt.Sprintf(
					"%06d",
					tt.random,
				) {
					t.Fatalf(
						"unexpected OTP formatting: %q",
						got,
					)
				}
			},
		)
	}
}

func TestGenerateNonceCreates64CharacterHexValue(t *testing.T) {
	randomBytes := func(
		size int,
	) ([]byte, error) {
		if size != 32 {
			t.Fatalf(
				"expected 32 random bytes, got %d",
				size,
			)
		}

		bytes := make(
			[]byte,
			32,
		)

		for i := range bytes {
			bytes[i] = byte(i)
		}

		return bytes, nil
	}

	got, err := GenerateNonce(
		randomBytes,
	)

	if err != nil {
		t.Fatalf(
			"generate nonce: %v",
			err,
		)
	}

	const expected = "000102030405060708090a0b0c0d0e0f" +
		"101112131415161718191a1b1c1d1e1f"

	if got != expected {
		t.Fatalf(
			"expected %q, got %q",
			expected,
			got,
		)
	}

	if len(got) != 64 {
		t.Fatalf(
			"expected 64-character nonce, got %d",
			len(got),
		)
	}
}
