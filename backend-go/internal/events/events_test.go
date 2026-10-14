package events

import (
	"strings"
	"testing"
)

func TestDetailsRejectSensitiveKeysDepthAndUTF16Size(t *testing.T) {
	for _, k := range []string{"Access-Token", "refresh_token", "TOKEN", "Password", "otp-code", "Authorization", "cookie", "set-cookie", "message", "message_body"} {
		if _, e := Details(map[string]any{"nested": []any{map[string]any{k: "secret"}}}, "security event"); e == nil {
			t.Error("accepted", k)
		}
	}
	d := map[string]any{"value": "safe"}
	for i := 0; i < 7; i++ {
		d = map[string]any{"nested": d}
	}
	if _, e := Details(d, "audit"); e == nil {
		t.Fatal("accepted deep details")
	}
	if _, e := Details(map[string]any{"x": strings.Repeat("😀", 1997)}, "audit"); e == nil {
		t.Fatal("accepted >4000 UTF16 units")
	}
	if _, e := Details(map[string]any{"x": strings.Repeat("😀", 1996)}, "audit"); e != nil {
		t.Fatal(e)
	}
	if _, e := Details(map[string]any{"x": "<>&"}, "audit"); e != nil {
		t.Fatal(e)
	}
}
func TestDetailsNodeJSONLengthUsesLiteralLineSeparators(t *testing.T) {
	if _, e := Details(map[string]any{"x": strings.Repeat("\u2028", 3992)}, "audit"); e != nil {
		t.Fatal("Node JSON is exactly 4000 UTF16 units", e)
	}
	if _, e := Details(map[string]any{"x": strings.Repeat("\u2029", 3993)}, "audit"); e == nil {
		t.Fatal("Node JSON exceeds 4000 UTF16 units")
	}
}
