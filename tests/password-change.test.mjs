import test from 'node:test';
import assert from 'node:assert/strict';
import {openDB} from '../server/db.mjs';
import {addUser,createSession,verifyPassword} from '../server/auth.mjs';
import {enableMfa,newSecret} from '../server/mfa.mjs';
import {makeServer} from '../server/http.mjs';
const origin='http://localhost:3000',password='first-password-123';
async function fixture(run){
 const db=openDB(':memory:');const id=await addUser(db,'pw@example.test','Pw',password);enableMfa(db,id,newSecret());const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
 const server=makeServer(db,{origin});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const signIn=(kind='web')=>{const s=createSession(db,user,{kind});return{Cookie:'stage_session='+s.token,'X-CSRF-Token':s.csrf};};
 const crm=(headers,body)=>fetch(base+'/api/crm',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(body)});
 try{await run({db,user,base,signIn,crm});}finally{await new Promise(r=>server.close(r));db.close();}
}
const hash=(db,id)=>db.prepare('SELECT password_hash FROM users WHERE id=?').get(id).password_hash;

test('a user changes their own password with the current one; other sessions end, this one stays',()=>fixture(async({db,user,signIn,crm})=>{
 const here=signIn(),phone=signIn('mobile'),other=signIn();
 const wrong=await crm(here,{action:'passwordChange',current:'not-my-password',next:'brand-new-password-1'});
 assert.equal(wrong.status,403);assert.equal((await wrong.json()).status,'password_invalid');assert.ok(await verifyPassword(password,hash(db,user.id)));
 assert.equal((await crm(here,{action:'passwordChange',current:password,next:'short'})).status,400);
 assert.equal((await crm(here,{action:'passwordChange',current:password,next:password})).status,400);
 const ok=await crm(here,{action:'passwordChange',current:password,next:'brand-new-password-1'});assert.equal(ok.status,200);
 assert.equal((await ok.json()).data.signedOut,2);
 assert.ok(await verifyPassword('brand-new-password-1',hash(db,user.id)));
 assert.equal((await crm(here,{action:'load'})).status,200,'the session that changed it stays signed in');
 assert.equal((await crm(phone,{action:'load'})).status,401);assert.equal((await crm(other,{action:'load'})).status,401);
 const events=db.prepare('SELECT event FROM security_events WHERE user_id=? ORDER BY id').all(user.id).map(e=>e.event);
 assert.deepEqual(events,['password_change_failed','password_changed']);
}));

test('after a temporary password, only choosing an own password is open',()=>fixture(async({db,user,base,signIn,crm})=>{
 db.prepare('UPDATE users SET must_change_password=1 WHERE id=?').run(user.id);const here=signIn();
 const session=await (await fetch(base+'/api/session',{headers:{Cookie:here.Cookie}})).json();assert.equal(session.data.user.mustChangePassword,true);
 const blocked=await crm(here,{action:'load'});assert.equal(blocked.status,403);assert.equal((await blocked.json()).status,'password_change_required');
 assert.equal((await fetch(base+'/api/import',{method:'POST',headers:{Origin:origin,...here},body:'x'})).status,403);
 const ok=await crm(here,{action:'passwordChange',current:password,next:'my-own-password-42'});assert.equal(ok.status,200);
 assert.equal((await ok.json()).data.user.mustChangePassword,undefined);
 assert.equal((await crm(here,{action:'load'})).status,200);
 assert.equal(db.prepare('SELECT must_change_password m FROM users WHERE id=?').get(user.id).m,0);
}));
