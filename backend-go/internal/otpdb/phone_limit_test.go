package otpdb

import (
	"testing"
	"time"
)

func TestPhoneRequestWait(t *testing.T) {
	now := time.Date(
		2026,
		time.October,
		7,
		12,
		0,
		0,
		0,
		time.UTC,
	)

	tests := []struct {
		name             string
		events           []time.Time
		pendingExpiresAt *time.Time
		expected         int
	}{
		{
			name:     "no previous requests",
			events:   nil,
			expected: 0,
		},
		{
			name: "cooldown still active",
			events: []time.Time{
				now.Add(-30 * time.Second),
			},
			expected: 30,
		},
		{
			name: "cooldown finished",
			events: []time.Time{
				now.Add(-60 * time.Second),
			},
			expected: 0,
		},
		{
			name: "five requests in fifteen minutes",
			events: []time.Time{
				now.Add(-10 * time.Minute),
				now.Add(-8 * time.Minute),
				now.Add(-6 * time.Minute),
				now.Add(-4 * time.Minute),
				now.Add(-2 * time.Minute),
			},
			expected: 300,
		},
		{
			name: "twenty requests in one day",
			events: func() []time.Time {
				result := make(
					[]time.Time,
					0,
					20,
				)

				for i := 0; i < 20; i++ {
					result = append(
						result,
						now.Add(
							-time.Duration(
								20-i,
							)*time.Hour,
						),
					)
				}

				return result
			}(),
			expected: 14400,
		},
		{
			name:   "pending OTP delivery",
			events: nil,
			pendingExpiresAt: func() *time.Time {
				value :=
					now.Add(
						90 * time.Second,
					)

				return &value
			}(),
			expected: 90,
		},
	}

	for _, tt := range tests {
		t.Run(
			tt.name,
			func(t *testing.T) {
				got := PhoneRequestWait(
					tt.events,
					tt.pendingExpiresAt,
					now,
				)

				if got != tt.expected {
					t.Fatalf(
						"expected wait %d seconds, got %d",
						tt.expected,
						got,
					)
				}
			},
		)
	}
}
