package phone

import (
	"regexp"
	"strings"
	"unicode"
)

var iranianMobilePattern = regexp.MustCompile(`^09[0-9]{9}$`)

func Normalize(value string) string {
	normalized := strings.Map(
		func(r rune) rune {
			if unicode.IsSpace(r) || r == '-' {
				return -1
			}

			return r
		},
		value,
	)

	if strings.HasPrefix(
		normalized,
		"+98",
	) {
		normalized =
			"0" + normalized[3:]
	}

	if strings.HasPrefix(
		normalized,
		"0098",
	) {
		normalized =
			"0" + normalized[4:]
	}

	return normalized
}

func IsValidIranianMobile(
	value string,
) bool {
	return iranianMobilePattern.MatchString(
		value,
	)
}
