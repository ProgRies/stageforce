import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {openDB} from '../server/db.mjs';
import {addUser,hashToken} from '../server/auth.mjs';
import {createOrg,importPreview,confirmImport} from '../server/crm.mjs';
import {createGmailKey,authorizeGmail,revokeGmailKey,selectedGmailMessage} from '../server/gmail.mjs';
import {makeServer} from '../server/http.mjs';
const password='test-password-12345';
async function setup(){const db=openDB(':memory:');const id=await addUser(db,'alex@example.test','Alex',password);return{db,user:db.prepare('SELECT * FROM users WHERE id=?').get(id)};}
const selected={mailbox:'alex@example.test',gmailId:'19a123abcdef',messageId:'<selected@example.test>',from:'Müller <pat@example.test>',to:'Alex <alex@example.test>',cc:'',subject:'Interesse an Bühne ✓',date:'2026-10-13T08:00:00Z',text:'New answer\n> Previous email\nAn inline reply'};

test('capture credentials are hashed, rotated, expired and tied to an active account',async()=>{
 const{db,user}=await setup();try{
  const first=createGmailKey(db,user),req={headers:{authorization:'Bearer '+first.token}};
  assert.equal(db.prepare('SELECT token_hash FROM gmail_keys').get().token_hash,hashToken(first.token));
  assert.equal(authorizeGmail(db,req).id,user.id);
  const second=createGmailKey(db,user);assert.throws(()=>authorizeGmail(db,req),/abgelaufen/);
  req.headers.authorization='Bearer '+second.token;
  db.prepare('UPDATE gmail_keys SET expires_at=?').run(Date.now()-1);assert.throws(()=>authorizeGmail(db,req),/abgelaufen/);
  req.headers.authorization='Bearer '+createGmailKey(db,user).token;
  db.prepare('UPDATE users SET active=0').run();assert.throws(()=>authorizeGmail(db,req),/abgelaufen/);
  db.prepare('UPDATE users SET active=1').run();revokeGmailKey(db,user);assert.throws(()=>authorizeGmail(db,req),/abgelaufen/);
 }finally{db.close();}
});
test('selected-message adapter preserves Unicode, rejects header injection and excludes arbitrary payload data',async()=>{
 const{db,user}=await setup();try{
  const p=await selectedGmailMessage({...selected,attachments:['DO_NOT_STORE'],secret:'DO_NOT_STORE'},user);
  assert.equal(p.subject,selected.subject);assert.equal(p.sender[0].name,'Müller');assert.equal(p.messageId,selected.messageId);assert.equal(p.sentAt,selected.date.replace('Z','.000Z'));
  assert.deepEqual(p.attachments,[]);assert.ok(!JSON.stringify(p).includes('DO_NOT_STORE'));
  assert.match(p.sourceUrl,/^https:\/\/mail.google.com\//);assert.match(p.sourceUrl,/rfc822msgid/);assert.match(p.cleaned,/inline reply/);assert.doesNotMatch(p.cleaned,/Previous email/);
  await assert.rejects(selectedGmailMessage({...selected,subject:'Hi\r\nBcc: evil@example.test'},user),/Kopfzeile/);
  await assert.rejects(selectedGmailMessage({...selected,mailbox:'other@example.test'},user),/dieselbe/);
  await assert.rejects(selectedGmailMessage({...selected,text:'x'.repeat(500001)},user),/text/);
  const out=await selectedGmailMessage({...selected,from:user.email,to:'pat@example.test'},user);assert.equal(out.direction,'outgoing');
 }finally{db.close();}
});
test('HTTP capture stages only, deduplicates retries and keeps browser auth/CSRF and review ownership intact',async()=>{
 const{db,user}=await setup();const org=createOrg(db,user,'Customer');
 const otherId=await addUser(db,'bea@example.test','Bea',password),other=db.prepare('SELECT * FROM users WHERE id=?').get(otherId);
 const key=createGmailKey(db,user).token;
 const server=makeServer(db,{origin:'http://localhost:3000'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const send=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 const auth={Authorization:'Bearer '+key};
 try{
  assert.equal((await send('/api/integrations/gmail/import',selected)).status,401);
  assert.equal((await send('/api/integrations/gmail/import',selected,{...auth,Origin:'https://evil.test'})).status,403);
  assert.equal((await send('/api/crm',{action:'load'},auth)).status,403);
  assert.equal((await send('/api/crm',{action:'load'},{...auth,Origin:'http://localhost:3000'})).status,401);
  let r=await send('/api/integrations/gmail/check',{},auth);assert.deepEqual((await r.json()).data,{email:user.email});
  r=await send('/api/integrations/gmail/import',selected,auth);assert.equal(r.status,200);const result=(await r.json()).data;
  assert.deepEqual(Object.keys(result),['reviewUrl']);const id=new URL(result.reviewUrl).searchParams.get('import');
  assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM activities').get().n,0);
  r=await send('/api/integrations/gmail/import',selected,auth);assert.equal((await r.json()).data.reviewUrl,result.reviewUrl);
  assert.equal(db.prepare('SELECT count(*) n FROM email_imports').get().n,1);
  assert.throws(()=>importPreview(db,other,id),/nicht gefunden/);
  const p=importPreview(db,user,id);confirmImport(db,user,{importId:id,id:org.id,version:org.version,date:'2026-10-13',body:p.cleaned,sourceUrl:p.sourceUrl});
  assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,1);
  // Token creation/revocation requires both browser session and CSRF.
  const login=await send('/api/login',{email:user.email,password},{Origin:'http://localhost:3000'});
  const cookie=login.headers.get('set-cookie').split(';')[0],session=(await login.json()).data;
  const browser={Origin:'http://localhost:3000',Cookie:cookie};
  assert.equal((await send('/api/crm',{action:'gmailCreate'},browser)).status,403);
  const status=await send('/api/crm',{action:'gmailStatus'},{...browser,'X-CSRF-Token':session.csrf});assert.ok(!('token' in (await status.json()).data));
  const revoked=await send('/api/crm',{action:'gmailRevoke'},{...browser,'X-CSRF-Token':session.csrf});assert.equal(revoked.status,200);
  assert.equal((await send('/api/integrations/gmail/import',selected,auth)).status,401);
 }finally{await new Promise(r=>server.close(r));db.close();}
});
test('version 1 database upgrades additively and retains users and organisations',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'stage-upgrade-')),path=join(dir,'crm.sqlite');let db=openDB(path);
 try{
  const id=await addUser(db,'alex@example.test','Alex',password),org=createOrg(db,{id},'Existing customer');
  db.exec('DROP TABLE gmail_keys; DELETE FROM schema_versions WHERE version=2; PRAGMA user_version=1');db.close();db=openDB(path);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);
  assert.equal(db.prepare('SELECT name FROM organisations WHERE id=?').get(org.id).name,'Existing customer');
  assert.equal(db.prepare('SELECT email FROM users WHERE id=?').get(id).email,'alex@example.test');
  assert.equal(db.prepare('SELECT count(*) n FROM gmail_keys').get().n,0);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('Apps Script adapter uses selected-message reads only and sends no attachments or tokens in review links',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../integrations/gmail/appsscript.json',import.meta.url),'utf8'));
 assert.deepEqual(manifest.oauthScopes,[
  'https://www.googleapis.com/auth/gmail.addons.execute','https://www.googleapis.com/auth/gmail.addons.current.message.action',
  'https://www.googleapis.com/auth/script.external_request','https://www.googleapis.com/auth/userinfo.email']);
 const code=readFileSync(new URL('../integrations/gmail/Code.gs',import.meta.url),'utf8');
 const calls=[],requests=[],store=new Map([['stageforceCaptureKey','sf_gmail_'+'a'.repeat(43)]]);
 function widget(){return new Proxy({},{get:(_,name)=>(...args)=>{calls.push([name,...args]);return widget();}});}
 const context=vm.createContext({
  CardService:new Proxy({OpenAs:{FULL_SIZE:'FULL_SIZE'}},{get:(o,k)=>o[k]||(()=>widget())}),
  PropertiesService:{getUserProperties:()=>({getProperty:k=>store.get(k),setProperty:(k,v)=>store.set(k,v),deleteProperty:k=>store.delete(k)})},
  Session:{getActiveUser:()=>({getEmail:()=>selected.mailbox})},
  GmailApp:{setCurrentMessageAccessToken:t=>calls.push(['access',t]),getMessageById:id=>{assert.equal(id,selected.gmailId);calls.push(['message',id]);return{
   getPlainBody:()=>selected.text,getId:()=>selected.gmailId,getHeader:n=>{assert.equal(n,'Message-ID');return selected.messageId;},
   getFrom:()=>selected.from,getTo:()=>selected.to,getCc:()=>'',getDate:()=>new Date(selected.date),getSubject:()=>selected.subject
  };}},
  UrlFetchApp:{fetch:(url,options)=>{requests.push({url,options});return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({status:'success',data:url.endsWith('/check')?{email:selected.mailbox}:{reviewUrl:'https://crm.example.com/?import=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'}})};}}
 });
 vm.runInContext(code,context);context.onGmailMessage();assert.equal(requests.length,0);assert.ok(!calls.some(c=>c[0]==='message'));
 context.captureMessage({gmail:{messageId:selected.gmailId,accessToken:'temporary-selected-message-access'}});
 assert.equal(requests.length,2);assert.equal(requests[1].options.followRedirects,false);
 assert.deepEqual(JSON.parse(requests[1].options.payload),{...selected,date:new Date(selected.date).toISOString()});
 assert.ok(calls.some(c=>c[0]==='setUrl'&&c[1]==='https://crm.example.com/?import=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'));
 assert.ok(!requests.some(r=>r.url.includes('sf_gmail_')));
});
