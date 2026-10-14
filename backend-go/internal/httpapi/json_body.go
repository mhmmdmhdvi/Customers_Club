package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

	"golang.org/x/text/encoding/unicode"
)

// Like express.json, parse only application/json and accept object/array roots.
// Map lookup is deliberately case sensitive, matching JavaScript property access.
func readAuthJSON(w http.ResponseWriter, r *http.Request) (map[string]any, bool) {
	mediaType, params, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return nil, true
	}
	charset := strings.ToLower(params["charset"])
	if charset == "" {
		charset = "utf-8"
	}
	switch charset {
	case "utf-8", "utf-16", "utf-16le", "utf-16be":
	default:
		writeOTPMessage(w, http.StatusUnsupportedMediaType, "Unsupported JSON charset")
		return nil, false
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 100*1024))
	if err != nil {
		var limit *http.MaxBytesError
		if errors.As(err, &limit) {
			writeOTPMessage(w, http.StatusRequestEntityTooLarge, "Request body too large")
		} else {
			writeOTPMessage(w, http.StatusBadRequest, "Invalid request body")
		}
		return nil, false
	}
	if len(data) == 0 {
		return nil, true
	}
	if charset != "utf-8" {
		endian := unicode.LittleEndian
		if charset == "utf-16be" || (charset == "utf-16" && utf16BigEndian(data)) {
			endian = unicode.BigEndian
		}
		data, err = unicode.UTF16(endian, unicode.IgnoreBOM).NewDecoder().Bytes(data)
		if err != nil {
			writeOTPMessage(w, http.StatusBadRequest, "Invalid request body")
			return nil, false
		}
	}
	// Like iconv-lite, strip a single decoded initial byte-order mark.
	data = bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		writeOTPMessage(w, http.StatusBadRequest, "Invalid request body")
		return nil, false
	}
	switch body := value.(type) {
	case map[string]any:
		return body, true
	case []any:
		return nil, true
	default:
		writeOTPMessage(w, http.StatusBadRequest, "Invalid request body")
		return nil, false
	}
}

// iconv-lite's unqualified UTF-16 decoder uses a BOM first, then counts ASCII
// characters in the first 100 code units to infer endian order; ties use LE.
func utf16BigEndian(data []byte) bool {
	if bytes.HasPrefix(data, []byte{0xfe, 0xff}) {
		return true
	}
	if bytes.HasPrefix(data, []byte{0xff, 0xfe}) {
		return false
	}
	var big, little int
	for i := 0; i+1 < len(data) && i < 200; i += 2 {
		if data[i] == 0 && data[i+1] != 0 {
			big++
		}
		if data[i] != 0 && data[i+1] == 0 {
			little++
		}
	}
	return big > little
}
