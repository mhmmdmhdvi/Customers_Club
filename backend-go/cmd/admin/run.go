package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/adminmfa"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/adminops"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/database"
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/phone"
	"io"
)

func run(ctx context.Context, args []string, env map[string]string, out io.Writer) error {
	if len(args) != 2 || (args[0] != "promote" && args[0] != "mfa-enroll" && args[0] != "mfa-reset") {
		return errors.New("usage: admin <promote|mfa-enroll|mfa-reset> <phone>")
	}
	if !phone.IsValidIranianMobile(phone.Normalize(args[1])) {
		return errors.New("invalid Iranian mobile number")
	}
	var crypto *adminmfa.Crypto
	if args[0] != "promote" {
		key, e := hex.DecodeString(env["ADMIN_MFA_ENCRYPTION_KEY"])
		if e != nil || len(key) != 32 {
			return errors.New("ADMIN_MFA_ENCRYPTION_KEY must contain 64 hexadecimal characters")
		}
		crypto, e = adminmfa.New(key)
		if e != nil {
			return e
		}
	}
	cfg, e := database.ConfigFromEnv(env)
	if e != nil {
		return e
	}
	pool, e := database.Open(ctx, cfg)
	if e != nil {
		return e
	}
	defer pool.Close()
	service := adminops.New(pool, crypto)
	var result adminops.Enrollment
	switch args[0] {
	case "promote":
		result.UserID, e = service.Promote(ctx, args[1])
	case "mfa-enroll":
		result, e = service.Enroll(ctx, args[1])
	case "mfa-reset":
		result, e = service.Reset(ctx, args[1])
	}
	if e != nil {
		return e
	}
	return json.NewEncoder(out).Encode(result)
}
