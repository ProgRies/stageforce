import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,getOrg,contacts} from '../server/crm.mjs';
import {extensionAction} from '../server/extension.mjs';
import {dialNumber} from '../server/calls.mjs';
import {formatPhone} from '../src/domain.ts';
import '../integrations/chrome/extract.js';
const mailbox='alex@team.test';
async function setup(){const db=openDB(':memory:');const id=await addUser(db,mailbox,'Alex','long-password-1234');const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);return{db,user,action:b=>extensionAction(db,user,b,'http://localhost:3000')};}
test('German numbers become international; foreign numbers keep their spelling',()=>{
 assert.equal(formatPhone('030 1234567'),'+49 30 1234567');
 assert.equal(formatPhone('0171/7654321'),'+49 171 7654321');
 assert.equal(formatPhone('(030) 123 45 67'),'+49 30 123 45 67');
 assert.equal(formatPhone('+49 (0)30 123 456-0'),'+49 30 123 456-0');
 assert.equal(formatPhone('0041 44 123 45 67'),'+41 44 123 45 67');
 assert.equal(formatPhone('+44 20 7946 0958'),'+44 20 7946 0958');
 assert.equal(formatPhone('1234567'),'1234567');
 assert.equal(dialNumber('030 1234567'),dialNumber('+49 (0)30 1234567'));
});
test('reply history is cut at Gmail, Outlook and German reply headers',()=>{
 const strip=globalThis.stageForceExtract.stripQuoted;
 assert.equal(strip('Danke, passt!\n\nAm 20.10.2026 um 10:00 schrieb Pat <pat@x.de>:\nalte Nachricht'),'Danke, passt!');
 assert.equal(strip('Sounds good.\n\nFrom: Pat <pat@x.de>\nSent: Monday\nTo: Alex\nSubject: Re: Offer\n\nOld'),'Sounds good.');
 assert.equal(strip('Gerne.\n-----Ursprüngliche Nachricht-----\nVon: Pat'),'Gerne.');
 assert.equal(strip('Von: Pat kommt die Anfrage morgen.\nGrüße'),'Von: Pat kommt die Anfrage morgen.\nGrüße');
});
test('INTERNAL_DOMAINS treats company aliases as internal and their mail as sent',async()=>{
 const {db,user,action}=await setup();const previous=process.env.INTERNAL_DOMAINS;process.env.INTERNAL_DOMAINS='stage.bio, @other-team.test';
 try{
  const org=createOrg(db,user,'Client');addContact(db,org.id,{name:'Pat',e_mails:['pat@client.test']});
  const out=action({action:'lookup',mailbox,from:{name:'Billing',email:'billing@stage.bio'},recipients:[{email:'pat@client.test',name:'Pat'},{email:'support@other-team.test',name:''}]});
  assert.equal(out.direction,'outgoing');assert.deepEqual(out.participants.map(p=>p.email),['pat@client.test']);assert.equal(out.organisation.id,org.id);
  const incoming=action({action:'lookup',mailbox,from:{name:'Pat',email:'pat@client.test'},recipients:[{email:'contact@stage.bio',name:''}]});
  assert.equal(incoming.direction,'incoming');assert.deepEqual(incoming.participants.map(p=>p.email),['pat@client.test']);
 }finally{if(previous===undefined)delete process.env.INTERNAL_DOMAINS;else process.env.INTERNAL_DOMAINS=previous;db.close();}
});
test('extension contact saves store German numbers in international format without duplicates',async()=>{
 const {db,user,action}=await setup();try{
  const org=createOrg(db,user,'Client');const cid=addContact(db,org.id,{name:'Pat',e_mails:['pat@client.test'],telefone:['+49 30 1234567']});
  action({action:'contactSave',confirmed:true,mailbox,organisationId:org.id,version:getOrg(db,org.id).version,email:'pat@client.test',name:'Pat',phones:['030 1234567','0171 7654321']});
  assert.deepEqual(contacts(db,org.id).find(c=>c.id===cid).telefone,['+49 30 1234567','+49 171 7654321']);
 }finally{db.close();}
});
test('old conversations can be saved in any order: shared organisation, date order and full text kept',async()=>{
 const {db,user,action}=await setup();try{
  const thread='thread-f:1780000000000000001';
  const mail=(n,day,extra={})=>({action:'save',confirmed:true,requestId:randomUUID(),mailbox,gmailThreadId:thread,gmailMessageId:'m'+n,from:{name:'Pat',email:n%2?'pat@client.test':mailbox},recipients:[{email:n%2?mailbox:'pat@client.test',name:''}],originalSubject:'Offer',subject:'Offer',body:'Reply '+n,originalBody:'Reply '+n+'\n\nAm '+day+'.10.2024 schrieb Pat:\n> earlier',timestamp:`2024-10-${day}T09:00:00Z`,timestampRaw:'',sourceUrl:'https://mail.google.com/mail/u/0/#inbox/'+n,contactEmails:[],...extra});
  const first=action(mail(6,16,{newOrganisation:'Client'}));const org=first.organisation;
  const lookup=action({action:'lookup',mailbox,gmailThreadId:thread,from:{name:'Sam',email:'sam@another.test'},recipients:[{email:mailbox,name:''}]});
  assert.equal(lookup.organisation.id,org.id);assert.equal(lookup.conversation,true);
  let version=lookup.organisation.version;for(const [n,day] of [[2,12],[11,21],[1,11]])version=action(mail(n,day,{organisationId:org.id,version})).organisation.version;
  assert.equal(action(mail(6,16,{organisationId:org.id,version})).duplicate,true);
  const dates=db.prepare('SELECT m.sent_at FROM activities a JOIN messages m ON m.id=a.message_id WHERE a.organisation_id=? ORDER BY m.sent_at').all(org.id).map(r=>r.sent_at.slice(8,10));
  assert.deepEqual(dates,['11','12','16','21']);
  const stored=db.prepare("SELECT m.body,o.body AS original FROM messages m JOIN message_originals o ON o.message_id=m.id JOIN extension_message_refs r ON r.message_id=m.id WHERE r.gmail_id='m6'").get();
  assert.equal(stored.body,'Reply 6');assert.match(stored.original,/schrieb Pat/);
  const outgoing=db.prepare("SELECT m.direction FROM messages m JOIN extension_message_refs r ON r.message_id=m.id WHERE r.gmail_id='m2'").get();assert.equal(outgoing.direction,'outgoing');
  assert.throws(()=>action({action:'lookup',mailbox,gmailThreadId:'bad thread<>',from:{name:'',email:'x@y.test'},recipients:[]}),/conversation/);
 }finally{db.close();}
});
test('lookup names Gmail local-part names properly and says where an address is already stored',async()=>{
 const {db,user,action}=await setup();try{
  const worms=createOrg(db,user,'Stadt Worms'),other=createOrg(db,user,'Kreis Alzey');addContact(db,worms.id,{name:'Daniel Körbel',e_mails:['daniel.koerbel@worms.de']});addContact(db,other.id,{name:'',e_mails:['margaretha.mohr@worms.de']});
  const out=action({action:'lookup',mailbox,from:{name:'margaretha.mohr',email:'margaretha.mohr@worms.de'},recipients:[{email:'daniel.koerbel@worms.de',name:'daniel.koerbel'},{email:'jf@internet-connect.de',name:'jf'},{email:mailbox,name:''}],organisationId:worms.id});
  const by=Object.fromEntries(out.participants.map(p=>[p.email,p]));
  assert.equal(by['margaretha.mohr@worms.de'].name,'Margaretha Mohr');assert.equal(by['margaretha.mohr@worms.de'].known,false);assert.deepEqual(by['margaretha.mohr@worms.de'].crm.organisations.map(o=>o.name),['Kreis Alzey']);
  assert.equal(by['daniel.koerbel@worms.de'].name,'Daniel Körbel');assert.equal(by['daniel.koerbel@worms.de'].known,true);
  assert.equal(by['jf@internet-connect.de'].name,'Jf');assert.equal(by['jf@internet-connect.de'].crm,null);
 }finally{db.close();}
});
test('lookup offers the selected organisation\'s two most recent contacts for emails without client addresses',async()=>{
 const {db,user,action}=await setup();try{
  const org=createOrg(db,user,'Stadt Worms');for(const n of ['Anna','Ben','Cleo'])addContact(db,org.id,{name:n,e_mails:[n.toLowerCase()+'@worms.de']});
  const out=action({action:'lookup',mailbox,from:{name:'Alex',email:mailbox},recipients:[{email:'colleague@team.test',name:''}],organisationId:org.id});
  assert.equal(out.participants.length,0);assert.equal(out.suggested.length,2);assert.ok(out.suggested.every(s=>s.contactId&&s.known));
  const saved=action({action:'save',confirmed:true,requestId:randomUUID(),mailbox,from:{name:'Alex',email:mailbox},recipients:[{email:'colleague@team.test',name:''}],gmailMessageId:'internal',originalSubject:'Intern',subject:'Intern',body:'Notiz',originalBody:'Notiz',timestamp:'2026-07-31T06:47:00Z',timestampRaw:'',contactEmails:[],extraContactIds:[out.suggested[0].contactId],organisationId:org.id,version:getOrg(db,org.id).version});
  assert.equal(saved.saved,true);assert.equal(db.prepare('SELECT contact_id FROM activity_contacts').get().contact_id,out.suggested[0].contactId);
 }finally{db.close();}
});
