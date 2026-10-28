import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addActivity,activitySave,contactSave,entity,search} from '../server/crm.mjs';
import {prepareCall,saveCall} from '../server/calls.mjs';
async function fixture(){const db=openDB(':memory:');const id=await addUser(db,'edit@example.test','Editor','long-password-1234');const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);return{db,user,org:createOrg(db,user,'Editing test')};}
test('editing notes keeps author, date and event identity, records audit and updates search',async()=>{const{db,user,org}=await fixture();try{
 const activityId=addActivity(db,org.id,user,{type:'Notiz',text:'Original description',date:'2026-10-01'});
 const before=db.prepare('SELECT * FROM activities WHERE id=?').get(activityId);
 const result=activitySave(db,user,{id:org.id,activityId,originalText:before.body,text:'Reviseddescription'});
 const after=db.prepare('SELECT * FROM activities WHERE id=?').get(activityId);
 assert.deepEqual({...after,body:before.body},{...before});assert.equal(after.body,'Reviseddescription');assert.equal(result.entity.version,'2');
 assert(search(db,'Reviseddescription').includes(org.id));assert(!search(db,'Original').includes(org.id));
 const audit=JSON.parse(db.prepare("SELECT changes_json FROM audit_log WHERE action='activity_edit'").get().changes_json);assert.deepEqual(audit,{activityId,from:before.body,to:'Reviseddescription'});
 activitySave(db,user,{id:org.id,activityId,originalText:before.body,text:'Reviseddescription'});assert.equal(entity(db,org.id).version,'2');
 assert.throws(()=>activitySave(db,user,{id:org.id,activityId,originalText:before.body,text:'Stale overwrite'}),e=>e.code==='conflict');
 assert.throws(()=>activitySave(db,user,{id:org.id,activityId,originalText:after.body,text:'  '}),/leer/);
 assert.equal(db.prepare('SELECT count(*) n FROM activities').get().n,1);
 }finally{db.close();}});
test('call edits preserve timestamp, contact, phone and links; empty notes use the standard label',async()=>{const{db,user,org}=await fixture();try{
 const c=contactSave(db,user,{id:org.id,version:org.version,name:'Contact',phones:'+493012345678',emails:''});
 const prepared=prepareCall(db,user,{organisationId:org.id,contactId:c.contactId,phone:'+493012345678',requestId:randomUUID(),startedAt:new Date().toISOString()});saveCall(db,user,{callId:prepared.callId,notes:'Original call note'});
 const call=db.prepare('SELECT * FROM call_attempts').get();
 activitySave(db,user,{id:org.id,activityId:call.activity_id,originalText:'Original call note',text:''});
 assert.deepEqual(db.prepare('SELECT * FROM call_attempts').get(),call);assert.equal(db.prepare('SELECT body FROM activities WHERE id=?').get(call.activity_id).body,'Anruf gestartet · keine Notiz');
 assert.equal(db.prepare('SELECT contact_id FROM activity_contacts WHERE activity_id=?').get(call.activity_id).contact_id,c.contactId);
 assert.equal(entity(db,org.id).values[15],'');
 }finally{db.close();}});
test('activity edits reject other organisations, emails, internal events and oversized input atomically',async()=>{const{db,user,org}=await fixture();try{
 const other=createOrg(db,user,'Other');const note=addActivity(db,org.id,user,{type:'Notiz',text:'Original'});
 assert.throws(()=>activitySave(db,user,{id:other.id,activityId:note,originalText:'Original',text:'Wrong org'}),e=>e.http===404);
 for(const type of ['E-Mail erhalten','CRM-Änderung','Kontakt']){const id=addActivity(db,org.id,user,{type,text:'Original'});assert.throws(()=>activitySave(db,user,{id:org.id,activityId:id,originalText:'Original',text:'Forbidden'}),/Nur Anrufnotizen/);}
 assert.throws(()=>activitySave(db,user,{id:org.id,activityId:note,originalText:'Original',text:'x'.repeat(12001)}),/lange/);
 assert.equal(entity(db,org.id).version,org.version);assert.equal(db.prepare("SELECT count(*) n FROM audit_log WHERE action='activity_edit'").get().n,0);
 }finally{db.close();}});
test('calls can be logged by hand and notes turned into calls, which then count as contact',async()=>{const{db,user,org}=await fixture();try{
 const {randomUUID:id}=await import('node:crypto');const {save,history}=await import('../server/crm.mjs');
 let r=save(db,user,{id:org.id,version:org.version,requestId:id(),fields:{},note:{type:'Anruf',text:'Rückruf von Anna, will ein Angebot',date:'2026-10-01'}});
 let h=history(db,org.id).items[0];assert.equal(h.art,'Anruf · Gespräch geführt');assert.equal(h.is_contact,true);assert.equal(r.entity.values[15],'2026-10-01');
 assert.equal(db.prepare('SELECT count(*) n FROM call_attempts').get().n,0);
 assert.throws(()=>save(db,user,{id:org.id,version:r.entity.version,requestId:id(),fields:{},note:{type:'Anruf',text:'Future',date:'2999-01-01'}}),/Ungültige/);
 assert.throws(()=>save(db,user,{id:org.id,version:r.entity.version,requestId:id(),fields:{},note:{type:'Anruf · Erreicht',text:'Forged',date:'2026-10-01'}}),/Ungültige/);
 const note=addActivity(db,org.id,user,{type:'Notiz',text:'Kurz notiert während des Gesprächs',date:'2026-10-05'});
 r=activitySave(db,user,{id:org.id,activityId:note,originalText:'Kurz notiert während des Gesprächs',text:'Kurz notiert während des Gesprächs',kind:'Anruf'});
 assert.equal(r.kind,'Anruf · Gespräch geführt');assert.equal(r.entity.values[15],'2026-10-05');
 const row=db.prepare('SELECT * FROM activities WHERE id=?').get(note);assert.equal(row.kind,'Anruf · Gespräch geführt');assert.equal(row.is_contact,1);assert.equal(row.occurred_on,'2026-10-05');
 assert.deepEqual(JSON.parse(db.prepare("SELECT changes_json FROM audit_log WHERE action='activity_edit'").get().changes_json).kind,{from:'Notiz',to:'Anruf · Gespräch geführt'});
 // Converting again is a no-op; an empty text falls back to the outcome label like other calls.
 assert.equal(activitySave(db,user,{id:org.id,activityId:note,originalText:row.body,text:row.body,kind:'Anruf'}).entity.version,r.entity.version);
 assert.equal(activitySave(db,user,{id:org.id,activityId:note,originalText:row.body,text:''}).text,'Gespräch geführt');
 // Only notes convert: meetings, tracked calls and other kinds are refused.
 for(const type of ['Meeting','Anruf · Erreicht','Anruf gestartet']){const other=addActivity(db,org.id,user,{type,text:'Original',date:'2026-10-02'});assert.throws(()=>activitySave(db,user,{id:org.id,activityId:other,originalText:'Original',text:'Original',kind:'Anruf'}),/Nur Notizen/);}
 const n2=addActivity(db,org.id,user,{type:'Notiz',text:'Original'});assert.throws(()=>activitySave(db,user,{id:org.id,activityId:n2,originalText:'Original',text:'Original',kind:'Meeting'}),/Nur Notizen/);
 }finally{db.close();}});
