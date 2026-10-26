import test from 'node:test';
import assert from 'node:assert/strict';
import {openDB} from '../server/db.mjs';
import {addUser,createSession} from '../server/auth.mjs';
import {totp,newSecret,enableMfa} from '../server/mfa.mjs';
import {clientIP,logEvent,failuresSinceLastLogin,pruneEvents} from '../server/security.mjs';
import {makeServer} from '../server/http.mjs';
const origin='https://crm.example.test',password='security-test-password';
const step=(t=Date.now())=>Math.floor(t/30000);
async function fixture(run){
 const old=process.env.TRUST_PROXY;process.env.TRUST_PROXY='1';
 const db=openDB(':memory:');const id=await addUser(db,'sec@example.test','Sec',password);const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);const secret=newSecret();enableMfa(db,id,secret);
 const server=makeServer(db,{origin});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(body)});
 const login=(ip,email='sec@example.test',pass=password)=>post('/api/login',{email,password:pass},{'X-Forwarded-For':'203.0.113.99, '+ip});
 const challenge=r=>r.headers.getSetCookie().find(c=>c.startsWith('stage_mfa=')).split(';')[0];
 try{await run({db,user,secret,base,post,login,challenge});}finally{await new Promise(r=>server.close(r));db.close();if(old===undefined)delete process.env.TRUST_PROXY;else process.env.TRUST_PROXY=old;}
}

test('the client address is the one the proxy appended, and only when the proxy is trusted',()=>{
 const req={headers:{'x-forwarded-for':'1.1.1.1, 198.51.100.7'},socket:{remoteAddress:'::ffff:10.0.0.2'}};
 assert.equal(clientIP(req,true),'198.51.100.7','a client can prepend fake entries, but the last one comes from the proxy');
 assert.equal(clientIP(req,false),'10.0.0.2');assert.equal(clientIP({headers:{},socket:{remoteAddress:'10.0.0.3'}},true),'10.0.0.3');
});

test('one address flooding the login cannot lock out colleagues elsewhere',()=>fixture(async({login})=>{
 for(let i=0;i<30;i++)assert.equal((await login('198.51.100.1','nobody'+i+'@example.test')).status,401);
 assert.equal((await login('198.51.100.1')).status,429,'the flooding address is slowed down');
 assert.equal((await login('198.51.100.2')).status,200,'a colleague on another address still signs in');
 for(let i=0;i<10;i++)assert.equal((await login('198.51.100.3','sec@example.test','wrong-password-'+i)).status,401);
 assert.equal((await login('198.51.100.3')).status,429,'ten tries per account and address');
 assert.equal((await login('198.51.100.4')).status,200,'the same account from another address is not locked');
}));

test('a new browser key needs a fresh authenticator code',()=>fixture(async({db,user,secret,post})=>{
 const s=createSession(db,user),auth={Cookie:'stage_session='+s.token,'X-CSRF-Token':s.csrf};
 const create=code=>post('/api/crm',{action:'extensionCreate',code},auth);
 let r=await create(undefined);assert.equal(r.status,403);assert.equal((await r.json()).status,'mfa_invalid');
 r=await create('000000');assert.equal(r.status,403);
 assert.equal(db.prepare('SELECT count(*) n FROM extension_keys').get().n,0,'no key without a code');
 const now=totp(secret,step());r=await create(now);assert.equal(r.status,200);assert.match((await r.json()).data.token,/^sf_ext_/);
 assert.equal((await create(now)).status,403,'the same code cannot be used twice');
 const events=db.prepare("SELECT event FROM security_events WHERE user_id=? ORDER BY id").all(user.id).map(e=>e.event);
 assert.deepEqual(events,['key_code_failed','key_code_failed','key_created','key_code_failed']);
 for(let i=0;i<5;i++)await create('111111');assert.equal((await create(totp(secret,step()+1))).status,429,'code guessing is rate limited');
}));

test('wrong passwords and codes are logged and shown at the next sign-in',()=>fixture(async({db,user,secret,post,login,challenge})=>{
 assert.equal((await login('198.51.100.5','sec@example.test','not-the-password')).status,401);
 let r=await login('198.51.100.5');const c1=challenge(r);
 assert.equal((await post('/api/login/mfa',{code:'000000'},{Cookie:c1,'X-Forwarded-For':'198.51.100.5'})).status,401);
 assert.equal((await post('/api/login/mfa',{code:'999999'},{Cookie:c1,'X-Forwarded-For':'198.51.100.5'})).status,401);
 r=await post('/api/login/mfa',{code:totp(secret,step())},{Cookie:c1,'X-Forwarded-For':'198.51.100.5'});assert.equal(r.status,200);
 const body=(await r.json()).data;assert.deepEqual({passwords:body.security.passwords,codes:body.security.codes},{passwords:1,codes:2});
 const rows=db.prepare('SELECT event,ip,email FROM security_events WHERE user_id=? ORDER BY id').all(user.id);
 assert.deepEqual(rows.map(e=>e.event),['password_failed','code_failed','code_failed','login']);assert.ok(rows.every(e=>e.ip==='198.51.100.5'&&e.email==='sec@example.test'));
 assert.deepEqual(failuresSinceLastLogin(db,user.id),{passwords:0,codes:0,since:db.prepare("SELECT at FROM security_events WHERE event='login'").get().at},'the warning is shown once');
 const session=r.headers.getSetCookie().find(c=>c.startsWith('stage_session=')).split(';')[0];
 const list=await post('/api/crm',{action:'securityEvents'},{Cookie:session,'X-CSRF-Token':body.csrf});assert.equal(list.status,200);
 assert.deepEqual((await list.json()).data.items.map(e=>e.event),['login','code_failed','code_failed','password_failed']);
 assert.equal((await login('198.51.100.6','ghost@example.test')).status,401);
 assert.equal(db.prepare("SELECT user_id FROM security_events WHERE email='ghost@example.test'").get().user_id,null,'unknown addresses are logged without an account');
}));

test('events older than 90 days are removed',()=>{
 const db=openDB(':memory:');try{logEvent(db,{event:'login',email:'a@b.test'});const old=Date.now()-91*86400000;db.prepare('UPDATE security_events SET at=?').run(old);logEvent(db,{event:'login',email:'a@b.test'});
 pruneEvents(db);assert.equal(db.prepare('SELECT count(*) n FROM security_events').get().n,1);}finally{db.close();}
});
