// Package perftest contains opt-in measurements; it is never runtime wiring.
package perftest

import (
	"math"
	"slices"
	"time"
)

type latency struct {
	Samples           int     `json:"samples"`
	P50MS             float64 `json:"p50Ms"`
	P95MS             float64 `json:"p95Ms"`
	P99MS             float64 `json:"p99Ms"`
	RequestsPerSecond float64 `json:"requestsPerSecond"`
	WallMS            float64 `json:"wallMs"`
}

func summarize(samples []time.Duration, wall time.Duration) latency {
	sorted := slices.Clone(samples)
	slices.Sort(sorted)
	percentile := func(p float64) float64 {
		return float64(sorted[int(math.Ceil(p*float64(len(sorted))))-1]) / float64(time.Millisecond)
	}
	return latency{len(sorted), percentile(.50), percentile(.95), percentile(.99), float64(len(sorted)) / wall.Seconds(), float64(wall) / float64(time.Millisecond)}
}
