package accesstoken

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSessionID = "122a8f89-1f56-4b08-85a7-384fb07d61e8"

func signTestToken(
	t *testing.T,
	secret []byte,
	claims jwt.MapClaims,
	method jwt.SigningMethod,
) string {
	t.Helper()
	token := jwt.NewWithClaims(
		method,
		claims,
	)
	token.Header["typ"] = "JWT"
	signed, err :=
		token.SignedString(secret)

	if err != nil {
		t.Fatalf(
			"sign test token: %v",
			err,
		)
	}
	return signed
}
func TestIssueCreatesMinimalAccessToken(t *testing.T) {
	secret := []byte(
		"12345678901234567890123456789012",
	)

	tokens, err := New(Config{
		Secret:           secret,
		Issuer:           "test-api",
		Audience:         "test-web",
		AccessTTLSeconds: 900,
		Now: func() time.Time {
			return time.Unix(1000, 0)
		},
	})

	if err != nil {
		t.Fatalf(
			"create token service: %v",
			err,
		)
	}

	result, err := tokens.Issue(
		1,
		testSessionID,
		time.Unix(2000, 0),
	)

	if err != nil {
		t.Fatalf(
			"issue access token: %v",
			err,
		)
	}

	if result.ExpiresIn != 900 {
		t.Fatalf(
			"expected expiresIn 900, got %d",
			result.ExpiresIn,
		)
	}

	parts := strings.Split(
		result.AccessToken,
		".",
	)

	if len(parts) != 3 {
		t.Fatalf(
			"expected JWT with 3 parts, got %d",
			len(parts),
		)
	}

	payloadBytes, err :=
		base64.RawURLEncoding.DecodeString(
			parts[1],
		)

	if err != nil {
		t.Fatalf(
			"decode JWT payload: %v",
			err,
		)
	}

	var payload map[string]any

	if err := json.Unmarshal(
		payloadBytes,
		&payload,
	); err != nil {
		t.Fatalf(
			"decode JWT JSON: %v",
			err,
		)
	}

	if payload["tokenUse"] != "access" {
		t.Errorf(
			"expected tokenUse access, got %v",
			payload["tokenUse"],
		)
	}

	if payload["sid"] != testSessionID {
		t.Errorf(
			"expected sid %q, got %v",
			testSessionID,
			payload["sid"],
		)
	}

	if payload["sub"] != "1" {
		t.Errorf(
			"expected subject 1, got %v",
			payload["sub"],
		)
	}

	for _, forbidden := range []string{
		"phone",
		"role",
		"firstName",
		"lastName",
	} {
		if _, exists := payload[forbidden]; exists {
			t.Errorf(
				"JWT must not contain %q",
				forbidden,
			)
		}
	}
}

func TestVerifyAcceptsIssuedAccessToken(t *testing.T) {
	secret := []byte(
		"12345678901234567890123456789012",
	)

	now := time.Unix(1000, 0)

	tokens, err := New(Config{
		Secret:           secret,
		Issuer:           "test-api",
		Audience:         "test-web",
		AccessTTLSeconds: 900,
		Now: func() time.Time {
			return now
		},
	})

	if err != nil {
		t.Fatalf(
			"create token service: %v",
			err,
		)
	}

	issued, err := tokens.Issue(
		1,
		testSessionID,
		time.Unix(2000, 0),
	)

	if err != nil {
		t.Fatalf(
			"issue access token: %v",
			err,
		)
	}

	claims, err :=
		tokens.Verify(
			issued.AccessToken,
		)

	if err != nil {
		t.Fatalf(
			"verify access token: %v",
			err,
		)
	}

	if claims.UserID != 1 {
		t.Errorf(
			"expected user id 1, got %d",
			claims.UserID,
		)
	}

	if claims.SessionID != testSessionID {
		t.Errorf(
			"expected session id %q, got %q",
			testSessionID,
			claims.SessionID,
		)
	}
}

func TestIssueRejectsInvalidIdentity(t *testing.T) {
	secret := []byte(
		"12345678901234567890123456789012",
	)

	tokens, err := New(Config{
		Secret:           secret,
		Issuer:           "test-api",
		Audience:         "test-web",
		AccessTTLSeconds: 900,
		Now: func() time.Time {
			return time.Unix(1000, 0)
		},
	})

	if err != nil {
		t.Fatalf(
			"create token service: %v",
			err,
		)
	}

	tests := []struct {
		name      string
		userID    int64
		sessionID string
	}{
		{
			name:      "zero user id",
			userID:    0,
			sessionID: testSessionID,
		},
		{
			name:      "negative user id",
			userID:    -1,
			sessionID: testSessionID,
		},
		{
			name:      "unsafe user id",
			userID:    9007199254740992,
			sessionID: testSessionID,
		},
		{
			name:      "invalid session id",
			userID:    1,
			sessionID: "not-a-session",
		},
	}

	for _, tt := range tests {
		t.Run(
			tt.name,
			func(t *testing.T) {
				_, err := tokens.Issue(
					tt.userID,
					tt.sessionID,
					time.Unix(2000, 0),
				)

				if err == nil {
					t.Fatal(
						"expected token issuance to fail",
					)
				}
			},
		)
	}
}
func TestVerifyRejectsInvalidClaims(t *testing.T) {
	secret := []byte(
		"12345678901234567890123456789012",
	)

	tokens, err := New(Config{
		Secret:           secret,
		Issuer:           "test-api",
		Audience:         "test-web",
		AccessTTLSeconds: 900,
		Now: func() time.Time {
			return time.Unix(1000, 0)
		},
	})

	if err != nil {
		t.Fatalf(
			"create token service: %v",
			err,
		)
	}

	baseClaims := func() jwt.MapClaims {
		return jwt.MapClaims{
			"sid":      testSessionID,
			"tokenUse": "access",
			"iss":      "test-api",
			"aud":      "test-web",
			"sub":      "1",
			"iat":      int64(1000),
			"exp":      int64(1900),
		}
	}

	tests := []struct {
		name   string
		mutate func(jwt.MapClaims)
	}{
		{
			name: "wrong issuer",
			mutate: func(c jwt.MapClaims) {
				c["iss"] = "other"
			},
		},
		{
			name: "wrong audience",
			mutate: func(c jwt.MapClaims) {
				c["aud"] = "other"
			},
		},
		{
			name: "wrong token use",
			mutate: func(c jwt.MapClaims) {
				c["tokenUse"] = "refresh"
			},
		},
		{
			name: "zero subject",
			mutate: func(c jwt.MapClaims) {
				c["sub"] = "0"
			},
		},
		{
			name: "leading zero subject",
			mutate: func(c jwt.MapClaims) {
				c["sub"] = "01"
			},
		},
		{
			name: "unsafe subject",
			mutate: func(c jwt.MapClaims) {
				c["sub"] =
					"9007199254740992"
			},
		},
		{
			name: "bad session id",
			mutate: func(c jwt.MapClaims) {
				c["sid"] =
					"not-a-session"
			},
		},
		{
			name: "future issued at",
			mutate: func(c jwt.MapClaims) {
				c["iat"] = int64(1001)
			},
		},
		{
			name: "expired",
			mutate: func(c jwt.MapClaims) {
				c["exp"] = int64(1000)
			},
		},
		{
			name: "overlong lifetime",
			mutate: func(c jwt.MapClaims) {
				c["exp"] = int64(1901)
			},
		},
	}

	for _, tt := range tests {
		t.Run(
			tt.name,
			func(t *testing.T) {
				claims := baseClaims()
				tt.mutate(claims)

				raw := signTestToken(
					t,
					secret,
					claims,
					jwt.SigningMethodHS256,
				)

				if _, err :=
					tokens.Verify(raw); err == nil {
					t.Fatal(
						"expected token verification to fail",
					)
				}
			},
		)
	}
}
func TestVerifyRejectsWrongAlgorithmAndTampering(t *testing.T) {
	secret := []byte(
		"12345678901234567890123456789012",
	)

	tokens, err := New(Config{
		Secret:           secret,
		Issuer:           "test-api",
		Audience:         "test-web",
		AccessTTLSeconds: 900,
		Now: func() time.Time {
			return time.Unix(1000, 0)
		},
	})

	if err != nil {
		t.Fatalf(
			"create token service: %v",
			err,
		)
	}

	claims := jwt.MapClaims{
		"sid":      testSessionID,
		"tokenUse": "access",
		"iss":      "test-api",
		"aud":      "test-web",
		"sub":      "1",
		"iat":      int64(1000),
		"exp":      int64(1900),
	}

	for _, method := range []jwt.SigningMethod{
		jwt.SigningMethodHS384,
		jwt.SigningMethodHS512,
	} {
		raw := signTestToken(
			t,
			secret,
			claims,
			method,
		)

		if _, err := tokens.Verify(raw); err == nil {
			t.Fatalf(
				"expected algorithm %s to be rejected",
				method.Alg(),
			)
		}
	}

	wrongSecret := []byte(
		"abcdefghijklmnopqrstuvwxyzABCDEF",
	)

	rawWrongKey := signTestToken(
		t,
		wrongSecret,
		claims,
		jwt.SigningMethodHS256,
	)

	if _, err := tokens.Verify(rawWrongKey); err == nil {
		t.Fatal(
			"expected token signed with another key to fail",
		)
	}

	valid := signTestToken(
		t,
		secret,
		claims,
		jwt.SigningMethodHS256,
	)

	parts := strings.Split(valid, ".")

	payload := []byte(
		`{"sid":"122a8f89-1f56-4b08-85a7-384fb07d61e8","tokenUse":"access","iss":"test-api","aud":"test-web","sub":"2","iat":1000,"exp":1900}`,
	)

	parts[1] =
		base64.RawURLEncoding.EncodeToString(
			payload,
		)

	tampered := strings.Join(
		parts,
		".",
	)

	if _, err := tokens.Verify(tampered); err == nil {
		t.Fatal(
			"expected tampered JWT to fail",
		)
	}
}
