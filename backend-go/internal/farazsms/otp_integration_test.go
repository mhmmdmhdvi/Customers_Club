package farazsms

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otp"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

func TestFarazSMSSenderIntegratesWithOTPCreate(t *testing.T) {
	var smsRequests atomic.Int32

	server := httptest.NewServer(
		http.HandlerFunc(func(
			w http.ResponseWriter,
			r *http.Request,
		) {
			if r.Method != http.MethodPost {
				t.Errorf("expected POST, got %s", r.Method)
			}

			if r.Header.Get("Api-Key") != "test-key" {
				t.Error("unexpected API key")
			}

			var body struct {
				Code       string `json:"code"`
				Attributes struct {
					Code string `json:"code"`
				} `json:"attributes"`
				Recipient string `json:"recipient"`
			}

			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("invalid SMS JSON: %v", err)
				w.WriteHeader(http.StatusBadRequest)
				return
			}

			if body.Code != "test-pattern" ||
				body.Attributes.Code != "123456" ||
				body.Recipient != "09121234567" {
				t.Error("unexpected SMS payload")
			}

			smsRequests.Add(1)
			w.WriteHeader(http.StatusCreated)
		}),
	)
	defer server.Close()

	sender, err := NewSender(
		Config{
			APIKey:      "test-key",
			LineNumber:  "30001234",
			PatternCode: "test-pattern",
		},
		server.Client(),
	)

	if err != nil {
		t.Fatalf("sender construction failed: %v", err)
	}

	// Test-only endpoint override.
	sender.endpoint = server.URL + "/ws/v1/sms/pattern"

	// No real database transaction should be started.
	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (otpdb.Transaction, error) {
		t.Error("unexpected database transaction")
		return nil, errors.New("unexpected database access")
	}

	service := otp.NewDatabaseOTPService(
		make([]byte, 32),
		begin,
		sender.SendOTP,
	)

	if service == nil {
		t.Fatal("expected OTP service")
	}

	// Deterministic OTP for this integration test.
	service.RandomInt = func(min, max int) (int, error) {
		return 123456, nil
	}

	service.RandomBytes = func(size int) ([]byte, error) {
		return make([]byte, size), nil
	}

	ipCharged := false
	reserved := false
	activated := false

	service.ChargeIP = func(
		ctx context.Context,
		secret []byte,
		ip string,
		operation string,
	) error {
		if ip != "192.0.2.1" || operation != "request" {
			t.Fatal("unexpected IP charging parameters")
		}

		ipCharged = true
		return nil
	}

	service.Reserve = func(
		ctx context.Context,
		secret []byte,
		phone string,
		codeHash string,
		nonce string,
		ttl time.Duration,
	) (otpdb.ReservedOTP, error) {
		if !ipCharged {
			t.Fatal("IP charging must happen before reservation")
		}

		if phone != "09121234567" ||
			codeHash == "" ||
			ttl != 2*time.Minute {
			t.Fatal("unexpected reservation parameters")
		}

		reserved = true

		return otpdb.ReservedOTP{
			ID:        42,
			ExpiresAt: time.Now().Add(2 * time.Minute),
		}, nil
	}

	service.MarkDeliveryFailed = func(
		ctx context.Context,
		phone string,
		otpID int64,
	) error {
		t.Fatal("successful SMS must not trigger failure cleanup")
		return nil
	}

	service.Activate = func(
		ctx context.Context,
		phone string,
		otpID int64,
	) error {
		if !reserved || smsRequests.Load() != 1 {
			t.Fatal("SMS must be sent after reservation, before activation")
		}

		if phone != "09121234567" || otpID != 42 {
			t.Fatal("unexpected activation target")
		}

		activated = true
		return nil
	}

	err = service.Create(
		context.Background(),
		"+98 912-123-4567",
		"::ffff:192.0.2.1",
	)

	if err != nil {
		t.Fatalf("expected successful OTP creation, got %v", err)
	}

	if !ipCharged || !reserved || !activated {
		t.Fatal("expected complete OTP creation lifecycle")
	}

	if smsRequests.Load() != 1 {
		t.Fatalf(
			"expected one SMS request, got %d",
			smsRequests.Load(),
		)
	}
}
