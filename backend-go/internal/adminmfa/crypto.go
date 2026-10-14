// Package adminmfa implements Node-compatible AES-256-GCM storage and SHA1 TOTP.
package adminmfa

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"
)

type Encrypted struct {
	Ciphertext string `json:"ciphertext"`
	IV         string `json:"iv"`
	Tag        string `json:"tag"`
}
type Crypto struct{ aead cipher.AEAD }

func New(key []byte) (*Crypto, error) {
	if len(key) != 32 {
		return nil, errors.New("Admin MFA encryption key must be 32 bytes")
	}
	block, e := aes.NewCipher(key)
	if e != nil {
		return nil, e
	}
	aead, e := cipher.NewGCM(block)
	if e != nil {
		return nil, e
	}
	return &Crypto{aead}, nil
}
func (c *Crypto) Encrypt(secret string) (Encrypted, error) {
	if secret == "" {
		return Encrypted{}, errors.New("MFA secret required")
	}
	iv := make([]byte, c.aead.NonceSize())
	if _, e := rand.Read(iv); e != nil {
		return Encrypted{}, e
	}
	out := c.aead.Seal(nil, iv, []byte(secret), nil)
	split := len(out) - c.aead.Overhead()
	encode := base64.RawURLEncoding.EncodeToString
	return Encrypted{encode(out[:split]), encode(iv), encode(out[split:])}, nil
}
func (c *Crypto) Decrypt(v Encrypted) (string, error) {
	decode := base64.RawURLEncoding.DecodeString
	iv, e := decode(v.IV)
	if e != nil || len(iv) != c.aead.NonceSize() {
		return "", errors.New("invalid encrypted MFA secret")
	}
	ct, e := decode(v.Ciphertext)
	if e != nil {
		return "", errors.New("invalid encrypted MFA secret")
	}
	tag, e := decode(v.Tag)
	if e != nil || len(tag) != c.aead.Overhead() {
		return "", errors.New("invalid encrypted MFA secret")
	}
	plain, e := c.aead.Open(nil, iv, append(ct, tag...), nil)
	if e != nil {
		return "", errors.New("invalid encrypted MFA secret")
	}
	return string(plain), nil
}
func Generate(secret string, now time.Time) (string, error) {
	return generateCounter(secret, now.Unix()/30)
}
func generateCounter(secret string, counter int64) (string, error) {
	if counter < 0 {
		return "", errors.New("invalid TOTP time")
	}
	secret = strings.ToUpper(strings.TrimRight(secret, "="))
	secret = strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return -1
		}
		return r
	}, secret)
	key, e := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if e != nil || len(key) == 0 {
		return "", errors.New("invalid TOTP secret")
	}
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(counter))
	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	v := mac.Sum(nil)
	offset := int(v[len(v)-1] & 15)
	code := binary.BigEndian.Uint32(v[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", code%1000000), nil
}
func Verify(secret, code string, now time.Time) (int64, bool, error) {
	if len(code) != 6 {
		return 0, false, nil
	}
	for counter := now.Unix()/30 - 1; counter <= now.Unix()/30+1; counter++ {
		if counter < 0 {
			continue
		}
		candidate, e := generateCounter(secret, counter)
		if e != nil {
			return 0, false, e
		}
		if subtle.ConstantTimeCompare([]byte(candidate), []byte(code)) == 1 {
			return counter, true, nil
		}
	}
	return 0, false, nil
}
