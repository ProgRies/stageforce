import test from 'node:test';
import assert from 'node:assert/strict';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,save,history,getOrg,listData,entity,activitySave,addContact} from '../server/crm.mjs';
import {buildQueue,meetingWhen,todayBerlin} from '../src/domain.ts';
const shift=days=>{const d=new Date(todayBerlin()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
test('meetings can be planned ahead, show as upcoming and keep the org out of the call list',async()=>{
 const db=openDB(':memory:');try{
  const uid=await addUser(db,'plan@example.test','Plan','long-password-1234'),user=db.prepare('SELECT * FROM users WHERE id=?').get(uid);
  let org=createOrg(db,user,'Customer');addContact(db,org.id,{name:'Pat',telefone:['+49 30 1234567']},true);org=entity(db,org.id,true);
  assert.equal(buildQueue([org]).length,1);
  const intro=shift(14);
  org=save(db,user,{id:org.id,version:org.version,requestId:'plan-1',fields:{},note:{type:'Meeting',text:'Intro-Meeting',date:intro}}).entity;
  assert.deepEqual(org.upcoming,{date:intro,text:'Intro-Meeting'});assert.equal(getOrg(db,org.id).last_contact,null,'a planned meeting is not a contact yet');
  const listed=listData(db).entities.find(e=>e.id===org.id);assert.deepEqual(listed.upcoming,{date:intro,text:'Intro-Meeting'});
  assert.deepEqual(buildQueue([listed]),[],'no calls while a meeting is booked');
  assert.throws(()=>save(db,user,{id:org.id,version:org.version,requestId:'plan-2',fields:{},note:{type:'Notiz',text:'Zukunft',date:intro}}),/Datum/);
  assert.throws(()=>save(db,user,{id:org.id,version:org.version,requestId:'plan-3',fields:{},note:{type:'Meeting',text:'Zu weit',date:shift(800)}}),/Datum/);
  const item=()=>history(db,org.id,0,'communication').items.find(h=>h.art==='Meeting');
  // Moving the date and cancelling are edits on the entry.
  const setup=shift(21);let r=activitySave(db,user,{id:org.id,activityId:item().ereignis_id,text:'Setup-Meeting',originalText:'Intro-Meeting',date:setup,cancelled:false});
  assert.equal(r.date,setup);assert.deepEqual(r.entity.upcoming,{date:setup,text:'Setup-Meeting'});
  r=activitySave(db,user,{id:org.id,activityId:item().ereignis_id,text:'Setup-Meeting',originalText:'Setup-Meeting',date:setup,cancelled:true});
  assert.equal(r.entity.upcoming,null);assert.equal(item().meeting_cancelled,true);assert.equal(buildQueue([r.entity]).length,1);
  r=activitySave(db,user,{id:org.id,activityId:item().ereignis_id,text:'Setup-Meeting',originalText:'Setup-Meeting',cancelled:false});
  assert.equal(r.entity.upcoming.date,setup);
  assert.throws(()=>activitySave(db,user,{id:org.id,activityId:item().ereignis_id,text:'Setup-Meeting',originalText:'Setup-Meeting',date:shift(800)}),/Datum/);
  // Once its day has come, a planned meeting counts as the last contact.
  db.prepare("UPDATE activities SET occurred_on=? WHERE kind='Meeting'").run(shift(-1));
  listData(db);assert.equal(getOrg(db,org.id).last_contact,shift(-1));assert.equal(entity(db,org.id).upcoming,null);
  const note=save(db,user,{id:org.id,version:getOrg(db,org.id).version,requestId:'note-1',fields:{},note:{type:'Notiz',text:'Notiz',date:todayBerlin()}}).entity;
  const noteId=history(db,org.id,0,'communication').items.find(h=>h.art==='Notiz').ereignis_id;
  assert.throws(()=>activitySave(db,user,{id:note.id,activityId:noteId,text:'Notiz',originalText:'Notiz',date:intro}),/Meetings/);
 }finally{db.close();}
});
test('upcoming labels read naturally',()=>{
 assert.equal(meetingWhen('2026-10-25','2026-10-25'),'heute');assert.equal(meetingWhen('2026-10-26','2026-10-25'),'morgen');assert.equal(meetingWhen('2026-11-03','2026-10-25'),'Di., 03.11.');
});
