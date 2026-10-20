package contact

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/jsstring"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/phone"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/session"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
	"golang.org/x/text/unicode/norm"
)

type Data struct {
	Name, Phone, Subject, Message string
	Email                         *string
}

func fail(message string) error { return &session.Error{Status: 400, Message: message} }
func required(v any, label string, max int) (string, error) {
	s, ok := v.(string)
	if !ok {
		return "", fail(label + " is required")
	}
	s = jsstring.Trim(norm.NFC.String(s))
	if strings.ContainsRune(s, 0) {
		return "", fail(label + " contains invalid characters")
	}
	if n := utf8.RuneCountInString(s); n < 1 || n > max {
		return "", fail(label + " must contain 1 to " + strconv.Itoa(max) + " characters")
	}
	return s, nil
}

var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

func Parse(b map[string]any) (Data, error) {
	var d Data
	if b == nil {
		return d, fail("Contact message details are required")
	}
	for k := range b {
		switch k {
		case "name", "phone", "email", "subject", "message":
		default:
			return d, fail("Unexpected contact message field")
		}
	}
	if s, ok := b["name"].(string); ok && strings.ContainsFunc(s, unicode.IsControl) {
		return d, fail("Name must not contain control characters")
	}
	var e error
	d.Name, e = required(b["name"], "Name", 80)
	if e != nil {
		return d, e
	}
	s, _ := b["phone"].(string)
	d.Phone = phone.Normalize(s)
	if !phone.IsValidIranianMobile(d.Phone) {
		return d, fail("Invalid phone number")
	}
	d.Subject, _ = b["subject"].(string)
	switch d.Subject {
	case "SUPPORT", "SUGGESTION", "COMPLAINT", "OTHER":
	default:
		return d, fail("Invalid subject")
	}
	d.Message, e = required(b["message"], "Message", 250)
	if e != nil {
		return d, e
	}
	if b["email"] != nil {
		s, ok := b["email"].(string)
		if !ok {
			return d, fail("Invalid email")
		}
		s = cases.Lower(language.Und).String(jsstring.Trim(s))
		if strings.ContainsRune(s, 0) || len(utf16.Encode([]rune(s))) > 254 || s != "" && (!emailPattern.MatchString(s) || strings.ContainsFunc(s, jsstring.IsSpace)) {
			return d, fail("Invalid email")
		}
		if s != "" {
			d.Email = &s
		}
	}
	return d, nil
}
func LockKey(phone string) int64 {
	h := sha256.Sum256([]byte("club-contact-message-lock-v1:" + phone))
	return int64(binary.BigEndian.Uint64(h[:8]))
}

type Service struct{ pool *pgxpool.Pool }

func New(p *pgxpool.Pool) *Service { return &Service{p} }
func (s *Service) CreateMessage(ctx context.Context, b map[string]any) error {
	d, e := Parse(b)
	if e != nil {
		return e
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = tx.Rollback(cleanup)
	}()
	if _, e = tx.Exec(ctx, `SET LOCAL lock_timeout='3s'`); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, LockKey(d.Phone)); e != nil {
		return e
	}
	now := time.Now().UTC().Truncate(time.Millisecond)
	var count int
	if e = tx.QueryRow(ctx, `SELECT count(*) FROM "ContactMessage" WHERE phone=$1 AND "createdAt">=$2`, d.Phone, now.Add(-time.Hour)).Scan(&count); e != nil {
		return e
	}
	if count >= 3 {
		return &session.Error{Status: 429, Message: "Too many contact messages"}
	}
	if _, e = tx.Exec(ctx, `INSERT INTO "ContactMessage" (name,phone,email,subject,message,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$6)`, d.Name, d.Phone, d.Email, d.Subject, d.Message, now); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
