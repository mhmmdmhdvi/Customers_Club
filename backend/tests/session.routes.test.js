// Real Express/Supertest/JWT, deliberately injected in-memory DB. No .env import.
const test=require("node:test");const assert=require("node:assert/strict");const crypto=require("node:crypto");
const express=require("express");const request=require("supertest");const cors=require("cors");
const {readAuthConfig,createSessionCorsOptions}=require("../src/config/auth");
const {createAccessTokens}=require("../src/utils/access-token");
const {createSessionService}=require("../src/services/session.service.factory");
const {createSessionController}=require("../src/controllers/session.controller.factory");
const {createSessionRoutes}=require("../src/routes/session.routes.factory");
const {createSessionDb}=require("./helpers/session-db");
const proof="d".repeat(64);const phone="09121234567";const origin="http://localhost:5173";
function setup(purpose="REGISTER",production=false){
  const browserOrigin=production?"https://club.example.test":origin;
  const config=readAuthConfig({NODE_ENV:production?"production":"test",ACCESS_TOKEN_SECRET:crypto.randomBytes(32).toString("hex"),JWT_ISSUER:"routes-test",JWT_AUDIENCE:"routes-web",AUTH_ALLOWED_ORIGINS:browserOrigin});
  const db=createSessionDb({users:purpose==="LOGIN"?[{id:1,phone,role:"MEMBER",firstName:"A",lastName:"B"}]:[],proofs:[{id:1,phone,tokenHash:crypto.createHash("sha256").update(proof).digest("hex"),purpose,usedAt:null,expiresAt:new Date(Date.now()+300000)}]});
  const service=createSessionService(db.prisma,{tokens:createAccessTokens(config)});
  const controller=createSessionController({sessionService:service,getConfig:()=>config});
  const app=express();app.use(cors(createSessionCorsOptions(()=>config)));app.use(express.json());app.use("/auth",createSessionRoutes({controller,sessionService:service,getConfig:()=>config}));
  const post=(path,body={},cookie)=>{let r=request(app).post(path).set("Origin",browserOrigin).set("X-CSRF-Protection","1").send(body);if(cookie)r=r.set("Cookie",cookie);return r;};
  return{app,db,post,config};
}
function cookie(res){return res.headers["set-cookie"][0].split(";")[0];}
const details=()=>({verificationToken:proof,firstName:"خسرو",lastName:"وفایی"});

test("HTTP registration -> me -> refresh -> logout works without another OTP",async()=>{
  const {app,db,post}=setup();const created=await post("/auth/register",details());
  assert.equal(created.status,201);assert.equal(created.body.authenticated,true);assert.equal(created.body.user.role,"MEMBER");
  assert.equal(created.body.refreshToken,undefined);assert.equal(created.headers["cache-control"],"no-store");
  const me=await request(app).get("/auth/me").set("Authorization",`Bearer ${created.body.accessToken}`);
  assert.equal(me.status,200);assert.equal(me.body.user.phone,phone);
  const refreshed=await post("/auth/refresh",{},cookie(created));assert.equal(refreshed.status,200);assert.notEqual(cookie(refreshed),cookie(created));
  const out=await post("/auth/logout",{},cookie(refreshed));assert.equal(out.status,204);
  const denied=await request(app).get("/auth/me").set("Authorization",`Bearer ${refreshed.body.accessToken}`);assert.equal(denied.status,401);
  assert.equal(db.state.sessions.length,1);
});
test("HTTP LOGIN proof creates an existing-member session",async()=>{
  const {app,post}=setup("LOGIN");const result=await post("/auth/login",{verificationToken:proof});
  assert.equal(result.status,200);const me=await request(app).get("/auth/me").set("Authorization",`Bearer ${result.body.accessToken}`);assert.equal(me.status,200);
});
test("HTTP proof reuse cannot create another login",async()=>{
  const {post,db}=setup("LOGIN");assert.equal((await post("/auth/login",{verificationToken:proof})).status,200);
  assert.equal((await post("/auth/login",{verificationToken:proof})).status,401);assert.equal(db.state.sessions.length,1);
});
test("HTTP refresh-token replay revokes replacement access",async()=>{
  const {app,post}=setup("LOGIN");const first=await post("/auth/login",{verificationToken:proof});const second=await post("/auth/refresh",{},cookie(first));
  assert.equal(second.status,200);const replay=await post("/auth/refresh",{},cookie(first));assert.equal(replay.status,401);
  assert.equal((await request(app).get("/auth/me").set("Authorization",`Bearer ${second.body.accessToken}`)).status,401);
});
test("production response cookie is HttpOnly Secure SameSite=Strict and host-only",async()=>{
  const {post}=setup("LOGIN",true);const res=await post("/auth/login",{verificationToken:proof});assert.equal(res.status,200);
  const value=res.headers["set-cookie"][0];assert.match(value,/^__Host-club_refresh=/);assert.match(value,/HttpOnly/);assert.match(value,/Secure/);assert.match(value,/SameSite=Strict/);assert.match(value,/Path=\//);assert.doesNotMatch(value,/Domain=/);
});
for(const path of ["/auth/register","/auth/login","/auth/refresh","/auth/logout"]){
  test(`${path} blocks missing CSRF header before data changes`,async()=>{
    const {app,db}=setup();const res=await request(app).post(path).send(details());assert.equal(res.status,403);assert.equal(db.state.users.length,0);assert.equal(db.state.sessions.length,0);assert.equal(db.state.proofs[0].usedAt,null);
  });
}
test("untrusted origin cannot read or change session",async()=>{
  const {app,db}=setup();const res=await request(app).post("/auth/register").set("Origin","https://evil.test").set("X-CSRF-Protection","1").send(details());
  assert.equal(res.status,403);assert.equal(res.headers["access-control-allow-origin"],undefined);assert.equal(db.state.users.length,0);
});
test("allowed browser preflight permits only the configured origin",async()=>{
  const {app}=setup();const res=await request(app).options("/auth/login").set("Origin",origin).set("Access-Control-Request-Method","POST").set("Access-Control-Request-Headers","content-type,x-csrf-protection");
  assert.equal(res.status,204);assert.equal(res.headers["access-control-allow-origin"],origin);assert.equal(res.headers["access-control-allow-credentials"],"true");
});
test("refresh token in JSON is not accepted instead of its cookie",async()=>{
  const {post}=setup("LOGIN");const first=await post("/auth/login",{verificationToken:proof});
  const token=cookie(first).split("=")[1];const res=await post("/auth/refresh",{refreshToken:token});assert.equal(res.status,401);
});
test("me never accepts an access token from a URL or cookie",async()=>{
  const {app,post}=setup("LOGIN");const first=await post("/auth/login",{verificationToken:proof});
  assert.equal((await request(app).get("/auth/me").query({accessToken:first.body.accessToken}).set("Cookie",cookie(first))).status,401);
});
test("unapproved extra registration fields are rejected",async()=>{
  const {db,post}=setup();const res=await post("/auth/register",{...details(),role:"ADMIN"});assert.equal(res.status,400);assert.equal(db.state.users.length,0);
});
