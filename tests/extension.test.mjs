import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser,hashToken,createSession} from '../server/auth.mjs';
import {enableMfa,newSecret} from '../server/mfa.mjs';
import {createOrg,addContact,getOrg} from '../server/crm.mjs';
import {extensionCreate,extensionRevoke,authorizeExtension,extensionAction} from '../server/extension.mjs';
import {makeServer} from '../server/http.mjs';
import '../integrations/chrome/date.js';
const origin='http://localhost:3000';
const msg={mailbox:'alex@team.test',from:{name:'Pat',email:'pat@customer.test'},recipients:[{email:'alex@team.test',name:'Alex'}],originalSubject:'Hello',subject:'Hello',originalBody:'Confidential\n<script>not executable</script>',body:'Reviewed confidential email',timestamp:'2026-10-13T10:07:00Z',timestampRaw:'13.10.2026, 12:07',direction:'incoming',sourceUrl:'https://mail.google.com/mail/u/0/#inbox/example',contactEmails:['pat@customer.test']};
async function setup(){const db=openDB(':memory:');const id=await addUser(db,msg.mailbox,'Alex','long-password-1234');enableMfa(db,id,newSecret());const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);return{db,user};}
const action=(db,user,b)=>extensionAction(db,user,b,origin);
test('extension keys are separate, hashed, revocable, rotating, expiring and disabled with accounts',async()=>{
 const{db,user}=await setup();try{const first=extensionCreate(db,user);const req={headers:{authorization:'Bearer '+first.token,origin:'chrome-extension://'+'a'.repeat(32)}};
 assert.equal(db.prepare('SELECT token_hash FROM extension_keys').get().token_hash,hashToken(first.token));assert.equal(authorizeExtension(db,req).id,user.id);
 assert.throws(()=>authorizeExtension(db,{headers:{...req.headers,origin:'https://mail.google.com'}}),/Extension/);
 extensionCreate(db,user);assert.throws(()=>authorizeExtension(db,req),/Connect/);
 req.headers.authorization='Bearer '+extensionCreate(db,user).token;db.prepare('UPDATE extension_keys SET expires_at=0').run();assert.throws(()=>authorizeExtension(db,req),/Connect/);
 req.headers.authorization='Bearer '+extensionCreate(db,user).token;db.prepare('UPDATE users SET active=0').run();assert.throws(()=>authorizeExtension(db,req),/Connect/);db.prepare('UPDATE users SET active=1').run();extensionRevoke(db,user);assert.throws(()=>authorizeExtension(db,req),/Connect/);
 }finally{db.close();}
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
 const{db,user}=await setup();const key=extensionCreate(db,user).token,session=createSession(db,user);const server=makeServer(db,{origin});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,b,h={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...h},body:JSON.stringify(b)});
 try{const path='/api/integrations/extension',auth={Authorization:'Bearer '+key};assert.equal((await post(path,{action:'check'})).status,401);assert.equal((await post(path,{action:'check'},{Cookie:'stage_session='+session.token})).status,401);
 assert.equal((await post(path,{action:'check'},{...auth,Origin:'https://evil.test'})).status,403);assert.equal((await post(path,{action:'check'},auth)).status,200);
 assert.equal((await post('/api/crm',{action:'load'},{...auth,Origin:origin})).status,401);
 const browser={Origin:origin,Cookie:'stage_session='+session.token};assert.equal((await post('/api/crm',{action:'extensionCreate'},browser)).status,403);
 assert.equal((await post('/api/crm',{action:'extensionRevoke'},{...browser,'X-CSRF-Token':session.csrf})).status,200);assert.equal((await post(path,{action:'check'},auth)).status,401);
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
