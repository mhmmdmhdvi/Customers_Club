package otpdb

import "testing"

func TestLockKeyMatchesNodeCompatibilityVector(t *testing.T) {
	got := LockKey(
		"phone:09121234567",
	)

	const expected int64 = -6316654346097566983

	if got != expected {
		t.Fatalf(
			"expected Node-compatible lock key %d, got %d",
			expected,
			got,
		)
	}
}
