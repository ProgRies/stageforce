import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDB} from '../server/db.mjs';
import {addUser,createSession,getSession} from '../server/auth.mjs';
import {extensionCreate,authorizeExtension} from '../server/extension.mjs';
import {totp,matchTotp,base32,fromBase32,newSecret,enableMfa,resetMfa,startChallenge,challengeUser,completeChallenge,otpauthURI} from '../server/mfa.mjs';
import {makeServer} from '../server/http.mjs';
const origin='https://crm.example.test',password='mfa-test-password-1';
const step=(t=Date.now())=>Math.floor(t/30000);
async function fixture(run){
 const db=openDB(':memory:');const id=await addUser(db,'mfa@example.test','Mfa',password);const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
 const server=makeServer(db,{origin});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(body)});
 const login=async()=>{const r=await post('/api/login',{email:'mfa@example.test',password});assert.equal(r.status,200);return{data:(await r.json()).data,cookie:r.headers.getSetCookie().find(c=>c.startsWith('stage_mfa=')).split(';')[0],setCookie:r.headers.getSetCookie()};};
 const code=(cookie,value)=>post('/api/login/mfa',{code:value},{Cookie:cookie});
 try{await run({db,user,base,post,login,code});}finally{await new Promise(r=>server.close(r));db.close();}
}
const sessionOf=r=>{const c=r.headers.getSetCookie().find(c=>c.startsWith('stage_session=')&&!c.startsWith('stage_session=;'));return c&&c.split(';')[0];};

test('TOTP matches RFC 6238 and base32 round-trips',()=>{
 const secret=base32(Buffer.from('12345678901234567890'));assert.equal(secret,'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
 assert.equal(totp(secret,step(59000)),'287082');assert.equal(totp(secret,step(1111111109000)),'081804');assert.equal(totp(secret,step(20000000000000)),'353130');
 assert.deepEqual(fromBase32(newSecret()).length,20);
 assert.equal(matchTotp(secret,'287082',59000+30000),step(59000),'one step of clock drift is tolerated');assert.equal(matchTotp(secret,'287082',59000+90000),null);
 assert.equal(matchTotp(secret,'28708',59000),null);assert.match(otpauthURI(secret,'a@b.test'),/^otpauth:\/\/totp\/Stage%20Force%3Aa%40b\.test\?secret=GEZ.*&issuer=Stage%20Force/);
});

test('a password alone never opens a session; first login must set up the authenticator',()=>fixture(async({post,login,code,base,db,user})=>{
 const first=await login();assert.equal(first.data.mfa,'setup');assert.match(first.data.secret,/^[A-Z2-7]{32}$/);assert.match(first.data.uri,/^otpauth:\/\/totp\//);
 assert.equal(first.setCookie.some(c=>c.startsWith('stage_session=')),false);
 for(const v of ['HttpOnly','Secure','SameSite=Strict','Path=/api/login'])assert.ok(first.setCookie[0].includes(v));
 // The challenge cookie cannot stand in for a session anywhere.
 const asSession='stage_session='+first.cookie.split('=')[1];
 assert.equal((await post('/api/crm',{action:'load'},{Cookie:first.cookie})).status,401);assert.equal((await post('/api/crm',{action:'load'},{Cookie:asSession})).status,401);
 assert.equal((await fetch(base+'/api/live',{headers:{Cookie:asSession}})).status,401);assert.equal((await fetch(base+'/api/session',{headers:{Cookie:asSession}})).status,401);
 assert.equal((await code(first.cookie,'000000')).status,401);assert.equal(db.prepare('SELECT count(*) n FROM user_mfa').get().n,0);
 assert.equal((await post('/api/login/mfa',{code:totp(first.data.secret,step())},{Cookie:first.cookie,Origin:'https://evil.example'})).status,403);
 const r=await code(first.cookie,totp(first.data.secret,step()));assert.equal(r.status,200);const body=(await r.json()).data;
 assert.equal(body.recoveryCodes.length,10);assert.match(body.recoveryCodes[0],/^[A-Z2-7]{5}-[A-Z2-7]{5}-[A-Z2-7]{6}$/);
 const session=sessionOf(r);assert.ok(session);for(const v of ['HttpOnly','Secure','SameSite=Lax'])assert.ok(r.headers.getSetCookie().find(c=>c.startsWith('stage_session=')).includes(v));
 assert.equal((await post('/api/crm',{action:'load'},{Cookie:session,'X-CSRF-Token':body.csrf})).status,200);
 assert.equal((await code(first.cookie,totp(first.data.secret,step()))).status,401,'a used challenge is gone');
 assert.equal(db.prepare('SELECT count(*) n FROM mfa_recovery_codes WHERE user_id=?').get(user.id).n,10);assert.equal(db.prepare('SELECT count(*) n FROM mfa_recovery_codes WHERE code_hash LIKE ?').get('%-%').n,0,'only hashes are stored');
}));

test('later logins ask for the code; codes cannot be replayed and recovery codes work once',()=>fixture(async({login,code,db,user})=>{
 const secret=newSecret();const recovery=enableMfa(db,user.id,secret);
 let l=await login();assert.equal(l.data.mfa,'verify');assert.equal(l.data.secret,undefined);
 const now=totp(secret,step());assert.equal((await code(l.cookie,now)).status,200);
 l=await login();assert.equal((await code(l.cookie,now)).status,401,'the same code a second time is refused');
 const r=await code(l.cookie,recovery[3].toLowerCase());assert.equal(r.status,200);assert.equal((await r.json()).data.recoveryLeft,9);
 l=await login();assert.equal((await code(l.cookie,recovery[3])).status,401,'a recovery code is single use');
}));

test('five wrong codes end the challenge and require the password again',()=>fixture(async({login,code,db,user})=>{
 const secret=newSecret();enableMfa(db,user.id,secret);const l=await login();
 for(let i=0;i<4;i++){const r=await code(l.cookie,'123456');assert.equal((await r.json()).status,'mfa_invalid');}
 const last=await code(l.cookie,'123456');assert.equal((await last.json()).status,'mfa_expired');
 assert.equal((await code(l.cookie,totp(secret,step()))).status,401);
}));

test('challenges expire and belong to active users only',async()=>{
 const db=openDB(':memory:');try{const id=await addUser(db,'x@example.test','X',password);const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
  const c=startChallenge(db,user);assert.ok(challengeUser(db,c.token));
  assert.equal(completeChallenge(db,challengeUser(db,c.token),totp(c.setup.secret,step(Date.now()+11*60000)),Date.now()+11*60000),null);
  db.prepare('UPDATE users SET active=0').run();assert.equal(challengeUser(db,c.token),null);
 }finally{db.close();}
});

test('sessions, browser keys and live streams need a confirmed second factor',()=>fixture(async({db,user,base})=>{
 const session=createSession(db,user),key=extensionCreate(db,user).token;const req={headers:{cookie:'stage_session='+session.token,authorization:'Bearer '+key}};
 assert.equal(getSession(db,req),null);assert.throws(()=>authorizeExtension(db,req),/Connect/);
 assert.equal((await fetch(base+'/api/live',{headers:{Cookie:'stage_session='+session.token}})).status,401);
 assert.equal((await fetch(base+'/api/integrations/extension',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:'{"action":"check"}'})).status,401);
 enableMfa(db,user.id,newSecret());assert.ok(getSession(db,req));
 resetMfa(db,user.id);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM extension_keys').get().n,0);
 assert.equal(db.prepare('SELECT count(*) n FROM user_mfa').get().n,0);
}));

test('upgrading an existing database signs everyone out and revokes browser keys once',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'stage-mfa-'));const path=join(dir,'crm.sqlite');let db=openDB(path);
 try{const id=await addUser(db,'old@example.test','Old',password);const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
  db.exec('DROP TABLE user_mfa; DROP TABLE mfa_recovery_codes; DROP TABLE login_challenges; PRAGMA user_version=9');createSession(db,user);extensionCreate(db,user);db.close();
  db=openDB(path);assert.equal(db.prepare('PRAGMA user_version').get().user_version,13);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM extension_keys').get().n,0);
  enableMfa(db,id,newSecret());createSession(db,user);db.close();db=openDB(path);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,1,'later restarts keep sessions');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
