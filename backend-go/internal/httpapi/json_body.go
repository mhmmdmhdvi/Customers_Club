package httpapi

import (
	"bytes"
	"compress/gzip"
	"compress/zlib"
	"context"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/andybalholm/brotli"
	"golang.org/x/text/encoding/unicode"
)

type jsonBodyKey struct{}

// WithBrowserPolicy handles allowed preflights before this boundary. All other
// requests are parsed once before path/method selection, like express.json().
func withJSONBoundary(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, valid := readAuthJSON(w, r)
		if !valid {
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), jsonBodyKey{}, body)))
	})
}

func requestJSON(r *http.Request) map[string]any {
	body, _ := r.Context().Value(jsonBodyKey{}).(map[string]any)
	return body
}

func writeJSONBodyError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Cache-Control", "no-store")
	writeOTPMessage(w, status, message)
}

// Like express.json, parse only application/json and accept object/array roots.
// Map lookup is deliberately case sensitive, matching JavaScript property access.
func readAuthJSON(w http.ResponseWriter, r *http.Request) (map[string]any, bool) {
	// body-parser skips requests with neither Content-Length nor transfer coding
	// before charset/content-encoding checks. Do not reject bodyless public GETs.
	if r.Body == nil || (r.ContentLength == 0 && len(r.TransferEncoding) == 0 && r.Header.Get("Content-Length") == "") {
		return nil, true
	}
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
		writeJSONBodyError(w, http.StatusUnsupportedMediaType, "Unsupported JSON charset")
		return nil, false
	}
	var source io.Reader = r.Body
	var decompressor io.ReadCloser
	encoding := strings.ToLower(r.Header.Get("Content-Encoding"))
	switch encoding {
	case "", "identity":
	case "gzip":
		decompressor, err = gzip.NewReader(r.Body)
	case "deflate":
		decompressor, err = zlib.NewReader(r.Body)
	case "br":
		source = brotli.NewReader(r.Body)
	default:
		writeJSONBodyError(w, http.StatusUnsupportedMediaType, "Unsupported content encoding")
		return nil, false
	}
	if err != nil {
		writeJSONBodyError(w, http.StatusBadRequest, "Invalid request body")
		return nil, false
	}
	if decompressor != nil {
		defer decompressor.Close()
		source = decompressor
	}
	// Limit decompressed bytes, not Content-Length or the compressed stream.
	// Reading one byte past the limit distinguishes exactly 100 KiB from excess.
	data, err := io.ReadAll(io.LimitReader(source, 100*1024+1))
	if len(data) > 100*1024 {
		writeJSONBodyError(w, http.StatusRequestEntityTooLarge, "Request body too large")
		return nil, false
	}
	if err != nil {
		writeJSONBodyError(w, http.StatusBadRequest, "Invalid request body")
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
			writeJSONBodyError(w, http.StatusBadRequest, "Invalid request body")
			return nil, false
		}
	}
	// Like iconv-lite, strip a single decoded initial byte-order mark.
	data = bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		writeJSONBodyError(w, http.StatusBadRequest, "Invalid request body")
		return nil, false
	}
	switch body := value.(type) {
	case map[string]any:
		return body, true
	case []any:
		return nil, true
	default:
		writeJSONBodyError(w, http.StatusBadRequest, "Invalid request body")
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
