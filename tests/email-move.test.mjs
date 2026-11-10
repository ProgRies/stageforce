import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {enableMfa,newSecret} from '../server/mfa.mjs';
import {createOrg,addContact,getOrg,history,search,contacts} from '../server/crm.mjs';
import {extensionAction} from '../server/extension.mjs';
import {emailMovePreview,emailMove} from '../server/emailmove.mjs';
import '../integrations/chrome/date.js';
const origin='http://localhost:3000';
const base={mailbox:'alex@team.test',from:{name:'Pat',email:'pat@customer.test'},recipients:[{email:'alex@team.test',name:'Alex'}],direction:'incoming',contactEmails:['pat@customer.test'],sourceUrl:'https://mail.google.com/mail/u/0/#inbox/x'};
async function setup(){const db=openDB(':memory:');const id=await addUser(db,base.mailbox,'Alex','long-password-1234');enableMfa(db,id,newSecret());const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
 return{db,user,wrong:createOrg(db,user,'Wrong GmbH'),right:createOrg(db,user,'Right AG')};}
// Saves one email through the extension, as the popup does.
function save(db,user,org,{subject,minute,thread='t1',gmail,extra={}}){
 const b={...base,originalSubject:subject,subject,originalBody:subject+' body',body:subject+' body',timestamp:`2026-10-13T10:${minute}:00Z`,timestampRaw:'13.10.2026 '+minute,gmailMessageId:gmail||'g'+minute,gmailThreadId:thread,...extra};
 extensionAction(db,user,{...b,action:'save',confirmed:true,requestId:randomUUID(),organisationId:org.id,version:getOrg(db,org.id).version},origin);
 return db.prepare('SELECT a.id,a.message_id FROM activities a JOIN messages m ON m.id=a.message_id WHERE m.subject=?').get(subject);
}
const orgOf=(db,activityId)=>db.prepare('SELECT organisation_id FROM activities WHERE id=?').get(activityId).organisation_id;
test('moving one email re-points its entry, relinks its contact in the target and leaves the email record alone',async()=>{const{db,user,wrong,right}=await setup();try{
 const mail=save(db,user,wrong,{subject:'Offer',minute:'05',extra:{originalBody:'Zebrafinch pricing',body:'Zebrafinch pricing'}});
 db.prepare("UPDATE organisations SET last_contact='2026-10-13' WHERE id=?").run(wrong.id);
 const message=db.prepare('SELECT * FROM messages WHERE id=?').get(mail.message_id);
 const p=emailMovePreview(db,user,{id:wrong.id,activityId:mail.id,into:right.id});
 assert.equal(p.email.subject,'Offer');assert.deepEqual(p.siblings,[]);assert.equal(p.contacts.length,1);assert.equal(p.contacts[0].existing,false);assert.equal(p.copyInTarget,false);
 const r=emailMove(db,user,{id:wrong.id,version:getOrg(db,wrong.id).version,activityId:mail.id,into:right.id});
 assert.equal(orgOf(db,mail.id),right.id);assert.deepEqual(r.moved,[mail.id]);assert.equal(r.createdContacts,1);assert.deepEqual(r.unusedContacts,['Pat']);
 assert.deepEqual(db.prepare('SELECT * FROM messages WHERE id=?').get(mail.message_id),message);
 const pat=contacts(db,right.id).find(c=>c.e_mails.includes('pat@customer.test'));assert(pat);
 assert.deepEqual(db.prepare('SELECT contact_id FROM activity_contacts WHERE activity_id=?').all(mail.id).map(r=>r.contact_id),[pat.id]);
 // The old contact stays where it was.
 assert.equal(contacts(db,wrong.id).length,1);
 assert.equal(getOrg(db,wrong.id).last_contact,null);assert.equal(getOrg(db,right.id).last_contact,'2026-10-13');
 assert(!search(db,'Zebrafinch').includes(wrong.id));assert(search(db,'Zebrafinch').includes(right.id));
 assert.equal(db.prepare("SELECT count(*) n FROM audit_log WHERE action='email_move'").get().n,2);
 // The extension now reports the new organisation for this Gmail message.
 const status=extensionAction(db,user,{action:'messageStatus',mailbox:base.mailbox,gmailMessageId:'g05'},origin);assert.equal(status.organisation.id,right.id);
 }finally{db.close();}});
test('an existing contact with the same address in the target is reused, not duplicated',async()=>{const{db,user,wrong,right}=await setup();try{
 const existing=addContact(db,right.id,{name:'Pat Right',e_mails:['PAT@customer.test']});
 const mail=save(db,user,wrong,{subject:'Hello',minute:'06'});
 assert.equal(emailMovePreview(db,user,{id:wrong.id,activityId:mail.id,into:right.id}).contacts[0].existing,true);
 const r=emailMove(db,user,{id:wrong.id,version:getOrg(db,wrong.id).version,activityId:mail.id,into:right.id});
 assert.equal(r.createdContacts,0);assert.equal(contacts(db,right.id).length,1);
 assert.deepEqual(db.prepare('SELECT contact_id FROM activity_contacts WHERE activity_id=?').all(mail.id).map(r=>r.contact_id),[existing]);
 }finally{db.close();}});
test('other emails of the same conversation are offered and only move when chosen',async()=>{const{db,user,wrong,right}=await setup();try{
 const first=save(db,user,wrong,{subject:'Thread start',minute:'01'}),second=save(db,user,wrong,{subject:'Re: Thread start',minute:'02'}),third=save(db,user,wrong,{subject:'Re: Re: Thread start',minute:'03'}),other=save(db,user,wrong,{subject:'Unrelated',minute:'04',thread:'t2'});
 const p=emailMovePreview(db,user,{id:wrong.id,activityId:second.id});
 assert.deepEqual(p.siblings.map(s=>s.activityId),[first.id,third.id]);
 emailMove(db,user,{id:wrong.id,version:getOrg(db,wrong.id).version,activityId:second.id,into:right.id,siblingIds:[third.id]});
 assert.deepEqual([first,second,third,other].map(a=>orgOf(db,a.id)),[wrong.id,right.id,right.id,wrong.id]);
 // Only one contact copy for both moved emails.
 assert.equal(contacts(db,right.id).length,1);
 // An email outside the conversation cannot be smuggled in as a sibling.
 assert.throws(()=>emailMove(db,user,{id:wrong.id,version:getOrg(db,wrong.id).version,activityId:first.id,into:right.id,siblingIds:[other.id]}),e=>e.code==='conflict');
 assert.equal(orgOf(db,first.id),wrong.id);assert.equal(orgOf(db,other.id),wrong.id);
 }finally{db.close();}});
test('a meeting logged from the email moves with it',async()=>{const{db,user,wrong,right}=await setup();try{
 const mail=save(db,user,wrong,{subject:'Call next week',minute:'07',extra:{meeting:{log:true,date:'2026-10-20',time:'14:00'}}});
 const meeting=db.prepare('SELECT activity_id FROM meeting_refs WHERE message_id=?').get(mail.message_id).activity_id;
 assert.equal(emailMovePreview(db,user,{id:wrong.id,activityId:mail.id}).meeting.activityId,meeting);
 const r=emailMove(db,user,{id:wrong.id,version:getOrg(db,wrong.id).version,activityId:mail.id,into:right.id});
 assert.deepEqual(r.moved.sort(),[mail.id,meeting].sort());assert.equal(orgOf(db,meeting),right.id);
 assert.equal(history(db,wrong.id,0,'communication').total,0);assert.equal(history(db,right.id,0,'communication').total,2);
 }finally{db.close();}});
test('a move is refused for stale views, notes, the same organisation and unknown targets, and changes nothing',async()=>{const{db,user,wrong,right}=await setup();try{
 const mail=save(db,user,wrong,{subject:'Stay',minute:'08'});
 const note=db.prepare("INSERT INTO activities(id,organisation_id,kind,occurred_on,created_at,body) VALUES('n1',?,'Notiz','2026-10-01','x','note') RETURNING id").get(wrong.id).id;
 const state=()=>JSON.stringify(db.prepare('SELECT * FROM activities ORDER BY id').all())+JSON.stringify(db.prepare('SELECT * FROM activity_contacts ORDER BY activity_id').all());
 const before=state(),v=getOrg(db,wrong.id).version;
 assert.throws(()=>emailMove(db,user,{id:wrong.id,version:v-1,activityId:mail.id,into:right.id}),e=>e.code==='conflict');
 assert.throws(()=>emailMove(db,user,{id:wrong.id,version:v,activityId:note,into:right.id}),e=>e.code==='not_found');
 assert.throws(()=>emailMove(db,user,{id:wrong.id,version:v,activityId:mail.id,into:wrong.id}),/andere Organisation/);
 assert.throws(()=>emailMove(db,user,{id:wrong.id,version:v,activityId:mail.id,into:'nope'}),e=>e.code==='not_found');
 assert.throws(()=>emailMove(db,user,{id:right.id,version:getOrg(db,right.id).version,activityId:mail.id,into:wrong.id}),e=>e.code==='not_found');
 assert.equal(state(),before);
 }finally{db.close();}});
