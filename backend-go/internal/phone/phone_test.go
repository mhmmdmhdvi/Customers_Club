package phone

import "testing"

func TestNormalize(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "international plus 98",
			input:    "+989121234567",
			expected: "09121234567",
		},
		{
			name:     "international 0098",
			input:    "00989121234567",
			expected: "09121234567",
		},
		{
			name:     "removes spaces",
			input:    "0912 123 4567",
			expected: "09121234567",
		},
		{
			name:     "removes hyphens",
			input:    "0912-123-4567",
			expected: "09121234567",
		},
		{
			name:     "keeps local format",
			input:    "09121234567",
			expected: "09121234567",
		},
	}

	for _, tt := range tests {
		t.Run(
			tt.name,
			func(t *testing.T) {
				got := Normalize(tt.input)

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

func TestIsValidIranianMobile(t *testing.T) {
	valid := []string{
		"09121234567",
		"09901234567",
	}

	for _, input := range valid {
		if !IsValidIranianMobile(input) {
			t.Errorf(
				"expected %q to be valid",
				input,
			)
		}
	}

	invalid := []string{
		"9121234567",
		"08121234567",
		"0912123456",
		"091212345678",
		"09121234abc",
	}

	for _, input := range invalid {
		if IsValidIranianMobile(input) {
			t.Errorf(
				"expected %q to be invalid",
				input,
			)
		}
	}
}
