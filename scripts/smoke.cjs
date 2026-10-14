"use strict";
const assert=require("node:assert/strict");
async function smoke(base) {
 const origin=new URL(base);
 assert.ok(["http:","https:"].includes(origin.protocol));
 for(const path of ["/","/admin","/login"]) {
  const response=await fetch(new URL(path,origin),{redirect:"error",signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200,path);assert.match(response.headers.get("content-type"),/text\/html/);
  const html=await response.text(); assert.match(html,/<div id="root">/);
  if(path==="/") {
   const script=/<script\b[^>]*\bsrc="([^"]+)"/.exec(html);assert.ok(script,"Built SPA script missing");
   const asset=await fetch(new URL(script[1],origin),{signal:AbortSignal.timeout(10000)});assert.equal(asset.status,200);
   assert.match(await asset.text(),/["'`]\/api["'`]/,"SPA must be compiled with the same-site /api base");
  }
 }
 for(const path of ["/api/health","/api/ready"]) {
  const response=await fetch(new URL(path,origin),{redirect:"error",signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200,path);assert.match(response.headers.get("content-type"),/application\/json/);
 }
 // Harmless no-cookie logout verifies browser origin, CSRF and cookie flags.
 const response=await fetch(new URL("/api/auth/logout",origin),{method:"POST",headers:{Origin:origin.origin,"Content-Type":"application/json","X-CSRF-Protection":"1"},body:"{}",signal:AbortSignal.timeout(10000)});
 assert.equal(response.status,204);
 const cookie=response.headers.get("set-cookie");assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Path=\//);
 if(origin.protocol==="https:"){assert.match(cookie,/__Host-club_refresh=/);assert.match(cookie,/Secure/);}
 console.log("Smoke passed: SPA reloads, /api stripping, readiness and cookie policy.");
}
module.exports={smoke};
if(require.main===module) smoke(process.argv[2]).catch(()=>{console.error("Smoke verification failed.");process.exitCode=1;});
