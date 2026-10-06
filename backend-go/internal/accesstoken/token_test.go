package accesstoken

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

const testSessionID = "122a8f89-1f56-4b08-85a7-384fb07d61e8"

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
