import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,entity,save,history,listData} from '../server/crm.mjs';
import {prepareCall,saveCall} from '../server/calls.mjs';
import {todayBerlin,addDays,addMonths,followUpLabel,followUpDistance} from '../src/domain.ts';
async function setup(){const db=openDB(':memory:');const id=await addUser(db,'alex@team.test','Alex','long-password-1234');return{db,user:db.prepare('SELECT * FROM users WHERE id=?').get(id)};}
function dial(db,user,name='Lead'){const org=createOrg(db,user,name),cid=addContact(db,org.id,{name:'Pat',telefone:['030 1234567']});return{org,start:()=>prepareCall(db,user,{organisationId:org.id,contactId:cid,phone:'030 1234567',startedAt:new Date().toISOString(),requestId:randomUUID()})};}
const today=todayBerlin(),later=addMonths(today,3);
const edit=(db,user,id,fields,note)=>save(db,user,{id,version:entity(db,id).version,requestId:randomUUID(),fields,note});

test('the call card can keep a planned call when a call comes before it',async()=>{const{db,user}=await setup();try{
 const{org,start}=dial(db,user);saveCall(db,user,{callId:start().callId,outcome:'callback',callbackDate:later});
 const call=start();assert.equal(call.followUp,later);
 saveCall(db,user,{callId:call.callId,outcome:'not_reached',keepFollowUp:true});
 assert.equal(entity(db,org.id).values[17],later);assert.equal(entity(db,org.id).values[16],'Rückruf vereinbart');
 assert.equal(history(db,org.id,0,'communication').items[0].art,'Anruf · Nicht erreicht');
 // The result's other effects still happen: "E-Mail nötig" still lands in Prüfen.
 saveCall(db,user,{callId:start().callId,outcome:'email',keepFollowUp:true});
 assert.equal(entity(db,org.id).values[17],later);assert.deepEqual(listData(db).review.map(r=>r.text),['E-Mail senden']);
 // Unticked, the result moves the date as before.
 saveCall(db,user,{callId:start().callId,outcome:'not_reached',keepFollowUp:false});assert.equal(entity(db,org.id).values[17],addDays(today,2));
}finally{db.close();}});
test('keeping only applies to a planned call still ahead, and never to "Später anrufen"',async()=>{const{db,user}=await setup();try{
 const{org,start}=dial(db,user);edit(db,user,org.id,{17:today});
 assert.equal(start().followUp,today);
 saveCall(db,user,{callId:start().callId,outcome:'not_reached',keepFollowUp:true});assert.equal(entity(db,org.id).values[17],addDays(today,2));
 edit(db,user,org.id,{17:later});const sooner=addDays(today,5);
 saveCall(db,user,{callId:start().callId,outcome:'callback',callbackDate:sooner,keepFollowUp:true});assert.equal(entity(db,org.id).values[17],sooner);
 // Without the flag (the phone app) nothing changes.
 saveCall(db,user,{callId:start().callId,outcome:'no_interest'});assert.equal(entity(db,org.id).values[17],addDays(today,365));
}finally{db.close();}});
test('a call logged by hand can set, keep or clear the planned call',async()=>{const{db,user}=await setup();try{
 const{org}=dial(db,user);
 edit(db,user,org.id,{17:later},{type:'Anruf',date:today,text:'Budget erst im neuen Jahr'});
 assert.equal(entity(db,org.id).values[17],later);assert.equal(history(db,org.id,0,'communication').items[0].art,'Anruf · Gespräch geführt');
 edit(db,user,org.id,{},{type:'Anruf',date:today,text:'Kurz nachgefragt'});assert.equal(entity(db,org.id).values[17],later);
 edit(db,user,org.id,{17:''},{type:'Anruf',date:today,text:'Kein Bedarf mehr'});assert.equal(entity(db,org.id).values[17],'');
}finally{db.close();}});
test('the organisation says who set the planned call and how',async()=>{const{db,user}=await setup();try{
 const{org,start}=dial(db,user);assert.equal(entity(db,org.id,true).followUpSource,undefined);
 saveCall(db,user,{callId:start().callId,outcome:'callback',callbackDate:later});
 let source=entity(db,org.id,true).followUpSource;assert.equal(source.outcome,'Später anrufen');assert.equal(source.by,'Alex');
 saveCall(db,user,{callId:start().callId,outcome:'not_reached',keepFollowUp:true});assert.equal(entity(db,org.id,true).followUpSource.outcome,'Später anrufen');
 edit(db,user,org.id,{17:addDays(today,20)});source=entity(db,org.id,true).followUpSource;assert.equal(source.outcome,null);assert.equal(source.by,'Alex');
 assert.equal(entity(db,org.id).followUpSource,undefined,'the list stays lean');
}finally{db.close();}});
test('short labels for the planned call',()=>{
 const t='2026-10-28';
 assert.equal(followUpLabel('2026-10-25',t),'Anruf fällig seit 25.10.');assert.equal(followUpLabel(t,t),'Anruf heute');assert.equal(followUpLabel('2026-10-29',t),'Anruf morgen');
 assert.equal(followUpLabel('2026-11-03',t),'Anruf Di., 03.11.');assert.equal(followUpLabel('2027-01-28',t),'Anruf Do., 28.01.27');
 assert.equal(followUpDistance('2027-01-28',t),'in 3 Monaten');assert.equal(followUpDistance('2026-11-03',t),'in 6 Tagen');
 assert.equal(addMonths('2026-11-30',3),'2027-02-28');assert.equal(addMonths('2026-10-28',12),'2027-10-28');
});
