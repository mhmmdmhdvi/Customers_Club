package httpapi

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otp"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

type contractExpected struct {
	JSON         json.RawMessage `json:"json"`
	ContentType  string          `json:"contentType"`
	BodyContains string          `json:"bodyContains"`
}
type contractFixture struct {
	Name               string                      `json:"name"`
	Method             string                      `json:"method"`
	Path               string                      `json:"path"`
	Body               json.RawMessage             `json:"body"`
	RawBody            *string                     `json:"rawBody"`
	RawBodyHex         *string                     `json:"rawBodyHex"`
	RequestContentType *string                     `json:"requestContentType"`
	Oversized          bool                        `json:"oversized"`
	Scenario           string                      `json:"scenario"`
	Status             int                         `json:"status"`
	JSON               json.RawMessage             `json:"json"`
	Empty              bool                        `json:"empty"`
	RequestHeaders     map[string]string           `json:"requestHeaders"`
	Headers            map[string]string           `json:"headers"`
	AbsentHeaders      []string                    `json:"absentHeaders"`
	Calls              []contractCall              `json:"calls"`
	Runtime            map[string]contractExpected `json:"runtime"`
}
type contractCall struct {
	Operation string `json:"operation"`
	Phone     string `json:"phone"`
	Code      string `json:"code,omitempty"`
}
type contractService struct {
	t        *testing.T
	scenario string
	calls    []contractCall
}

func (s *contractService) record(operation, phone, code, ip string) error {
	s.t.Helper()
	if ip != "127.0.0.1" && ip != "::1" {
		s.t.Errorf("socket peer expected, got %q", ip)
	}
	s.calls = append(s.calls, contractCall{Operation: operation, Phone: phone, Code: code})
	switch s.scenario {
	case "invalid":
		return otpdb.ErrInvalidOTP
	case "expired":
		return otpdb.ErrOTPExpired
	case "limited":
		return &otpdb.RateLimitError{RetryAfter: 17}
	case "unavailable":
		return otp.ErrUnavailable
	case "unexpected":
		return errors.New("private dependency detail")
	}
	return nil
}
func (s *contractService) Create(_ context.Context, phone, ip string) error {
	return s.record("create", phone, "", ip)
}
func (s *contractService) VerifyPhone(_ context.Context, phone, code, ip string) (VerifyCodeResult, error) {
	err := s.record("verify", phone, code, ip)
	step := "REGISTER"
	if s.scenario == "login" {
		step = "LOGIN"
	}
	return VerifyCodeResult{NextStep: step, VerificationToken: strings.Repeat("c", 64), VerificationExpiresAt: "2030-01-01T00:05:00.000Z"}, err
}

func TestSharedHTTPContracts(t *testing.T) {
	data, err := os.ReadFile("../../../contracts/http.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures struct {
		Version         int               `json:"version"`
		SecurityHeaders map[string]string `json:"securityHeaders"`
		Cases           []contractFixture `json:"cases"`
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	if fixtures.Version != 1 || len(fixtures.Cases) == 0 {
		t.Fatal("missing contract fixtures")
	}
	for _, fixture := range fixtures.Cases {
		t.Run(fixture.Name, func(t *testing.T) {
			service := &contractService{t: t, scenario: fixture.Scenario, calls: []contractCall{}}
			server := httptest.NewServer(WithBrowserPolicy(NewRouterWithDependencies(RouterDependencies{RequestCode: service, VerifyCode: service}), authconfig.Config{AllowedOrigins: []string{"http://localhost:5173"}}))
			defer server.Close()
			body := string(fixture.Body)
			if fixture.RawBody != nil {
				body = *fixture.RawBody
			}
			if fixture.RawBodyHex != nil {
				raw, err := hex.DecodeString(*fixture.RawBodyHex)
				if err != nil {
					t.Fatal(err)
				}
				body = string(raw)
			}
			if fixture.Oversized {
				body = `{"phone":"09121234567","padding":"` + strings.Repeat("x", 100*1024) + `"}`
			}
			req, err := http.NewRequest(fixture.Method, server.URL+fixture.Path, strings.NewReader(body))
			if err != nil {
				t.Fatal(err)
			}
			if body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			if fixture.RequestContentType != nil {
				req.Header.Set("Content-Type", *fixture.RequestContentType)
			}
			req.Header.Set("X-Forwarded-For", "203.0.113.99")
			req.Header.Set("X-Request-Id", "client-controlled")
			for k, v := range fixture.RequestHeaders {
				req.Header.Set(k, v)
			}
			client := server.Client()
			client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
			res, err := client.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			raw, err := io.ReadAll(res.Body)
			if err != nil {
				t.Fatal(err)
			}
			if res.StatusCode != fixture.Status {
				t.Errorf("status %d want %d: %s", res.StatusCode, fixture.Status, raw)
			}
			expected := fixture.Runtime["go"]
			expectedJSON := fixture.JSON
			if len(expected.JSON) > 0 {
				expectedJSON = expected.JSON
			}
			if len(expectedJSON) > 0 {
				var actual, want any
				if err := json.Unmarshal(raw, &actual); err != nil {
					t.Fatal(err)
				}
				if err := json.Unmarshal(expectedJSON, &want); err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(actual, want) {
					t.Errorf("JSON %s want %s", raw, expectedJSON)
				}
				if !strings.HasPrefix(res.Header.Get("Content-Type"), "application/json") {
					t.Error("JSON content type missing")
				}
			}
			if expected.ContentType != "" && !strings.HasPrefix(res.Header.Get("Content-Type"), expected.ContentType) {
				t.Errorf("content type %q", res.Header.Get("Content-Type"))
			}
			if expected.BodyContains != "" && !strings.Contains(string(raw), expected.BodyContains) {
				t.Errorf("body %q", raw)
			}
			if fixture.Empty && len(raw) != 0 {
				t.Error("body must be empty")
			}
			for k, v := range fixtures.SecurityHeaders {
				if res.Header.Get(k) != v {
					t.Errorf("%s %q want %q", k, res.Header.Get(k), v)
				}
			}
			for k, v := range fixture.Headers {
				if res.Header.Get(k) != v {
					t.Errorf("%s %q want %q", k, res.Header.Get(k), v)
				}
			}
			for _, k := range fixture.AbsentHeaders {
				if res.Header.Get(k) != "" {
					t.Errorf("unexpected %s: %q", k, res.Header.Get(k))
				}
			}
			if !regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`).MatchString(res.Header.Get("X-Request-Id")) {
				t.Error("missing server UUID request ID")
			}
			if res.Header.Get("X-Powered-By") != "" {
				t.Error("framework header leaked")
			}
			if fixture.Calls != nil && !reflect.DeepEqual(service.calls, fixture.Calls) {
				t.Errorf("calls %+v want %+v", service.calls, fixture.Calls)
			}
		})
	}
}
