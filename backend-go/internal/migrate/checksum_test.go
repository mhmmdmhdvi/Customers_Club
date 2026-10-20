package migrate

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"testing"
)

func TestCanonicalSQLAndChecksumIgnoreCheckoutLineEndings(t *testing.T) {
	want := []byte("SELECT 1;\nSELECT 2;\n")
	for _, input := range [][]byte{want, []byte("SELECT 1;\r\nSELECT 2;\r\n")} {
		if !bytes.Equal(canonicalSQL(input), want) {
			t.Fatal("SQL execution depends on checkout line endings")
		}
		if checksum(input) != fmt.Sprintf("%x", sha256.Sum256(want)) {
			t.Fatal("ledger checksum depends on checkout line endings")
		}
	}
}
