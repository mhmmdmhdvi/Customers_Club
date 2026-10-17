package session

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

func TestCapturedJalaaliCalendarFullSupportedRange(t *testing.T) {
	out, e := os.ReadFile("testdata/jalaali-node.json")
	if e != nil {
		t.Fatal(e)
	}
	var years [][3]int
	if e = json.Unmarshal(out, &years); e != nil {
		t.Fatal(e)
	}
	if len(years) != 3239 || years[0][0] != -61 || years[len(years)-1][0] != 3177 {
		t.Fatal("incomplete calendar reference")
	}
	for _, r := range years {
		march, leap := calendar(r[0])
		if march != r[1] || leap != r[2] {
			t.Fatalf("calendar year %d got %d/%d want %d/%d", r[0], march, leap, r[1], r[2])
		}
	}
	// Tehran enters Farvardin 1 while UTC is still the previous day.
	before := time.Date(2026, 3, 20, 20, 29, 59, 0, time.UTC)
	after := before.Add(time.Second)
	if pastBirthday(1404, 12, 29, before) {
		t.Fatal("today accepted before Tehran midnight")
	}
	if !pastBirthday(1404, 12, 29, after) {
		t.Fatal("yesterday rejected after Tehran midnight")
	}
}
