import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,entity,listData,history,getOrg,activitySave,save} from '../server/crm.mjs';
import {prepareCall,saveCall,cancelCall,openCall,draftCall} from '../server/calls.mjs';
import {deleteOrganisation} from '../server/lifecycle.mjs';
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
test('"Speichern" logs a talked call and leaves the planned date, next step and phase alone',async()=>{const{db,user}=await setup();try{
 const{org,start}=dial(db,user);const date=addDays(today,30);saveCall(db,user,{callId:start(),outcome:'callback',callbackDate:date});
 saveCall(db,user,{callId:start(),notes:'Kurz über die Preise gesprochen',outcome:'talked',keepFollowUp:false});
 const e=entity(db,org.id),h=history(db,org.id,0,'communication').items[0];
 assert.equal(e.values[17],date);assert.equal(e.values[16],'Rückruf vereinbart');assert.equal(e.values[10],'Unbearbeitet');
 assert.equal(h.art,'Anruf · Gespräch geführt');assert.equal(h.text,'Kurz über die Preise gesprochen');assert.equal(getOrg(db,org.id).last_contact,today);
 const none=dial(db,user,'Ohne Termin');saveCall(db,user,{callId:none.start(),outcome:'talked'});assert.equal(entity(db,none.org.id).values[17],'');
}finally{db.close();}});
test('call back uses the chosen date, keeps the note and replaces the previous follow-up',async()=>{const{db,user}=await setup();try{
 const{org,start}=dial(db,user);saveCall(db,user,{callId:start(),outcome:'not_reached'});
 const date=addDays(today,10);saveCall(db,user,{callId:start(),notes:'Ab Montag wieder im Büro',outcome:'callback',callbackDate:date});
 assert.equal(entity(db,org.id).values[17],date);assert.equal(entity(db,org.id).values[16],'Rückruf vereinbart');assert.equal(db.prepare('SELECT count(*) n FROM followups WHERE organisation_id=? AND completed_at IS NULL').get(org.id).n,1);
 assert.equal(history(db,org.id,0,'communication').items[0].text,'Ab Montag wieder im Büro');
 // A refused save leaves the call open, so the same call is tried again.
 const open=start();
 assert.throws(()=>saveCall(db,user,{callId:open,outcome:'callback',callbackDate:addDays(today,-1)}),/call-back date/);
 assert.throws(()=>saveCall(db,user,{callId:open,outcome:'__proto__'}),/Unknown call result/);
 assert.throws(()=>saveCall(db,user,{callId:open,outcome:'callback',callbackDate:'2026-02-30'}),/call-back date/);
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
test('an open call can be resumed with its draft note, blocks a second call and closes on save',async()=>{const{db,user}=await setup();try{
 const{org,start}=dial(db,user);const id=start();
 assert.deepEqual(draftCall(db,user,{callId:id,notes:'Ruft nach 15 Uhr zurück'}),{saved:true});
 const open=openCall(db,user).call;assert.equal(open.callId,id);assert.equal(open.organisation.name,'Lead');assert.equal(open.notes,'Ruft nach 15 Uhr zurück');assert.equal(open.dial,'+49301234567');assert.deepEqual(open.outcomes.map(o=>o.key),['not_reached','callback','meeting','email','talked']);assert.equal(open.outcomes.at(-1).label,'Speichern');
 assert.throws(()=>dial(db,user,'Other').start(),/Another call with a note is still open/);
 // Repeating the same request returns the open call instead of refusing it.
 assert.equal(prepareCall(db,user,{organisationId:org.id,contactId:open.contact.id,phone:'030 1234567',startedAt:open.startedAt,requestId:id}).callId,id);
 const colleague=db.prepare('SELECT * FROM users WHERE id=?').get(await addUser(db,'sam@team.test','Sam','long-password-1234'));
 assert.equal(openCall(db,colleague).call,null);assert.throws(()=>draftCall(db,colleague,{callId:id,notes:'x'}),/Call not found/);
 saveCall(db,user,{callId:id,notes:'Ruft nach 15 Uhr zurück',outcome:'not_reached'});
 assert.equal(openCall(db,user).call,null);assert.deepEqual(draftCall(db,user,{callId:id,notes:'late'}),{saved:false,closed:true});assert.equal(db.prepare('SELECT count(*) n FROM call_drafts').get().n,0);
}finally{db.close();}});
test('abandoned calls older than twelve hours neither resume nor block, and discarding drops the draft',async()=>{const{db,user}=await setup();try{
 const{org,start}=dial(db,user);const old=start();db.prepare('UPDATE call_attempts SET started_at=? WHERE id=?').run(new Date(Date.now()-13*3600000).toISOString(),old);
 assert.equal(openCall(db,user).call,null);const id=start();draftCall(db,user,{callId:id,notes:'Notiz'});
 cancelCall(db,user,{callId:id});assert.equal(openCall(db,user).call,null);assert.equal(db.prepare('SELECT count(*) n FROM call_drafts').get().n,0);
 draftCall(db,user,{callId:start(),notes:'Notiz'});deleteOrganisation(db,user,{id:org.id,version:getOrg(db,org.id).version,confirmName:'Lead'});assert.equal(db.prepare('SELECT count(*) n FROM call_drafts').get().n,0);
}finally{db.close();}});
test('starting a call drops an older open call without a note, so nothing lingers',async()=>{const{db,user}=await setup();try{
 const first=dial(db,user,'First').start(),second=dial(db,user,'Second').start();
 assert.equal(db.prepare('SELECT count(*) n FROM call_attempts WHERE id=?').get(first).n,0);assert.equal(openCall(db,user).call.callId,second);
 draftCall(db,user,{callId:second,notes:'   '});assert.equal(dial(db,user,'Third').start().length,36);
}finally{db.close();}});

// 0.3.16: the card, the Anruf tab and the phone app pick a result and the next call separately, then save.
const followUp=(db,id)=>({...db.prepare('SELECT f.text,f.due_date,t.time FROM followups f LEFT JOIN followup_times t ON t.followup_id=f.id WHERE f.organisation_id=? AND f.completed_at IS NULL').get(id)});
test('a result and a next call: keep, a date with a time, or none',async()=>{const{db,user}=await setup();try{
 const {org,start}=dial(db,user),ahead=addDays(today,10);
 assert.equal(callView(db,user,start).results.map(r=>r.key).join(),'talked,not_reached,meeting,email');
 saveCall(db,user,{callId:start(),outcome:'talked',next:{kind:'date',date:ahead,time:'09:30'}});
 assert.deepEqual(followUp(db,org.id),{text:'Rückruf vereinbart',due_date:ahead,time:'09:30'});
 // Not reached before the planned day: "Unverändert" leaves it as it is.
 saveCall(db,user,{callId:start(),outcome:'not_reached',next:{kind:'keep'}});assert.deepEqual(followUp(db,org.id),{text:'Rückruf vereinbart',due_date:ahead,time:'09:30'});
 assert.equal(history(db,org.id).items[0].art,'Anruf · Nicht erreicht');
 saveCall(db,user,{callId:start(),outcome:'not_reached',next:{kind:'date',date:addDays(today,2)}});assert.deepEqual(followUp(db,org.id),{text:'Erneut anrufen',due_date:addDays(today,2),time:null});
 saveCall(db,user,{callId:start(),outcome:'talked',next:{kind:'none'}});assert.equal(followUp(db,org.id).due_date,null);
 assert.throws(()=>saveCall(db,user,{callId:start(),next:{kind:'keep'}}),/result/);
 assert.throws(()=>saveCall(db,user,{callId:start(),outcome:'callback',next:{kind:'keep'}}),/result/);
 assert.throws(()=>saveCall(db,user,{callId:start(),outcome:'talked',next:{kind:'date',date:addDays(today,-1)}}),/date/);
 assert.throws(()=>saveCall(db,user,{callId:start(),outcome:'talked',next:{kind:'later'}}),/next call/);
}finally{db.close();}});
function callView(db,user,start){const id=start();const v=openCall(db,user).call;cancelCall(db,user,{callId:id});return v;}
test('a next step written by hand stays when a result moves the date',async()=>{const{db,user}=await setup();try{
 const {org,start}=dial(db,user);db.prepare("INSERT INTO followups VALUES('f1',?,'Preisliste schicken, dann nachfassen',?,'',NULL)").run(org.id,today);
 saveCall(db,user,{callId:start(),outcome:'not_reached',next:{kind:'date',date:addDays(today,2)}});
 assert.deepEqual(followUp(db,org.id),{text:'Preisliste schicken, dann nachfassen',due_date:addDays(today,2),time:null});
 // Older cards too.
 saveCall(db,user,{callId:start(),outcome:'email'});assert.equal(followUp(db,org.id).text,'Preisliste schicken, dann nachfassen');
}finally{db.close();}});
test('"Termin vereinbart" only moves the phase forward',async()=>{const{db,user}=await setup();try{
 for(const [from,to] of [['Unbearbeitet','Termin vereinbart'],['Im Gespräch','Termin vereinbart'],['Angebot','Angebot'],['Gewonnen','Gewonnen'],['Testphase','Testphase']]){
  const {org,start}=dial(db,user,'Lead '+from);db.prepare('UPDATE organisations SET phase=? WHERE id=?').run(from,org.id);
  saveCall(db,user,{callId:start(),outcome:'meeting',next:{kind:'date',date:addDays(today,14)}});assert.equal(getOrg(db,org.id).phase,to,from);
 }
 // An older extension's one tap behaves the same.
 const {org,start}=dial(db,user,'Kunde');db.prepare("UPDATE organisations SET phase='Gewonnen' WHERE id=?").run(org.id);saveCall(db,user,{callId:start(),outcome:'no_interest'});assert.equal(getOrg(db,org.id).phase,'Gewonnen');
}finally{db.close();}});
test('the Anruf tab logs the same results by hand',async()=>{const{db,user}=await setup();try{
 const org=createOrg(db,user,'Lead'),log=(outcome,fields,text='')=>save(db,user,{id:org.id,version:entity(db,org.id).version,requestId:randomUUID(),fields,note:{type:'Anruf',text,date:today,outcome}});
 log('not_reached',{17:addDays(today,2)});
 assert.equal(history(db,org.id,0,'communication').items[0].art,'Anruf · Nicht erreicht');assert.equal(history(db,org.id,0,'communication').items[0].text,'Nicht erreicht');assert.equal(entity(db,org.id).values[15],'');
 assert.deepEqual(followUp(db,org.id),{text:'Erneut anrufen',due_date:addDays(today,2),time:null});
 log('meeting',{},'Demo am 12.11.');assert.equal(getOrg(db,org.id).phase,'Termin vereinbart');assert.equal(entity(db,org.id).values[15],today);assert.equal(followUp(db,org.id).due_date,addDays(today,2));
 log('email',{17:addDays(today,7)});assert.equal(listData(db).review.length,1);
 // Without a result (older pages) it stays a conversation.
 save(db,user,{id:org.id,version:entity(db,org.id).version,requestId:randomUUID(),fields:{},note:{type:'Anruf',text:'kurz gesprochen',date:today}});assert.equal(history(db,org.id,0,'communication').items[0].art,'Anruf · Gespräch geführt');
 assert.throws(()=>log('callback',{}),/Anrufergebnis/);
}finally{db.close();}});
