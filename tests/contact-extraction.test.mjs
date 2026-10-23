import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,contacts,getOrg,contactSave} from '../server/crm.mjs';
import {extensionAction} from '../server/extension.mjs';
import '../integrations/chrome/extract.js';
const origin='http://localhost:3000';
const envelope={mailbox:'alex@team.test',from:{name:'Booking system',email:'bookings@service.test'},recipients:[{email:'alex@team.test',name:'Alex'}]};
const message={...envelope,action:'save',confirmed:true,requestId:randomUUID(),gmailMessageId:'booking',originalSubject:'Booking',subject:'Booking',originalBody:'Name\nErika Musterfrau\nE-Mail\nemusterfrau@pruefstelle.example\nMobiltelefon\n+491701234567',body:'Name\nErika Musterfrau\nE-Mail\nemusterfrau@pruefstelle.example\nMobiltelefon\n+491701234567',timestamp:'2026-10-13T10:07:00Z',timestampRaw:'13.10.2026, 12:07',direction:'incoming',contactEmails:[]};
async function setup(){const db=openDB(':memory:');const id=await addUser(db,envelope.mailbox,'Alex','long-password-1234'),user=db.prepare('SELECT * FROM users WHERE id=?').get(id);const action=b=>extensionAction(db,user,b,origin);return{db,user,action};}
test('selection parser handles booking labels, signatures, phones alone and ignores fax/date numbers',()=>{
 const parse=globalThis.stageForceExtract.contact;
 assert.deepEqual(parse(message.body),{name:'Erika Musterfrau',emails:['emusterfrau@pruefstelle.example'],phones:['+491701234567']});
 assert.deepEqual(parse('Jane Doe\njane.doe@example.org\nPhone: +49 (0)30 1234567\nFax: +49 30 7654321'),{name:'Jane Doe',emails:['jane.doe@example.org'],phones:['+49 (0)30 1234567']});
 assert.deepEqual(parse('030 1234567').phones,['030 1234567']);
 assert.deepEqual(parse('23.10.2026\nFax\n+49 30 7654321').phones,[]);
 assert.equal(parse('socialmedia@client.com').name,'Socialmedia');
 assert.equal(parse('Jane Doe <jane@example.org>').name,'Jane Doe');
 assert.deepEqual(parse('Name\n<script>alert(1)</script>\nx@example.org').emails,['x@example.org']);
});
test('explicit extension contact save supports header-free contacts, call preparation and email linkage',async()=>{
 const {db,user,action}=await setup();try{
 const draft={action:'contactSave',confirmed:true,mailbox:envelope.mailbox,newOrganisation:'Prüfstelle Nord',name:'Erika Musterfrau',email:'emusterfrau@pruefstelle.example',phones:['+491701234567']};
 assert.throws(()=>action({...draft,confirmed:false}),/confirmation/);assert.equal(db.prepare('SELECT count(*) n FROM contacts').get().n,0);
 const saved=action(draft);assert.equal(saved.saved,true);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,0);
 const call=action({...envelope,action:'callPrepare',confirmedContact:true,requestId:randomUUID(),startedAt:new Date().toISOString(),organisationId:saved.organisation.id,contactId:saved.contact.contactId,phone:'+491701234567'});assert.equal(call.contact.id,saved.contact.contactId);action({action:'callCancel',callId:call.callId});
 const result=action({...message,organisationId:saved.organisation.id,version:getOrg(db,saved.organisation.id).version,extraContactIds:[saved.contact.contactId]});
 const detail=action({action:'messageStatus',mailbox:envelope.mailbox,gmailMessageId:'booking',detail:true});
 assert.equal(detail.participants[0].contactId,saved.contact.contactId);assert.equal(detail.message.body,message.body);assert.equal(db.prepare('SELECT sender_json FROM messages').get().sender_json,JSON.stringify([envelope.from]));
 assert.equal(action({...message,organisationId:saved.organisation.id,version:result.organisation.version,extraContactIds:[saved.contact.contactId]}).duplicate,true);assert.equal(contacts(db,saved.organisation.id).length,1);
 }finally{db.close();}
});
test('saved-email contact edits preserve secondary addresses and role, replace phones and reject foreign contacts',async()=>{
 const {db,user,action}=await setup();try{
 const org=createOrg(db,user,'Client'),other=createOrg(db,user,'Other');const cid=addContact(db,org.id,{name:'Wrong Name',rolle:'Sales',e_mails:['jane@example.org','other@example.org'],telefone:['+49301234567','+49307654321']});const foreign=addContact(db,other.id,{name:'Foreign',e_mails:['foreign@example.org']});
 action({...message,organisationId:org.id,version:getOrg(db,org.id).version,extraContactIds:[cid]});const detail=action({action:'messageStatus',mailbox:envelope.mailbox,gmailMessageId:'booking',detail:true});
 const edit={action:'contactSave',confirmed:true,mailbox:envelope.mailbox,organisationId:org.id,version:getOrg(db,org.id).version,contactId:cid,email:'jane@example.org',name:'Jane Doe',phones:['+49305555555'],gmailMessageId:'booking',messageId:detail.message.id};
 action(edit);const c=contacts(db,org.id)[0];assert.equal(c.name,'Jane Doe');assert.deepEqual(c.e_mails,['jane@example.org','other@example.org']);assert.deepEqual(c.telefone,['+49305555555']);assert.equal(c.rolle,'Sales');assert.throws(()=>action({...edit,name:'Stale'}),/inzwischen/);
 const version=getOrg(db,org.id).version;assert.throws(()=>action({...edit,version,contactId:foreign}),/belong/);assert.equal(getOrg(db,org.id).version,version);
 assert.throws(()=>action({...edit,version,phones:['not a number']}),/phone/);assert.throws(()=>action({...edit,version,mailbox:'wrong@team.test'}),/mailbox/);
 }finally{db.close();}
});
test('contact-to-email association is transactional and restricted to the selected organisation',async()=>{
 const {db,user,action}=await setup();try{
 const org=createOrg(db,user,'One'),other=createOrg(db,user,'Two'),foreign=addContact(db,other.id,{name:'Other',e_mails:['other@example.org']});
 assert.throws(()=>action({...message,organisationId:org.id,version:getOrg(db,org.id).version,extraContactIds:[foreign]}),/belong/);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,0);
 action({...message,organisationId:org.id,version:getOrg(db,org.id).version});const mid=db.prepare('SELECT id FROM messages').get().id;
 const b={id:other.id,version:getOrg(db,other.id).version,name:'Extracted',emails:'extracted@example.org',phones:'',messageId:mid};assert.throws(()=>contactSave(db,user,b),/Organisation/);assert.equal(contacts(db,other.id).length,1);
 const saved=contactSave(db,user,{...b,id:org.id,version:getOrg(db,org.id).version});assert.equal(db.prepare('SELECT contact_id FROM activity_contacts').get().contact_id,saved.contactId);
 }finally{db.close();}
});

test('phone-only selections can be reused and linked without creating invented email addresses',async()=>{
 const {db,user,action}=await setup();try{
 const org=createOrg(db,user,'Phone only');const draft={action:'contactSave',confirmed:true,mailbox:envelope.mailbox,organisationId:org.id,name:'Jane',email:'',phones:['+49 30 1234567']};
 const first=action({...draft,version:getOrg(db,org.id).version});const again=action({...draft,version:getOrg(db,org.id).version});assert.equal(again.contact.contactId,first.contact.contactId);assert.equal(contacts(db,org.id).length,1);assert.deepEqual(contacts(db,org.id)[0].e_mails,[]);
 action({...message,organisationId:org.id,version:getOrg(db,org.id).version,extraContactIds:[first.contact.contactId]});const detail=action({action:'messageStatus',mailbox:envelope.mailbox,gmailMessageId:'booking',detail:true});assert.equal(detail.participants[0].email,'');assert.equal(detail.participants[0].contactId,first.contact.contactId);
 }finally{db.close();}
});
