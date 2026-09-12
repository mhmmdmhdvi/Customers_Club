// These tests check our policy wrapper through an injected library interface.
// access-token.test.js separately exercises the REAL jsonwebtoken library.
const test=require("node:test");const assert=require("node:assert/strict");const crypto=require("node:crypto");
const {createAccessTokens}=require("../src/utils/access-token");
const sid="122a8f89-1f56-4b08-85a7-384fb07d61e8";
function setup(t){t.mock.timers.enable({apis:["Date"],now:1_000_000});const config={secret:crypto.randomBytes(32),issuer:"api",audience:"web",accessTtlSeconds:900};return config;}
test("JWT wrapper asks library to sign HS256 with issuer audience and subject",(t)=>{
  const c=setup(t);const lib={sign(p,key,opts){assert.equal(key,c.secret);assert.deepEqual(p,{sid,tokenUse:"access",iat:1000,exp:1900});assert.deepEqual(opts,{algorithm:"HS256",issuer:"api",audience:"web",subject:"1",header:{typ:"JWT"}});return"jwt";}};
  assert.equal(createAccessTokens(c,lib).issue(1,sid,new Date(2_000_000)).accessToken,"jwt");
});
test("JWT wrapper passes exact verification policy",(t)=>{
  const c=setup(t);const lib={verify(raw,key,opts){assert.equal(raw,"jwt");assert.equal(key,c.secret);assert.deepEqual(opts,{algorithms:["HS256"],issuer:"api",audience:"web",clockTimestamp:1000,clockTolerance:0,complete:true});return{header:{alg:"HS256",typ:"JWT"},payload:{sid,sub:"1",tokenUse:"access",iss:"api",aud:"web",iat:1000,exp:1900}};}};
  assert.deepEqual(createAccessTokens(c,lib).verify("jwt"),{userId:1,sessionId:sid});
});
for(const patch of [{tokenUse:"refresh"},{sub:"0"},{exp:1901},{iat:1001},{sid:"bad"},{iss:"else"}]){
  test(`wrapper rejects signed but incorrect claims ${JSON.stringify(patch)}`,(t)=>{
    const c=setup(t);const lib={verify(){return{header:{alg:"HS256",typ:"JWT"},payload:{sid,sub:"1",tokenUse:"access",iss:"api",aud:"web",iat:1000,exp:1900,...patch}};}};
    assert.throws(()=>createAccessTokens(c,lib).verify("jwt"),{statusCode:401});
  });
}
test("signing cannot outlive or resurrect an expired session",(t)=>{
  const c=setup(t);const lib={sign(p){assert.equal(p.exp,1010);return"jwt";}};const tokens=createAccessTokens(c,lib);
  assert.equal(tokens.issue(1,sid,new Date(1_010_000)).expiresIn,10);
  assert.throws(()=>tokens.issue(1,sid,new Date(1_000_000)),{statusCode:401});
});
