// Only invoked by Go testdb.Open, against its independently marked child.
const assert=require('node:assert/strict');
async function main(){
 const raw=process.env.ADMIN_REFERENCE_DATABASE_URL;const url=new URL(raw);const owned=/^\/mig_test_([a-f0-9]{16})_([a-f0-9]{32})$/.exec(url.pathname);
 assert.ok(owned);assert.equal(url.hostname,'127.0.0.1');assert.notEqual(url.port,'5432');assert.equal(process.env.ADMIN_REFERENCE_CONFIRM,'read:'+url.pathname.slice(1));
 const {PrismaClient}=require('../../src/generated/prisma');const {PrismaPg}=require('@prisma/adapter-pg');const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:raw})});
 try{
  const [identity]=await prisma.$queryRawUnsafe("SELECT current_database() database,current_user username,shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()");
  assert.equal(identity.database,url.pathname.slice(1));assert.equal(identity.username,`mig_owner_${owned[1]}`);assert.equal(identity.marker,`customers-club-migration:${owned[1]}:${owned[2]}`);
  const services={users:require('../../src/services/admin-users.service.factory').createAdminUsersService(prisma),messages:require('../../src/services/admin-messages.service.factory').createAdminMessagesService(prisma),audit:require('../../src/services/admin-audit-read.service.factory').createAdminAuditReadService(prisma),security:require('../../src/services/admin-security-read.service.factory').createAdminSecurityReadService(prisma)};
  const queries=JSON.parse(process.env.ADMIN_REFERENCE_QUERIES);const output=[];
  for(const {resource,query}of queries){const s=services[resource];output.push(await (resource==='users'?s.getUsers(query):resource==='messages'?s.getMessages(query):s.getEvents(query)));}
  process.stdout.write(JSON.stringify(output));
 }finally{await prisma.$disconnect();}
}
main().catch(()=>{process.stderr.write('Admin database reference failed\n');process.exitCode=1;});
