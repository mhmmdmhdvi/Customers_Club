const test = require("node:test");
const assert = require("node:assert/strict");
const { readRefreshCookie, setRefreshCookie, clearRefreshCookie } = require("../src/utils/session-cookie");
const { createSessionGuard, createAuthentication, requireRole } = require("../src/middleware/session-auth");
const { AuthError } = require("../src/utils/auth-error");
const config = { allowedOrigins: ["http://localhost:5173"], cookie: { name: "club_refresh", secure: false } };
const token = "c".repeat(64);
function response() {
  return { code: 200, body: null, headers: {}, cookies: [], set(k,v) { this.headers[k]=v; return this; },
    status(v) {this.code=v;return this;}, json(v) {this.body=v;return this;},
    cookie(...args) {this.cookies.push(args);return this;}, clearCookie(...args) {this.cleared=args;return this;} };
}
function req(extra={}) { const headers={origin: "http://localhost:5173", "content-type":"application/json", "x-csrf-protection":"1", ...extra}; return {headers, get(k){return this.headers[k.toLowerCase()];},is(type){return type === "application/json" && this.headers["content-type"] === type;}}; }

test("refresh cookie accepts only one well-formed named credential", () => {
  assert.equal(readRefreshCookie(req({cookie:`other=x; club_refresh=${token}`}),config), token);
  assert.equal(readRefreshCookie(req(),config), undefined);
});
for (const cookie of [`club_refresh=${token}; club_refresh=${token}`, "club_refresh=short", "club_refresh=%61", `club_refresh=${token.toUpperCase()}`, "x".repeat(9000)]) {
  test(`bad refresh cookie rejected (${cookie.length})`, () => {
    assert.throws(() => readRefreshCookie(req({cookie}),config), {statusCode:401});
  });
}
test("cookies use HttpOnly, strict same-site, host-only path and matching deletion", () => {
  const res=response(); setRefreshCookie(res,token,new Date(Date.now()+100000).toISOString(),config);
  const [name,value,options]=res.cookies[0];
  assert.equal(name,"club_refresh");assert.equal(value,token);
  assert.equal(options.httpOnly,true);assert.equal(options.sameSite,"strict");
  assert.equal(options.path,"/");assert.equal(options.domain,undefined);
  assert.equal(options.secure,false);assert.ok(options.maxAge>0);
  clearRefreshCookie(res,config);
  assert.deepEqual(res.cleared,[name,{httpOnly:true,sameSite:"strict",secure:false,path:"/"}]);
});
test("production cookie retains Secure flag", () => {
  const res=response(); setRefreshCookie(res,token,new Date(Date.now()+100000).toISOString(),{...config,cookie:{name:"__Host-club_refresh",secure:true}});
  assert.equal(res.cookies[0][2].secure,true);
});
for (const [label, headers, code] of [
  ["missing CSRF header",{"x-csrf-protection":undefined},403],
  ["bad CSRF header",{"x-csrf-protection":"0"},403],
  ["untrusted origin",{origin:"https://attacker.test"},403],
  ["null origin",{origin:"null"},403],
  ["duplicate origins",{origin:["http://localhost:5173","https://attacker.test"]},403],
  ["form body",{"content-type":"application/x-www-form-urlencoded"},415],
]) {
  test(`session mutation blocks ${label}`, () => {
    const res=response(); let next=false;
    createSessionGuard(()=>config)(req(headers),res,()=>{next=true;});
    assert.equal(next,false);assert.equal(res.code,code);
  });
}
for (const origin of ["http://localhost:5173",undefined]) {
  test(`JSON plus custom header allowed (${origin ?? "non-browser"})`, () => {
    let next=false;createSessionGuard(()=>config)(req({origin}),response(),()=>{next=true;});assert.equal(next,true);
  });
}
for (const authorization of [undefined,"", "Bearer", "Basic abc", "Bearer a b", ["Bearer a","Bearer b"], "Bearer " + "x".repeat(4100)]) {
  test(`bad authorization header rejected (${typeof authorization})`, async () => {
    const res=response(); let calls=0;
    const middleware=createAuthentication({authenticate:async()=>{calls++;}});
    await middleware(req({authorization}),res,()=>assert.fail("must not proceed"));
    assert.equal(calls,0);assert.equal(res.code,401);
  });
}
test("middleware accepts Bearer only and attaches authenticated user", async () => {
  const request=req({authorization:"Bearer signed.token.here"});const res=response();let next=false;
  await createAuthentication({authenticate:async(value)=>{assert.equal(value,"signed.token.here");return {user:{id:1,role:"MEMBER"},sessionId:"sid"};}})(request,res,()=>{next=true;});
  assert.equal(next,true);assert.equal(request.auth.user.id,1);assert.equal(res.headers["Cache-Control"],"no-store");
});
test("middleware maps invalid credentials without exposing details", async () => {
  const res=response();
  await createAuthentication({authenticate:async()=>{throw new AuthError();}})(req({authorization:"Bearer a.b.c"}),res,()=>assert.fail());
  assert.equal(res.code,401);assert.deepEqual(res.body,{message:"Invalid or expired session"});
});
for(const [role,allowed] of [["MEMBER",false],["ADMIN",true]]) {
  test(`ADMIN authorization for ${role}: ${allowed}`,()=>{
    const res=response();let next=false;requireRole("ADMIN")({auth:{user:{role}}},res,()=>{next=true;});
    assert.equal(next,allowed);if(!allowed) assert.equal(res.code,403);
  });
}
test("role middleware fails closed without authentication",()=>{
  const res=response();requireRole("ADMIN")({},res,()=>assert.fail());assert.equal(res.code,401);
});
