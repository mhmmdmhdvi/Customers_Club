const test = require("node:test");
const assert = require("node:assert/strict");
const { createSessionController } = require("../src/controllers/session.controller.factory");
const { AuthError, AuthConfigurationError } = require("../src/utils/auth-error");
const { RegistrationError } = require("../src/utils/registration-error");
const config = { cookie: { name: "club_refresh", secure: false } };
function response() {return {code:200,headers:{},cookies:[],set(k,v){this.headers[k]=v;return this;},status(c){this.code=c;return this;},json(body){this.body=body;return this;},end(){this.ended=true;return this;},cookie(...args){this.cookies.push(args);return this;},clearCookie(...args){this.cleared=args;return this;}};}
function grant() {return { user:{id:1,phone:"09121234567",role:"MEMBER"},accessToken:"signed.access.jwt",expiresIn:900,accessExpiresAt:new Date(Date.now()+900000).toISOString(),refreshToken:"c".repeat(64),refreshExpiresAt:new Date(Date.now()+600000).toISOString() };}
for(const [method,status,message] of [["register",201,"Registration completed"],["login",200,"Logged in"],["refresh",200,"Session refreshed"]]) {
  test(`${method} sets cookie but exposes only access credential in JSON`,async()=>{
    const result=grant();const res=response();let received;
    const controller=createSessionController({sessionService:{[method]:async(input)=>{received=input;return result;}},getConfig:()=>config});
    const body={verificationToken:"a".repeat(64)};
    await controller[method]({body,headers:{cookie:`club_refresh=${result.refreshToken}`}},res);
    assert.equal(res.code,status);assert.equal(res.body.message,message);assert.equal(res.body.authenticated,true);
    assert.equal(res.body.tokenType,"Bearer");assert.equal(res.body.accessToken,result.accessToken);
    assert.equal(res.body.refreshToken,undefined);assert.ok(!JSON.stringify(res.body).includes(result.refreshToken));
    assert.equal(res.cookies[0][1],result.refreshToken);assert.equal(res.headers["Cache-Control"],"no-store");
    assert.deepEqual(received,method==="refresh"?result.refreshToken:body);
  });
}
for(const status of [400,409]) {
  test(`register preserves expected validation error ${status}`,async()=>{
    const res=response();const api=createSessionController({sessionService:{register:async()=>{throw new RegistrationError("expected",status);}},getConfig:()=>config});
    await api.register({body:{},headers:{}},res);assert.equal(res.code,status);assert.deepEqual(res.body,{message:"expected"});assert.equal(res.cookies.length,0);
  });
}
for(const method of ["login","register","refresh","logout"]){
  test(`${method} rejects missing config before database work`,async()=>{
    const res=response();const api=createSessionController({sessionService:{[method]:async()=>assert.fail("No database access without config")},getConfig:()=>{throw new AuthConfigurationError();}});
    await api[method]({body:{},headers:{}},res);assert.equal(res.code,503);
  });
}
test("refresh rejection clears cookie; raw secret does not leak",async()=>{
  const res=response();const api=createSessionController({sessionService:{refresh:async()=>{throw new AuthError();}},getConfig:()=>config});
  await api.refresh({headers:{cookie:`club_refresh=${"a".repeat(64)}`}},res);
  assert.equal(res.code,401);assert.equal(res.cleared[0],"club_refresh");
});
test("unexpected database exception produces generic response and safe log",async(t)=>{
  const log=t.mock.method(console,"error",()=>{});const res=response();
  const api=createSessionController({sessionService:{login:async()=>{throw new Error("postgresql://private-token-password");}},getConfig:()=>config});
  await api.login({headers:{},body:{}},res);assert.equal(res.code,500);assert.deepEqual(res.body,{message:"Internal server error"});
  assert.ok(!JSON.stringify(log.mock.calls).includes("private-token"));
});
test("logout returns 204, clears cookie, and never sends a token",async()=>{
  const res=response();let received;const api=createSessionController({sessionService:{logout:async(v)=>{received=v;}},getConfig:()=>config});
  await api.logout({headers:{cookie:`club_refresh=${"a".repeat(64)}`}},res);
  assert.equal(received,"a".repeat(64));assert.equal(res.code,204);assert.equal(res.ended,true);assert.equal(res.body,undefined);assert.equal(res.cleared[0],"club_refresh");
});
test("me returns only the authenticated current user",async()=>{
  const res=response();const user={id:1,role:"MEMBER"};const api=createSessionController({sessionService:{},getConfig:()=>config});
  await api.me({auth:{user,sessionId:"private-session"}},res);assert.deepEqual(res.body,{user});assert.equal(res.headers["Cache-Control"],"no-store");
});
