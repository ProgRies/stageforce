import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,contacts,history,getOrg} from '../server/crm.mjs';
import {prepareCall,saveCall,cancelCall} from '../server/calls.mjs';
import {extensionAction} from '../server/extension.mjs';
import '../integrations/chrome/extract.js';
async function setup(){const db=openDB(':memory:');const id=await addUser(db,'alex@team.test','Alex','long-password-1234');return{db,user:db.prepare('SELECT * FROM users WHERE id=?').get(id)};}
const env={mailbox:'alex@team.test',from:{email:'pat@client.test',name:'Pat'},recipients:[{email:'alex@team.test'}]};
const msg={...env,action:'save',confirmed:true,subject:'Reviewed',originalSubject:'Original',originalBody:'Original body',body:'Reviewed body',timestamp:'2026-10-22T12:00:00Z',timestampRaw:'22.10.2026 14:00',gmailMessageId:'msg-a:123',contactEmails:['pat@client.test'],contactPhones:[{email:'pat@client.test',phones:['+49 123 456789']}],attachments:[{name:'Proposal.pdf',size:'24 KB',type:'pdf'}]};
const act=(db,user,b)=>extensionAction(db,user,b,'http://localhost:3000');
test('call preparation persists new entity and phone; cancellation produces no event, retry no duplicates',async()=>{const{db,user}=await setup();try{
 const b={...env,action:'callPrepare',newOrganisation:'New lead',contactEmail:'pat@client.test',phone:'+49 123 456789',startedAt:new Date().toISOString(),requestId:randomUUID()};
 assert.throws(()=>act(db,user,{...b,newOrganisation:undefined}),/organisation/);
 const r=act(db,user,b);assert.equal(contacts(db,r.organisation.id)[0].telefone[0],b.phone);assert.equal(history(db,r.organisation.id,0,'communication').total,0);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,0);
 assert.equal(act(db,user,b).callId,r.callId);assert.equal(db.prepare('SELECT count(*) n FROM organisations').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM contacts').get().n,1);
 const saved=saveCall(db,user,{callId:r.callId,notes:''});assert.equal(saved.saved,true);saveCall(db,user,{callId:r.callId,notes:'retry'});
 const h=history(db,r.organisation.id,0,'communication');assert.equal(h.total,1);assert.equal(h.items[0].text,'Anruf gestartet · keine Notiz');assert.equal(h.items[0].sent_at,b.startedAt);assert.equal(h.items[0].call_phone,b.phone);assert.equal(h.items[0].call_contact,'Pat');assert.equal(getOrg(db,r.organisation.id).last_contact,null);
 }finally{db.close();}});
test('calls require an actual organisation/contact/number association and enforce user ownership',async()=>{const{db,user}=await setup();try{const o=createOrg(db,user,'One'),other=createOrg(db,user,'Two'),cid=addContact(db,o.id,{name:'Pat',telefone:['030 1234567']});const b={organisationId:o.id,contactId:cid,phone:'030 1234567',startedAt:new Date().toISOString(),requestId:randomUUID()};
 assert.throws(()=>prepareCall(db,user,{...b,organisationId:other.id}),/Save this contact/);assert.throws(()=>prepareCall(db,user,{...b,phone:'012345678'}),/Save this contact/);assert.throws(()=>prepareCall(db,user,{...b,phone:'abc'}),/number/);
 const r=prepareCall(db,user,b);const id=await addUser(db,'bea@team.test','Bea','long-password-1234'),u=db.prepare('SELECT * FROM users WHERE id=?').get(id);assert.throws(()=>saveCall(db,u,{callId:r.callId}),/not found/);assert.throws(()=>prepareCall(db,u,b),/not found/);saveCall(db,user,{callId:r.callId,notes:'No answer'});assert.equal(history(db,o.id).items[0].text,'No answer');
 }finally{db.close();}});
test('message identity survives body changes, reopens saved state and metadata; mailbox is scoped',async()=>{const{db,user}=await setup();try{const r=act(db,user,{...msg,newOrganisation:'Client',requestId:randomUUID()});const status=act(db,user,{action:'messageStatus',mailbox:env.mailbox,gmailMessageId:msg.gmailMessageId,detail:true});assert.equal(status.saved,true);assert.equal(status.message.body,msg.body);assert.equal(status.message.attachments[0].name,'Proposal.pdf');assert.equal(status.participants[0].phones[0],'+49 123 456789');assert.equal(status.participants[0].known,true);
 assert.equal(act(db,user,{...msg,originalBody:'Gmail rendered this differently',requestId:randomUUID(),organisationId:r.organisation.id,version:r.organisation.version}).duplicate,true);assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,1);
 assert.equal(act(db,user,{action:'messageStatus',mailbox:env.mailbox,gmailMessageId:'another'}).saved,false);assert.throws(()=>act(db,user,{action:'messageStatus',mailbox:'wrong@team.test',gmailMessageId:msg.gmailMessageId}),/mailbox/);
 const call=act(db,user,{...env,action:'callPrepare',messageId:status.message.id,gmailMessageId:msg.gmailMessageId,organisationId:r.organisation.id,contactId:status.participants[0].contactId,phone:'+49 123 456789',startedAt:new Date().toISOString(),requestId:randomUUID()});saveCall(db,user,{callId:call.callId,notes:'Asked for proposal'});assert.equal(db.prepare('SELECT source_message_id FROM call_attempts').get().source_message_id,status.message.id);
 }finally{db.close();}});
test('legacy fingerprint attaches a stable identity on first explicit open',async()=>{const{db,user}=await setup();try{act(db,user,{...msg,gmailMessageId:undefined,newOrganisation:'Client',requestId:randomUUID()});const legacyFingerprint=createHash('sha256').update('extension-v1:'+JSON.stringify([msg.from.email,msg.timestampRaw,msg.originalSubject,msg.originalBody])).digest('hex');const b={mailbox:env.mailbox,gmailMessageId:msg.gmailMessageId,legacyFingerprint,action:'messageStatus',detail:true};assert.equal(act(db,user,b).saved,true);assert.equal(act(db,user,{action:'messageStatus',mailbox:env.mailbox,gmailMessageId:msg.gmailMessageId}).saved,true);assert.equal(db.prepare('SELECT count(*) n FROM extension_message_refs').get().n,1);
 }finally{db.close();}});
test('phone extraction excludes fax, dates, amounts and plain quoted replies',()=>{const f=globalThis.stageForceExtract.phones;assert.deepEqual(f('Pat\nTel: +49 (0)30 1234567\nFax: +49 30 999999\nInvoice 123456789\nDate 22.10.2026\nEUR 123456.00'),['+49 (0)30 1234567']);assert.deepEqual(f('Pat\nMobile: +49 171 1234567\nOn Monday, Bob wrote:\nTel: +49 30 999999'),['+49 171 1234567']);
 assert.deepEqual(f('Hallo,\nbitte rufen Sie unsere Hotline an: Tel. 0800 1234567.\n\nViele Grüße\nAnna Schmidt\nT: 030 1234567\nM +49 171 7654321\nHandy: 0172 1111111\nF: 030 1234568'),['030 1234567','+49 171 7654321','0172 1111111']);
 assert.deepEqual(f('Beste Grüße\nTel. +49 30 1234567 | Fax +49 30 1234568 | Büro: 030 2222222\nTel: 12.10.2026'),['+49 30 1234567','030 2222222']);
});

test('cancelling deletes only the pending preparation; organisation and contact remain',async()=>{const{db,user}=await setup();try{const r=act(db,user,{...env,action:'callPrepare',newOrganisation:'Cancelled lead',contactEmail:'pat@client.test',phone:'030 1234567',startedAt:new Date().toISOString(),requestId:randomUUID()});assert.equal(cancelCall(db,user,{callId:r.callId}).cancelled,true);assert.equal(db.prepare('SELECT count(*) n FROM call_attempts').get().n,0);assert.equal(contacts(db,r.organisation.id).length,1);assert.equal(history(db,r.organisation.id,0,'communication').total,0);assert.throws(()=>saveCall(db,user,{callId:r.callId}),/not found/);}finally{db.close();}});
