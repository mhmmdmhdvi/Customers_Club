package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otp"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpdb"
)

func TestNewDatabaseAPIHandlerConnectsOTPDatabase(
	t *testing.T,
) {
	// This error simulates an unavailable database.
	// No real PostgreSQL connection will be opened.
	databaseFailure := errors.New(
		"synthetic offline database failure",
	)

	beginCalls := 0
	sendCalls := 0

	// Fake PostgreSQL transaction provider.
	begin := func(
		ctx context.Context,
		options pgx.TxOptions,
	) (otpdb.Transaction, error) {
		beginCalls++

		return nil, databaseFailure
	}

	// Fake SMS sender.
	sendOTP := func(
		ctx context.Context,
		phone string,
		code string,
		expiresAt time.Time,
	) error {
		sendCalls++

		return nil
	}

	// Test-only secret.
	secret := make([]byte, 32)

	// This constructor does not exist yet.
	handler, err := newDatabaseAPIHandler(
		secret,
		begin,
		sendOTP,
	)

	if err != nil {
		t.Fatalf(
			"expected HTTP handler, got %v",
			err,
		)
	}

	req := httptest.NewRequest(
		http.MethodPost,
		"/auth/request-code",
		strings.NewReader(
			`{"phone":"09121234567"}`,
		),
	)

	req.Header.Set(
		"Content-Type",
		"application/json",
	)

	req.RemoteAddr = "192.0.2.19:52100"

	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, req)

	// Database failure must not produce success.
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf(
			"expected HTTP 500, got %d: %s",
			recorder.Code,
			recorder.Body.String(),
		)
	}

	// The request must actually reach our
	// PostgreSQL-backed OTP implementation.
	if beginCalls != 1 {
		t.Fatalf(
			"expected one transaction attempt, got %d",
			beginCalls,
		)
	}

	// Database failure occurs before SMS delivery.
	if sendCalls != 0 {
		t.Fatal(
			"SMS must not be sent after database failure",
		)
	}

	if recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(
			"authentication response must not be cached",
		)
	}
}

func TestNewDatabaseAPIHandlerRejectsInvalidDependencies(
	t *testing.T,
) {
	// Valid-length test secret.
	// Production secrets must be securely generated.
	validSecret := make([]byte, 32)

	// A fake transaction provider that must never
	// be called during constructor validation.
	validBegin := otpdb.BeginTransaction(
		func(
			ctx context.Context,
			options pgx.TxOptions,
		) (otpdb.Transaction, error) {
			t.Fatal(
				"constructor must not start a transaction",
			)

			return nil, errors.New("unexpected transaction")
		},
	)

	// A fake SMS sender that must never be called
	// during constructor validation.
	validSender := otp.SendOTPFunc(
		func(
			ctx context.Context,
			phone string,
			code string,
			expiresAt time.Time,
		) error {
			t.Fatal(
				"constructor must not send SMS",
			)

			return nil
		},
	)

	tests := []struct {
		name    string
		secret  []byte
		begin   otpdb.BeginTransaction
		sendOTP otp.SendOTPFunc
	}{
		{
			name:    "missing OTP secret",
			secret:  nil,
			begin:   validBegin,
			sendOTP: validSender,
		},
		{
			name:    "OTP secret too short",
			secret:  make([]byte, 31),
			begin:   validBegin,
			sendOTP: validSender,
		},
		{
			name:    "OTP secret too long",
			secret:  make([]byte, 33),
			begin:   validBegin,
			sendOTP: validSender,
		},
		{
			name:    "missing PostgreSQL transaction provider",
			secret:  validSecret,
			begin:   nil,
			sendOTP: validSender,
		},
		{
			name:    "missing SMS sender",
			secret:  validSecret,
			begin:   validBegin,
			sendOTP: nil,
		},
		{
			name:    "missing database and sender",
			secret:  validSecret,
			begin:   nil,
			sendOTP: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, err := newDatabaseAPIHandler(
				tt.secret,
				tt.begin,
				tt.sendOTP,
			)

			if err == nil {
				t.Fatal(
					"expected invalid dependencies to fail",
				)
			}

			if handler != nil {
				t.Fatal(
					"invalid dependencies must not produce HTTP handler",
				)
			}
		})
	}
}
