package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/admin"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/contact"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/session"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

type adminFixture struct {
	Name, Method, Path, Scenario, Role, Text, ContentType string
	Body                                                  json.RawMessage
	Raw                                                   *string
	JSON                                                  json.RawMessage
	Status                                                int
	Validate, NoCSRF, RawRequest, RealService             bool
	Headers                                               map[string]string
	Runtime                                               map[string]contractExpected
}
type contactContract struct{ scenario string }

func (s contactContract) CreateMessage(_ context.Context, b map[string]any) error {
	_, e := contact.Parse(b)
	if e != nil {
		return e
	}
	if s.scenario == "quota" {
		return &session.Error{Status: 429, Message: "Too many contact messages"}
	}
	if s.scenario == "unexpected" {
		return errors.New("private dependency detail")
	}
	return nil
}

type adminAuth struct {
	sessionContract
	role string
}

func (s adminAuth) Authenticate(ctx context.Context, raw string) (session.Authentication, error) {
	a, e := s.sessionContract.Authenticate(ctx, raw)
	a.User.Role = s.role
	return a, e
}

type adminContract struct{ f adminFixture }

func (s adminContract) Overview(context.Context) (map[string]any, error) {
	return map[string]any{"members": map[string]int{"total": 0, "newLast7Days": 0}, "messages": map[string]int{"total": 0, "new": 0}, "sessions": map[string]int{"active": 0}}, nil
}
func (s adminContract) List(ctx context.Context, resource string, q url.Values) (map[string]any, error) {
	if s.f.Validate {
		return admin.New(nil).List(ctx, resource, q)
	}
	return map[string]any{"items": []any{}, "pagination": map[string]int{"page": 1, "pageSize": 20, "total": 0, "totalPages": 0}}, nil
}
func (s adminContract) Detail(ctx context.Context, resource, id string) (map[string]any, error) {
	if s.f.Validate {
		return admin.New(nil).Detail(ctx, resource, id)
	}
	if resource == "messages" && id == "1" {
		return map[string]any{"id": 1, "name": "Test", "phone": "09121234567", "email": nil, "subject": "SUPPORT", "message": "private body", "status": "NEW", "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-01T00:00:00.000Z"}, nil
	}
	message := map[string]string{"messages": "Contact message not found", "audit": "Audit event not found", "security": "Security event not found"}[resource]
	return nil, &session.Error{Status: 404, Message: message}
}
func (s adminContract) UpdateStatus(ctx context.Context, id string, status any, actor int64, requestID string) (map[string]any, error) {
	if s.f.Validate {
		return admin.New(nil).UpdateStatus(ctx, id, status, actor, requestID)
	}
	if s.f.Scenario == "transition" {
		return nil, &session.Error{Status: 409, Message: "Invalid contact message status transition"}
	}
	return map[string]any{"id": 1, "status": "READ", "updatedAt": "2026-01-01T00:00:00.000Z"}, nil
}
func TestSharedAdminContactHTTPContracts(t *testing.T) {
	raw, e := os.ReadFile("../../../contracts/admin-contact.json")
	if e != nil {
		t.Fatal(e)
	}
	var fixtures struct{ Cases []adminFixture }
	if e = json.Unmarshal(raw, &fixtures); e != nil {
		t.Fatal(e)
	}
	var real *admin.Service
	parentT := t
	for _, f := range fixtures.Cases {
		t.Run(f.Name, func(t *testing.T) {
			role := f.Role
			if role == "" {
				role = "ADMIN"
			}
			deps := RouterDependencies{Session: adminAuth{sessionContract{f.Scenario}, role}, Auth: authconfig.Config{AllowedOrigins: []string{"http://localhost:5173"}}, Admin: adminContract{f}, Contact: contactContract{f.Scenario}}
			if f.RealService {
				if os.Getenv("ALLOW_MIGRATION_TEST_DATABASE") != "1" || os.Getenv("MIGRATION_TEST_DATABASE_URL") == "" {
					t.Skip("real admin contracts require disposable database opt-in")
				}
				if real == nil {
					p := testdb.Open(parentT)
					if _, e := p.Exec(context.Background(), `INSERT INTO "User" (phone,"createdAt","updatedAt") VALUES ('09121234567','2026-01-01','2026-01-01')`); e != nil {
						t.Fatal(e)
					}
					real = admin.New(p)
				}
				deps.Admin = real
			}
			srv := httptest.NewServer(WithBrowserPolicy(NewRouterWithDependencies(deps), deps.Auth))
			defer srv.Close()
			body := string(f.Body)
			if f.Raw != nil {
				body = *f.Raw
			}
			requestURL := srv.URL + f.Path
			if f.RawRequest {
				requestURL = srv.URL
			}
			r, e := http.NewRequest(f.Method, requestURL, strings.NewReader(body))
			if e != nil {
				t.Fatal(e)
			}
			if role != "anonymous" {
				r.Header.Set("Authorization", "Bearer a.b.c")
			}
			if !f.NoCSRF {
				r.Header.Set("X-CSRF-Protection", "1")
			}
			if body != "" {
				r.Header.Set("Content-Type", "application/json")
			}
			if f.ContentType != "" {
				r.Header.Set("Content-Type", f.ContentType)
			}
			for k, v := range f.Headers {
				r.Header.Set(k, v)
			}
			var res *http.Response
			if f.RawRequest {
				u, _ := url.Parse(srv.URL)
				conn, err := net.Dial("tcp", u.Host)
				if err != nil {
					t.Fatal(err)
				}
				defer conn.Close()
				_, err = fmt.Fprintf(conn, "%s %s HTTP/1.1\r\nHost: %s\r\nAuthorization: Bearer a.b.c\r\nConnection: close\r\n\r\n", f.Method, f.Path, u.Host)
				if err != nil {
					t.Fatal(err)
				}
				res, e = http.ReadResponse(bufio.NewReader(conn), r)
			} else {
				res, e = srv.Client().Do(r)
			}
			if e != nil {
				t.Fatal(e)
			}
			defer res.Body.Close()
			out, _ := io.ReadAll(res.Body)
			if res.StatusCode != f.Status {
				t.Fatalf("%d want %d: %s", res.StatusCode, f.Status, out)
			}
			expected := f.JSON
			if len(f.Runtime["go"].JSON) > 0 {
				expected = f.Runtime["go"].JSON
			}
			if len(expected) > 0 {
				var got, want any
				if e = json.Unmarshal(out, &got); e != nil {
					t.Fatal(e)
				}
				_ = json.Unmarshal(expected, &want)
				if !reflect.DeepEqual(got, want) {
					t.Fatalf("%s want %s", out, expected)
				}
			}
			if f.Text != "" && string(out) != f.Text {
				t.Fatal(string(out))
			}
			if f.RawRequest {
				if res.Header.Get("Cache-Control") != "" {
					t.Fatal("native parser boundary cache header")
				}
			} else if res.Header.Get("Cache-Control") != "no-store" {
				t.Fatal("no-store missing")
			}
		})
	}
}
