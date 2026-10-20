package perftest

import (
	"testing"
	"time"
)

func TestLatencySummaryUsesNearestRankAndWallThroughput(t *testing.T) {
	samples := []time.Duration{5 * time.Millisecond, time.Millisecond, 4 * time.Millisecond, 2 * time.Millisecond, 3 * time.Millisecond}
	got := summarize(samples, time.Second)
	if got.P50MS != 3 || got.P95MS != 5 || got.P99MS != 5 || got.RequestsPerSecond != 5 || got.Samples != 5 {
		t.Fatalf("unexpected summary: %+v", got)
	}
	if samples[0] != 5*time.Millisecond {
		t.Fatal("summary changed original sample order")
	}
}
