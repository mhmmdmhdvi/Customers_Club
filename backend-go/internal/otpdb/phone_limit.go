package otpdb

import (
	"math"
	"time"
)

const (
	phoneCooldown = 60 * time.Second

	phoneQuarterWindow = 15 * time.Minute

	phoneDayWindow = 24 * time.Hour
)

func PhoneRequestWait(
	events []time.Time,
	pendingExpiresAt *time.Time,
	now time.Time,
) int {
	dayEvents := FilterEvents(
		events,
		now,
		phoneDayWindow,
	)

	recentEvents := FilterEvents(
		dayEvents,
		now,
		phoneQuarterWindow,
	)

	wait := 0

	wait = maxInt(
		wait,
		WaitFor(
			dayEvents,
			20,
			phoneDayWindow,
			now,
		),
	)

	wait = maxInt(
		wait,
		WaitFor(
			recentEvents,
			5,
			phoneQuarterWindow,
			now,
		),
	)

	if len(dayEvents) > 0 {
		last :=
			dayEvents[len(dayEvents)-1]

		cooldownWait :=
			ceilSeconds(
				last.
					Add(phoneCooldown).
					Sub(now),
			)

		wait = maxInt(
			wait,
			cooldownWait,
		)
	}

	if pendingExpiresAt != nil {
		pendingWait :=
			ceilSeconds(
				pendingExpiresAt.
					Sub(now),
			)

		wait = maxInt(
			wait,
			pendingWait,
		)
	}

	return wait
}

func ceilSeconds(
	duration time.Duration,
) int {
	if duration <= 0 {
		return 0
	}

	return int(
		math.Ceil(
			duration.Seconds(),
		),
	)
}

func maxInt(
	a int,
	b int,
) int {
	if a > b {
		return a
	}

	return b
}
