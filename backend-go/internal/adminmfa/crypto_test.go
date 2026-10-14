package adminmfa

import (
	"encoding/json"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestNodeCiphertextAndTOTPInterop(t *testing.T) {
	script := `const c=require('./src/security/admin-mfa-crypto').createAdminMfaCrypto(Buffer.alloc(32,109)); const t=require('./src/security/totp'); console.log(JSON.stringify({encrypted:c.encrypt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'),code:t.generateTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',{timeMs:59000})}));`
	cmd := exec.Command("node", "-e", script)
	cmd.Dir = "../../../backend"
	out, e := cmd.Output()
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
	raw, _ := json.Marshal(enc)
	script = `const c=require('./src/security/admin-mfa-crypto').createAdminMfaCrypto(Buffer.alloc(32,109));process.stdout.write(c.decrypt(JSON.parse(process.argv[1])));`
	cmd = exec.Command("node", "-e", script, string(raw))
	cmd.Dir = "../../../backend"
	out, e = cmd.Output()
	if e != nil || string(out) != secret {
		t.Fatal("Node decrypt", e)
	}
	enc.Tag = strings.Repeat("A", 22)
	if _, e = c.Decrypt(enc); e == nil {
		t.Fatal("tamper accepted")
	}
}
