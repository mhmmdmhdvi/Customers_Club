package otpip

import (
	"encoding/binary"
	"errors"
	"net"
	"strconv"
	"strings"
)

var ErrInvalidIP = errors.New("invalid transport IP")

func Normalize(
	value string,
) (string, error) {
	if value == "" {
		return "", ErrInvalidIP
	}

	ip := net.ParseIP(value)

	if ip == nil {
		return "", ErrInvalidIP
	}

	if ipv4 := ip.To4(); ipv4 != nil {
		return net.IP(ipv4).String(), nil
	}

	ipv6 := ip.To16()

	if ipv6 == nil {
		return "", ErrInvalidIP
	}

	parts := make(
		[]string,
		8,
	)

	for i := 0; i < 8; i++ {
		value :=
			binary.BigEndian.Uint16(
				ipv6[i*2 : i*2+2],
			)

		parts[i] =
			strconv.FormatUint(
				uint64(value),
				16,
			)
	}

	return strings.Join(
		parts,
		":",
	), nil
}
