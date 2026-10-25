import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,entity,listData,history,getOrg,activitySave} from '../server/crm.mjs';
import {prepareCall,saveCall} from '../server/calls.mjs';
import {todayBerlin,addDays,buildQueue,callable} from '../src/domain.ts';
async function setup(){const db=openDB(':memory:');const id=await addUser(db,'alex@team.test','Alex','long-password-1234');return{db,user:db.prepare('SELECT * FROM users WHERE id=?').get(id)};}
function dial(db,user,name='Lead'){const org=createOrg(db,user,name),cid=addContact(db,org.id,{name:'Pat',telefone:['030 1234567']});return{org,start:()=>prepareCall(db,user,{organisationId:org.id,contactId:cid,phone:'030 1234567',startedAt:new Date().toISOString(),requestId:randomUUID()}).callId};}
const today=todayBerlin();

test('each result logs the call and schedules the next one for the caller',async()=>{const{db,user}=await setup();try{
 const cases={not_reached:[2,'Anruf · Nicht erreicht',null],email:[7,'Anruf · E-Mail nötig',today],meeting:[14,'Anruf · Termin',today],no_interest:[365,'Anruf · Kein Interesse',today]};
 for(const[outcome,[days,kind,contact]]of Object.entries(cases)){const{org,start}=dial(db,user,outcome);saveCall(db,user,{callId:start(),notes:'',outcome});
  const e=entity(db,org.id),h=history(db,org.id,0,'communication').items[0];
  assert.equal(e.values[17],addDays(today,days),outcome);assert.equal(h.art,kind);assert.equal(h.text,kind.slice(8));assert.equal(getOrg(db,org.id).last_contact,contact,outcome);
  assert.equal(db.prepare('SELECT owner FROM followups WHERE organisation_id=? AND completed_at IS NULL').get(org.id).owner,user.id);}
 const phases=Object.fromEntries(listData(db).entities.map(e=>[e.values[1],e.values[10]]));
 assert.equal(phases.meeting,'Termin vereinbart');assert.equal(phases.no_interest,'Aktuell kein Bedarf');assert.equal(phases.not_reached,'Unbearbeitet');
 assert.deepEqual(listData(db).review.map(r=>r.text),['E-Mail senden']);
}finally{db.close();}});
test('call back uses the chosen date, keeps the note and replaces the previous follow-up',async()=>{const{db,user}=await setup();try{
 const{org,start}=dial(db,user);saveCall(db,user,{callId:start(),outcome:'not_reached'});
 const date=addDays(today,10);saveCall(db,user,{callId:start(),notes:'Ab Montag wieder im Büro',outcome:'callback',callbackDate:date});
 assert.equal(entity(db,org.id).values[17],date);assert.equal(entity(db,org.id).values[16],'Rückruf vereinbart');assert.equal(db.prepare('SELECT count(*) n FROM followups WHERE organisation_id=? AND completed_at IS NULL').get(org.id).n,1);
 assert.equal(history(db,org.id,0,'communication').items[0].text,'Ab Montag wieder im Büro');
 assert.throws(()=>saveCall(db,user,{callId:start(),outcome:'callback',callbackDate:addDays(today,-1)}),/call-back date/);
 assert.throws(()=>saveCall(db,user,{callId:start(),outcome:'__proto__'}),/Unknown call result/);
 assert.throws(()=>saveCall(db,user,{callId:start(),outcome:'callback',callbackDate:'2026-02-30'}),/call-back date/);
}finally{db.close();}});
test('a call without a result keeps the previous behaviour',async()=>{const{db,user}=await setup();try{
 const{org,start}=dial(db,user);saveCall(db,user,{callId:start(),notes:''});
 assert.equal(history(db,org.id,0,'communication').items[0].art,'Anruf gestartet');assert.equal(entity(db,org.id).values[17],'');
}finally{db.close();}});
test('clearing a result note falls back to the result label',async()=>{const{db,user}=await setup();try{
 const{org,start}=dial(db,user);saveCall(db,user,{callId:start(),notes:'Zentrale',outcome:'not_reached'});
 const h=history(db,org.id,0,'communication').items[0];assert.equal(activitySave(db,user,{id:org.id,activityId:h.ereignis_id,text:'',originalText:'Zentrale'}).text,'Nicht erreicht');
}finally{db.close();}});
test('the call list never gives up: a due follow-up returns even after "Kein Interesse", only "Verloren" stays out',()=>{
 const rec=(id,f={})=>{const v=Array(24).fill('');Object.assign(v,{0:id,1:id,9:'Lead',10:'Unbearbeitet',14:'+49 30 1234567'},f);return{id,row:0,values:v,version:'1'};};
 const due=rec('due',{10:'Aktuell kein Bedarf',17:addDays(today,-1)}),waiting=rec('waiting',{17:addDays(today,3)}),lost=rec('lost',{10:'Verloren',17:addDays(today,-1)}),quiet=rec('quiet',{10:'Aktuell kein Bedarf'}),fresh=rec('fresh');
 assert.deepEqual([due,waiting,lost,quiet,fresh].filter(e=>callable(e,today)).map(e=>e.id),['due','fresh']);
 assert.deepEqual(buildQueue([due,waiting,lost,quiet,fresh],10).map(q=>q.id),['due','fresh']);
});
