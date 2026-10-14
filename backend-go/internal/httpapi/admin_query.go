package httpapi

import (
	"net/url"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"golang.org/x/text/encoding/unicode"
)

// parseAdminQuery matches Express's default Node querystring parser. Invalid
// percent escapes and semicolons remain data for the endpoint validators; an
// invalid value must not erase a filter or one member of a duplicate field.
func parseAdminQuery(raw string) url.Values {
	values := url.Values{}
	// Empty segments consume the same bounded 1000-pair budget as Node.
	for i, pair := range strings.SplitN(raw, "&", 1001) {
		if i == 1000 {
			break
		}
		if pair == "" {
			continue
		}
		key, value, _ := strings.Cut(pair, "=")
		values.Add(decodeQueryComponent(key), decodeQueryComponent(value))
	}
	return values
}

func queryHex(c byte) int {
	switch {
	case c >= '0' && c <= '9':
		return int(c - '0')
	case c >= 'a' && c <= 'f':
		return int(c-'a') + 10
	case c >= 'A' && c <= 'F':
		return int(c-'A') + 10
	}
	return -1
}

func decodeQueryComponent(raw string) string {
	// Node only invokes its URI decoder after observing a valid %HH triplet.
	encoded := false
	for i := 0; i+2 < len(raw); i++ {
		if raw[i] == '%' && queryHex(raw[i+1]) >= 0 && queryHex(raw[i+2]) >= 0 {
			encoded = true
			break
		}
	}
	if !encoded {
		return strings.ReplaceAll(raw, "+", " ")
	}
	if decoded, e := url.QueryUnescape(raw); e == nil && utf8.ValidString(decoded) {
		return decoded
	}
	// Node's fallback unescapeBuffer preserves invalid escapes, decodes valid
	// ones, and writes literal UTF16 units into bytes before Buffer.toString.
	units := utf16.Encode([]rune(strings.ReplaceAll(raw, "+", " ")))
	data := make([]byte, 0, len(units))
	for i := 0; i < len(units); i++ {
		if units[i] == '%' && i+2 < len(units) && units[i+1] <= 127 && units[i+2] <= 127 {
			high, low := queryHex(byte(units[i+1])), queryHex(byte(units[i+2]))
			if high >= 0 && low >= 0 {
				data = append(data, byte(high*16+low))
				i += 2
				continue
			}
		}
		data = append(data, byte(units[i]))
	}
	// x/text replaces maximal malformed UTF8 subparts like Node Buffer, unlike
	// strings.ToValidUTF8 (which collapses consecutive invalid byte runs).
	decoded, _ := unicode.UTF8.NewDecoder().String(string(data))
	return decoded
}
