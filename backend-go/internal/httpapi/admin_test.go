package httpapi

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/contact"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/events"
)

type contactValidation struct{}

func (contactValidation) CreateMessage(_ context.Context, b map[string]any) error {
	_, e := contact.Parse(b)
	return e
}

type securityCapture struct{ values []events.Security }

func (s *securityCapture) Record(_ context.Context, v events.Security) error {
	s.values = append(s.values, v)
	return nil
}
func TestAdminPrefixAuthorizesBeforeRouteAndMethodSelection(t *testing.T) {
	for _, path := range []string{"/admin", "/admin/unknown", "/ADMIN/users/", "/admin/messages/1/status"} {
		for _, method := range []string{"GET", "POST", "OPTIONS"} {
			req := httptest.NewRequest(method, path, nil)
			w := httptest.NewRecorder()
			NewRouterWithDependencies(RouterDependencies{Session: sessionContract{}}).ServeHTTP(w, req)
			if w.Code != 401 || w.Header().Get("Cache-Control") != "no-store" {
				t.Errorf("%s %s status=%d", method, path, w.Code)
			}
			req = httptest.NewRequest(method, path, nil)
			req.Header.Set("Authorization", "Bearer a.b.c")
			w = httptest.NewRecorder()
			NewRouterWithDependencies(RouterDependencies{Session: sessionContract{}}).ServeHTTP(w, req)
			if w.Code != 403 {
				t.Errorf("member %s %s status=%d", method, path, w.Code)
			}
		}
	}
}
func TestPublicContactRouteAndGuardEvents(t *testing.T) {
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/CONTACT/messages/", strings.NewReader(`{"name":"x"}`))
	r.Header.Set("Content-Type", "application/json")
	NewRouterWithDependencies(RouterDependencies{Contact: contactValidation{}}).ServeHTTP(w, r)
	if w.Code != 400 || !strings.Contains(w.Body.String(), "Invalid phone number") {
		t.Fatal(w.Code, w.Body.String())
	}
	recorder := &securityCapture{}
	r = httptest.NewRequest("POST", "/auth/login", strings.NewReader(`{}`))
	r.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	NewRouterWithDependencies(RouterDependencies{Session: sessionContract{}, Auth: authconfig.Config{}, Events: recorder}).ServeHTTP(w, r)
	if len(recorder.values) != 1 || recorder.values[0].EventType != "CSRF_REJECTED" || recorder.values[0].Route != "/auth/login" || recorder.values[0].RequestID == "" {
		t.Fatal(recorder.values)
	}
}
func TestSessionGuardAndAuthorizationEventDetails(t *testing.T) {
	for _, c := range []struct {
		path, method, authorization, origin, contentType, event, reason string
		csrf                                                            bool
		actor                                                           bool
	}{{"/auth/me", "GET", "", "", "", "AUTHENTICATION_REJECTED", "INVALID_AUTHORIZATION_HEADER", false, false}, {"/auth/me", "GET", "Bearer a.b.c", "", "", "AUTHENTICATION_REJECTED", "INVALID_OR_EXPIRED_SESSION", false, false}, {"/admin/unknown", "POST", "Bearer a.b.c", "", "", "AUTHORIZATION_REJECTED", "", false, true}, {"/auth/login", "POST", "", "http://untrusted.test", "application/json", "ORIGIN_REJECTED", "UNTRUSTED_ORIGIN", true, false}, {"/auth/login", "POST", "", "", "text/plain", "CONTENT_TYPE_REJECTED", "NON_JSON_REQUEST", true, false}} {
		s := &securityCapture{}
		scenario := ""
		if c.reason == "INVALID_OR_EXPIRED_SESSION" {
			scenario = "invalid"
		}
		r := httptest.NewRequest(c.method, c.path, strings.NewReader(`{}`))
		if c.authorization != "" {
			r.Header.Set("Authorization", c.authorization)
		}
		if c.origin != "" {
			r.Header.Set("Origin", c.origin)
		}
		if c.contentType != "" {
			r.Header.Set("Content-Type", c.contentType)
		}
		if c.csrf {
			r.Header.Set("X-CSRF-Protection", "1")
		}
		w := httptest.NewRecorder()
		NewRouterWithDependencies(RouterDependencies{Session: sessionContract{scenario}, Events: s}).ServeHTTP(w, r)
		if len(s.values) != 1 {
			t.Fatal(c, s.values)
		}
		v := s.values[0]
		if v.EventType != c.event || v.Outcome != "FAILURE" || v.Route != c.path || v.StatusCode != w.Code || (v.ActorUserID != nil) != c.actor {
			t.Fatal(c, v)
		}
		if c.reason != "" && v.Details["reason"] != c.reason {
			t.Fatal(v)
		}
	}
}
