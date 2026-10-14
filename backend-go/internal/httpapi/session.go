package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/jsstring"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/session"
)

type SessionService interface {
	Register(context.Context, map[string]any) (session.Grant, error)
	Login(context.Context, map[string]any) (session.Grant, error)
	CompleteMFA(context.Context, map[string]any) (session.Grant, error)
	Refresh(context.Context, string) (session.Grant, error)
	Logout(context.Context, string) error
	Authenticate(context.Context, string) (session.Authentication, error)
}

var refreshPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var bearerPattern = regexp.MustCompile(`(?i)^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$`)

func readRefreshCookie(r *http.Request, name string) (string, error) {
	values := r.Header.Values("Cookie")
	if len(values) == 0 {
		return "", nil
	}
	if len(values) != 1 || len(values[0]) > 8192 {
		return "", session.ErrUnauthorized
	}
	found := false
	token := ""
	for _, part := range strings.Split(values[0], ";") {
		part = jsstring.Trim(part)
		key, value, ok := strings.Cut(part, "=")
		if !ok || key != name {
			continue
		}
		if found || !refreshPattern.MatchString(value) {
			return "", session.ErrUnauthorized
		}
		found = true
		token = value
	}
	return token, nil
}
func refreshCookie(w http.ResponseWriter, deps RouterDependencies, token string, expiry time.Time) {
	cookie := &http.Cookie{Name: deps.Auth.Cookie.Name, Value: token, Path: "/", HttpOnly: true, Secure: deps.Auth.Cookie.Secure, SameSite: http.SameSiteStrictMode}
	if token == "" {
		cookie.Expires = time.Unix(0, 0).UTC()
	} else {
		cookie.Expires = expiry
		cookie.MaxAge = int(time.Until(expiry).Seconds())
	}
	http.SetCookie(w, cookie)
}
func sessionFailure(w http.ResponseWriter, e error) {
	var ae *session.Error
	if errors.As(e, &ae) {
		writeSecurityError(w, ae.Status, ae.Message)
		return
	}
	writeSecurityError(w, 500, "Internal server error")
}
func handleSession(w http.ResponseWriter, r *http.Request, deps RouterDependencies, path string) {
	w.Header().Set("Cache-Control", "no-store")
	if deps.Session == nil {
		writeSecurityError(w, 503, "Authentication unavailable")
		return
	}
	if path == "/auth/me" {
		a, e := authenticate(r, deps.Session)
		if e != nil {
			sessionFailure(w, e)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"user": a.User})
		return
	}
	var grant session.Grant
	var e error
	status := 200
	message := "Logged in"
	switch path {
	case "/auth/register":
		status = 201
		message = "Registration completed"
		grant, e = deps.Session.Register(r.Context(), requestJSON(r))
	case "/auth/login":
		grant, e = deps.Session.Login(r.Context(), requestJSON(r))
	case "/auth/login/mfa":
		grant, e = deps.Session.CompleteMFA(r.Context(), requestJSON(r))
	case "/auth/refresh", "/auth/logout":
		var token string
		token, e = readRefreshCookie(r, deps.Auth.Cookie.Name)
		if e == nil {
			if path == "/auth/logout" {
				e = deps.Session.Logout(r.Context(), token)
			} else {
				message = "Session refreshed"
				grant, e = deps.Session.Refresh(r.Context(), token)
			}
		}
	}
	if e != nil {
		var ae *session.Error
		if path == "/auth/refresh" && errors.As(e, &ae) && ae.Status == 401 {
			refreshCookie(w, deps, "", time.Time{})
		}
		sessionFailure(w, e)
		return
	}
	if path == "/auth/logout" {
		refreshCookie(w, deps, "", time.Time{})
		w.WriteHeader(204)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if path == "/auth/login" && grant.MFARequired {
		_ = json.NewEncoder(w).Encode(map[string]any{"message": "MFA required", "authenticated": false, "mfaRequired": true, "mfaChallengeToken": grant.MFAChallengeToken, "mfaExpiresAt": grant.MFAExpiresAt.UTC().Format("2006-01-02T15:04:05.000Z")})
		return
	}
	if !refreshPattern.MatchString(grant.RefreshToken) || !grant.RefreshExpiresAt.After(time.Now()) {
		sessionFailure(w, errors.New("invalid grant"))
		return
	}
	refreshCookie(w, deps, grant.RefreshToken, grant.RefreshExpiresAt)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"message": message, "authenticated": true, "user": grant.User, "tokenType": "Bearer", "accessToken": grant.AccessToken, "expiresIn": grant.ExpiresIn, "accessExpiresAt": grant.AccessExpiresAt})
}
func authenticate(r *http.Request, s SessionService) (session.Authentication, error) {
	values := r.Header.Values("Authorization")
	if len(values) != 1 || len(values[0]) > 4103 || !bearerPattern.MatchString(values[0]) {
		return session.Authentication{}, session.ErrUnauthorized
	}
	return s.Authenticate(r.Context(), values[0][7:])
}

// RequireRole uses the current database-backed user supplied by Authenticate.
func RequireRole(a session.Authentication, roles ...string) error {
	if a.User.ID < 1 {
		return session.ErrUnauthorized
	}
	for _, role := range roles {
		if a.User.Role == role {
			return nil
		}
	}
	return &session.Error{Status: 403, Message: "Forbidden"}
}
