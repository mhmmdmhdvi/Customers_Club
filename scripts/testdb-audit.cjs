"use strict";
const { Client } = require("../backend/node_modules/pg");
async function audit() {
 const raw=process.env.MIGRATION_TEST_DATABASE_URL;
 const url=new URL(raw);
 const match=/^\/mig_parent_([a-f0-9]{16})$/.exec(url.pathname);
 if(process.env.ALLOW_MIGRATION_TEST_DATABASE!=="1" || !match || url.protocol!=="postgresql:" || !["127.0.0.1","[::1]"].includes(url.hostname) || !url.port || url.port==="5432" || url.username!==`mig_owner_${match[1]}` || !/^[a-f0-9]{64}$/.test(url.password) || url.search!=="?sslmode=disable" || url.hash) throw Error("Refusing audit target");
 const db=new Client({connectionString:raw,connectionTimeoutMillis:5000,query_timeout:5000});
 try {
  await db.connect();
  const {rows:[identity]}=await db.query(`SELECT current_database() database,current_user username,session_user login,pg_get_userbyid(d.datdba) owner,shobj_description(d.oid,'pg_database') db_marker,shobj_description(r.oid,'pg_authid') role_marker,r.rolsuper superuser,r.rolcreaterole createrole FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`);
  const marker=`customers-club-migration:${match[1]}`;
  if(identity.database!==url.pathname.slice(1) || identity.username!==url.username || identity.login!==url.username || identity.owner!==url.username || identity.db_marker!==marker || identity.role_marker!==marker || identity.superuser || identity.createrole) throw Error("Audit identity mismatch");
  const {rows:[counts]}=await db.query(`SELECT (SELECT count(*)::int FROM pg_database WHERE datname LIKE $1) children,(SELECT count(*)::int FROM pg_tables WHERE schemaname='public') parent_tables`,[`mig_test_${match[1]}_%`]);
  console.log(`Owned catalog audit: children=${counts.children}, parent_tables=${counts.parent_tables}`);
  if(counts.children!==0 || counts.parent_tables!==0) throw Error("Owned catalog not clean");
 } finally {await db.end();}
}
audit().catch(()=>{console.error("Owned catalog audit refused or failed.");process.exitCode=1;});
