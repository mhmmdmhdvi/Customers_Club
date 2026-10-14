package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/authconfig"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/events"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/session"
)

type AdminService interface {
	Overview(context.Context) (map[string]any, error)
	List(context.Context, string, url.Values) (map[string]any, error)
	Detail(context.Context, string, string) (map[string]any, error)
	UpdateStatus(context.Context, string, any, int64, string) (map[string]any, error)
}
type authContextKey struct{}

func requestAuthentication(r *http.Request) session.Authentication {
	a, _ := r.Context().Value(authContextKey{}).(session.Authentication)
	return a
}
func securityEvent(r *http.Request, deps RouterDependencies, eventType string, status int, actor *int64, details map[string]any) {
	events.BestEffort(r.Context(), deps.Events, events.Security{EventType: eventType, Outcome: "FAILURE", ActorUserID: actor, RequestID: RequestIDFromContext(r.Context()), Route: r.URL.EscapedPath(), StatusCode: status, Details: details})
}
func authentication(w http.ResponseWriter, r *http.Request, deps RouterDependencies) (session.Authentication, bool) {
	w.Header().Set("Cache-Control", "no-store")
	values := r.Header.Values("Authorization")
	reason := "INVALID_AUTHORIZATION_HEADER"
	if len(values) == 1 && len(values[0]) <= 4103 && bearerPattern.MatchString(values[0]) {
		reason = "INVALID_OR_EXPIRED_SESSION"
	}
	if deps.Session == nil {
		sessionFailure(w, session.ErrUnauthorized)
		return session.Authentication{}, false
	}
	a, e := authenticate(r, deps.Session)
	if e != nil {
		status := errorStatus(e)
		securityEvent(r, deps, "AUTHENTICATION_REJECTED", status, nil, map[string]any{"reason": reason})
		sessionFailure(w, e)
		return a, false
	}
	return a, true
}

// Express decodes a matched dynamic segment before selecting the method, and
// rejects malformed UTF8 at that boundary. Keep static segments escaped.
func decodeAdminID(w http.ResponseWriter, kind, raw string) (string, bool) {
	id, e := url.PathUnescape(raw)
	if e != nil || !utf8.ValidString(id) {
		label := map[string]string{"messages": "contact message", "audit": "audit event", "security": "security event"}[kind]
		writeSecurityError(w, 400, "Invalid "+label+" id")
		return "", false
	}
	return id, true
}
func handleAdmin(w http.ResponseWriter, r *http.Request, deps RouterDependencies, path string) {
	a, ok := authentication(w, r, deps)
	if !ok {
		return
	}
	if e := RequireRole(a, "ADMIN"); e != nil {
		securityEvent(r, deps, "AUTHORIZATION_REJECTED", 403, &a.User.ID, map[string]any{"requiredRoles": []string{"ADMIN"}})
		sessionFailure(w, e)
		return
	}
	r = r.WithContext(context.WithValue(r.Context(), authContextKey{}, a))
	parts := strings.Split(strings.TrimPrefix(path, "/admin/"), "/")
	methods := ""
	var work func() (map[string]any, error)
	if len(parts) == 1 {
		switch parts[0] {
		case "overview":
			methods = "GET, HEAD"
			work = func() (map[string]any, error) { return deps.Admin.Overview(r.Context()) }
		case "users", "messages", "audit", "security":
			methods = "GET, HEAD"
			work = func() (map[string]any, error) {
				return deps.Admin.List(r.Context(), parts[0], parseAdminQuery(r.URL.RawQuery))
			}
		}
	} else if len(parts) == 2 && parts[1] != "" && (parts[0] == "messages" || parts[0] == "audit" || parts[0] == "security") {
		methods = "GET, HEAD"
		id, ok := decodeAdminID(w, parts[0], parts[1])
		if !ok {
			return
		}
		work = func() (map[string]any, error) { return deps.Admin.Detail(r.Context(), parts[0], id) }
	} else if len(parts) == 3 && parts[0] == "messages" && parts[1] != "" && parts[2] == "status" {
		methods = "PATCH"
		id, ok := decodeAdminID(w, parts[0], parts[1])
		if !ok {
			return
		}
		work = func() (map[string]any, error) {
			return deps.Admin.UpdateStatus(r.Context(), id, requestJSON(r)["status"], a.User.ID, RequestIDFromContext(r.Context()))
		}
	}
	if methods != "" && r.Method == http.MethodOptions {
		w.Header().Set("Allow", methods)
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte(methods))
		return
	}
	if methods == "GET, HEAD" && (r.Method == "GET" || r.Method == "HEAD") || methods == "PATCH" && r.Method == "PATCH" {
		handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if deps.Admin == nil {
				writeSecurityError(w, 500, "Internal server error")
				return
			}
			result, e := work()
			if e != nil {
				sessionFailure(w, e)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(result)
		})
		if methods == "PATCH" {
			sessionGuardWithEvents(handler, func() (authconfig.Config, error) { return deps.Auth, nil }, deps).ServeHTTP(w, r)
		} else {
			handler.ServeHTTP(w, r)
		}
		return
	}
	writeSecurityError(w, 404, "Not found")
}
