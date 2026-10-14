const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fixtures = require('../../contracts/sessions.json');
const { AuthError } = require('../src/utils/auth-error');
const { RegistrationError } = require('../src/utils/registration-error');
let scenario;
let realService;
const { createSessionService }=require('../src/services/session.service.factory');
const { createSessionDb }=require('./helpers/session-db');
const referenceDB=createSessionDb().prisma;
const adminMfaService=require('../src/services/admin-mfa.service.factory').createAdminMfaService(referenceDB,{mfaCrypto:require('../src/security/admin-mfa-crypto').createAdminMfaCrypto(Buffer.alloc(32,109))});
const reference=createSessionService(referenceDB,{tokens:{},adminMfaService});
const user = {id:1,phone:'09121234567',firstName:null,lastName:null,role:'MEMBER',birthYear:null,birthMonth:null,birthDay:null,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};
function grant() {
 if(scenario==='duplicate') throw new RegistrationError('Phone already registered',409);
 if(scenario==='register-invalid') throw new RegistrationError('Invalid or expired verification');
 if(scenario==='login-invalid') throw new AuthError('Invalid or expired verification');
 if(scenario==='invalid') throw new AuthError();
 if(scenario==='unexpected') throw new Error('private database/token detail');
 if(scenario==='challenge') return {mfaRequired:true,mfaChallengeToken:'c'.repeat(64),mfaExpiresAt:'2030-01-01T00:05:00.000Z'};
 return {user,accessToken:'a.b.c',expiresIn:900,accessExpiresAt:'2030-01-01T00:15:00.000Z',refreshToken:'b'.repeat(64),refreshExpiresAt:'2030-01-01T00:00:00.000Z'};
}
const filename=require.resolve('../src/services/session.service');
require.cache[filename]={id:filename,filename,loaded:true,exports:{register:async(input)=>realService?reference.register(input):grant(),login:async(input)=>realService?reference.login(input):grant(),completeAdminMfa:async(input)=>realService?reference.completeAdminMfa(input):grant(),refresh:async()=>grant(),logout:async()=>{},authenticate:async()=>({user:grant().user,sessionId:'session'})}};
process.env.ACCESS_TOKEN_SECRET='a'.repeat(64);process.env.JWT_ISSUER='tests';process.env.JWT_AUDIENCE='tests';process.env.AUTH_ALLOWED_ORIGINS='http://localhost:5173';
const app=require('../src/app');
for(const f of fixtures.cases) test(`shared session contract: ${f.name}`,async()=>{
 scenario=f.scenario;realService=f.realService;process.env.NODE_ENV=f.production?'production':'test';process.env.AUTH_ALLOWED_ORIGINS=f.production?'https://club.example':'http://localhost:5173';
 let req=request(app)[f.method.toLowerCase()](f.path).redirects(0);
 if(!f.noCSRF)req=req.set('X-CSRF-Protection','1');
 for(const[k,v]of Object.entries(f.headers??{}))req=req.set(k,v);
 if(f.largeCookie)req=req.set('Cookie','x'.repeat(f.largeCookie));
 if(f.largeAuthorization)req=req.set('Authorization','Bearer '+'a'.repeat(f.largeAuthorization-11)+'.b.c');
 if(f.raw!==undefined)req=req.set('Content-Type',f.contentType??'application/json').send(f.raw);else if(f.body!==undefined)req=req.send(f.body);
 const res=await req;assert.equal(res.status,f.status);assert.equal(res.headers['cache-control'],f.runtime?.node?.noCacheHeader?undefined:'no-store');
 const expected={...f,...f.runtime?.node};if(expected.json)assert.deepEqual(res.body,expected.json);if(expected.bodyContains)assert.ok(res.text.includes(expected.bodyContains));
 if(f.empty)assert.equal(res.text??'','');if(f.me)assert.deepEqual(res.body,{user});
 if(f.grant){assert.deepEqual(res.body,{message:f.message,authenticated:true,user,tokenType:'Bearer',accessToken:'a.b.c',expiresIn:900,accessExpiresAt:'2030-01-01T00:15:00.000Z'});const cookie=res.headers['set-cookie'][0];assert.ok(cookie.startsWith((f.production?'__Host-club_refresh':'club_refresh')+'='+'b'.repeat(64)));assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Path=\//);if(f.production)assert.match(cookie,/Secure/);}
 if(f.clearCookie){const cookie=res.headers['set-cookie'][0];assert.ok(cookie.startsWith('club_refresh=;'));assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);}
 assert.equal(res.body.refreshToken,undefined);
});
