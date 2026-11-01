import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB,reindex} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addActivity,activityDelete,contactSave,entity,search,history} from '../server/crm.mjs';
import {prepareCall,saveCall,openCall} from '../server/calls.mjs';
async function fixture(){const db=openDB(':memory:');const id=await addUser(db,'delete@example.test','Deleter','long-password-1234');const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);return{db,user,org:createOrg(db,user,'Delete test')};}
const body=(db,id)=>db.prepare('SELECT body FROM activities WHERE id=?').get(id)?.body;
test('deleting a note removes it, keeps the full entry in the audit log and updates search and version',async()=>{const{db,user,org}=await fixture();try{
 const keepId=addActivity(db,org.id,user,{type:'Notiz',text:'Stays here',date:'2026-10-01'});
 const id=addActivity(db,org.id,user,{type:'Notiz',text:'Zebrafinch remark',date:'2026-10-02'});
 reindex(db,org.id);assert(search(db,'Zebrafinch').includes(org.id));
 const before=db.prepare('SELECT * FROM activities WHERE id=?').get(id),version=Number(entity(db,org.id).version);
 const r=activityDelete(db,user,{id:org.id,activityId:id,originalText:'Zebrafinch remark'});
 assert.equal(body(db,id),undefined);assert.equal(body(db,keepId),'Stays here');assert.equal(Number(r.entity.version),version+1);
 assert(!search(db,'Zebrafinch').includes(org.id));
 const log=JSON.parse(db.prepare("SELECT changes_json FROM audit_log WHERE action='activity_delete'").get().changes_json);
 assert.deepEqual(log.activity,{...before});
 assert.equal(history(db,org.id,0,'all').total,1);
 }finally{db.close();}});
test('a delete is refused for emails, other organisations, unknown entries and stale views, and changes nothing',async()=>{const{db,user,org}=await fixture();try{
 const other=createOrg(db,user,'Other org');
 const id=addActivity(db,org.id,user,{type:'Notiz',text:'Current text',date:'2026-10-02'});
 db.prepare("INSERT INTO messages(id,dedupe_key,subject,sender_json,recipients_json,body,direction,sent_at) VALUES('m1','k1','Hello','[]','[]','Body','incoming','2026-10-01T10:00:00Z')").run();
 const mail=addActivity(db,org.id,user,{type:'E-Mail',text:'Hello',date:'2026-10-01',messageId:'m1'});
 const count=()=>db.prepare('SELECT count(*) n FROM activities').get().n,n=count(),audits=()=>db.prepare('SELECT count(*) n FROM audit_log').get().n,a=audits();
 assert.throws(()=>activityDelete(db,user,{id:org.id,activityId:mail,originalText:'Hello'}),/Nur Notizen/);
 assert.throws(()=>activityDelete(db,user,{id:other.id,activityId:id,originalText:'Current text'}),e=>e.code==='not_found');
 assert.throws(()=>activityDelete(db,user,{id:org.id,activityId:'nope',originalText:''}),e=>e.code==='not_found');
 assert.throws(()=>activityDelete(db,user,{id:org.id,activityId:id,originalText:'Older text'}),e=>e.code==='conflict');
 assert.throws(()=>activityDelete(db,user,{id:org.id,activityId:id}),e=>e.code==='conflict');
 assert.equal(count(),n);assert.equal(audits(),a);
 }finally{db.close();}});
test('deleting a logged call removes its call attempt, does not reopen it, and moves the last contact back',async()=>{const{db,user,org}=await fixture();try{
 const older=addActivity(db,org.id,user,{type:'Anruf · Gespräch geführt',text:'Earlier call',date:'2026-09-01',contacted:true});
 db.prepare("UPDATE organisations SET last_contact='2026-09-01' WHERE id=?").run(org.id);
 const c=contactSave(db,user,{id:org.id,version:entity(db,org.id).version,name:'Contact',phones:'+493012345678',emails:''});
 const p=prepareCall(db,user,{organisationId:org.id,contactId:c.contactId,phone:'+493012345678',requestId:randomUUID(),startedAt:new Date().toISOString()});
 saveCall(db,user,{callId:p.callId,notes:'Talked today',outcome:'talked',next:{kind:'none'}});
 const call=db.prepare('SELECT * FROM call_attempts').get(),last=db.prepare('SELECT last_contact FROM organisations WHERE id=?').get(org.id).last_contact;
 assert.notEqual(last,'2026-09-01');
 activityDelete(db,user,{id:org.id,activityId:call.activity_id,originalText:body(db,call.activity_id)});
 assert.equal(db.prepare('SELECT count(*) n FROM call_attempts').get().n,0);assert.equal(openCall(db,user).call,null);
 assert.equal(db.prepare('SELECT count(*) n FROM activity_contacts').get().n,0);
 assert.equal(db.prepare('SELECT last_contact FROM organisations WHERE id=?').get(org.id).last_contact,'2026-09-01');
 activityDelete(db,user,{id:org.id,activityId:older,originalText:'Earlier call'});
 assert.equal(db.prepare('SELECT last_contact FROM organisations WHERE id=?').get(org.id).last_contact,null);
 }finally{db.close();}});
test('deleting a meeting also removes its cancelled mark and invite reference',async()=>{const{db,user,org}=await fixture();try{
 const id=addActivity(db,org.id,user,{type:'Meeting',text:'Zoom · 14:30 Uhr · Intro',date:'2099-01-05'});
 db.prepare('INSERT INTO meeting_status VALUES(?,?)').run(id,new Date().toISOString());
 db.prepare("INSERT INTO meeting_refs VALUES(?,?,NULL,'')").run(id,'key-1');
 activityDelete(db,user,{id:org.id,activityId:id,originalText:'Zoom · 14:30 Uhr · Intro'});
 for(const t of ['activities','meeting_status','meeting_refs'])assert.equal(db.prepare(`SELECT count(*) n FROM ${t}`).get().n,0,t);
 assert.equal(entity(db,org.id).upcoming??null,null);
 }finally{db.close();}});
