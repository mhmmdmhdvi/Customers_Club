// Shared actual HTTP boundary; real Node business validators and transactions
// execute against deterministic database replies. Real PostgreSQL checks live
// in backend-go's guarded harness and production-wrapped integration tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fixtures = require('../../contracts/admin-contact.json');
const { AuthError } = require('../src/utils/auth-error');
let scenario;
let role;
function replace(path, exports) { const id=require.resolve(path);require.cache[id]={id,filename:id,loaded:true,exports}; }
const message = { id:1,name:'Test',phone:'09121234567',email:null,subject:'SUPPORT',message:'private body',status:'NEW',createdAt:new Date('2026-01-01T00:00:00.000Z'),updatedAt:new Date('2026-01-01T00:00:00.000Z') };
const prisma = {
 user:{ count:async()=>0,findMany:async()=>[] },
 authSession:{count:async()=>0},
 contactMessage:{count:async()=>scenario==='quota'?3:0,create:async()=>{if(scenario==='unexpected')throw Error('private dependency detail');return message;},findMany:async()=>[],findUnique:async({where,select})=>{if(where.id!==1)return null;return Object.fromEntries(Object.keys(select).map(k=>[k,message[k]]));},updateMany:async({data})=>{message.status=data.status;return {count:1};}},
 adminAuditEvent:{count:async()=>0,findMany:async()=>[],findUnique:async()=>null,create:async()=>({id:1})},
 securityEvent:{count:async()=>0,findMany:async()=>[],findUnique:async()=>null,create:async()=>({id:1})},
};
prisma.$transaction=async work=>work(prisma);
const audit=require('../src/services/admin-audit.service.factory').createAdminAuditService(prisma);
const contact=require('../src/services/contact-message.service.factory').createContactMessageService(prisma,{withPhoneLock:async(db,phone,work)=>work(db)});
replace('../src/services/contact-message.service',contact);
replace('../src/services/admin-users.service',require('../src/services/admin-users.service.factory').createAdminUsersService(prisma));
replace('../src/services/admin-messages.service',require('../src/services/admin-messages.service.factory').createAdminMessagesService(prisma,{adminAuditService:audit}));
replace('../src/services/admin-overview.service',require('../src/services/admin-overview.service.factory').createAdminOverviewService(prisma));
replace('../src/services/admin-audit-read.service',require('../src/services/admin-audit-read.service.factory').createAdminAuditReadService(prisma));
replace('../src/services/admin-security-read.service',require('../src/services/admin-security-read.service.factory').createAdminSecurityReadService(prisma));
replace('../src/services/security-event.service',{record:async()=>{}});
replace('../src/services/session.service',{authenticate:async()=>{if(scenario==='invalid')throw new AuthError();return {user:{id:1,role},sessionId:'session'};}});
process.env.ACCESS_TOKEN_SECRET='a'.repeat(64);process.env.JWT_ISSUER='tests';process.env.JWT_AUDIENCE='tests';process.env.AUTH_ALLOWED_ORIGINS='http://localhost:5173';
const app=require('../src/app');
for(const f of fixtures.cases)test(`shared admin/contact contract: ${f.name}`,async()=>{
 scenario=f.scenario;role=f.role??'ADMIN';message.status='NEW';
 let req=request(app)[f.method.toLowerCase()](f.path).redirects(0).set('X-Request-Id','client');
 if(role!=='anonymous')req=req.set('Authorization','Bearer a.b.c');
 if(!f.noCSRF)req=req.set('X-CSRF-Protection','1');
 for(const[k,v]of Object.entries(f.headers??{}))req=req.set(k,v);
 if(f.raw!==undefined)req=req.set('Content-Type',f.contentType??'application/json').send(f.raw);else if(f.body!==undefined)req=req.send(f.body);
 const diagnostics=[];const originalError=console.error;console.error=(...args)=>diagnostics.push(args);
 let res;try{res=await req;}finally{console.error=originalError;}
 assert.deepEqual(diagnostics,f.scenario==='unexpected'?[['Contact message operation failed']]:[]);
 assert.equal(res.status,f.status,res.text);
 const expected={...f,...f.runtime?.node};
 if(expected.json)assert.deepEqual(res.body,expected.json);
 if(expected.bodyContains)assert.ok(res.text.includes(expected.bodyContains),res.text);
 if(f.text)assert.equal(res.text,f.text);
 assert.equal(res.headers['cache-control'],'no-store');assert.match(res.headers['x-request-id'],/^[a-f0-9-]{36}$/);
});
