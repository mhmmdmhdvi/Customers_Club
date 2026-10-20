package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/session"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSessionHTTPDatabaseLifecycle(t *testing.T) {
	p := testdb.Open(t)
	auth := authconfig.Config{Secret: []byte(strings.Repeat("s", 32)), Issuer: "test", Audience: "web", AccessTTLSeconds: 900, AllowedOrigins: []string{"http://localhost:5173"}, Cookie: authconfig.CookieConfig{Name: "club_refresh"}}
	s, e := session.New(p, auth, []byte(strings.Repeat("m", 32)))
	if e != nil {
		t.Fatal(e)
	}
	srv := httptest.NewServer(NewRouterWithDependencies(RouterDependencies{Session: s, Auth: auth}))
	defer srv.Close()
	request := func(method, path, body, cookie, bearer string) (int, map[string]any, []*http.Cookie) {
		t.Helper()
		req, _ := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Protection", "1")
		if cookie != "" {
			req.Header.Set("Cookie", cookie)
		}
		if bearer != "" {
			req.Header.Set("Authorization", bearer)
		}
		res, e := srv.Client().Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(res.Body)
		var v map[string]any
		if len(raw) > 0 {
			if e = json.Unmarshal(raw, &v); e != nil {
				t.Fatal(e)
			}
		}
		if res.Header.Get("Cache-Control") != "no-store" {
			t.Fatal("cache")
		}
		if _, ok := v["refreshToken"]; ok {
			t.Fatal("refresh credential leaked")
		}
		return res.StatusCode, v, res.Cookies()
	}
	token := strings.Repeat("a", 64)
	hash := sha256.Sum256([]byte(token))
	_, e = p.Exec(context.Background(), `INSERT INTO "PhoneVerification" (phone,"tokenHash",purpose,"expiresAt") VALUES ('09121234567',$1,'REGISTER',$2)`, hex.EncodeToString(hash[:]), time.Now().UTC().Add(5*time.Minute))
	if e != nil {
		t.Fatal(e)
	}
	status, v, cookies := request("POST", "/auth/register", `{"verificationToken":"`+token+`","firstName":"Test","lastName":"Name","birthYear":1370,"birthMonth":1,"birthDay":1}`, "", "")
	if status != 201 || len(cookies) != 1 {
		t.Fatalf("register %d %+v", status, v)
	}
	c := cookies[0]
	if !c.HttpOnly || c.Path != "/" || c.SameSite != http.SameSiteStrictMode || c.MaxAge < 600000 {
		t.Fatal("cookie flags")
	}
	access := v["accessToken"].(string)
	status, v, _ = request("GET", "/auth/me", "", "", "Bearer "+access)
	if status != 200 || v["user"] == nil {
		t.Fatal("me", status)
	}
	status, v, rotated := request("POST", "/auth/refresh", "{}", c.Name+"="+c.Value, "")
	if status != 200 || len(rotated) != 1 {
		t.Fatal("refresh", status, v)
	}
	status, _, _ = request("POST", "/auth/logout", "{}", c.Name+"="+c.Value, "")
	if status != 204 {
		t.Fatal("logout", status)
	}
	status, _, _ = request("GET", "/auth/me", "", "", "Bearer "+access)
	if status != 401 {
		t.Fatal("revoked", status)
	}
	status, _, clear := request("POST", "/auth/refresh", "{}", rotated[0].Name+"="+rotated[0].Value, "")
	if status != 401 || len(clear) != 1 || clear[0].Value != "" {
		t.Fatal("clear", status)
	}
	status, _, _ = request("POST", "/auth/login", `{"verificationToken":"invalid"}`, "", "")
	if status != 401 {
		t.Fatal("login", status)
	}
	status, _, _ = request("POST", "/auth/login/mfa", `{"code":"123456"}`, "", "")
	if status != 401 {
		t.Fatal("mfa", status)
	}
}
func TestStrictRefreshCookie(t *testing.T) {
	for _, raw := range []string{"club_refresh=" + strings.Repeat("a", 64) + "; club_refresh=" + strings.Repeat("a", 64), "club_refresh=%61" + strings.Repeat("a", 63), "club_refresh=" + strings.Repeat("A", 64), strings.Repeat("x", 8193)} {
		r := httptest.NewRequest("POST", "/", nil)
		r.Header.Set("Cookie", raw)
		if _, e := readRefreshCookie(r, "club_refresh"); e == nil {
			t.Fatal("unsafe cookie accepted")
		}
	}
}

func TestRoleUsesLiveAuthentication(t *testing.T) {
	if e := RequireRole(session.Authentication{User: session.User{ID: 1, Role: "MEMBER"}}, "ADMIN"); e == nil {
		t.Fatal("member granted admin")
	}
	if e := RequireRole(session.Authentication{User: session.User{ID: 1, Role: "ADMIN"}}, "ADMIN"); e != nil {
		t.Fatal(e)
	}
	if e := RequireRole(session.Authentication{}, "ADMIN"); e == nil {
		t.Fatal("anonymous granted admin")
	}
}
