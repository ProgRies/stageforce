import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openDB} from '../server/db.mjs';
import {createOrg,addContact,contacts,entity,history,save,stageImport,importPreview,confirmImport,timelinePosition,addActivity} from '../server/crm.mjs';
import {parseEmail} from '../server/email.mjs';
import {createSession} from '../server/auth.mjs';
import {enableMfa,newSecret} from '../server/mfa.mjs';
import {makeServer} from '../server/http.mjs';
function setup(){const db=openDB(':memory:');for(const name of['alex','bea'])db.prepare('INSERT INTO users VALUES(?,?,?,?,1,?)').run(name,name+'@our-team.test',name,'unused','2026-01-01');enableMfa(db,'alex',newSecret());return{db,user:{id:'alex',email:'alex@our-team.test'}};}
async function mail({sender='Pat Test <pat@customer.test>',to='alex@our-team.test',cc='',date='Tue, 13 Oct 2026 10:00:00 +0200',id='one',body='Agreed.'}={}){return parseEmail(Buffer.from(`From: ${sender}\r\nTo: ${to}\r\nCc: ${cc}\r\nMessage-ID: <${id}@example.test>\r\nDate: ${date}\r\nSubject: Message ${id}\r\n\r\n${body}`),'alex@our-team.test');}
const confirm=(p,org,extra={})=>({importId:p.id,id:org.id,version:org.version,date:'2026-10-13',body:p.cleaned,...extra});

test('legacy generic contacts remain visible and participate in email placement without reclassifying notes',async()=>{const{db,user}=setup();try{
 const org=createOrg(db,user,'Legacy example');
 addActivity(db,org.id,null,{type:'Kontakt',date:'2026-02-11',text:'Call followed by email',contacted:true});
 addActivity(db,org.id,null,{type:'Notiz / Status',text:'Undated historical information'});
 const before=JSON.stringify(db.prepare('SELECT * FROM activities ORDER BY id').all());
 assert.equal(history(db,org.id,0,'communication').items[0].art,'Kontakt');
 assert.equal(history(db,org.id,0,'communication').total,1);
 assert.equal(history(db,org.id,0,'internal').items[0].art,'Notiz / Status');
 const p=stageImport(db,user,await mail());
 const position=timelinePosition(db,user,{importId:p.id,id:org.id,date:'2026-02-10'});
 assert.equal(position.position,2);assert.equal(position.before.art,'Kontakt');
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM activities ORDER BY id').all()),before);
 assert.equal(entity(db,org.id).values[15],'2026-02-11');
 }finally{db.close();}});

test('wizard suggests exact sender, handles shared agency addresses, and never uses public mailbox domains as company evidence',async()=>{const{db,user}=setup();try{
 const a=createOrg(db,user,'Customer'),b=createOrg(db,user,'Other');addContact(db,a.id,{e_mails:['pat@customer.test']});addContact(db,b.id,{e_mails:['cc@other.test']});
 let p=stageImport(db,user,await mail({cc:'cc@other.test'}));assert.equal(p.bestId,a.id);assert.equal(p.candidates[0].reason,'E-Mail-Adresse bekannt');
 addContact(db,b.id,{e_mails:['pat@customer.test']});p=stageImport(db,user,await mail({id:'ambiguous'}));assert.equal(p.bestId,'');assert.equal(p.candidates.length,2);
 p=stageImport(db,user,await mail({sender:'New <new@customer.test>',id:'domain'}));assert.ok(p.candidates.every(c=>c.score===30));assert.equal(p.bestId,'');
 addContact(db,a.id,{e_mails:['any@gmail.com']});p=stageImport(db,user,await mail({sender:'Different <other@gmail.com>',id:'public'}));assert.equal(p.candidates.length,0);
 }finally{db.close();}});

test('participant suggestions exclude team by default metadata and identify quoted addresses separately',async()=>{const{db,user}=setup();try{
 const p=stageImport(db,user,await mail({cc:'Bea <bea@our-team.test>, External <cc@customer.test>',body:'Hello\nFrom: Earlier Person <earlier@customer.test>\nAn address in prose: random@elsewhere.test'}));
 assert.equal(p.participants.find(a=>a.email==='bea@our-team.test').internal,true);assert.equal(p.participants.find(a=>a.email==='cc@customer.test').role,'cc');assert.equal(p.participants.find(a=>a.email==='earlier@customer.test').role,'quoted');assert.ok(!p.participants.some(a=>a.email==='random@elsewhere.test'));assert.equal(p.suggestedName,'Customer');
 }finally{db.close();}});

test('new organisation, multiple contacts, message and selections commit once and roll back together',async()=>{const{db,user}=setup();try{
 const p=stageImport(db,user,await mail({cc:'Second <second@customer.test>, Agency <agency@outside.test>'}));assert.equal(db.prepare('SELECT count(*) n FROM organisations').get().n,0);
 const b={importId:p.id,newOrganisation:{name:'New customer'},date:'2026-10-13',contactEmails:['pat@customer.test','second@customer.test'],body:p.cleaned};
 assert.throws(()=>confirmImport(db,user,{...b,contactEmails:['not-in-mail@example.test']}),/Beteiligten/);assert.equal(db.prepare('SELECT count(*) n FROM organisations').get().n,0);
 const r=confirmImport(db,user,b);assert.equal(r.entity.values[9],'Lead');assert.equal(contacts(db,r.entity.id).length,2);assert.equal(db.prepare('SELECT count(*) n FROM activity_contacts').get().n,2);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,1);assert.equal(confirmImport(db,user,b).alreadySaved,true);assert.equal(db.prepare('SELECT count(*) n FROM organisations').get().n,1);
 assert.equal(contacts(db,r.entity.id).some(c=>c.e_mails.includes('agency@outside.test')),false);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 const other=stageImport(db,user,await mail({id:'invalid'}));const insert=db.prepare('SELECT count(*) n FROM organisations').get().n;
 assert.throws(()=>confirmImport(db,user,{importId:other.id,newOrganisation:{name:'Invalid',status:'Kunde'},date:'2026-10-13',fields:{10:'bad'}}),/Phase/);assert.equal(db.prepare('SELECT count(*) n FROM organisations').get().n,insert);
 }finally{db.close();}});

test('reuses contacts within the selected organisation, preserves unchecked contacts and checks concurrent versions',async()=>{const{db,user}=setup();try{
 let org=createOrg(db,user,'Customer');const cid=addContact(db,org.id,{name:'Existing',e_mails:['PAT@customer.test']});const other=createOrg(db,user,'Agency');addContact(db,other.id,{name:'Agency copy',e_mails:['second@customer.test']});
 const p=stageImport(db,user,await mail({cc:'second@customer.test'}));const saved=confirmImport(db,user,confirm(p,org,{contactEmails:['pat@customer.test','second@customer.test']}));assert.equal(contacts(db,org.id).length,2);assert.ok(db.prepare('SELECT 1 FROM activity_contacts WHERE contact_id=?').get(cid));assert.equal(contacts(db,other.id).length,1);
 const p2=stageImport(db,user,await mail({id:'new'}));assert.throws(()=>confirmImport(db,user,confirm(p2,org,{contactEmails:[]})),/inzwischen/);confirmImport(db,user,confirm(p2,saved.entity,{contactEmails:[]}));assert.equal(contacts(db,org.id).length,2);
 }finally{db.close();}});

test('preview locates old email among the full communication history, ignoring recent internal edits',async()=>{const{db,user}=setup();try{
 let org=createOrg(db,user,'Customer');for(let day=1;day<=45;day++)addActivity(db,org.id,user,{type:'CRM-Änderung',date:'2026-10-14',text:'Internal '+day});
 addActivity(db,org.id,user,{type:'Telefonat',date:'2026-10-14',text:'Latest call',contacted:true});addActivity(db,org.id,user,{type:'Telefonat',date:'2026-09-01',text:'Older call',contacted:true});
 const p=stageImport(db,user,await mail());const placement=timelinePosition(db,user,{importId:p.id,id:org.id,date:'2026-10-13'});assert.equal(placement.position,2);assert.equal(placement.total,3);assert.equal(placement.before.text,'Latest call');assert.equal(placement.after.text,'Older call');
 org=confirmImport(db,user,confirm(p,org)).entity;assert.equal(org.values[15],'2026-10-14');const comm=history(db,org.id,0,'communication');assert.equal(comm.total,3);assert.deepEqual(comm.items.map(i=>i.datum),['2026-10-14','2026-10-13','2026-09-01']);assert.equal(history(db,org.id,0,'internal').total,45);assert.equal(history(db,org.id,40,'internal').items.length,5);
 }finally{db.close();}});

test('same-day emails sort by original sent time, not import order; preview agrees with saved position',async()=>{const{db,user}=setup();try{
 let org=createOrg(db,user,'Customer');const newer=stageImport(db,user,await mail({id:'late',date:'Tue, 13 Oct 2026 16:00:00 +0200'}));org=confirmImport(db,user,confirm(newer,org)).entity;
 const older=stageImport(db,user,await mail({id:'early',date:'Tue, 13 Oct 2026 08:00:00 +0200'}));assert.equal(timelinePosition(db,user,{importId:older.id,id:org.id,date:'2026-10-13'}).position,2);org=confirmImport(db,user,confirm(older,org)).entity;
 assert.deepEqual(history(db,org.id,0,'communication').items.map(i=>i.subject),['Message late','Message early']);
 const first=stageImport(db,user,await mail({id:'latest',date:'Tue, 13 Oct 2026 18:00:00 +0200'}));assert.equal(timelinePosition(db,user,{importId:first.id,id:org.id,date:'2026-10-13'}).position,1);
 }finally{db.close();}});

test('duplicate email cannot create another organisation or rewrite previous contact decisions',async()=>{const{db,user}=setup();try{
 const org=createOrg(db,user,'Customer'),p=stageImport(db,user,await mail());confirmImport(db,user,confirm(p,org,{contactEmails:['pat@customer.test']}));const duplicate=stageImport(db,user,await mail());assert.equal(duplicate.bestId,org.id);
 assert.throws(()=>confirmImport(db,user,{importId:duplicate.id,newOrganisation:{name:'Duplicate'},date:'2026-10-13'}),/bereits/);assert.equal(db.prepare('SELECT count(*) n FROM organisations').get().n,1);
 const r=confirmImport(db,user,confirm(duplicate,entity(db,org.id),{contactEmails:[]}));assert.equal(r.duplicate,true);assert.equal(db.prepare('SELECT count(*) n FROM activity_contacts').get().n,1);
 }finally{db.close();}});

test('new customers require explicit paying status; draft/contact-date overrides are refused in email imports',async()=>{const{db,user}=setup();try{
 const p=stageImport(db,user,await mail());const b={importId:p.id,newOrganisation:{name:'Paying customer',status:'Kunde'},date:'2026-10-13'};assert.throws(()=>confirmImport(db,user,{...b,fields:{15:'2026-10-14'}}),/Nur Status/);const r=confirmImport(db,user,b);assert.equal(r.entity.values[9],'Kunde');assert.equal(r.entity.values[15],'2026-10-13');
 const failed=save(db,user,{id:r.entity.id,version:r.entity.version,requestId:'missed',fields:{},note:{type:'Notiz',text:'Telefonisch nicht erreicht.',date:'2026-10-14',contacted:true}});assert.equal(failed.entity.values[15],'2026-10-13');assert.equal(history(db,r.entity.id,0,'communication').items[0].art,'Notiz');
 }finally{db.close();}});

test('wizard HTTP endpoint returns position and persists selected contacts via authenticated routes',async()=>{const{db,user}=setup();const org=createOrg(db,user,'Customer'),p=stageImport(db,user,await mail()),session=createSession(db,user),server=makeServer(db,{origin:'http://localhost:3000'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;try{
 const headers={Origin:'http://localhost:3000',Cookie:'stage_session='+session.token,'Content-Type':'application/json','X-CSRF-Token':session.csrf};const send=b=>fetch(base+'/api/crm',{method:'POST',headers,body:JSON.stringify(b)});
 let res=await send({action:'importPosition',importId:p.id,id:org.id,date:'2026-10-13'});assert.equal((await res.json()).data.position,1);
 res=await send({action:'importConfirm',...confirm(p,org,{contactEmails:['pat@customer.test']})});assert.equal(res.status,200);
 res=await send({action:'detail',id:org.id,historyKind:'communication'});const detail=(await res.json()).data;assert.equal(detail.history.total,1);res=await send({action:'message',id:detail.history.items[0].message_id});assert.equal((await res.json()).data.contacts.length,1);
 }finally{await new Promise(r=>server.close(r));db.close();}});

test('schema 3 upgrade preserves existing messages and contacts without inventing associations',()=>{const dir=mkdtempSync(join(tmpdir(),'stage-wizard-'));let db=openDB(join(dir,'crm.sqlite'));try{
 const org=createOrg(db,null,'Example');addContact(db,org.id,{name:'Existing'});db.exec('DROP TABLE activity_contacts; DELETE FROM schema_versions WHERE version=4; PRAGMA user_version=3');db.close();db=openDB(join(dir,'crm.sqlite'));assert.equal(db.prepare('PRAGMA user_version').get().user_version,10);assert.equal(contacts(db,org.id).length,1);assert.equal(db.prepare('SELECT count(*) n FROM activity_contacts').get().n,0);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}});

test('duplicate source without a Date header offers the previously reviewed date and direction',async()=>{const{db,user}=setup();try{
 const payload=await mail();payload.sentAt=null;const org=createOrg(db,user,'Customer'),p=stageImport(db,user,payload);confirmImport(db,user,confirm(p,org,{direction:'outgoing'}));const duplicate=stageImport(db,user,payload);assert.equal(duplicate.existing.date,'2026-10-13');assert.equal(duplicate.existing.direction,'outgoing');
 }finally{db.close();}});

test('colleague messages suggest outgoing; internal forwards do not silently advance customer-contact dates',async()=>{const{db,user}=setup();try{
 const p=stageImport(db,user,await mail({sender:'bea@our-team.test',to:'pat@customer.test'}));assert.equal(p.direction,'outgoing');assert.equal(p.suggestedContacted,true);
 const internal=stageImport(db,user,await mail({id:'internal',sender:'bea@our-team.test',to:'alex@our-team.test',body:'Forwarded\nFrom: Pat <pat@customer.test>'}));assert.equal(internal.suggestedContacted,false);
 const org=createOrg(db,user,'Customer');const r=confirmImport(db,user,confirm(internal,org));assert.equal(r.entity.values[15],'');
 }finally{db.close();}});
