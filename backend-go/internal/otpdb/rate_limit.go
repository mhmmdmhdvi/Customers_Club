package otpdb

import (
	"math"
	"sort"
	"time"
)

func WaitFor(
	events []time.Time,
	limit int,
	window time.Duration,
	now time.Time,
) int {
	if len(events) < limit {
		return 0
	}

	oldestRelevant :=
		events[len(events)-limit]

	remaining :=
		oldestRelevant.
			Add(window).
			Sub(now)

	seconds :=
		int(
			math.Ceil(
				remaining.Seconds(),
			),
		)

	if seconds < 1 {
		return 1
	}

	return seconds
}

func FilterEvents(
	events []time.Time,
	now time.Time,
	window time.Duration,
) []time.Time {
	cutoff := now.Add(-window)

	filtered := make(
		[]time.Time,
		0,
		len(events),
	)

	for _, event := range events {
		if event.After(cutoff) {
			filtered = append(
				filtered,
				event,
			)
		}
	}

	sort.Slice(
		filtered,
		func(i, j int) bool {
			return filtered[i].Before(
				filtered[j],
			)
		},
	)
	return filtered
}
