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
