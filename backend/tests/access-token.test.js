// Runs against the real maintained JWT library, not a fake verifier.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { createAccessTokens } = require("../src/utils/access-token");
const conf = () => ({ secret: crypto.randomBytes(32), issuer: "test-api", audience: "test-web", accessTtlSeconds: 900 });
const SID = "122a8f89-1f56-4b08-85a7-384fb07d61e8";
function fixture(t) {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const config = conf(); return { config, tokens: createAccessTokens(config) };
}
function signed(config, patch = {}, options = {}) {
  return jwt.sign({ sid: SID, tokenUse: "access", sub: "1", iss: config.issuer, aud: config.audience,
    iat: 1000, exp: 1900, ...patch }, config.secret, { algorithm: "HS256", header: { typ: "JWT" }, ...options });
}
test("access JWT round-trips with minimal claims, no phone or names", (t) => {
  const { tokens } = fixture(t); const result = tokens.issue(1, SID, new Date(999999999));
  const decoded = jwt.decode(result.accessToken);
  assert.equal(result.expiresIn,900);
  assert.deepEqual(tokens.verify(result.accessToken),{userId:1,sessionId:SID});
  assert.equal(decoded.phone,undefined);assert.equal(decoded.role,undefined);assert.equal(decoded.firstName,undefined);
  assert.equal(decoded.tokenUse,"access");
});
test("access expiry is clipped to absolute session expiry",(t)=>{
  const {tokens}=fixture(t);const result=tokens.issue(1,SID,new Date(1_020_000));
  assert.equal(result.expiresIn,20);assert.equal(jwt.decode(result.accessToken).exp,1020);
});
test("access JWT expires exactly at exp",(t)=>{
  const {tokens}=fixture(t);const {accessToken}=tokens.issue(1,SID,new Date(9_000_000));
  t.mock.timers.setTime(1_899_999);assert.equal(tokens.verify(accessToken).userId,1);
  t.mock.timers.setTime(1_900_000);assert.throws(()=>tokens.verify(accessToken),{statusCode:401});
});
for(const [name,patch] of [
  ["wrong issuer",{iss:"other"}],["wrong audience",{aud:"other"}],
  ["wrong use",{tokenUse:"refresh"}],["invalid subject",{sub:"0"}],
  ["leading-zero subject",{sub:"01"}],["oversized subject",{sub:"9007199254740993"}],
  ["bad session ID",{sid:"not-a-session"}],["future issued-at",{iat:1001,exp:1900}],
  ["overlong lifetime",{exp:1901}],["expired",{exp:1000}],
  ["future not-before",{nbf:1001}],
]) {
  test(`JWT rejects ${name}`, (t)=>{
    const {tokens,config}=fixture(t);assert.throws(()=>tokens.verify(signed(config,patch)),{statusCode:401});
  });
}
for(const field of ["exp","iat","sid","tokenUse","sub"]) {
  test(`JWT rejects missing ${field}`, (t)=>{
    const {tokens,config}=fixture(t);
    const payload={sid:SID,tokenUse:"access",sub:"1",iss:config.issuer,aud:config.audience,iat:1000,exp:1900};delete payload[field];
    const token=jwt.sign(payload,config.secret,{algorithm:"HS256",...(field==="iat"?{noTimestamp:true}:{})});
    assert.throws(()=>tokens.verify(token),{statusCode:401});
  });
}
for(const algorithm of ["HS384","HS512","none"]) {
  test(`JWT rejects unapproved ${algorithm} algorithm`,(t)=>{
    const {tokens,config}=fixture(t);
    const token=algorithm==="none"?jwt.sign({sid:SID,sub:"1",exp:1900},null,{algorithm:"none"}):signed(config,{}, {algorithm});
    assert.throws(()=>tokens.verify(token),{statusCode:401});
  });
}
test("JWT rejects another key and a tampered payload",(t)=>{
  const {tokens,config}=fixture(t);const good=signed(config);
  const other=signed({...config,secret:crypto.randomBytes(32)});
  assert.throws(()=>tokens.verify(other),{statusCode:401});
  const [head,,sig]=good.split('.');const body=Buffer.from(JSON.stringify({...jwt.decode(good),sub:"2"})).toString("base64url");
  assert.throws(()=>tokens.verify(`${head}.${body}.${sig}`),{statusCode:401});
});
for(const input of [undefined,null,123,"", "x".repeat(5000)]) {
  test(`JWT input rejected (${typeof input})`,(t)=>{const{tokens}=fixture(t);assert.throws(()=>tokens.verify(input),{statusCode:401});});
}
