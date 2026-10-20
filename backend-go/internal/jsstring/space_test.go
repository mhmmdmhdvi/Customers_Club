package jsstring

import "testing"

func TestECMAScriptWhitespace(t *testing.T) {
	for _, r := range []rune{'\t', '\n', '\v', '\f', '\r', ' ', 0xA0, 0x1680, 0x2000, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF} {
		if !IsSpace(r) || Trim(string(r)+"123456"+string(r)) != "123456" {
			t.Errorf("JS whitespace U+%04X not trimmed", r)
		}
	}
	for _, r := range []rune{0x85, 0x1C, 0x180E, 0x200B} {
		value := string(r) + "123456" + string(r)
		if IsSpace(r) || Trim(value) != value {
			t.Errorf("non-JS whitespace U+%04X trimmed", r)
		}
	}
}
