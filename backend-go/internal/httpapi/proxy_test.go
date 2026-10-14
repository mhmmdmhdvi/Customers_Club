package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTrustedProxyCustomerBudgets(t *testing.T) {
	policy, err := ParseTrustedProxies("192.0.2.9,2001:db8::/64")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, peer string
		headers    []string
		wantIP     string
		status     int
	}{
		{"untrusted spoof", "192.0.2.8:80", []string{"203.0.113.1"}, "192.0.2.8", 200},
		{"customer one", "192.0.2.9:80", []string{"203.0.113.1"}, "203.0.113.1", 200},
		{"customer two", "192.0.2.9:80", []string{"203.0.113.2"}, "203.0.113.2", 200},
		{"ipv6", "[2001:db8::9]:80", []string{"2001:db8:1::2"}, "2001:db8:1:0:0:0:0:2", 200},
		{"chain refused", "192.0.2.9:80", []string{"203.0.113.1,203.0.113.2"}, "", 400},
		{"duplicate refused", "192.0.2.9:80", []string{"203.0.113.1", "203.0.113.2"}, "", 400},
		{"bad refused", "192.0.2.9:80", []string{"not-an-ip"}, "", 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			service := &fakeRequestCodeService{}
			handler := WithTrustedProxy(NewRouterWithDependencies(RouterDependencies{RequestCode: service}), policy)
			r := httptest.NewRequest(http.MethodPost, "/auth/request-code", strings.NewReader(`{"phone":"09121234567"}`))
			r.Header.Set("Content-Type", "application/json")
			r.RemoteAddr = tc.peer
			for _, v := range tc.headers {
				r.Header.Add("X-Real-IP", v)
			}
			r.Header.Set("X-Forwarded-For", "198.51.100.1")
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != tc.status || service.ip != tc.wantIP {
				t.Fatalf("status=%d IP=%q", w.Code, service.ip)
			}
			verify := &fakeVerifyCodeService{}
			handler = WithTrustedProxy(NewRouterWithDependencies(RouterDependencies{VerifyCode: verify}), policy)
			r.URL.Path = "/auth/verify-code"
			r.Body = io.NopCloser(strings.NewReader(`{"phone":"09121234567","code":"123456"}`))
			r.ContentLength = int64(len(`{"phone":"09121234567","code":"123456"}`))
			w = httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != tc.status || verify.ip != tc.wantIP {
				t.Fatalf("verify status=%d IP=%q", w.Code, verify.ip)
			}
		})
	}
}

func TestProxyConfigurationRejectsUnsafeOrMalformedTargets(t *testing.T) {
	for _, raw := range []string{"*", "0.0.0.0/0", "::/0", "hostname", "192.0.2.1,", "192.0.2.1/99"} {
		if _, err := ParseTrustedProxies(raw); err == nil {
			t.Errorf("accepted %q", raw)
		}
	}
	policy, err := ParseTrustedProxies("")
	if err != nil {
		t.Fatal(err)
	}
	var peer string
	h := WithTrustedProxy(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { peer = r.RemoteAddr }), policy)
	r := httptest.NewRequest("GET", "/health", nil)
	r.RemoteAddr = "192.0.2.9:80"
	r.Header.Set("X-Real-IP", "203.0.113.2")
	h.ServeHTTP(httptest.NewRecorder(), r)
	if peer != r.RemoteAddr {
		t.Fatal("default trusts headers")
	}
}
