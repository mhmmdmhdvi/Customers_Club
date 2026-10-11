package farazsms

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

const patternEndpoint = "https://api.iranpayamak.com/ws/v1/sms/pattern"

var ErrUnavailable = errors.New("SMS delivery unavailable")

type Config struct {
	APIKey      string
	LineNumber  string
	PatternCode string
}

type Sender struct {
	apiKey      string
	lineNumber  string
	patternCode string
	client      *http.Client
	endpoint    string
}

type patternAttributes struct {
	Code string `json:"code"`
}

type patternRequest struct {
	Code         string            `json:"code"`
	Attributes   patternAttributes `json:"attributes"`
	Recipient    string            `json:"recipient"`
	LineNumber   string            `json:"line_number"`
	NumberFormat string            `json:"number_format"`
}

func NewSender(
	config Config,
	client *http.Client,
) (*Sender, error) {
	apiKey := strings.TrimSpace(config.APIKey)
	lineNumber := strings.TrimSpace(config.LineNumber)
	patternCode := strings.TrimSpace(config.PatternCode)

	if apiKey == "" ||
		lineNumber == "" ||
		patternCode == "" ||
		client == nil {
		return nil, ErrUnavailable
	}

	return &Sender{
		apiKey:      apiKey,
		lineNumber:  lineNumber,
		patternCode: patternCode,
		client:      client,
		endpoint:    patternEndpoint,
	}, nil
}

func (s *Sender) SendOTP(
	ctx context.Context,
	phone string,
	code string,
	expiresAt time.Time,
) error {
	if s == nil || s.client == nil {
		return ErrUnavailable
	}

	// FarazSMS does not require the OTP expiry
	// in its pattern request.

	payload := patternRequest{
		Code: s.patternCode,
		Attributes: patternAttributes{
			Code: code,
		},
		Recipient:    phone,
		LineNumber:   s.lineNumber,
		NumberFormat: "english",
	}

	body, err := json.Marshal(payload)

	if err != nil {
		return ErrUnavailable
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		s.endpoint,
		bytes.NewReader(body),
	)

	if err != nil {
		return ErrUnavailable
	}

	request.Header.Set(
		"Accept",
		"application/json",
	)

	request.Header.Set(
		"Api-Key",
		s.apiKey,
	)

	request.Header.Set(
		"Content-Type",
		"application/json",
	)

	response, err := s.client.Do(request)

	if err != nil {
		return ErrUnavailable
	}

	defer response.Body.Close()

	// Node.js accepts HTTP 201 directly.
	if response.StatusCode == http.StatusCreated {
		return nil
	}

	if response.StatusCode != http.StatusOK {
		return ErrUnavailable
	}

	// For HTTP 200, Node.js requires a JSON
	// response containing {"status":"success"}.
	// Bound the response size to avoid unbounded reads.
	const maxResponseBytes = 64 * 1024

	responseBody, err := io.ReadAll(
		io.LimitReader(
			response.Body,
			maxResponseBytes+1,
		),
	)

	if err != nil ||
		len(responseBody) > maxResponseBytes {
		return ErrUnavailable
	}

	var result struct {
		Status string `json:"status"`
	}

	if err := json.Unmarshal(
		responseBody,
		&result,
	); err != nil {
		return ErrUnavailable
	}

	if result.Status != "success" {
		return ErrUnavailable
	}

	return nil
}
