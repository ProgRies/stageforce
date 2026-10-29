import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDB,reindex} from '../server/db.mjs';
import {addUser,createSession,getSession,hashToken,mobileSessions,revokeMobileSession} from '../server/auth.mjs';
import {totp,newSecret,enableMfa} from '../server/mfa.mjs';
import {createOrg,addContact,contacts,getOrg} from '../server/crm.mjs';
import {prepareCall,startIncoming,saveCall,openCall,NEW_FROM_CALL} from '../server/calls.mjs';
import {mobileHome,mobileSearch} from '../server/mobile.mjs';
import {makeServer} from '../server/http.mjs';
const origin='https://crm.example.test',password='mobile-test-password';
const call=(b={})=>({requestId:randomUUID(),startedAt:new Date().toISOString(),...b});
async function team(){const db=openDB(':memory:');const id=await addUser(db,'chris@example.test','Chris',password);enableMfa(db,id,newSecret());return{db,user:db.prepare('SELECT * FROM users WHERE id=?').get(id)};}
const cookie=token=>({headers:{cookie:'stage_session='+token}});

test('the phone app signs in once with password and code and gets a 90-day session; the desktop keeps 7 days',async()=>{
 const db=openDB(':memory:');const id=await addUser(db,'chris@example.test','Chris',password);const secret=newSecret();enableMfa(db,id,secret);
 const server=makeServer(db,{origin});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(body)});
 async function signIn(device,step){const r=await post('/api/login',{email:'chris@example.test',password});const mfa=r.headers.getSetCookie().find(c=>c.startsWith('stage_mfa=')).split(';')[0];return post('/api/login/mfa',{code:totp(secret,step),...(device?{device}:{})},{Cookie:mfa,'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'});}
 try{
  const step=Math.floor(Date.now()/30000);
  const phone=await signIn('mobile',step);assert.equal(phone.status,200);
  const phoneCookie=phone.headers.getSetCookie().find(c=>c.startsWith('stage_session='));assert.match(phoneCookie,/Max-Age=7776000/);
  const desk=await signIn(undefined,step+1);assert.equal(desk.status,200);
  assert.match(desk.headers.getSetCookie().find(c=>c.startsWith('stage_session=')),/Max-Age=604800/,'the desktop session is unchanged');
  const rows=db.prepare('SELECT kind,label,expires_at-created_at AS span FROM sessions ORDER BY kind').all().map(r=>({...r}));
  assert.deepEqual(rows,[{kind:'mobile',label:'iPhone',span:90*86400000},{kind:'web',label:'',span:7*86400000}]);
  const token=phoneCookie.split(';')[0];const session=await fetch(base+'/api/session',{headers:{Cookie:token}});
  assert.equal(session.status,200);assert.match(session.headers.getSetCookie()[0]||'',/Max-Age=7776000/,'each open of the app refreshes the cookie');
  const login=db.prepare("SELECT detail FROM security_events WHERE event='login' ORDER BY id").all().map(r=>r.detail);
  assert.deepEqual(login,['Authenticator · Handy-App (iPhone)','Authenticator'],'the security log says which sign-in was the phone');
 }finally{await new Promise(r=>server.close(r));db.close();}
});

test('a phone session moves forward while it is used and can be signed out from the desktop',async()=>{
 const{db,user}=await team();const phone=createSession(db,user,{kind:'mobile',label:'iPhone'}),desk=createSession(db,user);
 const hash=hashToken(phone.token),old=Date.now()-30*86400000;
 db.prepare('UPDATE sessions SET last_used_at=?,expires_at=? WHERE token_hash=?').run(old,old+90*86400000,hash);
 const s=getSession(db,cookie(phone.token));assert.equal(s.kind,'mobile');assert.equal(s.renewed,true);
 const row=db.prepare('SELECT expires_at,last_used_at FROM sessions WHERE token_hash=?').get(hash);
 assert.ok(row.expires_at>Date.now()+89*86400000,'another 90 days from today');
 assert.equal(getSession(db,cookie(phone.token)).renewed,undefined,'not written again within the hour');
 assert.equal(getSession(db,cookie(desk.token)).renewed,undefined,'a desktop session never moves');
 const list=mobileSessions(db,user.id);assert.equal(list.length,1);assert.equal(list[0].label,'iPhone');assert.ok(!('token_hash' in list[0]));
 const otherId=await addUser(db,'bea@example.test','Bea',password);
 assert.equal(revokeMobileSession(db,otherId,list[0].id),null,'a colleague cannot sign out my phone');
 assert.equal(revokeMobileSession(db,user.id,list[0].id),hash);assert.equal(getSession(db,cookie(phone.token)),null);
 assert.ok(getSession(db,cookie(desk.token)),'the desktop stays signed in');
 db.close();
});

test('a call from a new lead creates the organisation and contact on the spot and flags it for Prüfen',async()=>{
 const{db,user}=await team();
 assert.throws(()=>startIncoming(db,user,call({newOrganisation:'Stadt Neu'})),/Name oder Nummer/);
 const c=startIncoming(db,user,call({newOrganisation:'Stadt Neu',contactName:'Lisa Hoffmann',phone:'0151 2345 6789'}));
 assert.equal(c.direction,'in');assert.equal(c.contact.name,'Lisa Hoffmann');assert.equal(c.phone,'+49 151 2345 6789');
 const org=getOrg(db,c.organisation.id);assert.equal(org.status,'Lead');
 assert.deepEqual(db.prepare('SELECT text FROM review_issues WHERE organisation_id=? AND resolved_at IS NULL').all(org.id).map(r=>r.text),[NEW_FROM_CALL]);
 assert.deepEqual(contacts(db,org.id).map(x=>[x.name,x.telefone,x.primary]),[['Lisa Hoffmann',['+49 151 2345 6789'],true]]);
 assert.deepEqual(c.outcomes.map(o=>o.key),['talked','callback','meeting','email'],'an answered call cannot be "Nicht erreicht"');
 assert.throws(()=>startIncoming(db,user,call({newOrganisation:'stadt neu',contactName:'X'})),/gibt es schon/);
 db.close();
});

test('a call from a known contact needs no number; a new number is added to the contact',async()=>{
 const{db,user}=await team();const org=createOrg(db,user,'Landkreis Harburg');addContact(db,org.id,{name:'Petra Lange',telefone:['+49 4171 693 210']},true);
 const petra=contacts(db,org.id)[0];
 const c=startIncoming(db,user,call({organisationId:org.id,contactId:petra.id}));assert.equal(c.phone,'');assert.equal(c.dial,'');
 assert.equal(openCall(db,user).call.callId,c.callId,'the open call comes back when the app is reopened');
 assert.equal(db.prepare('SELECT count(*) n FROM review_issues').get().n,0,'a known organisation is not flagged');
 saveCall(db,user,{callId:c.callId,notes:'',outcome:'talked'});
 const again=startIncoming(db,user,call({organisationId:org.id,contactId:petra.id,phone:'0171 555 0101'}));
 assert.deepEqual(contacts(db,org.id)[0].telefone,['+49 4171 693 210','+49 171 555 0101']);
 assert.throws(()=>startIncoming(db,user,call({organisationId:org.id,contactId:'missing'})),/does not belong/);
 const other=createOrg(db,user,'Gemeinde Seevetal');
 const caller=startIncoming(db,user,call({organisationId:other.id,contactName:'Tom Krüger'}));
 assert.equal(contacts(db,other.id)[0].name,'Tom Krüger');assert.notEqual(caller.callId,again.callId,'an open call without a note gives way to the next one');
 db.close();
});

test('"Gespräch geführt" logs an incoming call without touching the follow-up; other results work as on the desktop',async()=>{
 const{db,user}=await team();const org=createOrg(db,user,'Stadt Lüneburg');addContact(db,org.id,{name:'Anna Becker',telefone:['+49 4131 309 3344']},true);const anna=contacts(db,org.id)[0];
 db.prepare("INSERT INTO followups VALUES('f1',?,'Angebot nachfassen','2030-01-01',?,NULL)").run(org.id,user.id);
 const a=startIncoming(db,user,call({organisationId:org.id,contactId:anna.id}));
 saveCall(db,user,{callId:a.callId,notes:'Fragt nach drei weiteren Lizenzen.',outcome:'talked'});
 let last=db.prepare('SELECT kind,body,is_contact FROM activities WHERE organisation_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(org.id);
 assert.deepEqual({...last},{kind:'Anruf · Gespräch geführt',body:'Eingehender Anruf · Fragt nach drei weiteren Lizenzen.',is_contact:1});
 assert.deepEqual({...db.prepare('SELECT text,due_date FROM followups WHERE organisation_id=?').get(org.id)},{text:'Angebot nachfassen',due_date:'2030-01-01'},'a plain conversation keeps the planned follow-up');
 const b=startIncoming(db,user,call({organisationId:org.id,contactId:anna.id}));
 saveCall(db,user,{callId:b.callId,notes:'',outcome:'callback',callbackDate:'2031-02-03'});
 assert.equal(db.prepare('SELECT due_date FROM followups WHERE organisation_id=?').get(org.id).due_date,'2031-02-03');
 last=db.prepare('SELECT kind,body FROM activities WHERE organisation_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(org.id);
 assert.equal(last.body,'Eingehender Anruf · Später anrufen');
 const out=prepareCall(db,user,call({organisationId:org.id,contactId:anna.id,phone:'+49 4131 309 3344'}));
 assert.equal(out.direction,'out');assert.ok(out.outcomes.some(o=>o.key==='not_reached'));assert.ok(!out.outcomes.some(o=>o.key==='no_interest'),'"Kein Interesse" is no longer offered');
 db.close();
});

test('the caller search finds organisations by name and by the last digits of a number',async()=>{
 const{db,user}=await team();const a=createOrg(db,user,'Stadt Lüneburg'),b=createOrg(db,user,'Hochschule Bremen');
 addContact(db,a.id,{name:'Anna Becker',telefone:['+49 4131 309 3344']},true);addContact(db,b.id,{name:'Mia Schulz',telefone:['+49 421 5905 4410']},true);reindex(db,a.id);reindex(db,b.id);
 assert.deepEqual(mobileSearch(db,'lüne').items.map(o=>o.name),['Stadt Lüneburg']);
 assert.deepEqual(mobileSearch(db,'3344').items.map(o=>o.name),['Stadt Lüneburg']);
 assert.deepEqual(mobileSearch(db,'5905 44').items.map(o=>o.name),['Hochschule Bremen']);
 assert.deepEqual(mobileSearch(db,'Anna').items[0].contacts.map(c=>[c.name,c.phones]),[['Anna Becker',['+49 4131 309 3344']]]);
 assert.deepEqual(mobileSearch(db,'').items,[]);
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date());
 db.prepare("INSERT INTO followups VALUES('f1',?,'Rückruf',?,?,NULL)").run(b.id,today,user.id);
 const c=startIncoming(db,user,call({organisationId:a.id,contactId:contacts(db,a.id)[0].id}));saveCall(db,user,{callId:c.callId,outcome:'talked'});
 const home=mobileHome(db,user);assert.deepEqual(home.due.map(o=>o.name),['Hochschule Bremen']);assert.deepEqual(home.recent.map(o=>o.name),['Stadt Lüneburg']);
 db.close();
});

test('the server serves the phone app under /m/ and leaves the desktop page as it was',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sf-static-'));mkdirSync(join(dir,'m'));mkdirSync(join(dir,'assets'));
 writeFileSync(join(dir,'index.html'),'desktop');writeFileSync(join(dir,'m','index.html'),'phone');writeFileSync(join(dir,'m','manifest.webmanifest'),'{}');writeFileSync(join(dir,'m','sw.js'),'//');writeFileSync(join(dir,'m','icon-180.png'),'png');
 const db=openDB(':memory:');const server=makeServer(db,{origin,staticDir:dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  let r=await fetch(base+'/');assert.equal(await r.text(),'desktop');assert.equal(r.headers.get('cache-control'),'no-store');
  for(const path of ['/m','/m/']){r=await fetch(base+path);assert.equal(await r.text(),'phone');assert.equal(r.headers.get('cache-control'),'no-store');}
  r=await fetch(base+'/m/manifest.webmanifest');assert.match(r.headers.get('content-type'),/application\/manifest\+json/);assert.equal(r.headers.get('cache-control'),'no-cache');
  r=await fetch(base+'/m/sw.js');assert.match(r.headers.get('content-type'),/javascript/);assert.equal(r.headers.get('service-worker-allowed'),'/m/');
  r=await fetch(base+'/m/icon-180.png');assert.equal(r.headers.get('content-type'),'image/png');
  for(const path of ['/m/../server/http.mjs','/m/%2e%2e/package.json','/other.html'])assert.equal((await fetch(base+path)).status,404,path);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});
