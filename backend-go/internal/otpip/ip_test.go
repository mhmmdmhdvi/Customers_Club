package otpip

import "testing"

func TestNormalize(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "ipv4",
			input:    "192.0.2.1",
			expected: "192.0.2.1",
		},
		{
			name:     "ipv4 mapped dotted",
			input:    "::ffff:192.0.2.1",
			expected: "192.0.2.1",
		},
		{
			name:     "ipv4 mapped hex",
			input:    "::ffff:c000:201",
			expected: "192.0.2.1",
		},
		{
			name:     "ipv6 canonical",
			input:    "2001:0DB8:0:0::1",
			expected: "2001:db8:0:0:0:0:0:1",
		},
		{
			name:     "ipv6 loopback",
			input:    "::1",
			expected: "0:0:0:0:0:0:0:1",
		},
	}

	for _, tt := range tests {
		t.Run(
			tt.name,
			func(t *testing.T) {
				got, err := Normalize(tt.input)

				if err != nil {
					t.Fatalf(
						"expected valid IP, got %v",
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
			},
		)
	}
}

func TestNormalizeRejectsInvalidTransportIP(t *testing.T) {
	inputs := []string{
		"",
		"192.0.2.1, 192.0.2.2",
		"192.0.2.1:80",
		"for=192.0.2.1",
		"fe80::1%eth0",
	}

	for _, input := range inputs {
		t.Run(
			input,
			func(t *testing.T) {
				if _, err := Normalize(input); err == nil {
					t.Fatalf(
						"expected %q to fail",
						input,
					)
				}
			},
		)
	}
}
