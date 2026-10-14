// Package events validates bounded, credential-free audit and security records.
package events

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log"
	"math"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/jsstring"
	"golang.org/x/text/unicode/norm"
)

func Text(v, label string, max int) (string, error) {
	v = jsstring.Trim(norm.NFC.String(v))
	if v == "" || utf8.RuneCountInString(v) > max || strings.ContainsFunc(v, unicode.IsControl) {
		return "", errors.New("Invalid " + label)
	}
	return v, nil
}

var sensitive = map[string]bool{"accesstoken": true, "refreshtoken": true, "token": true, "password": true, "otpcode": true, "authorization": true, "cookie": true, "setcookie": true, "message": true, "messagebody": true}

func check(v any, depth int, label string) error {
	if depth > 6 {
		return errors.New("Invalid " + label + " details")
	}
	switch x := v.(type) {
	case nil, string, bool:
		return nil
	case float64:
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return errors.New("Invalid " + label + " details")
		}
		return nil
	case int, int64:
		return nil
	case []string:
		for _, v := range x {
			if e := check(v, depth+1, label); e != nil {
				return e
			}
		}
		return nil
	case []any:
		for _, v := range x {
			if e := check(v, depth+1, label); e != nil {
				return e
			}
		}
		return nil
	case map[string]any:
		for k, v := range x {
			key := strings.Map(func(r rune) rune {
				if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
					return r
				}
				return -1
			}, strings.ToLower(k))
			if sensitive[key] {
				return errors.New("Sensitive " + label + " details are not allowed")
			}
			if e := check(v, depth+1, label); e != nil {
				return e
			}
		}
		return nil
	}
	return errors.New("Invalid " + label + " details")
}

// Details rejects unsafe data rather than silently dropping fields. nil means
// omitted; a non-nil value must be an ordinary JSON object, like Node.
func Details(v map[string]any, label string) ([]byte, error) {
	if v == nil {
		return nil, nil
	}
	if e := check(v, 0, label); e != nil {
		return nil, e
	}
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if e := enc.Encode(v); e != nil {
		return nil, errors.New("Invalid " + label + " details")
	}
	raw := bytes.TrimSuffix(b.Bytes(), []byte{'\n'})
	if jsonUnits(v) > 4000 {
		return nil, errors.New(strings.ToUpper(label[:1]) + label[1:] + " details are too large")
	}
	return raw, nil
}

// Node JSON.stringify leaves line separators literal and uses decimal notation
// for numbers in [1e-6,1e21). Go's encoder differs in both cases; calculate the
// Node UTF16 length rather than measuring Go's serialized representation.
func stringUnits(v string) int {
	var b bytes.Buffer
	e := json.NewEncoder(&b)
	e.SetEscapeHTML(false)
	_ = e.Encode(v)
	return len(utf16.Encode([]rune(strings.TrimSuffix(b.String(), "\n")))) - 5*(strings.Count(v, "\u2028")+strings.Count(v, "\u2029"))
}
func jsonUnits(v any) int {
	switch x := v.(type) {
	case nil:
		return 4
	case bool:
		if x {
			return 4
		}
		return 5
	case string:
		return stringUnits(x)
	case int:
		return len(strconv.Itoa(x))
	case int64:
		return len(strconv.FormatInt(x, 10))
	case float64:
		if x == 0 {
			return 1
		}
		format := byte('e')
		if math.Abs(x) >= 1e-6 && math.Abs(x) < 1e21 {
			format = 'f'
		}
		s := strconv.FormatFloat(x, format, -1, 64)
		s = strings.Replace(s, "e-0", "e-", 1)
		s = strings.Replace(s, "e+0", "e+", 1)
		return len(s)
	case []string:
		n := 2
		for i, v := range x {
			if i > 0 {
				n++
			}
			n += stringUnits(v)
		}
		return n
	case []any:
		n := 2
		for i, v := range x {
			if i > 0 {
				n++
			}
			n += jsonUnits(v)
		}
		return n
	case map[string]any:
		n := 2
		i := 0
		for k, v := range x {
			if i > 0 {
				n++
			}
			n += stringUnits(k) + 1 + jsonUnits(v)
			i++
		}
		return n
	}
	return 4001
}

type Security struct {
	EventType, Outcome, RequestID, Route string
	ActorUserID                          *int64
	StatusCode                           int
	Details                              map[string]any
}
type Service struct{ pool *pgxpool.Pool }

func New(p *pgxpool.Pool) *Service { return &Service{p} }
func (s *Service) Record(ctx context.Context, v Security) error {
	var e error
	v.EventType, e = Text(v.EventType, "event type", 80)
	if e != nil {
		return e
	}
	v.Route, e = Text(v.Route, "route", 255)
	if e != nil {
		return e
	}
	if v.Outcome != "SUCCESS" && v.Outcome != "FAILURE" {
		return errors.New("Invalid security event outcome")
	}
	if v.ActorUserID != nil && (*v.ActorUserID < 1 || *v.ActorUserID > 9007199254740991) {
		return errors.New("Invalid actor user id")
	}
	if v.StatusCode < 100 || v.StatusCode > 599 {
		return errors.New("Invalid status code")
	}
	var request any
	if v.RequestID != "" {
		request, e = Text(v.RequestID, "request id", 128)
		if e != nil {
			return e
		}
	}
	d, e := Details(v.Details, "security event")
	if e != nil {
		return e
	}
	_, e = s.pool.Exec(ctx, `INSERT INTO "SecurityEvent" ("eventType",outcome,"actorUserId","requestId",route,"statusCode",details) VALUES ($1,$2,$3,$4,$5,$6,$7)`, v.EventType, v.Outcome, v.ActorUserID, request, v.Route, v.StatusCode, d)
	return e
}

type Recorder interface {
	Record(context.Context, Security) error
}

// BestEffort bounds database work to one second. It deliberately emits only a
// fixed diagnostic: errors and event payloads can contain private data.
func BestEffort(ctx context.Context, r Recorder, v Security) {
	if r == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	if e := r.Record(ctx, v); e != nil {
		log.Print("Security event recording failed")
	}
}
func Audit(ctx context.Context, tx pgx.Tx, actor int64, targetID, requestID, from, to string) error {
	if actor < 1 || actor > 9007199254740991 {
		return errors.New("Invalid actor user id")
	}
	var request any
	var e error
	if requestID != "" {
		request, e = Text(requestID, "request id", 128)
		if e != nil {
			return e
		}
	}
	d, e := Details(map[string]any{"fromStatus": from, "toStatus": to}, "audit")
	if e != nil {
		return e
	}
	_, e = tx.Exec(ctx, `INSERT INTO "AdminAuditEvent" ("actorUserId",action,"targetType","targetId",outcome,"requestId",details) VALUES ($1,'CONTACT_MESSAGE_STATUS_CHANGED','CONTACT_MESSAGE',$2,'SUCCESS',$3,$4)`, actor, targetID, request, d)
	return e
}
