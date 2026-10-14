package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/accesstoken"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/session"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
)

type sessionContract struct{ scenario string }

func (s sessionContract) grant() (session.Grant, error) {
	switch s.scenario {
	case "duplicate":
		return session.Grant{}, &session.Error{Status: 409, Message: "Phone already registered"}
	case "register-invalid":
		return session.Grant{}, &session.Error{Status: 400, Message: "Invalid or expired verification"}
	case "login-invalid":
		return session.Grant{}, &session.Error{Status: 401, Message: "Invalid or expired verification"}
	case "invalid":
		return session.Grant{}, session.ErrUnauthorized
	case "unexpected":
		return session.Grant{}, errors.New("private database/token detail")
	case "challenge":
		return session.Grant{MFARequired: true, MFAChallengeToken: strings.Repeat("c", 64), MFAExpiresAt: time.Date(2030, 1, 1, 0, 5, 0, 0, time.UTC)}, nil
	}
	return session.Grant{User: session.User{ID: 1, Phone: "09121234567", Role: "MEMBER", CreatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), UpdatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}, IssueResult: accesstoken.IssueResult{AccessToken: "a.b.c", ExpiresIn: 900, AccessExpiresAt: "2030-01-01T00:15:00.000Z"}, RefreshToken: strings.Repeat("b", 64), RefreshExpiresAt: time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)}, nil
}
func (s sessionContract) Register(context.Context, map[string]any) (session.Grant, error) {
	return s.grant()
}
func (s sessionContract) Login(context.Context, map[string]any) (session.Grant, error) {
	return s.grant()
}
func (s sessionContract) CompleteMFA(context.Context, map[string]any) (session.Grant, error) {
	return s.grant()
}
func (s sessionContract) Refresh(context.Context, string) (session.Grant, error) { return s.grant() }
func (s sessionContract) Logout(context.Context, string) error                   { return nil }
func (s sessionContract) Authenticate(context.Context, string) (session.Authentication, error) {
	g, e := s.grant()
	return session.Authentication{User: g.User, SessionID: "session"}, e
}
func TestSharedSessionHTTPContracts(t *testing.T) {
	raw, e := os.ReadFile("../../../contracts/sessions.json")
	if e != nil {
		t.Fatal(e)
	}
	var fixture struct {
		Cases []struct {
			Name, Method, Path, Scenario, Message                          string
			Body                                                           json.RawMessage
			Raw                                                            *string
			ContentType                                                    string
			Headers                                                        map[string]string
			Status                                                         int
			JSON                                                           json.RawMessage
			Empty, Grant, Me, ClearCookie, Production, NoCSRF, RealService bool
			LargeCookie, LargeAuthorization                                int
			Runtime                                                        map[string]contractExpected
		}
	}
	if e = json.Unmarshal(raw, &fixture); e != nil {
		t.Fatal(e)
	}
	wantUser := map[string]any{"id": float64(1), "phone": "09121234567", "firstName": nil, "lastName": nil, "role": "MEMBER", "birthYear": nil, "birthMonth": nil, "birthDay": nil, "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-01T00:00:00.000Z"}
	var real *session.Service
	parentT := t
	for _, f := range fixture.Cases {
		t.Run(f.Name, func(t *testing.T) {
			auth := authconfig.Config{AllowedOrigins: []string{"http://localhost:5173"}, Cookie: authconfig.CookieConfig{Name: "club_refresh"}}
			if f.Production {
				auth.Cookie.Name = "__Host-club_refresh"
				auth.Cookie.Secure = true
			}
			var service SessionService = sessionContract{f.Scenario}
			if f.RealService {
				if real == nil {
					if os.Getenv("ALLOW_MIGRATION_TEST_DATABASE") != "1" || os.Getenv("MIGRATION_TEST_DATABASE_URL") == "" {
						t.Skip("real service contracts require disposable database opt-in")
					}
					auth.Secret = []byte(strings.Repeat("s", 32))
					auth.Issuer = "test"
					auth.Audience = "web"
					auth.AccessTTLSeconds = 900
					var err error
					real, err = session.New(testdb.Open(parentT), auth, []byte(strings.Repeat("m", 32)))
					if err != nil {
						t.Fatal(err)
					}
				}
				service = real
			}
			server := httptest.NewServer(WithBrowserPolicy(NewRouterWithDependencies(RouterDependencies{Session: service, Auth: auth}), auth))
			defer server.Close()
			body := string(f.Body)
			if f.Raw != nil {
				body = *f.Raw
			}
			req, _ := http.NewRequest(f.Method, server.URL+f.Path, strings.NewReader(body))
			if body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			if f.ContentType != "" {
				req.Header.Set("Content-Type", f.ContentType)
			}
			if !f.NoCSRF {
				req.Header.Set("X-CSRF-Protection", "1")
			}
			for k, v := range f.Headers {
				req.Header.Set(k, v)
			}
			if f.LargeCookie > 0 {
				req.Header.Set("Cookie", strings.Repeat("x", f.LargeCookie))
			}
			if f.LargeAuthorization > 0 {
				req.Header.Set("Authorization", "Bearer "+strings.Repeat("a", f.LargeAuthorization-11)+".b.c")
			}
			res, e := server.Client().Do(req)
			if e != nil {
				t.Fatal(e)
			}
			defer res.Body.Close()
			out, _ := io.ReadAll(res.Body)
			if res.StatusCode != f.Status {
				t.Fatalf("status %d want %d: %s", res.StatusCode, f.Status, out)
			}
			if res.Header.Get("Cache-Control") != "no-store" {
				t.Fatal("cache")
			}
			var actual any
			if len(out) > 0 {
				_ = json.Unmarshal(out, &actual)
			}
			expected := f.JSON
			if v := f.Runtime["go"]; len(v.JSON) > 0 {
				expected = v.JSON
			}
			if len(expected) > 0 {
				var want any
				json.Unmarshal(expected, &want)
				if !reflect.DeepEqual(actual, want) {
					t.Errorf("json %s want %s", out, expected)
				}
			}
			if f.Empty && len(out) != 0 {
				t.Fatal("body must be empty")
			}
			if f.Me {
				if !reflect.DeepEqual(actual, map[string]any{"user": wantUser}) {
					t.Fatalf("me %s", out)
				}
			}
			if f.Grant {
				want := map[string]any{"message": f.Message, "authenticated": true, "user": wantUser, "tokenType": "Bearer", "accessToken": "a.b.c", "expiresIn": float64(900), "accessExpiresAt": "2030-01-01T00:15:00.000Z"}
				if !reflect.DeepEqual(actual, want) {
					t.Fatalf("grant %s", out)
				}
				cookies := res.Cookies()
				if len(cookies) != 1 || cookies[0].Name != auth.Cookie.Name || cookies[0].Value != strings.Repeat("b", 64) || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode || cookies[0].Path != "/" || cookies[0].Secure != f.Production {
					t.Fatal("grant cookie")
				}
			}
			if f.ClearCookie {
				cookies := res.Cookies()
				if len(cookies) != 1 || cookies[0].Value != "" || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
					t.Fatal("clear cookie")
				}
			}
		})
	}
}
