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
}
