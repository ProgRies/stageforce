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
