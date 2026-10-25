import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,getOrg,contacts,history,save,linkSave,search} from '../server/crm.mjs';
import {extensionAction} from '../server/extension.mjs';
import {deleteOrganisation,mergeOrganisations} from '../server/lifecycle.mjs';
const origin='http://localhost:3000';
const msg={mailbox:'alex@team.test',from:{name:'Pat',email:'pat@customer.test'},recipients:[{email:'alex@team.test',name:'Alex'}],originalSubject:'Hello',subject:'Hello',originalBody:'Quarterly offer',body:'Quarterly offer',timestamp:'2026-10-13T10:07:00Z',timestampRaw:'13.10.2026, 12:07',direction:'incoming',sourceUrl:'https://mail.google.com/mail/u/0/#inbox/example',contactEmails:['pat@customer.test']};
async function setup(){const db=openDB(':memory:');const id=await addUser(db,msg.mailbox,'Alex','long-password-1234');return{db,user:db.prepare('SELECT * FROM users WHERE id=?').get(id)};}
const importEmail=(db,user,org,extra={})=>extensionAction(db,user,{...msg,...extra,action:'save',confirmed:true,requestId:randomUUID(),gmailMessageId:extra.gmailMessageId||'gmail-1',organisationId:org.id,version:getOrg(db,org.id).version},origin);
const count=(db,table)=>db.prepare(`SELECT count(*) n FROM ${table}`).get().n;

test('deleting an organisation removes its emails, notes and own contacts but keeps shared contacts',async()=>{
 const{db,user}=await setup();try{
  const org=createOrg(db,user,'Wrong record'),other=createOrg(db,user,'Partner');
  importEmail(db,user,org);
  const shared=addContact(db,org.id,{name:'Shared',e_mails:['shared@partner.test']});db.prepare('INSERT INTO organisation_contacts VALUES(?,?,0)').run(other.id,shared);
  save(db,user,{id:org.id,version:getOrg(db,org.id).version,requestId:'note',fields:{16:'Call back',17:'2026-11-01'},note:{type:'Notiz',text:'Internal note',date:'2026-10-20'}});
  linkSave(db,user,{id:org.id,version:getOrg(db,org.id).version,other:other.id,note:'Agency'});
  assert.equal(count(db,'messages'),1);assert.equal(count(db,'followups'),1);assert.equal(count(db,'organisation_links'),1);
  assert.throws(()=>deleteOrganisation(db,user,{id:org.id,version:getOrg(db,org.id).version,confirmName:'Wrong'}),/Namen/);
  const result=deleteOrganisation(db,user,{id:org.id,version:getOrg(db,org.id).version,confirmName:'Wrong record'});
  assert.deepEqual([result.emails,result.contacts],[1,1]);
  assert.throws(()=>getOrg(db,org.id),/nicht gefunden/);
  for(const table of ['messages','message_sources','extension_message_refs','followups','organisation_links'])assert.equal(count(db,table),0,table);
  assert.equal(db.prepare("SELECT count(*) n FROM activities WHERE organisation_id=?").get(org.id).n,0);
  assert.deepEqual(contacts(db,other.id).map(c=>c.name),['Shared']);
  assert.equal(db.prepare("SELECT count(*) n FROM contact_addresses WHERE value='pat@customer.test'").get().n,0);
  assert.deepEqual(search(db,'Quarterly'),[]);
  const log=db.prepare("SELECT * FROM audit_log WHERE action='organisation_delete'").get();assert.equal(log.organisation_id,null);assert.equal(JSON.parse(log.changes_json).name,'Wrong record');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(extensionAction(db,user,{...msg,action:'messageStatus',gmailMessageId:'gmail-1'},origin).saved,false);
 }finally{db.close();}
});

test('merging moves emails, contacts, links and follow-ups into the target without a re-import',async()=>{
 const{db,user}=await setup();try{
  const source=createOrg(db,user,'Acme duplicate'),target=createOrg(db,user,'Acme'),partner=createOrg(db,user,'Agency');
  importEmail(db,user,source);
  addContact(db,target.id,{name:'Main',e_mails:['main@acme.test']},true);
  save(db,user,{id:source.id,version:getOrg(db,source.id).version,requestId:'s',fields:{4:'Berlin',16:'Old step',18:'Source context'}});
  save(db,user,{id:target.id,version:getOrg(db,target.id).version,requestId:'t',fields:{16:'Current step',18:'Target context'}});
  linkSave(db,user,{id:source.id,version:getOrg(db,source.id).version,other:partner.id,note:'Agency link'});
  linkSave(db,user,{id:source.id,version:getOrg(db,source.id).version,other:target.id,note:''});
  assert.throws(()=>mergeOrganisations(db,user,{id:source.id,version:getOrg(db,source.id).version,into:source.id}),/andere/);
  const {entity}=mergeOrganisations(db,user,{id:source.id,version:getOrg(db,source.id).version,into:target.id});
  assert.throws(()=>getOrg(db,source.id),/nicht gefunden/);
  assert.equal(entity.values[4],'Berlin');assert.equal(entity.values[16],'Current step');assert.equal(entity.values[18],'Target context\n\nSource context');
  assert.deepEqual(contacts(db,target.id).map(c=>[c.e_mails[0],c.primary]).sort(),[['main@acme.test',true],['pat@customer.test',false]]);
  assert.ok(history(db,target.id,0,'communication').items.some(h=>h.subject==='Hello'));
  assert.deepEqual(db.prepare('SELECT a,b,note FROM organisation_links').all().map(l=>[[l.a,l.b].sort().join(),l.note]),[[[target.id,partner.id].sort().join(),'Agency link']]);
  assert.equal(db.prepare('SELECT count(*) n FROM followups WHERE organisation_id=? AND completed_at IS NULL').get(target.id).n,1);
  assert.deepEqual(search(db,'Quarterly'),[target.id]);
  const status=extensionAction(db,user,{...msg,action:'messageStatus',gmailMessageId:'gmail-1'},origin);assert.equal(status.organisation.id,target.id);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});
