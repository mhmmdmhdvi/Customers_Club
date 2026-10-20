package adminmfa

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

func TestCapturedCiphertextAndTOTPInterop(t *testing.T) {
	out, e := os.ReadFile("testdata/crypto-node.json")
	if e != nil {
		t.Fatal(e)
	}
	var v struct {
		Encrypted Encrypted `json:"encrypted"`
		Code      string    `json:"code"`
	}
	if e = json.Unmarshal(out, &v); e != nil {
		t.Fatal(e)
	}
	c, e := New([]byte(strings.Repeat("m", 32)))
	if e != nil {
		t.Fatal(e)
	}
	secret, e := c.Decrypt(v.Encrypted)
	if e != nil || secret != "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" {
		t.Fatal("decrypt", e)
	}
	counter, ok, e := Verify(secret, v.Code, time.Unix(59, 0))
	if e != nil || !ok || counter != 1 || v.Code != "287082" {
		t.Fatal("totp", counter, ok, e)
	}
	enc, e := c.Encrypt(secret)
	if e != nil {
		t.Fatal(e)
	}
	// Independently open Go-generated storage with the standard AES-GCM API.
	block, e := aes.NewCipher([]byte(strings.Repeat("m", 32)))
	if e != nil {
		t.Fatal(e)
	}
	aead, e := cipher.NewGCM(block)
	if e != nil {
		t.Fatal(e)
	}
	iv, _ := base64.RawURLEncoding.DecodeString(enc.IV)
	ct, _ := base64.RawURLEncoding.DecodeString(enc.Ciphertext)
	tag, _ := base64.RawURLEncoding.DecodeString(enc.Tag)
	out, e = aead.Open(nil, iv, append(ct, tag...), nil)
	if e != nil || string(out) != secret {
		t.Fatal("AES-GCM storage", e)
	}
	enc.Tag = strings.Repeat("A", 22)
	if _, e = c.Decrypt(enc); e == nil {
		t.Fatal("tamper accepted")
	}
}
