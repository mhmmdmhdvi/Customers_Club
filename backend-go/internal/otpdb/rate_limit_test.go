package otpdb

import (
	"testing"
	"time"
)

func TestWaitFor(t *testing.T) {
	now := time.Date(
		2026,
		time.October,
		6,
		12,
		0,
		0,
		0,
		time.UTC,
	)

	window := 15 * time.Minute

	tests := []struct {
		name     string
		events   []time.Time
		limit    int
		expected int
	}{
		{
			name: "below limit",
			events: []time.Time{
				now.Add(-4 * time.Minute),
				now.Add(-3 * time.Minute),
				now.Add(-2 * time.Minute),
				now.Add(-1 * time.Minute),
			},
			limit:    5,
			expected: 0,
		},
		{
			name: "exactly at limit",
			events: []time.Time{
				now.Add(-5 * time.Minute),
				now.Add(-4 * time.Minute),
				now.Add(-3 * time.Minute),
				now.Add(-2 * time.Minute),
				now.Add(-1 * time.Minute),
			},
			limit:    5,
			expected: 600,
		},
		{
			name: "uses oldest event among latest limit",
			events: []time.Time{
				now.Add(-10 * time.Minute),
				now.Add(-5 * time.Minute),
				now.Add(-4 * time.Minute),
				now.Add(-3 * time.Minute),
				now.Add(-2 * time.Minute),
				now.Add(-1 * time.Minute),
			},
			limit:    5,
			expected: 600,
		},
		{
			name: "rounds retry time up",
			events: []time.Time{
				now.Add(
					-15*time.Minute +
						500*time.Millisecond,
				),
			},
			limit:    1,
			expected: 1,
		},
	}

	for _, tt := range tests {
		t.Run(
			tt.name,
			func(t *testing.T) {
				got := WaitFor(
					tt.events,
					tt.limit,
					window,
					now,
				)

				if got != tt.expected {
					t.Fatalf(
						"expected retry after %d seconds, got %d",
						tt.expected,
						got,
					)
				}
			},
		)
	}
}

func TestFilterEvents(t *testing.T) {
	now := time.Date(
		2026,
		time.October,
		6,
		12,
		0,
		0,
		0,
		time.UTC,
	)

	window := 15 * time.Minute

	events := []time.Time{
		now.Add(-1 * time.Minute),
		now.Add(-16 * time.Minute),
		now.Add(-5 * time.Minute),
		now.Add(-15 * time.Minute),
		now.Add(-14 * time.Minute),
	}

	got := FilterEvents(
		events,
		now,
		window,
	)

	expected := []time.Time{
		now.Add(-14 * time.Minute),
		now.Add(-5 * time.Minute),
		now.Add(-1 * time.Minute),
	}

	if len(got) != len(expected) {
		t.Fatalf(
			"expected %d events, got %d",
			len(expected),
			len(got),
		)
	}

	for index := range expected {
		if !got[index].Equal(
			expected[index],
		) {
			t.Errorf(
				"event %d: expected %v, got %v",
				index,
				expected[index],
				got[index],
			)
		}
	}
}
