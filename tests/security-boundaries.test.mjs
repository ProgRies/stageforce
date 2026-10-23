import test from 'node:test';
import assert from 'node:assert/strict';
import {openDB} from '../server/db.mjs';
import {addUser,createSession} from '../server/auth.mjs';
import {extensionCreate} from '../server/extension.mjs';
import {makeServer} from '../server/http.mjs';
const origin='https://crm.example.test';
async function fixture(run){
 const db=openDB(':memory:');const id=await addUser(db,'audit@example.test','Audit','audit-only-password');const user=db.prepare('SELECT * FROM users WHERE id=?').get(id),session=createSession(db,user),key=extensionCreate(db,user).token;
 const server=makeServer(db,{origin});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 const auth={Origin:origin,Cookie:'stage_session='+session.token,'X-CSRF-Token':session.csrf};
 try{await run({db,user,session,key,post,auth,base});}finally{await new Promise(r=>server.close(r));db.close();}
}
test('HTTPS configuration emits secure cookies and security headers; production rejects HTTP',()=>fixture(async({post,base})=>{
 const r=await post('/api/login',{email:'audit@example.test',password:'audit-only-password'},{Origin:origin});assert.equal(r.status,200);
 for(const value of ['HttpOnly','Secure','SameSite=Lax','Path=/'])assert.ok(r.headers.get('set-cookie').includes(value));
 assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('x-frame-options'),'DENY');assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('strict-transport-security'),/max-age=31536000/);
 for(const path of ['/data/crm.sqlite','/server/auth.mjs','/.env','/assets/%2e%2e/server/auth.mjs'])assert.equal((await fetch(base+path)).status,404);
 const old=process.env.NODE_ENV;const db=openDB(':memory:');try{process.env.NODE_ENV='production';assert.throws(()=>makeServer(db,{origin:'http://localhost:3000'}),/HTTPS/);}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;db.close();}
}));
test('web mutations require both exact Origin and session CSRF; logout invalidates the session',()=>fixture(async({post,auth,session})=>{
 for(const headers of [{},{...auth,Origin:'https://evil.example'},{...auth,Origin:'null'},{...auth,'X-CSRF-Token':'wrong'}])assert.notEqual((await post('/api/crm',{action:'create',name:'Rejected'},headers)).status,200);
 assert.equal((await post('/api/crm',{action:'load'},auth)).status,200);
 assert.equal((await post('/api/logout',{},auth)).status,200);
 assert.equal((await post('/api/crm',{action:'load'},auth)).status,401);
}));
test('extension rejects invalid keys, mailbox spoofing, oversized bodies and generic CRM actions',()=>fixture(async({post,key})=>{
 const path='/api/integrations/extension',headers={Authorization:'Bearer '+key};
 assert.equal((await post(path,{action:'check'},{Authorization:'Bearer sf_ext_'+'x'.repeat(43)})).status,401);
 assert.equal((await post(path,{action:'lookup',mailbox:'other@example.test',from:{email:'client@example.org'},recipients:[]},headers)).status,403);
 assert.equal((await post(path,{action:'load'},headers)).status,400);
 assert.equal((await post(path,{action:'check',padding:'x'.repeat(3*1024*1024)},headers)).status,413);
 const r=await post(path,{action:'check'},headers);assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),null);
}));
test('SQL-like search input cannot bypass authentication or mutate tables',()=>fixture(async({post,auth,db})=>{
 const r=await post('/api/crm',{action:'search',query:"'); DROP TABLE users; --"},auth);assert.equal(r.status,200);assert.equal(db.prepare('SELECT count(*) n FROM users').get().n,1);
 const login=await post('/api/login',{email:"' OR 1=1 --",password:'wrong-password'},{Origin:origin});assert.equal(login.status,401);
}));
