package httpapi

import (
	"net/url"
	"reflect"
	"strings"
	"testing"
)

func TestAdminQueryNodeDecoding(t *testing.T) {
	// Literal expected values were checked against the installed Node24
	// querystring.parse, the default simple parser used by this Express app.
	for _, c := range []struct {
		raw  string
		want url.Values
	}{
		{"page=%ZZ&page=1;page=2", url.Values{"page": {"%ZZ", "1;page=2"}}},
		{"Search=a+b&search=a%2Bb&p%61ge=%31", url.Values{"Search": {"a b"}, "search": {"a+b"}, "page": {"1"}}},
		{"x=%E0%A4&x=%ED%A0%80&x=%F0%80%80%80", url.Values{"x": {"\ufffd", "\ufffd\ufffd\ufffd", "\ufffd\ufffd\ufffd\ufffd"}}},
		{"x=%FFa&x=%ZZ%C3%A9&x=%&x=a=b", url.Values{"x": {"\ufffda", "%ZZé", "%", "a=b"}}},
		{"x=é%ZZ%41", url.Values{"x": {"\ufffd%ZZA"}}},
		{"&&=value&flag&", url.Values{"": {"value"}, "flag": {""}}},
	} {
		if got := parseAdminQuery(c.raw); !reflect.DeepEqual(got, c.want) {
			t.Errorf("%q: got %#v want %#v", c.raw, got, c.want)
		}
	}
}

func TestAdminQueryNodeDefaultPairLimit(t *testing.T) {
	for _, c := range []struct {
		raw  string
		page string
	}{{strings.Repeat("unknown=x&", 999) + "page=bad", "bad"}, {strings.Repeat("unknown=x&", 1000) + "page=bad", ""}, {strings.Repeat("&", 999) + "page=bad", "bad"}, {strings.Repeat("&", 1000) + "page=bad", ""}} {
		if got := parseAdminQuery(c.raw).Get("page"); got != c.page {
			t.Errorf("pair boundary: page=%q want %q", got, c.page)
		}
	}
	if got := parseAdminQuery(strings.Repeat("x=1&", 1001))["x"]; len(got) != 1000 {
		t.Fatalf("retained duplicate values=%d want1000", len(got))
	}
}
