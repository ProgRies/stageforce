import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,getOrg,contacts} from '../server/crm.mjs';
import {extensionAction} from '../server/extension.mjs';
import {detectMeeting,logMeeting} from '../server/meetings.mjs';
const origin='http://localhost:3000';
async function setup(){const db=openDB(':memory:');const id=await addUser(db,'alex@team.test','Alex','long-password-1234');const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
 const org=createOrg(db,user,'Hörsel GmbH');addContact(db,org.id,{name:'Sabine Strebe',e_mails:['strebe@hoersel.test']});return{db,user,org:getOrg(db,org.id)};}
const act=(db,user,b)=>extensionAction(db,user,b,origin);
const event={eventId:'abc123_20261130T100000Z',title:'Social-Wall Stage Vorstellung',date:'2026-11-30',time:'11:00',links:['https://meet.google.com/fsz-fmqg-qia'],guests:[{email:'alex@team.test',name:'Alex'},{email:'strebe@hoersel.test',name:''},{email:'adrian@team.test',name:'Adrian Wabro'}]};
const meetings=db=>db.prepare("SELECT * FROM activities WHERE kind='Meeting'").all();

test('a meeting logged from the Gmail invitation is recognised in the Calendar pop-up by its Meet link and then marked in the grid',async()=>{
 const{db,user,org}=await setup();try{
  const invite=detectMeeting({subject:'Einladung: Social-Wall Stage Vorstellung @ Mo. 30. Nov. 2026 11:00 - 11:30 (MEZ) (alex@team.test)',body:'Mit Google Meet teilnehmen',links:['https://meet.google.com/fsz-fmqg-qia'],sentAt:'2026-11-20T09:00:00Z'});
  logMeeting(db,user,{organisationId:org.id,meeting:invite,date:'2026-11-30',time:'11:00',messageId:null,contactIds:[]});
  assert.deepEqual(act(db,user,{action:'calendarStatus',events:[{id:'other',title:'Something else',date:'2026-11-30',time:'11:00'}]}).logged,[]);
  const r=act(db,user,{action:'calendarCheck',...event});
  assert.equal(r.logged.organisation.name,'Hörsel GmbH');assert.equal(r.logged.date,'2026-11-30');assert.equal(r.logged.time,'11:00');
  assert.deepEqual(r.participants.filter(p=>!p.internal).map(p=>[p.email,p.name,p.known]),[['strebe@hoersel.test','Sabine Strebe',true]]);
  assert.ok(r.participants.find(p=>p.email==='adrian@team.test').internal,'colleagues are never clients');
  // The Meet-link match is remembered, so the box is marked by its id alone.
  assert.deepEqual(act(db,user,{action:'calendarStatus',events:[{id:event.eventId}]}).logged,[event.eventId]);
 }finally{db.close();}
});

test('an unlogged client meeting is offered for logging, saved with its contacts once, and moves with the calendar',async()=>{
 const{db,user,org}=await setup();try{
  const guests=[...event.guests,{email:'neu@hoersel.test',name:'Nina Neu'}],b={...event,links:[],guests};
  const check=act(db,user,{action:'calendarCheck',...b});
  assert.equal(check.logged,null);assert.equal(check.organisation.id,org.id);assert.deepEqual(check.candidates.map(c=>c.guests),[['strebe@hoersel.test']]);
  assert.throws(()=>act(db,user,{action:'calendarLog',...b,requestId:randomUUID(),organisationId:org.id,version:org.version,contactEmails:[]}),/confirmation/);
  assert.throws(()=>act(db,user,{action:'calendarLog',confirmed:true,...b,requestId:randomUUID(),organisationId:org.id,version:org.version,contactEmails:['adrian@team.test']}),/event guests/);
  const requestId=randomUUID(),save={action:'calendarLog',confirmed:true,...b,requestId,organisationId:org.id,version:org.version,contactEmails:['strebe@hoersel.test','neu@hoersel.test']};
  const saved=act(db,user,save);
  assert.equal(saved.logged.organisation.id,org.id);assert.deepEqual(saved.logged.contacts,['Nina Neu','Sabine Strebe']);
  assert.equal(meetings(db).length,1);assert.match(meetings(db)[0].body,/11:00 Uhr · Social-Wall Stage Vorstellung/);
  assert.deepEqual(contacts(db,org.id).map(c=>c.name).sort(),['Nina Neu','Sabine Strebe']);
  // A retried request changes nothing.
  assert.equal(act(db,user,save).duplicate,true);assert.equal(meetings(db).length,1);
  assert.equal(act(db,user,{action:'calendarCheck',...b}).logged.activityId,saved.logged.activityId);
  // The event moved in the calendar: logging it again moves the same entry.
  const moved=act(db,user,{...save,requestId:randomUUID(),date:'2026-12-02',time:'09:30',version:getOrg(db,org.id).version});
  assert.equal(moved.logged.activityId,saved.logged.activityId);assert.equal(meetings(db).length,1);assert.equal(meetings(db)[0].occurred_on,'2026-12-02');
  // Logging into an organisation someone edited meanwhile is fine: no organisation field is changed.
  assert.equal(act(db,user,{...save,requestId:randomUUID(),eventId:'other-event',date:'2026-12-09',version:'0'}).saved,true);
 }finally{db.close();}
});

test('events without clients stay quiet; a new organisation can be created; deleting the meeting removes its mark',async()=>{
 const{db,user}=await setup();try{
  const solo={eventId:'solo1',title:'Singstunde',date:'2026-12-02',time:'18:30',guests:[{email:'chor@singkreis.test',name:''}]};
  const r=act(db,user,{action:'calendarCheck',...solo});assert.equal(r.logged,null);assert.equal(r.organisation,null);assert.deepEqual(r.candidates,[]);
  assert.throws(()=>act(db,user,{action:'calendarLog',confirmed:true,...solo,requestId:randomUUID(),newOrganisation:'Hörsel GmbH',contactEmails:[]}),/already exists/);
  const saved=act(db,user,{action:'calendarLog',confirmed:true,...solo,requestId:randomUUID(),newOrganisation:'Singkreis',contactEmails:['chor@singkreis.test']});
  assert.equal(saved.organisation.name,'Singkreis');assert.deepEqual(act(db,user,{action:'calendarStatus',events:[{id:'solo1'}]}).logged,['solo1']);
  db.prepare('DELETE FROM activity_contacts').run();db.prepare('DELETE FROM meeting_refs').run();db.prepare('DELETE FROM activities WHERE id=?').run(saved.logged.activityId);
  assert.deepEqual(act(db,user,{action:'calendarStatus',events:[{id:'solo1'}]}).logged,[]);
 }finally{db.close();}
});

test('grid marks also find meetings logged by title, day and time, and reject malformed input',async()=>{
 const{db,user,org}=await setup();try{
  const m=detectMeeting({subject:'Einladung: Demo Theater Gera',body:'',links:['https://zoom.us/j/123456789']});
  logMeeting(db,user,{organisationId:org.id,meeting:m,date:'2026-12-03',time:'09:30',messageId:null,contactIds:[]});
  const events=[{id:'a',title:'Demo Theater Gera',date:'2026-12-03',time:'09:30'},{id:'b',title:'demo  theater gera',date:'2026-12-03',time:''},{id:'c',title:'Demo Theater Gera',date:'2026-12-03',time:'14:00'},{id:'d',title:'Demo Theater Gera',date:'2026-12-04',time:'09:30'}];
  assert.deepEqual(act(db,user,{action:'calendarStatus',events}).logged,['a','b']);
  assert.throws(()=>act(db,user,{action:'calendarStatus',events:Array.from({length:151},(_,i)=>({id:'e'+i}))}),/Invalid events/);
  assert.throws(()=>act(db,user,{action:'calendarStatus',events:[{id:'bad id<'}]}),/Invalid calendar event/);
  assert.throws(()=>act(db,user,{action:'calendarCheck',...event,date:'30.11.2026'}),/date/);
  assert.throws(()=>act(db,user,{action:'calendarCheck',...event,guests:[{email:'not-an-address'}]}),/guest/);
 }finally{db.close();}
});
