// Package jsstring preserves the ECMAScript whitespace semantics used by Node.
package jsstring

import "strings"

// IsSpace matches ECMAScript WhiteSpace and LineTerminator (String.trim and
// regular expression \s), which include BOM but exclude Unicode NEXT LINE.
func IsSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
		return true
	}
	return r >= 0x2000 && r <= 0x200A
}

func Trim(s string) string { return strings.TrimFunc(s, IsSpace) }
