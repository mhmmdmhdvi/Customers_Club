package session

import (
	"encoding/json"
	"os/exec"
	"testing"
	"time"
)

func TestCalendarInteroperatesWithInstalledJalaaliJS(t *testing.T) {
	cmd := exec.Command("node", "-e", `const j=require('jalaali-js');const out=[];for(let y=-61;y<=3177;y++){const r=j.jalCal(y);out.push([y,r.march,r.leap])}console.log(JSON.stringify(out));`)
	cmd.Dir = "../../../backend"
	out, e := cmd.Output()
	if e != nil {
		t.Fatal(e)
	}
	var years [][3]int
	if e = json.Unmarshal(out, &years); e != nil {
		t.Fatal(e)
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
