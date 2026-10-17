package admin

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/testdb"
)

func TestCapturedAdminReadContracts(t *testing.T) {
	p := testdb.Open(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, e := p.Exec(ctx, `INSERT INTO "User" (phone,"firstName","lastName",role,"createdAt","updatedAt") VALUES ('09121234567',NULL,NULL,'MEMBER','2020-01-01','2020-01-01'),('09121234568','Test_Name','é','ADMIN','2020-02-01','2020-02-01');
 INSERT INTO "ContactMessage" (name,phone,email,subject,message,status,"createdAt","updatedAt") VALUES ('Test_Name','09121234567',NULL,'SUPPORT','private body','NEW','2020-01-01','2020-01-01'),('Other','09121234568','user@example.com','COMPLAINT','private complaint','RESOLVED','2020-02-01','2020-02-01');
 INSERT INTO "AdminAuditEvent" ("actorUserId",action,"targetType","targetId",outcome,"requestId",details,"createdAt") VALUES (2,'CONTACT_MESSAGE_STATUS_CHANGED','CONTACT_MESSAGE','1','SUCCESS','request-1','{"fromStatus":"NEW","toStatus":"READ"}','2020-01-01'),(2,'OTHER_ACTION','OTHER','2','FAILURE',NULL,NULL,'2020-02-01');
 INSERT INTO "SecurityEvent" ("eventType",outcome,"actorUserId","requestId",route,"statusCode",details,"createdAt") VALUES ('ADMIN_LOGIN','SUCCESS',2,'request-1','/auth/login/mfa',200,NULL,'2020-01-01'),('CSRF_REJECTED','FAILURE',NULL,NULL,'/auth/login',403,'{"reason":"MISSING_OR_INVALID_CSRF_HEADER"}','2020-02-01')`)
	if e != nil {
		t.Fatal(e)
	}
	type query struct {
		Resource string            `json:"resource"`
		Query    map[string]string `json:"query"`
	}
	queries := []query{}
	for _, r := range []string{"users", "messages", "audit", "security"} {
		queries = append(queries, query{r, map[string]string{}}, query{r, map[string]string{"page": "2", "pageSize": "1"}}, query{r, map[string]string{"page": "5", "pageSize": "1", "fromDate": "invalid"}})
	}
	for _, r := range []string{"users", "messages"} {
		for _, s := range []string{"TeSt", "e\u0301", "%", "_", "\\", "091212", "' OR 1=1 --"} {
			queries = append(queries, query{r, map[string]string{"search": s}})
		}
	}
	queries = append(queries, query{"messages", map[string]string{"status": "RESOLVED", "subject": "COMPLAINT"}}, query{"audit", map[string]string{"actorUserId": "2", "action": "CONTACT_MESSAGE_STATUS_CHANGED", "targetType": "CONTACT_MESSAGE", "outcome": "SUCCESS"}}, query{"security", map[string]string{"eventType": "ADMIN_LOGIN", "actorUserId": "2", "requestId": "request-1", "statusCode": "200", "outcome": "SUCCESS"}})
	output, e := os.ReadFile("testdata/admin-read-node.json")
	if e != nil {
		t.Fatal(e)
	}
	var want []any
	if e = json.Unmarshal(output, &want); e != nil {
		t.Fatal("reference output malformed")
	}
	if len(want) != 29 || len(queries) != len(want) {
		t.Fatal("incomplete admin reference")
	}
	s := New(p)
	for i, q := range queries {
		values := url.Values{}
		for k, v := range q.Query {
			values.Set(k, v)
		}
		got, e := s.List(ctx, q.Resource, values)
		if e != nil {
			t.Errorf("%+v: %v", q, e)
			continue
		}
		raw, _ := json.Marshal(got)
		var normalized any
		_ = json.Unmarshal(raw, &normalized)
		if !reflect.DeepEqual(normalized, want[i]) {
			t.Errorf("%+v differs from Node: Go %s Node %+v", q, raw, want[i])
		}
	}
}
