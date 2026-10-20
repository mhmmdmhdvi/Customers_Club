package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/adminmfa"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/database"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

func TestInitializedAPIRealSessionAndMFALifecycle(t *testing.T) {
	p := testdb.Open(t)
	config, e := readStartupConfig(boundaryEnvironment())
	if e != nil {
		t.Fatal(e)
	}
	handler, cleanup, e := initializeAPI(context.Background(), config, func(context.Context, database.Config) (*pgxpool.Pool, error) { return p, nil }, &http.Client{})
	if e != nil {
		t.Fatal(e)
	}
	defer cleanup()
	srv := httptest.NewServer(handler)
	defer srv.Close()
	proof := func(token, purpose string) {
		t.Helper()
		hash := sha256.Sum256([]byte(token))
		_, e := p.Exec(context.Background(), `INSERT INTO "PhoneVerification" (phone,"tokenHash",purpose,"expiresAt") VALUES ('09121234567',$1,$2,$3)`, hex.EncodeToString(hash[:]), purpose, time.Now().UTC().Add(5*time.Minute))
		if e != nil {
			t.Fatal(e)
		}
	}
	request := func(method, path, body, cookie, bearer string) (int, map[string]any, string) {
		t.Helper()
		r, _ := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Protection", "1")
		r.Header.Set("Origin", "http://localhost:5173")
		if cookie != "" {
			r.Header.Set("Cookie", cookie)
		}
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		res, e := srv.Client().Do(r)
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
		if res.Header.Get("Cache-Control") != "no-store" || res.Header.Get("Access-Control-Allow-Credentials") != "true" {
			t.Fatal("production browser/cache headers")
		}
		cookieOut := ""
		if cookies := res.Cookies(); len(cookies) > 0 {
			cookieOut = cookies[0].Name + "=" + cookies[0].Value
		}
		return res.StatusCode, v, cookieOut
	}
	token := strings.Repeat("a", 64)
	proof(token, "REGISTER")
	status, v, cookie := request("POST", "/auth/register", `{"verificationToken":"`+token+`","firstName":"Test","lastName":"Name","birthYear":1370,"birthMonth":1,"birthDay":1}`, "", "")
	if status != 201 {
		t.Fatal("register", status, v)
	}
	status, v, rotated := request("POST", "/auth/refresh", "{}", cookie, "")
	if status != 200 {
		t.Fatal("refresh", status, v)
	}
	access := v["accessToken"].(string)
	status, _, _ = request("GET", "/auth/me", "", "", access)
	if status != 200 {
		t.Fatal("me", status)
	}
	status, _, _ = request("POST", "/auth/logout", "{}", rotated, "")
	if status != 204 {
		t.Fatal("logout", status)
	}
	status, _, _ = request("GET", "/auth/me", "", "", access)
	if status != 401 {
		t.Fatal("logout live check", status)
	}
	uid := v["user"].(map[string]any)["id"].(float64)
	_, e = p.Exec(context.Background(), `UPDATE "User" SET role='ADMIN' WHERE id=$1`, int64(uid))
	if e != nil {
		t.Fatal(e)
	}
	crypto, e := adminmfa.New(config.MFAKey)
	if e != nil {
		t.Fatal(e)
	}
	secret := "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	enc, e := crypto.Encrypt(secret)
	if e != nil {
		t.Fatal(e)
	}
	_, e = p.Exec(context.Background(), `INSERT INTO "AdminMfaCredential" ("userId","secretCiphertext","secretIv","secretTag","updatedAt") VALUES ($1,$2,$3,$4,$5)`, int64(uid), enc.Ciphertext, enc.IV, enc.Tag, time.Now().UTC())
	if e != nil {
		t.Fatal(e)
	}
	token = strings.Repeat("b", 64)
	proof(token, "LOGIN")
	status, v, cookie = request("POST", "/auth/login", `{"verificationToken":"`+token+`"}`, "", "")
	if status != 200 || v["mfaRequired"] != true || cookie != "" {
		t.Fatal("challenge", status, v)
	}
	challenge := v["mfaChallengeToken"].(string)
	code, e := adminmfa.Generate(secret, time.Now().UTC())
	if e != nil {
		t.Fatal(e)
	}
	status, v, cookie = request("POST", "/auth/login/mfa", `{"mfaChallengeToken":"`+challenge+`","code":"`+code+`","extra":true}`, "", "")
	if status != 200 || v["user"].(map[string]any)["role"] != "ADMIN" || cookie == "" {
		t.Fatal("MFA grant", status, v)
	}
	access = v["accessToken"].(string)
	status, _, _ = request("GET", "/auth/me", "", "", access)
	if status != 200 {
		t.Fatal("admin me", status)
	}
	status, _, _ = request("POST", "/auth/login/mfa", `{"mfaChallengeToken":"`+challenge+`","code":"`+code+`"}`, "", "")
	if status != 401 {
		t.Fatal("MFA replay", status)
	}
	// Stage5: all nine admin routes and public contact are exercised through
	// initializeAPI's actual database services and production browser wrapper.
	contactBody := `{"name":"Legacy contact","phone":"+98 912-1234567","email":null,"subject":"SUPPORT","message":"private fixture body"}`
	for i := 0; i < 4; i++ {
		status, v, _ = request("POST", "/contact/messages", contactBody, "", "")
		want := 201
		if i == 3 {
			want = 429
		}
		if status != want {
			t.Fatal("contact quota", status, v)
		}
	}
	for _, path := range []string{"/admin/overview", "/admin/users", "/admin/messages", "/admin/audit", "/admin/security"} {
		status, v, _ = request("GET", path, "", "", access)
		if status != 200 {
			t.Fatal(path, status, v)
		}
	}
	status, v, _ = request("GET", "/admin/messages/1", "", "", access)
	if status != 200 || v["email"] != nil || v["message"] != "private fixture body" {
		t.Fatal("detail DTO", status, v)
	}
	status, v, _ = request("PATCH", "/admin/messages/1/status", `{"status":"READ","actorUserId":999,"requestId":"client-id","extra":true}`, "", access)
	if status != 200 || v["status"] != "READ" {
		t.Fatal("status transition", status, v)
	}
	status, v, _ = request("GET", "/admin/audit/1", "", "", access)
	if status != 200 || v["actorUserId"] != uid || v["requestId"] == "client-id" || v["requestId"] == nil || v["details"].(map[string]any)["fromStatus"] != "NEW" {
		t.Fatal("trusted atomic audit", status, v)
	}
	status, v, _ = request("GET", "/admin/security?eventType=ADMIN_LOGIN", "", "", access)
	if status != 200 || v["pagination"].(map[string]any)["total"] != float64(1) {
		t.Fatal("admin login event", status, v)
	}
	status, v, _ = request("GET", "/admin/security/1", "", "", access)
	if status != 200 || v["eventType"] != "AUTHENTICATION_REJECTED" || v["route"] != "/auth/me" {
		t.Fatal("security detail", status, v)
	}
	if _, e = p.Exec(context.Background(), `ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT stage5_audit_failure CHECK (action <> 'CONTACT_MESSAGE_STATUS_CHANGED') NOT VALID`); e != nil {
		t.Fatal(e)
	}
	status, v, _ = request("PATCH", "/admin/messages/1/status", `{"status":"RESOLVED"}`, "", access)
	if status != 500 {
		t.Fatal("required audit error", status, v)
	}
	status, v, _ = request("GET", "/admin/messages/1", "", "", access)
	if status != 200 || v["status"] != "READ" {
		t.Fatal("HTTP audit rollback", status, v)
	}
	if _, e = p.Exec(context.Background(), `ALTER TABLE "AdminAuditEvent" DROP CONSTRAINT stage5_audit_failure`); e != nil {
		t.Fatal(e)
	}
	status, v, _ = request("PATCH", "/admin/messages/1/status", `{"status":"RESOLVED"}`, "", access)
	if status != 200 {
		t.Fatal("resolve", status, v)
	}
	if _, e = p.Exec(context.Background(), `UPDATE "User" SET role='MEMBER' WHERE id=$1`, int64(uid)); e != nil {
		t.Fatal(e)
	}
	status, v, _ = request("GET", "/admin/unknown", "", "", access)
	if status != 403 {
		t.Fatal("live ADMIN role", status, v)
	}
	var rejected int
	if e = p.QueryRow(context.Background(), `SELECT count(*) FROM "SecurityEvent" WHERE "eventType"='AUTHORIZATION_REJECTED' AND "actorUserId"=$1 AND route='/admin/unknown' AND "statusCode"=403`, int64(uid)).Scan(&rejected); e != nil || rejected != 1 {
		t.Fatal("authorization security event", rejected, e)
	}
}
