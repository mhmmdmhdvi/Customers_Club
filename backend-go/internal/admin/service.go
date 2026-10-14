// Package admin owns database reads and atomic contact status/audit mutations.
package admin

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/events"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/jsstring"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/session"
	"golang.org/x/text/unicode/norm"
)

type Service struct{ pool *pgxpool.Pool }

func New(p *pgxpool.Pool) *Service { return &Service{p} }
func failure(status int, message string) error {
	return &session.Error{Status: status, Message: message}
}

var decimal = regexp.MustCompile(`^\d+$`)

func positive(raw, label string, def, max int64) (int64, error) {
	if raw == "" && def > 0 {
		return def, nil
	}
	if !decimal.MatchString(raw) {
		return 0, failure(400, "Invalid "+label)
	}
	n, e := strconv.ParseInt(raw, 10, 64)
	if e != nil || n < 1 || n > 9007199254740991 || max > 0 && n > max {
		return 0, failure(400, "Invalid "+label)
	}
	return n, nil
}
func queryValue(q url.Values, k, label string) (string, error) {
	v := q[k]
	if len(v) > 1 {
		return "", failure(400, "Invalid "+label)
	}
	if len(v) == 1 {
		return v[0], nil
	}
	return "", nil
}

type filter struct {
	key, label string
	max        int
	allowed    string
	numeric    bool
}

type resource struct{ table, columns, detail, notFound, idLabel string }

var resources = map[string]resource{
	"users":    {"User", `id,phone,"firstName","lastName","birthYear","birthMonth","birthDay",role,"createdAt","updatedAt"`, "", "", ""},
	"messages": {"ContactMessage", `id,name,phone,email,subject,status,"createdAt","updatedAt"`, `id,name,phone,email,subject,message,status,"createdAt","updatedAt"`, "Contact message not found", "contact message id"},
	"audit":    {"AdminAuditEvent", `id,"actorUserId",action,"targetType","targetId",outcome,"requestId","createdAt"`, `id,"actorUserId",action,"targetType","targetId",outcome,"requestId",details,"createdAt"`, "Audit event not found", "audit event id"},
	"security": {"SecurityEvent", `id,"eventType",outcome,"actorUserId","requestId",route,"statusCode","createdAt"`, `id,"eventType",outcome,"actorUserId","requestId",route,"statusCode",details,"createdAt"`, "Security event not found", "security event id"},
}

func maps(rows pgx.Rows) ([]map[string]any, error) {
	defer rows.Close()
	out := []map[string]any{}
	fields := rows.FieldDescriptions()
	for rows.Next() {
		values, e := rows.Values()
		if e != nil {
			return nil, e
		}
		m := map[string]any{}
		for i, v := range values {
			if d, ok := v.(time.Time); ok {
				v = d.UTC().Format("2006-01-02T15:04:05.000Z")
			}
			m[fields[i].Name] = v
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
func (s *Service) List(ctx context.Context, kind string, q url.Values) (map[string]any, error) {
	r, ok := resources[kind]
	if !ok {
		return nil, errors.New("admin resource unavailable")
	}
	raw, e := queryValue(q, "page", "page")
	if e != nil {
		return nil, e
	}
	page, e := positive(raw, "page", 1, 0)
	if e != nil {
		return nil, e
	}
	raw, e = queryValue(q, "pageSize", "page size")
	if e != nil {
		return nil, e
	}
	size, e := positive(raw, "page size", 20, 100)
	if e != nil {
		return nil, e
	}
	args := []any{}
	conditions := []string{}
	add := func(column string, v any) {
		args = append(args, v)
		conditions = append(conditions, fmt.Sprintf(`"%s"=$%d`, column, len(args)))
	}
	if kind == "users" || kind == "messages" {
		raw, e = queryValue(q, "search", "search")
		if e != nil {
			return nil, e
		}
		search := jsstring.Trim(norm.NFC.String(raw))
		if utf8.RuneCountInString(search) > 80 || strings.ContainsFunc(search, unicode.IsControl) {
			return nil, failure(400, "Invalid search")
		}
		if search != "" {
			// Prisma contains preserves PostgreSQL LIKE wildcards and escapes.
			args = append(args, "%"+search+"%")
			n := len(args)
			columns := []string{"phone", "firstName", "lastName"}
			if kind == "messages" {
				columns = []string{"phone", "name", "email"}
			}
			parts := []string{}
			for _, c := range columns {
				if c == "phone" {
					parts = append(parts, fmt.Sprintf(`"%s" LIKE $%d`, c, n))
				} else {
					parts = append(parts, fmt.Sprintf(`"%s" ILIKE $%d`, c, n))
				}
			}
			conditions = append(conditions, "("+strings.Join(parts, " OR ")+")")
		}
	}
	filters := []filter{}
	switch kind {
	case "messages":
		filters = append(filters, filter{"status", "status", 0, "NEW|READ|RESOLVED", false}, filter{"subject", "subject", 0, "SUPPORT|SUGGESTION|COMPLAINT|OTHER", false})
	case "audit":
		filters = append(filters, filter{"actorUserId", "actor user id", 0, "", true}, filter{"action", "action", 80, "", false}, filter{"outcome", "outcome", 0, "SUCCESS|FAILURE", false}, filter{"targetType", "target type", 80, "", false})
	case "security":
		filters = append(filters, filter{"actorUserId", "actor user id", 0, "", true}, filter{"eventType", "event type", 80, "", false}, filter{"outcome", "outcome", 0, "SUCCESS|FAILURE", false}, filter{"statusCode", "status code", 0, "", true}, filter{"requestId", "request id", 128, "", false})
	}
	for _, f := range filters {
		raw, e = queryValue(q, f.key, f.label)
		if e != nil {
			return nil, e
		}
		if raw == "" {
			continue
		}
		if f.numeric {
			n, e := positive(raw, f.label, 0, 0)
			if e != nil {
				return nil, e
			}
			if f.key == "statusCode" && (n < 100 || n > 599) {
				return nil, failure(400, "Invalid status code")
			}
			add(f.key, n)
		} else if f.allowed != "" {
			found := false
			for _, v := range strings.Split(f.allowed, "|") {
				if raw == v {
					found = true
				}
			}
			if !found {
				return nil, failure(400, "Invalid "+f.label)
			}
			add(f.key, raw)
		} else {
			v, e := events.Text(raw, f.label, f.max)
			if e != nil {
				return nil, failure(400, e.Error())
			}
			add(f.key, v)
		}
	}
	where := ""
	if len(conditions) > 0 {
		where = " WHERE " + strings.Join(conditions, " AND ")
	}
	var total int64
	if e = s.pool.QueryRow(ctx, `SELECT count(*) FROM "`+r.table+`"`+where, args...).Scan(&total); e != nil {
		return nil, e
	}
	args = append(args, size, (page-1)*size)
	rows, e := s.pool.Query(ctx, `SELECT `+r.columns+` FROM "`+r.table+`"`+where+fmt.Sprintf(` ORDER BY "createdAt" DESC LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if e != nil {
		return nil, e
	}
	items, e := maps(rows)
	if e != nil {
		return nil, e
	}
	return map[string]any{"items": items, "pagination": map[string]any{"page": page, "pageSize": size, "total": total, "totalPages": (total + size - 1) / size}}, nil
}
func (s *Service) Detail(ctx context.Context, kind, raw string) (map[string]any, error) {
	r, ok := resources[kind]
	if !ok || r.detail == "" {
		return nil, errors.New("admin resource unavailable")
	}
	id, e := positive(raw, r.idLabel, 0, 0)
	if e != nil {
		return nil, e
	}
	rows, e := s.pool.Query(ctx, `SELECT `+r.detail+` FROM "`+r.table+`" WHERE id=$1`, id)
	if e != nil {
		return nil, e
	}
	items, e := maps(rows)
	if e != nil {
		return nil, e
	}
	if len(items) == 0 {
		return nil, failure(404, r.notFound)
	}
	return items[0], nil
}
func (s *Service) Overview(ctx context.Context) (map[string]any, error) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	var members, recent, messages, newMessages, active int64
	e := s.pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM "User" WHERE role='MEMBER'),(SELECT count(*) FROM "User" WHERE role='MEMBER' AND "createdAt">=$1),(SELECT count(*) FROM "ContactMessage"),(SELECT count(*) FROM "ContactMessage" WHERE status='NEW'),(SELECT count(*) FROM "AuthSession" WHERE "revokedAt" IS NULL AND "expiresAt">$2)`, now.Add(-7*24*time.Hour), now).Scan(&members, &recent, &messages, &newMessages, &active)
	if e != nil {
		return nil, e
	}
	return map[string]any{"members": map[string]any{"total": members, "newLast7Days": recent}, "messages": map[string]any{"total": messages, "new": newMessages}, "sessions": map[string]any{"active": active}}, nil
}
func (s *Service) UpdateStatus(ctx context.Context, raw string, status any, actor int64, requestID string) (map[string]any, error) {
	id, e := positive(raw, "contact message id", 0, 0)
	if e != nil {
		return nil, e
	}
	next, ok := status.(string)
	if !ok || (next != "NEW" && next != "READ" && next != "RESOLVED") {
		return nil, failure(400, "Invalid contact message status")
	}
	if actor < 1 || actor > 9007199254740991 {
		return nil, failure(400, "Invalid admin user")
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return nil, e
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = tx.Rollback(cleanup)
	}()
	var current string
	e = tx.QueryRow(ctx, `SELECT status FROM "ContactMessage" WHERE id=$1`, id).Scan(&current)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, failure(404, "Contact message not found")
	}
	if e != nil {
		return nil, e
	}
	if map[string]string{"NEW": "READ", "READ": "RESOLVED"}[current] != next {
		return nil, failure(409, "Invalid contact message status transition")
	}
	var updated time.Time
	e = tx.QueryRow(ctx, `UPDATE "ContactMessage" SET status=$2,"updatedAt"=$4 WHERE id=$1 AND status=$3 RETURNING "updatedAt"`, id, next, current, time.Now().UTC().Truncate(time.Millisecond)).Scan(&updated)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, failure(409, "Contact message status changed")
	}
	if e != nil {
		return nil, e
	}
	if e = events.Audit(ctx, tx, actor, strconv.FormatInt(id, 10), requestID, current, next); e != nil {
		return nil, e
	}
	if e = tx.Commit(ctx); e != nil {
		return nil, e
	}
	return map[string]any{"id": id, "status": next, "updatedAt": updated.UTC().Format("2006-01-02T15:04:05.000Z")}, nil
}
