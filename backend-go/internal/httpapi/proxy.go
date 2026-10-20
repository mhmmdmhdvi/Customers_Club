package httpapi

import (
	"errors"
	"net"
	"net/http"
	"net/netip"
	"strings"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpip"
)

type TrustedProxies []netip.Prefix

// ParseTrustedProxies accepts explicit peer addresses and CIDRs only. Empty
// configuration trusts no headers; universal networks are never accepted.
func ParseTrustedProxies(raw string) (TrustedProxies, error) {
	var peers TrustedProxies
	if raw == "" {
		return peers, nil
	}
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		prefix, err := netip.ParsePrefix(part)
		if err != nil {
			address, e := netip.ParseAddr(part)
			if e != nil || address.Zone() != "" {
				return nil, errors.New("invalid trusted proxy configuration")
			}
			address = address.Unmap()
			prefix = netip.PrefixFrom(address, address.BitLen())
		}
		if prefix.Bits() == 0 || prefix.Addr().Zone() != "" {
			return nil, errors.New("invalid trusted proxy configuration")
		}
		peers = append(peers, prefix.Masked())
	}
	return peers, nil
}

// The supplied proxy overwrites X-Real-IP with its socket peer, never appends
// a client-provided forwarding chain. Only configured connection peers may use it.
func WithTrustedProxy(next http.Handler, peers TrustedProxies) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		address, e := netip.ParseAddr(host)
		trusted := false
		if err == nil && e == nil {
			for _, prefix := range peers {
				if prefix.Contains(address.Unmap()) {
					trusted = true
					break
				}
			}
		}
		if trusted && len(r.Header.Values("X-Real-IP")) > 0 {
			values := r.Header.Values("X-Real-IP")
			client, e := netip.ParseAddr(values[0])
			if len(values) != 1 || e != nil || client.Zone() != "" {
				writeSecurityError(w, 400, "Invalid forwarding address")
				return
			}
			clone := r.Clone(r.Context())
			clone.RemoteAddr = net.JoinHostPort(client.Unmap().String(), "0")
			r = clone
		}
		next.ServeHTTP(w, r)
	})
}

func requestIP(r *http.Request) (string, error) {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return "", err
	}
	return otpip.Normalize(host)
}
