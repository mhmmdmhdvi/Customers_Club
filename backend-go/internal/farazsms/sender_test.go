package farazsms

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type roundTripFunc func(
	request *http.Request,
) (*http.Response, error)

func (f roundTripFunc) RoundTrip(
	request *http.Request,
) (*http.Response, error) {
	return f(request)
}

func TestSenderPostsFarazSMSPattern(t *testing.T) {
	requestReceived := false

	server := httptest.NewServer(
		http.HandlerFunc(func(
			w http.ResponseWriter,
			r *http.Request,
		) {
			requestReceived = true

			if r.Method != http.MethodPost {
				t.Errorf("expected POST, got %s", r.Method)
			}

			if r.URL.Path != "/ws/v1/sms/pattern" {
				t.Errorf("unexpected path: %s", r.URL.Path)
			}

			if r.Header.Get("Api-Key") != "test-api-key" {
				t.Error("unexpected API key header")
			}

			if r.Header.Get("Accept") != "application/json" {
				t.Error("expected JSON Accept header")
			}

			if r.Header.Get("Content-Type") != "application/json" {
				t.Error("expected JSON Content-Type header")
			}

			var payload struct {
				Code       string `json:"code"`
				Attributes struct {
					Code string `json:"code"`
				} `json:"attributes"`
				Recipient    string `json:"recipient"`
				LineNumber   string `json:"line_number"`
				NumberFormat string `json:"number_format"`
			}

			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Errorf("invalid request JSON: %v", err)
				w.WriteHeader(http.StatusBadRequest)
				return
			}

			if payload.Code != "test-pattern" {
				t.Error("unexpected pattern code")
			}

			if payload.Attributes.Code != "123456" {
				t.Error("unexpected OTP code")
			}

			if payload.Recipient != "09121234567" {
				t.Error("unexpected recipient")
			}

			if payload.LineNumber != "30001234" {
				t.Error("unexpected SMS line number")
			}

			if payload.NumberFormat != "english" {
				t.Error("expected english number format")
			}

			// Node.js treats HTTP 201 as successful delivery.
			w.WriteHeader(http.StatusCreated)
		}),
	)
	defer server.Close()

	sender, err := NewSender(
		Config{
			APIKey:      "test-api-key",
			LineNumber:  "30001234",
			PatternCode: "test-pattern",
		},
		server.Client(),
	)

	if err != nil {
		t.Fatalf("expected sender construction, got %v", err)
	}

	// Override the private endpoint inside this test only.
	// This prevents requests to the real FarazSMS provider.
	sender.endpoint = server.URL + "/ws/v1/sms/pattern"

	err = sender.SendOTP(
		context.Background(),
		"09121234567",
		"123456",
		time.Date(
			2026, time.October, 11,
			12, 2, 0, 0, time.UTC,
		),
	)

	if err != nil {
		t.Fatalf("expected SMS delivery success, got %v", err)
	}

	if !requestReceived {
		t.Fatal("expected FarazSMS HTTP request")
	}
}

func TestSenderHandlesProviderResponses(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		body       string
		wantError  bool
	}{
		{
			name:       "HTTP 200 success",
			statusCode: http.StatusOK,
			body:       `{"status":"success"}`,
			wantError:  false,
		},
		{
			name:       "HTTP 200 rejected",
			statusCode: http.StatusOK,
			body:       `{"status":"error"}`,
			wantError:  true,
		},
		{
			name:       "HTTP 200 malformed JSON",
			statusCode: http.StatusOK,
			body:       `not-json`,
			wantError:  true,
		},
		{
			name:       "HTTP 200 missing status",
			statusCode: http.StatusOK,
			body:       `{}`,
			wantError:  true,
		},
		{
			name:       "HTTP 401 unauthorized",
			statusCode: http.StatusUnauthorized,
			body:       `{"status":"error"}`,
			wantError:  true,
		},
		{
			name:       "HTTP 500 server error",
			statusCode: http.StatusInternalServerError,
			body:       `{"status":"error"}`,
			wantError:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(
				http.HandlerFunc(func(
					w http.ResponseWriter,
					r *http.Request,
				) {
					w.Header().Set(
						"Content-Type",
						"application/json",
					)

					w.WriteHeader(tt.statusCode)
					_, _ = w.Write([]byte(tt.body))
				}),
			)
			defer server.Close()

			sender, err := NewSender(
				Config{
					APIKey:      "test-api-key",
					LineNumber:  "30001234",
					PatternCode: "test-pattern",
				},
				server.Client(),
			)

			if err != nil {
				t.Fatalf(
					"expected sender construction, got %v",
					err,
				)
			}

			sender.endpoint =
				server.URL + "/ws/v1/sms/pattern"

			err = sender.SendOTP(
				context.Background(),
				"09121234567",
				"123456",
				time.Time{},
			)

			if tt.wantError {
				if !errors.Is(err, ErrUnavailable) {
					t.Fatalf(
						"expected ErrUnavailable, got %v",
						err,
					)
				}

				return
			}

			if err != nil {
				t.Fatalf(
					"expected SMS success, got %v",
					err,
				)
			}
		})
	}
}

func TestNewSenderRejectsInvalidConfig(t *testing.T) {
	validConfig := Config{
		APIKey:      "test-api-key",
		LineNumber:  "30001234",
		PatternCode: "test-pattern",
	}

	client := &http.Client{}

	tests := []struct {
		name   string
		config Config
		client *http.Client
	}{
		{
			name: "missing API key",
			config: Config{
				LineNumber:  "30001234",
				PatternCode: "test-pattern",
			},
			client: client,
		},
		{
			name: "whitespace API key",
			config: Config{
				APIKey:      "   ",
				LineNumber:  "30001234",
				PatternCode: "test-pattern",
			},
			client: client,
		},
		{
			name: "missing line number",
			config: Config{
				APIKey:      "test-api-key",
				PatternCode: "test-pattern",
			},
			client: client,
		},
		{
			name: "whitespace line number",
			config: Config{
				APIKey:      "test-api-key",
				LineNumber:  "   ",
				PatternCode: "test-pattern",
			},
			client: client,
		},
		{
			name: "missing pattern code",
			config: Config{
				APIKey:     "test-api-key",
				LineNumber: "30001234",
			},
			client: client,
		},
		{
			name: "whitespace pattern code",
			config: Config{
				APIKey:      "test-api-key",
				LineNumber:  "30001234",
				PatternCode: "   ",
			},
			client: client,
		},
		{
			name:   "missing HTTP client",
			config: validConfig,
			client: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sender, err := NewSender(
				tt.config,
				tt.client,
			)

			if !errors.Is(err, ErrUnavailable) {
				t.Fatalf(
					"expected ErrUnavailable, got %v",
					err,
				)
			}

			if sender != nil {
				t.Fatal(
					"invalid configuration must not create a sender",
				)
			}
		})
	}
}

func TestSenderHandlesNetworkFailure(t *testing.T) {
	networkFailure := errors.New(
		"synthetic network failure",
	)

	transportCalled := false

	client := &http.Client{
		Transport: roundTripFunc(
			func(
				request *http.Request,
			) (*http.Response, error) {
				transportCalled = true

				return nil, networkFailure
			},
		),
	}

	sender, err := NewSender(
		Config{
			APIKey:      "test-api-key",
			LineNumber:  "30001234",
			PatternCode: "test-pattern",
		},
		client,
	)

	if err != nil {
		t.Fatalf(
			"expected sender construction, got %v",
			err,
		)
	}

	err = sender.SendOTP(
		context.Background(),
		"09121234567",
		"123456",
		time.Time{},
	)

	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf(
			"expected ErrUnavailable, got %v",
			err,
		)
	}

	if !transportCalled {
		t.Fatal(
			"expected HTTP transport attempt",
		)
	}

	if errors.Is(err, networkFailure) {
		t.Fatal(
			"network internals must not be exposed",
		)
	}
}

func TestSenderHandlesCanceledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(
		context.Background(),
	)

	// Cancel before starting the HTTP request.
	cancel()

	client := &http.Client{
		Transport: roundTripFunc(
			func(
				request *http.Request,
			) (*http.Response, error) {
				if request.Context().Err() == nil {
					t.Error(
						"expected canceled request context",
					)
				}

				return nil, request.Context().Err()
			},
		),
	}

	sender, err := NewSender(
		Config{
			APIKey:      "test-api-key",
			LineNumber:  "30001234",
			PatternCode: "test-pattern",
		},
		client,
	)

	if err != nil {
		t.Fatalf(
			"expected sender construction, got %v",
			err,
		)
	}

	err = sender.SendOTP(
		ctx,
		"09121234567",
		"123456",
		time.Time{},
	)

	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf(
			"expected ErrUnavailable, got %v",
			err,
		)
	}
}
