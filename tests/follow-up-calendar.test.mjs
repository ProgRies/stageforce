import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,entity,save,listData,history} from '../server/crm.mjs';
import {prepareCall,saveCall} from '../server/calls.mjs';
import {logMeeting} from '../server/meetings.mjs';
import {calendar,meetingTime} from '../server/calendar.mjs';
import {deleteOrganisation} from '../server/lifecycle.mjs';
import {todayBerlin,addDays,mondayOf,isoWeek,dayItems} from '../src/domain.ts';
async function setup(){const db=openDB(':memory:');const users=[];for(const[email,name]of[['alex@team.test','Alex'],['sam@team.test','Sam']]){const id=await addUser(db,email,name,'long-password-1234');users.push(db.prepare('SELECT * FROM users WHERE id=?').get(id));}return{db,alex:users[0],sam:users[1]};}
const edit=(db,user,id,fields,extra={})=>save(db,user,{id,version:entity(db,id).version,requestId:randomUUID(),fields,...extra});
const today=todayBerlin(),week=mondayOf(today),later=addDays(week,9);

test('a planned call can carry a time, and a new date without one clears it',async()=>{const{db,alex}=await setup();try{
 const org=createOrg(db,alex,'Theater Nord');
 edit(db,alex,org.id,{17:later},{followUpTime:'10:30'});
 assert.equal(entity(db,org.id).followUpTime,'10:30');assert.equal(listData(db).entities[0].followUpTime,'10:30');
 assert.throws(()=>edit(db,alex,org.id,{17:later},{followUpTime:'25:00'}),/Uhrzeit/);
 // Only the time changes: the audit says so and the date stays.
 edit(db,alex,org.id,{17:later},{followUpTime:'14:00'});assert.equal(entity(db,org.id).followUpTime,'14:00');
 assert.deepEqual(JSON.parse(db.prepare("SELECT changes_json FROM audit_log WHERE action='update' ORDER BY rowid DESC LIMIT 1").get().changes_json)['Wiedervorlage Uhrzeit'],{from:'10:30',to:'14:00'});
 // Older clients send the date alone; the time no longer applies.
 edit(db,alex,org.id,{17:addDays(later,1)});assert.equal(entity(db,org.id).followUpTime,'');assert.equal(entity(db,org.id).values[17],addDays(later,1));
 // Other fields leave the time alone.
 edit(db,alex,org.id,{17:later},{followUpTime:'09:00'});edit(db,alex,org.id,{16:'Angebot besprechen'});assert.equal(entity(db,org.id).followUpTime,'09:00');
 edit(db,alex,org.id,{17:''},{followUpTime:'09:00'});assert.equal(entity(db,org.id).followUpTime,'');
}finally{db.close();}});
test('"Später anrufen" can set a time; other results and older images drop it',async()=>{const{db,alex}=await setup();try{
 const org=createOrg(db,alex,'Kulturhaus'),cid=addContact(db,org.id,{name:'Pat',telefone:['030 1234567']});
 const start=()=>prepareCall(db,alex,{organisationId:org.id,contactId:cid,phone:'030 1234567',startedAt:new Date().toISOString(),requestId:randomUUID()});
 saveCall(db,alex,{callId:start().callId,outcome:'callback',callbackDate:later,callbackTime:'11:15'});
 assert.equal(entity(db,org.id).followUpTime,'11:15');
 const call=start();assert.deepEqual([call.followUp,call.followUpTime],[later,'11:15']);
 // Kept: date and time stay.
 saveCall(db,alex,{callId:call.callId,outcome:'not_reached',keepFollowUp:true});assert.equal(entity(db,org.id).followUpTime,'11:15');
 assert.throws(()=>saveCall(db,alex,{callId:start().callId,outcome:'callback',callbackDate:later,callbackTime:'later'}),/Uhrzeit/);
 saveCall(db,alex,{callId:start().callId,outcome:'not_reached'});assert.equal(entity(db,org.id).followUpTime,'');assert.equal(entity(db,org.id).values[17],addDays(today,2));
 // An older image moves the date in place: the stored time was for the old date and no longer shows.
 saveCall(db,alex,{callId:start().callId,outcome:'callback',callbackDate:later,callbackTime:'08:00'});
 db.prepare('UPDATE followups SET due_date=? WHERE organisation_id=?').run(addDays(later,3),org.id);assert.equal(entity(db,org.id).followUpTime,'');
 // An older image inserts follow-ups by position; the time table does not get in its way.
 db.prepare('DELETE FROM followups WHERE organisation_id=?').run(org.id);
 db.prepare('INSERT INTO followups VALUES(?,?,?,?,?,NULL)').run(randomUUID(),org.id,'Rückruf',later,alex.id);
 assert.equal(db.prepare('SELECT count(*) n FROM followup_times').get().n,0,'times go with their follow-up');
 db.prepare('INSERT INTO followup_times SELECT id,due_date,? FROM followups WHERE organisation_id=?').run('12:00',org.id);
 deleteOrganisation(db,alex,{id:org.id,version:entity(db,org.id).version,confirmName:'Kulturhaus'});assert.equal(db.prepare('SELECT count(*) n FROM followup_times').get().n,0,'deleting an organisation takes its times along');
}finally{db.close();}});
test('the week shows my planned calls and everyone\'s meetings',async()=>{const{db,alex,sam}=await setup();try{
 const mine=createOrg(db,alex,'Mein Lead'),timed=createOrg(db,alex,'Mit Uhrzeit'),theirs=createOrg(db,alex,'Sams Lead'),old=createOrg(db,alex,'Überfällig'),next=createOrg(db,alex,'Nächste Woche');
 edit(db,alex,mine.id,{11:alex.id,17:addDays(week,6)});
 edit(db,alex,timed.id,{11:alex.id,17:addDays(week,6)},{followUpTime:'09:30'});
 edit(db,alex,theirs.id,{11:sam.id,17:addDays(week,6)});
 db.prepare("UPDATE organisations SET owner=? WHERE id=?").run(alex.id,old.id);db.prepare('INSERT INTO followups VALUES(?,?,?,?,?,NULL)').run(randomUUID(),old.id,'Nachfassen',addDays(today,-3),alex.id);
 edit(db,alex,next.id,{11:alex.id,17:addDays(week,7)});
 logMeeting(db,sam,{organisationId:theirs.id,meeting:{provider:'Zoom',title:'Kickoff',link:'',key:'Zoom:1',cancelled:false},date:addDays(week,2),time:'14:30',messageId:null});
 save(db,alex,{id:mine.id,version:entity(db,mine.id).version,requestId:randomUUID(),fields:{},note:{type:'Meeting',date:addDays(week,3),text:'Vor Ort, 10:00 Uhr'}});
 const w=calendar(db,alex,{from:week});
 assert.deepEqual(w.followUps.map(f=>f.name),['Überfällig','Mein Lead','Mit Uhrzeit']);
 assert.deepEqual(w.followUps.find(f=>f.name==='Mit Uhrzeit').time,'09:30');assert.equal(w.followUps.find(f=>f.name==='Überfällig').overdue,true);
 assert.deepEqual(w.meetings.map(m=>[m.name,m.time,m.text,m.by,m.mine]),[['Sams Lead','14:30','Zoom · Kickoff','Sam',false],['Mein Lead','10:00','Vor Ort, 10:00 Uhr','',true]]);
 // Overdue calls wait on today; the rest sit on their day, untimed before timed.
 assert.deepEqual(dayItems(w,today).filter(i=>i.overdue).map(i=>i.name),['Überfällig']);
 assert.deepEqual(dayItems(w,addDays(week,6)).map(i=>[i.name,i.time]),[['Mein Lead',''],['Mit Uhrzeit','09:30']]);
 // Other weeks never show overdue calls, and a cancelled meeting disappears.
 const after=calendar(db,alex,{from:addDays(week,7)});assert.deepEqual(after.followUps.map(f=>f.name),['Nächste Woche']);
 db.prepare('INSERT INTO meeting_status SELECT id,? FROM activities WHERE kind=? AND organisation_id=?').run(new Date().toISOString(),'Meeting',theirs.id);
 assert.deepEqual(calendar(db,alex,{from:week}).meetings.map(m=>m.name),['Mein Lead']);
 assert.deepEqual(calendar(db,sam,{from:week}).followUps.map(f=>f.name),['Sams Lead']);
 assert.throws(()=>calendar(db,alex,{from:addDays(week,1)}),/Woche/);
 assert.equal(history(db,mine.id,0,'communication').items[0].art,'Meeting');
}finally{db.close();}});
test('meeting times, weeks and week numbers',()=>{
 assert.equal(meetingTime('Zoom · 14:30 Uhr · Kickoff'),'14:30');assert.equal(meetingTime('Termin am 12.10. um 9.15 Uhr'),'09:15');
 assert.equal(meetingTime('Termin am 12.10.2026'),'');assert.equal(meetingTime('Meeting'),'');
 assert.equal(mondayOf('2026-10-28'),'2026-10-26');assert.equal(mondayOf('2026-11-01'),'2026-10-26');assert.equal(mondayOf('2026-10-26'),'2026-10-26');
 assert.equal(isoWeek('2026-10-26'),44);assert.equal(isoWeek('2027-01-01'),53);assert.equal(isoWeek('2027-01-04'),1);
});
