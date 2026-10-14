package session

import (
	"math"
	"regexp"
	"time"
	_ "time/tzdata"
	"unicode"
	"unicode/utf8"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/jsstring"
	"golang.org/x/text/unicode/norm"
)

var tokenPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var codePattern = regexp.MustCompile(`^[0-9]{6}$`)
var tehran = func() *time.Location {
	l, e := time.LoadLocation("Asia/Tehran")
	if e != nil {
		panic(e)
	}
	return l
}()

func normalizeName(v any, label string) (string, error) {
	s, ok := v.(string)
	if !ok {
		return "", failure(400, label+" must be a name without control characters")
	}
	for _, r := range s {
		if unicode.IsControl(r) {
			return "", failure(400, label+" must be a name without control characters")
		}
	}
	s = jsstring.Trim(norm.NFC.String(s))
	n := utf8.RuneCountInString(s)
	if n < 1 || n > 80 {
		return "", failure(400, label+" must contain 1 to 80 characters")
	}
	return s, nil
}
func integer(v any) (int, bool) {
	f, ok := v.(float64)
	if !ok || math.IsInf(f, 0) || math.IsNaN(f) || math.Trunc(f) != f || f < -9007199254740991 || f > 9007199254740991 {
		return 0, false
	}
	return int(f), true
}

// Borkowski calendar algorithm ported from jalaali-js (MIT); see JALAALI-LICENSE.
var breaks = []int{-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178}

func calendar(y int) (march, leap int) {
	gy := y + 621
	lj := -14
	jp := breaks[0]
	jump := 0
	for _, jm := range breaks[1:] {
		jump = jm - jp
		if y < jm {
			break
		}
		lj += jump/33*8 + (jump%33)/4
		jp = jm
	}
	n := y - jp
	lj += n/33*8 + (n%33+3)/4
	if jump%33 == 4 && jump-n == 4 {
		lj++
	}
	lg := gy/4 - ((gy/100+1)*3)/4 - 150
	march = 20 + lj - lg
	if jump-n < 6 {
		n = n - jump + (jump+4)/33*33
	}
	leap = ((n+1)%33 - 1) % 4
	if leap == -1 {
		leap = 4
	}
	return
}
func pastBirthday(y, m, d int, now time.Time) bool {
	if y < -61 || y > 3177 || m < 1 || m > 12 || d < 1 {
		return false
	}
	march, leap := calendar(y)
	days := 30
	if m <= 6 {
		days = 31
	}
	if m == 12 && leap != 0 {
		days = 29
	}
	if d > days {
		return false
	}
	// Compare Gregorian calendar days in Tehran, rather than UTC midnight.
	offset := (m-1)*31 - (m/7)*(m-7) + d - 1
	birthday := time.Date(y+621, 3, march, 0, 0, 0, 0, time.UTC).AddDate(0, 0, offset)
	local := now.In(tehran)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
	return birthday.Before(today)
}
