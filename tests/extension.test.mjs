import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser,hashToken,createSession} from '../server/auth.mjs';
import {enableMfa,newSecret} from '../server/mfa.mjs';
import {createOrg,addContact,getOrg} from '../server/crm.mjs';
import {extensionStatus,extensionCreate,extensionRenew,extensionRevoke,authorizeExtension,extensionAction} from '../server/extension.mjs';
import {makeServer} from '../server/http.mjs';
import '../integrations/chrome/date.js';
const origin='http://localhost:3000';
const msg={mailbox:'alex@team.test',from:{name:'Pat',email:'pat@customer.test'},recipients:[{email:'alex@team.test',name:'Alex'}],originalSubject:'Hello',subject:'Hello',originalBody:'Confidential\n<script>not executable</script>',body:'Reviewed confidential email',timestamp:'2026-10-13T10:07:00Z',timestampRaw:'13.10.2026, 12:07',direction:'incoming',sourceUrl:'https://mail.google.com/mail/u/0/#inbox/example',contactEmails:['pat@customer.test']};
async function setup(){const db=openDB(':memory:');const id=await addUser(db,msg.mailbox,'Alex','long-password-1234');enableMfa(db,id,newSecret());const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);return{db,user};}
const action=(db,user,b)=>extensionAction(db,user,b,origin);
test('extension keys are separate, hashed, revocable, expiring and disabled with accounts',async()=>{
 const{db,user}=await setup();try{const first=extensionCreate(db,user);const req={headers:{authorization:'Bearer '+first.token,origin:'chrome-extension://'+'a'.repeat(32)}};
 assert.equal(db.prepare('SELECT token_hash FROM extension_devices').get().token_hash,hashToken(first.token));assert.equal(authorizeExtension(db,req).id,user.id);
 assert.throws(()=>authorizeExtension(db,{headers:{...req.headers,origin:'https://mail.google.com'}}),/Extension/);
 req.headers.authorization='Bearer '+extensionCreate(db,user).token;db.prepare('UPDATE extension_devices SET expires_at=0').run();assert.throws(()=>authorizeExtension(db,req),/Connect/);
 const next=extensionCreate(db,user);req.headers.authorization='Bearer '+next.token;db.prepare('UPDATE users SET active=0').run();assert.throws(()=>authorizeExtension(db,req),/Connect/);db.prepare('UPDATE users SET active=1').run();extensionRevoke(db,user,next.id);assert.throws(()=>authorizeExtension(db,req),/Connect/);
 }finally{db.close();}
});
test('each computer has its own key: renewing or revoking one leaves the others connected',async()=>{
 const{db,user}=await setup();try{const other=await addUser(db,'sam@team.test','Sam','long-password-1234');enableMfa(db,other,newSecret());const sam=db.prepare('SELECT * FROM users WHERE id=?').get(other);
 const req=token=>({headers:{authorization:'Bearer '+token,origin:'chrome-extension://'+'a'.repeat(32)}});
 const office=extensionCreate(db,user,'  Büro-PC '),laptop=extensionCreate(db,user,'Laptop'),third=extensionCreate(db,user);
 assert.deepEqual(extensionStatus(db,user).devices.map(d=>d.label),['Büro-PC','Laptop','Computer 3']);
 for(const k of[office,laptop,third])assert.equal(authorizeExtension(db,req(k.token)).id,user.id);
 // Only the key that was used gets a last-use time.
 db.prepare('UPDATE extension_devices SET last_used_at=NULL').run();authorizeExtension(db,req(laptop.token));
 assert.deepEqual(extensionStatus(db,user).devices.map(d=>!!d.last_used_at),[false,true,false]);
 const renewed=extensionRenew(db,user,laptop.id);assert.equal(renewed.label,'Laptop');assert.throws(()=>authorizeExtension(db,req(laptop.token)),/Connect/);
 assert.equal(authorizeExtension(db,req(renewed.token)).id,user.id);assert.equal(authorizeExtension(db,req(office.token)).id,user.id);
 extensionRevoke(db,user,office.id);assert.throws(()=>authorizeExtension(db,req(office.token)),/Connect/);assert.equal(authorizeExtension(db,req(renewed.token)).id,user.id);
 // A key revoked in another tab is reported, not recreated; another user's key cannot be touched.
 assert.throws(()=>extensionRevoke(db,user,office.id),e=>e.http===404);assert.throws(()=>extensionRenew(db,user,office.id),e=>e.http===404);
 const theirs=extensionCreate(db,sam,'Laptop');assert.throws(()=>extensionRevoke(db,user,theirs.id),e=>e.http===404);assert.throws(()=>extensionRenew(db,user,theirs.id),e=>e.http===404);assert.equal(authorizeExtension(db,req(theirs.token)).id,sam.id);
 // Names: duplicates get a suffix, empty names a free number, long ones are cut.
 assert.equal(extensionCreate(db,user,'laptop').label,'laptop (2)');assert.equal(extensionCreate(db,user,'x'.repeat(80)).label.length,60);assert.equal(extensionCreate(db,user,'\u0000 ').label,'Computer 5');
 }finally{db.close();}
});
test('extension keys are limited per user and old expired keys are dropped',async()=>{
 const{db,user}=await setup();try{for(let i=0;i<10;i++)extensionCreate(db,user);
 assert.throws(()=>extensionCreate(db,user),e=>e.http===409);
 // An expired key no longer counts; one expired long ago leaves the list when the next key is created.
 const[a,b]=extensionStatus(db,user).devices;db.prepare('UPDATE extension_devices SET expires_at=? WHERE id=?').run(Date.now()-1000,a.id);db.prepare('UPDATE extension_devices SET expires_at=1 WHERE id=?').run(b.id);
 assert.equal(extensionStatus(db,user).devices.find(d=>d.id===a.id).expired,true);
 extensionCreate(db,user);const ids=extensionStatus(db,user).devices.map(d=>d.id);assert.ok(ids.includes(a.id));assert.ok(!ids.includes(b.id));
 }finally{db.close();}
});
test('existing keys move to devices without reconnecting, and the previous release keeps the newest key after a rollback',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const{tmpdir}=await import('node:os');const{join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'extension-devices-')),path=join(dir,'crm.sqlite');let db=openDB(path);
 const req=token=>({headers:{authorization:'Bearer '+token}});
 try{const id=await addUser(db,msg.mailbox,'Alex','long-password-1234');enableMfa(db,id,newSecret());const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
  // A key as the previous release stored it: only in extension_keys.
  const old='sf_ext_'+'A'.repeat(43);db.exec('DELETE FROM extension_devices');db.prepare('INSERT INTO extension_keys VALUES(?,?,?,?,?)').run(id,hashToken(old),Date.now(),Date.now()+86400000,null);db.close();
  db=openDB(path);assert.equal(db.prepare('PRAGMA user_version').get().user_version,13,'the previous release can still open the database');
  assert.equal(authorizeExtension(db,req(old)).id,id);assert.deepEqual(extensionStatus(db,user).devices.map(d=>d.label),['Browser']);
  const laptop=extensionCreate(db,user,'Laptop');assert.equal(db.prepare('SELECT token_hash FROM extension_keys WHERE user_id=?').get(id).token_hash,hashToken(laptop.token));
  // Restarting does not bring back a revoked key or duplicate the mirrored one.
  extensionRevoke(db,user,extensionStatus(db,user).devices[0].id);db.close();db=openDB(path);
  assert.deepEqual(extensionStatus(db,user).devices.map(d=>d.label),['Laptop']);assert.throws(()=>authorizeExtension(db,req(old)),/Connect/);
  extensionRevoke(db,user,laptop.id);assert.equal(db.prepare('SELECT count(*) n FROM extension_keys').get().n,0);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('lookup reads headers only, selects exact matches, leaves domain-only or ambiguous matches unselected',async()=>{
 const{db,user}=await setup();try{const org=createOrg(db,user,'Customer');addContact(db,org.id,{e_mails:['pat@customer.test']});const envelope={action:'lookup',mailbox:msg.mailbox,from:msg.from,recipients:msg.recipients};
 assert.equal(action(db,user,envelope).organisation.id,org.id);assert.equal(action(db,user,envelope).participants[0].known,true);
 assert.equal(action(db,user,{...envelope,from:{email:'new@customer.test'}}).organisation,null);
 const other=createOrg(db,user,'Other');addContact(db,other.id,{e_mails:['pat@customer.test']});assert.equal(action(db,user,envelope).organisation,null);
 assert.equal(db.prepare('SELECT count(*) n FROM email_imports').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,0);
 assert.throws(()=>action(db,user,{...envelope,mailbox:'someone@team.test'}),/mailbox/);
 }finally{db.close();}
});
test('atomic save, links, source attribution, duplicate retries and cross-user ownership',async()=>{
 const{db,user}=await setup();try{
 const b={...msg,action:'save',confirmed:true,requestId:randomUUID(),newOrganisation:'Customer',linked:{name:'Agency'}};
 const r=action(db,user,b);assert.equal(r.saved,true);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM organisation_links').get().n,1);assert.equal(db.prepare('SELECT body FROM messages').get().body,msg.body);
 assert.equal(db.prepare('SELECT mailbox FROM message_sources').get().mailbox,user.email);assert.equal(db.prepare('SELECT author_id FROM activities WHERE message_id IS NOT NULL').get().author_id,user.id);
 assert.equal(action(db,user,b).duplicate,true);assert.equal(db.prepare('SELECT count(*) n FROM contacts').get().n,1);
 const id=await addUser(db,'bea@team.test','Bea','long-password-1234'),other=db.prepare('SELECT * FROM users WHERE id=?').get(id);
 assert.throws(()=>action(db,other,b),/Request not found/);
 assert.equal(action(db,other,{...b,mailbox:other.email,requestId:randomUUID(),newOrganisation:undefined,organisationId:r.organisation.id,version:getOrg(db,r.organisation.id).version}).duplicate,true);
 assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM message_sources').get().n,2);
 }finally{db.close();}
});
test('failed link or stale organisation rolls back email and contacts and allows corrected retry',async()=>{
 const{db,user}=await setup();try{
 const b={...msg,action:'save',confirmed:true,requestId:randomUUID(),newOrganisation:'Customer',linked:{id:'missing'}};
 assert.throws(()=>action(db,user,b));for(const table of ['messages','contacts','organisations','email_imports','requests'])assert.equal(db.prepare('SELECT count(*) n FROM '+table).get().n,0,table);
 const org=createOrg(db,user,'Customer');assert.throws(()=>action(db,user,{...b,newOrganisation:undefined,organisationId:org.id,version:'-1',linked:undefined}),/inzwischen/);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,0);
 const r=action(db,user,{...b,newOrganisation:undefined,organisationId:org.id,version:org.version,linked:undefined});assert.equal(r.saved,true);
 }finally{db.close();}
});
test('HTTP extension API rejects website/cookie auth; key management still requires session and CSRF',async()=>{
 const{db,user}=await setup();const created=extensionCreate(db,user),key=created.token,session=createSession(db,user);const server=makeServer(db,{origin});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,b,h={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...h},body:JSON.stringify(b)});
 try{const path='/api/integrations/extension',auth={Authorization:'Bearer '+key};assert.equal((await post(path,{action:'check'})).status,401);assert.equal((await post(path,{action:'check'},{Cookie:'stage_session='+session.token})).status,401);
 assert.equal((await post(path,{action:'check'},{...auth,Origin:'https://evil.test'})).status,403);assert.equal((await post(path,{action:'check'},auth)).status,200);
 assert.equal((await post('/api/crm',{action:'load'},{...auth,Origin:origin})).status,401);
 const browser={Origin:origin,Cookie:'stage_session='+session.token};assert.equal((await post('/api/crm',{action:'extensionCreate'},browser)).status,403);
 assert.equal((await post('/api/crm',{action:'extensionRevoke',id:created.id},{...browser,'X-CSRF-Token':session.csrf})).status,200);assert.equal((await post('/api/crm',{action:'extensionRevoke',id:created.id},{...browser,'X-CSRF-Token':session.csrf})).status,404);assert.equal((await post(path,{action:'check'},auth)).status,401);
 assert.equal((await post('/api/integrations/gmail/check',{},auth)).status,403);
 }finally{await new Promise(r=>server.close(r));db.close();}
});
test('numeric Gmail dates are parsed without guessing relative or invalid values',()=>{
 assert.equal(globalThis.stageForceDate('22.10.2026, 14:07').getDate(),22);assert.equal(globalThis.stageForceDate('2026-10-22T12:07:00Z').toISOString(),'2026-10-22T12:07:00.000Z');assert.equal(globalThis.stageForceDate('Yesterday'),null);assert.equal(globalThis.stageForceDate('31.02.2026, 14:07'),null);
});

test('schema 5 upgrade preserves CRM records',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const{tmpdir}=await import('node:os');const{join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'extension-migration-')),path=join(dir,'crm.sqlite');let db=openDB(path);
 try{const id=await addUser(db,msg.mailbox,'Alex','long-password-1234'),org=createOrg(db,{id},'Preserved');db.exec('DROP TABLE extension_keys; PRAGMA user_version=5');db.close();db=openDB(path);
 assert.equal(getOrg(db,org.id).name,'Preserved');assert.equal(db.prepare('SELECT count(*) n FROM users').get().n,1);assert.equal(db.prepare('PRAGMA user_version').get().user_version,13);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('inbox and English Gmail dates with spelled-out months are read as local time',()=>{
 const f=globalThis.stageForceDate,local=(...a)=>new Date(...a).toISOString();
 assert.equal(f('Mo., 20. Okt. 2026, 10:00').toISOString(),local(2026,9,20,10,0));
 assert.equal(f('Do., 5. März 2026, 07:30').toISOString(),local(2026,2,5,7,30));
 assert.equal(f('Mon, Oct 20, 2026, 12:05 PM').toISOString(),local(2026,9,20,12,5));
 assert.equal(f('Tue, 3 Mar 2026, 23:59').toISOString(),local(2026,2,3,23,59));
 assert.equal(f('Oct 20, 2026, 13:00 PM'),null);assert.equal(f('Mon, Foo 20, 2026, 10:00'),null);assert.equal(f('20. Okt.'),null);
});
test('the same template sent in the same minute to two clients stays two emails, also with a colleague in copy',async()=>{
 const{db,user}=await setup();try{
 const a=createOrg(db,user,'Stadt A'),b=createOrg(db,user,'Stadt B');
 const sent={...msg,from:{name:'Alex',email:msg.mailbox},direction:'outgoing',originalSubject:'Kurze Nachfrage',subject:'Kurze Nachfrage',originalBody:'Guten Tag,\nhaben Sie unser Angebot erhalten?',body:'Guten Tag,\nhaben Sie unser Angebot erhalten?',action:'save',confirmed:true};
 const to=(address)=>({recipients:[{email:address,name:''},{email:'sam@team.test',name:'Sam'}],contactEmails:[address]});
 action(db,user,{...sent,...to('info@stadt-a.test'),requestId:randomUUID(),gmailMessageId:'g1',organisationId:a.id,version:a.version});
 const second=action(db,user,{...sent,...to('info@stadt-b.test'),requestId:randomUUID(),gmailMessageId:'g2',organisationId:b.id,version:b.version});
 assert.equal(second.duplicate,false);assert.equal(second.organisation.id,b.id);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,2);
 // Each Gmail message finds its own saved copy, and opening the second one again is recognised as saved.
 assert.equal(action(db,user,{action:'messageStatus',mailbox:msg.mailbox,gmailMessageId:'g2'}).organisation.id,b.id);
 const retry=action(db,user,{...sent,...to('info@stadt-b.test'),requestId:randomUUID(),gmailMessageId:'g2',organisationId:b.id,version:getOrg(db,b.id).version});
 assert.equal(retry.duplicate,true);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,2);
 }finally{db.close();}
});
