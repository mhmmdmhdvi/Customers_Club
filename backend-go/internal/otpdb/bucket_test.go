package otpdb

import (
	"testing"
)

func TestBucketKeyMatchesNodeCompatibilityVector(t *testing.T) {
	secret := make([]byte, 32)

	got, err := BucketKey(
		secret,
		"phone:request",
		"09121234567",
	)

	if err != nil {
		t.Fatalf(
			"bucket key failed: %v",
			err,
		)
	}

	const expected = "f9933811ca1e7d40da371753088609e8dd46e55aee58b47d57c8e25ac2384b52"

	if got != expected {
		t.Fatalf(
			"expected Node-compatible bucket key %q, got %q",
			expected,
			got,
		)
	}
}
