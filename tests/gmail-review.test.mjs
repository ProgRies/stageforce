import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,importPreview} from '../server/crm.mjs';
import {authorizeGmail,createGmailKey,selectedGmailMessage,stageGmailMessage} from '../server/gmail.mjs';
import {reviewGmail} from '../server/gmail-review.mjs';
import {makeServer} from '../server/http.mjs';

const selected={mailbox:'alex@example.test',gmailId:'19abc123',messageId:'<sidebar@example.test>',from:'Pat <pat@customer.test>',to:'Alex <alex@example.test>',cc:'Guest <guest@other.test>',subject:'Stage request',date:'2026-10-13T22:30:00Z',text:'Hello team\n> Old quote\nKeep this inline answer'};
async function setup(){
 const db=openDB(':memory:');
 const id=await addUser(db,selected.mailbox,'Alex','test-password-12345');
 const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
 const key=createGmailKey(db,user,{sidebarReview:true});
 const auth={headers:{authorization:'Bearer '+key.token}};
 const principal=()=>authorizeGmail(db,auth,false);
 const org=createOrg(db,user,'Customer');addContact(db,org.id,{name:'Pat',e_mails:['pat@customer.test']});
 const parsed=await selectedGmailMessage(selected,user),importId=stageGmailMessage(db,user,parsed);
 const call=b=>reviewGmail(db,principal(),{importId,...b},'https://crm.example.com');
 return{db,user,key,auth,org,importId,call};
}

test('sidebar review preserves explicit confirmation, ownership, quote choices, dates and retry idempotence',async()=>{
 const{db,user,org,importId,call}=await setup();try{
  const p=call({action:'preview'});assert.equal(p.bestId,org.id);assert.equal(p.date,'2026-10-14');assert.equal(p.removed,true);
  assert.equal(call({action:'search',query:'Customer'}).items[0].id,org.id);
  assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,0);
  const c=call({action:'context',id:org.id,date:p.date});assert.ok(c.participants.find(a=>a.email==='pat@customer.test').known);assert.equal(c.position.position,1);
  const other=await addUser(db,'bea@example.test','Bea','test-password-12345');
  assert.throws(()=>reviewGmail(db,{id:other,email:'bea@example.test',sidebar_review:1},{action:'search',importId,query:'Customer'},'https://crm.example.com'),/nicht gefunden/);
  const input={action:'confirm',id:org.id,version:org.version,date:p.date,direction:'incoming',bodyMode:'original',contactEmails:['pat@customer.test'],fields:{9:'Kunde'},summary:'Reviewed by Alex'};
  assert.throws(()=>call(input),/ausdrücklich/);
  assert.throws(()=>call({...input,confirmed:true,version:'999'}),/inzwischen geändert/);
  assert.throws(()=>call({...input,confirmed:true,contactEmails:['invented@customer.test']}),/Beteiligten/);
  assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,0);
  const result=call({...input,confirmed:true});assert.equal(result.saved,true);assert.match(result.organisationUrl,/\?organisation=STG-/);
  const mail=db.prepare('SELECT * FROM messages').get();assert.equal(mail.body,selected.text);
  assert.equal(db.prepare('SELECT count(*) n FROM activity_contacts').get().n,1);
  assert.equal(db.prepare('SELECT count(*) n FROM contacts').get().n,1); // CC was not added.
  assert.equal(db.prepare('SELECT status,last_contact FROM organisations WHERE id=?').get(org.id).status,'Lead'); // Arbitrary fields aren't accepted.
  assert.equal(db.prepare('SELECT last_contact FROM organisations WHERE id=?').get(org.id).last_contact,'2026-10-14');
  assert.equal(db.prepare("SELECT user_id FROM audit_log WHERE action='email_import'").get().user_id,user.id);
  assert.ok(call({...input,confirmed:true}).saved);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,1);
  assert.throws(()=>reviewGmail(db,{id:other,sidebar_review:1},{action:'preview',importId},'https://crm.example.com'),/nicht gefunden/);
 }finally{db.close();}
});

test('sidebar new organisation is created only at final save and long text is not truncated',async()=>{
 const{db,user,call}=await setup();try{
  const long='Long message '.repeat(2000),parsed=await selectedGmailMessage({...selected,messageId:'<long@example.test>',text:long},user);
  const importId=stageGmailMessage(db,user,parsed),p=call({action:'preview',importId});
  assert.equal(p.body,null);assert.ok(p.pages>1);assert.equal(p.excerpt.length,3000);
  const count=db.prepare('SELECT count(*) n FROM organisations').get().n;
  call({action:'context',importId,date:p.date});assert.equal(db.prepare('SELECT count(*) n FROM organisations').get().n,count);
  const result=call({action:'confirm',importId,confirmed:true,newOrganisation:{name:'New organisation',status:'Lead'},date:p.date,bodyMode:'cleaned',contactEmails:[]});
  assert.equal(result.organisation.name,'New organisation');assert.equal(db.prepare('SELECT body FROM messages').get().body,long.trim());
  assert.equal(db.prepare('SELECT count(*) n FROM organisations').get().n,count+1);
  call({action:'confirm',importId,confirmed:true,newOrganisation:{name:'New organisation',status:'Lead'}});
  assert.equal(db.prepare('SELECT count(*) n FROM organisations').get().n,count+1);
 }finally{db.close();}
});

test('HTTP review requires new scoped key, cannot use browser Origin or bypass CRM session auth',async()=>{
 const{db,user,key,org,importId}=await setup();
 const server=makeServer(db,{origin:'http://localhost:3000'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const post=(path,b,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key.token,...headers},body:JSON.stringify(b)});
 try{
  const data={action:'preview',importId};
  assert.equal((await post('/api/integrations/gmail/review',data,{Origin:'http://localhost:3000'})).status,403);
  assert.equal((await post('/api/integrations/gmail/review',data)).status,200);
  assert.equal((await post('/api/crm',{action:'load'},{Origin:'http://localhost:3000'})).status,401);
  assert.equal((await post('/api/integrations/gmail/review',{...data,action:'save',id:org.id})).status,400);
  db.prepare('UPDATE gmail_keys SET sidebar_review=0').run();
  assert.equal((await post('/api/integrations/gmail/review',data)).status,403);
  assert.equal((await post('/api/integrations/gmail/import',selected)).status,200);
  db.prepare('UPDATE gmail_keys SET sidebar_review=1').run();
  db.prepare('UPDATE email_imports SET expires_at=0').run();
  assert.equal((await post('/api/integrations/gmail/review',data)).status,404);
  db.prepare('DELETE FROM gmail_keys').run();assert.equal((await post('/api/integrations/gmail/review',data)).status,401);
 }finally{await new Promise(r=>server.close(r));db.close();}
});

test('schema 4 upgrade preserves data and does not expand existing key privileges',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'stage-gmail-review-')),path=join(dir,'crm.sqlite');let db=openDB(path);
 try{
  const id=await addUser(db,selected.mailbox,'Alex','test-password-12345'),user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
  const key=createGmailKey(db,user),org=createOrg(db,user,'Existing');
  db.exec('ALTER TABLE gmail_keys DROP COLUMN sidebar_review; DELETE FROM schema_versions WHERE version=5; PRAGMA user_version=4');db.close();db=openDB(path);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,5);
  assert.equal(authorizeGmail(db,{headers:{authorization:'Bearer '+key.token}},false).sidebar_review,0);
  assert.equal(db.prepare('SELECT name FROM organisations WHERE id=?').get(org.id).name,'Existing');
  const renewed=createGmailKey(db,user,{sidebarReview:true});
  assert.equal(authorizeGmail(db,{headers:{authorization:'Bearer '+renewed.token}},false).sidebar_review,1);
  assert.throws(()=>authorizeGmail(db,{headers:{authorization:'Bearer '+key.token}},false),/abgelaufen/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('Apps Script completes review in Gmail, leaves unchecked CC out, and never rereads or changes mail',async()=>{
 const{db,user,key,org,importId,call}=await setup();try{
  const code=readFileSync(new URL('../integrations/gmail/Code.gs',import.meta.url),'utf8');
  const requests=[],widgets=[],cache=new Map(),properties=new Map([['stageforceCaptureKey',key.token]]);let reads=0;
  const widget=()=>new Proxy({},{get:(_,method)=>(...args)=>{widgets.push([method,...args]);return widget();}});
  const context=vm.createContext({
   CardService:new Proxy({OpenAs:{FULL_SIZE:'FULL_SIZE'},TextButtonStyle:{FILLED:'FILLED'},SelectionInputType:{RADIO_BUTTON:'RADIO_BUTTON',CHECK_BOX:'CHECK_BOX',DROPDOWN:'DROPDOWN'}},{get:(o,k)=>o[k]||(()=>widget())}),
   CacheService:{getUserCache:()=>({put:(k,v)=>cache.set(k,v),get:k=>cache.get(k)})},Utilities:{getUuid:()=> 'flow-one'},
   PropertiesService:{getUserProperties:()=>({getProperty:k=>properties.get(k),setProperty:(k,v)=>properties.set(k,v),deleteProperty:k=>properties.delete(k)})},
   Session:{getActiveUser:()=>({getEmail:()=>selected.mailbox})},
   GmailApp:{setCurrentMessageAccessToken:()=>{},getMessageById:id=>{assert.equal(id,selected.gmailId);reads++;return{
    getPlainBody:()=>selected.text,getId:()=>selected.gmailId,getHeader:()=>selected.messageId,getFrom:()=>selected.from,getTo:()=>selected.to,getCc:()=>selected.cc,getDate:()=>new Date(selected.date),getSubject:()=>selected.subject
   };}},
   UrlFetchApp:{fetch:(url,options)=>{
    const b=JSON.parse(options.payload);requests.push({url,b});
    const data=url.endsWith('/check')?{email:user.email,sidebarReview:true}:url.endsWith('/import')?{reviewUrl:'https://crm.example.com/?import='+importId}:call(b);
    return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({status:'success',data})};
   }}
  });
  vm.runInContext(code,context);context.onGmailMessage();assert.equal(reads,0);assert.equal(requests.length,0);
  const gmail={messageId:selected.gmailId,accessToken:'ephemeral'};
  context.captureMessage({gmail});assert.equal(reads,1);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,0);
  const event=(params={},fields={})=>({gmail,commonEventObject:{parameters:{flow:'flow-one',...params},formInputs:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,{stringInputs:{value:Array.isArray(v)?v:[v]}}]))}});
  const beforeSwitch=requests.length;
  context.confirmContacts({...event(),gmail:{messageId:'different'}});assert.equal(requests.length,beforeSwitch);
  context.showNewOrganisation(event());
  context.selectOrganisation(event({newOrganisation:'true'},{newName:'Proposed organisation',newStatus:'Kunde'}));
  assert.equal(db.prepare('SELECT count(*) n FROM organisations').get().n,1);
  context.showOrganisations(event());
  context.suggestOrganisations(event({}, {orgSearch:'Customer'}));
  assert.ok(widgets.some(w=>w[0]==='addSuggestions'&&w[1].includes('Customer')));
  context.searchOrganisations(event({}, {orgSearch:'Customer'}));
  context.selectOrganisation(event({id:org.id}));
  context.confirmContacts(event({}, {contacts:['pat@customer.test']}));
  assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,0);
  // Date change must show updated timeline placement before a second explicit Save.
  const changed=event({}, {summary:'Handled in Gmail',direction:'incoming',contactCount:'yes'});
  changed.commonEventObject.formInputs.mailDate={dateInput:{msSinceEpoch:String(Date.parse('2026-10-12T00:00:00Z'))}};
  context.saveReviewedEmail(changed);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,0);
  context.saveReviewedEmail(changed);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,1);
  assert.equal(db.prepare('SELECT occurred_on FROM activities WHERE message_id IS NOT NULL').get().occurred_on,'2026-10-12');
  assert.equal(db.prepare('SELECT count(*) n FROM contacts').get().n,1);assert.equal(reads,1);
  assert.doesNotMatch(db.prepare('SELECT body FROM messages').get().body,/Old quote/);
  assert.ok(widgets.some(w=>w[0]==='setUrl'&&w[1].includes('?organisation='+org.id)));
  assert.ok(![...cache.values()].join('').includes(selected.text));assert.ok(![...cache.values()].join('').includes(key.token));
  context.saveReviewedEmail(changed);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,1);
  const prior=requests.length;cache.clear();context.saveReviewedEmail(changed);assert.equal(requests.length,prior);
  assert.ok(widgets.some(w=>w[0]==='setText'&&w[1].includes('Prüfung abgelaufen')));
  assert.deepEqual([...new Set([...code.matchAll(/GmailApp\.([A-Za-z]+)/g)].map(m=>m[1]))].sort(),['getMessageById','setCurrentMessageAccessToken']);
 }finally{db.close();}
});
