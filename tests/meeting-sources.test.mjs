import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,getOrg,save} from '../server/crm.mjs';
import {extensionAction} from '../server/extension.mjs';
// One meeting can reach the timeline from several places: the invitation email in Gmail, the Google Calendar pop-up, a colleague's
// copy of either, and a meeting typed into the CRM or the phone app. Whatever the order, the timeline must hold exactly one entry per
// real meeting, on its current date, and the calendar must say "logged" exactly when that entry exists.
const origin='http://localhost:3000';
async function setup(){
 const db=openDB(':memory:');const users={};
 for(const [mail,name] of [['alex@team.test','Alex'],['sam@team.test','Sam']]){const id=await addUser(db,mail,name,'long-password-1234');users[name.toLowerCase()]=db.prepare('SELECT * FROM users WHERE id=?').get(id);}
 const hoersel=createOrg(db,users.alex,'Hörsel GmbH');addContact(db,hoersel.id,{name:'Sabine Strebe',e_mails:['strebe@hoersel.test']});
 const suhl=createOrg(db,users.alex,'Stadthalle Suhl');addContact(db,suhl.id,{name:'Uwe Suhl',e_mails:['uwe@suhl.test']});
 return{db,...users,hoersel:hoersel.id,suhl:suhl.id};
}
const act=(db,user,b)=>extensionAction(db,user,b,origin);
const meetings=(db,org)=>db.prepare("SELECT a.occurred_on AS date,a.body,(SELECT 1 FROM meeting_status s WHERE s.activity_id=a.id) AS cancelled FROM activities a WHERE kind='Meeting'"+(org?' AND organisation_id=?':'')+' ORDER BY occurred_on,created_at').all(...(org?[org]:[]));
const version=(db,id)=>getOrg(db,id).version;
const MEET='https://meet.google.com/fsz-fmqg-qia';
const guests=[{email:'alex@team.test',name:'Alex'},{email:'strebe@hoersel.test',name:''}];
const event=(over={})=>({eventId:'evt1',title:'Social-Wall Stage Vorstellung',date:'2026-11-30',time:'11:00',links:[MEET],guests,...over});
const check=(db,user,over)=>act(db,user,{action:'calendarCheck',...event(over)});
const logCal=(db,user,org,over={})=>act(db,user,{action:'calendarLog',confirmed:true,requestId:randomUUID(),...event(over),organisationId:org,version:version(db,org),contactEmails:['strebe@hoersel.test']});
const marked=(db,user,events)=>act(db,user,{action:'calendarStatus',events}).logged;
// The invitation email Google sends, saved from Gmail with "Also log meeting" ticked (as the popup does for invitations).
function gmail(db,user,org,{subject='Einladung: Social-Wall Stage Vorstellung @ Mo. 30. Nov. 2026 11:00 - 11:30 (MEZ) (alex@team.test)',body='Sabine Strebe hat Sie eingeladen.\nMit Google Meet teilnehmen',links=[MEET],date='2026-11-30',time='11:00',from='strebe@hoersel.test',mailbox='alex@team.test',sent='2026-11-20T09:00:00Z',id=randomUUID()}={}){
 return act(db,user,{action:'save',confirmed:true,requestId:randomUUID(),mailbox,gmailMessageId:id,from:{name:'',email:from},recipients:[{email:mailbox,name:''}],originalSubject:subject,subject,originalBody:body,body,links,timestamp:sent,timestampRaw:sent,direction:'incoming',sourceUrl:'https://mail.google.com/mail/u/0/#inbox/'+id,contactEmails:[from],organisationId:org,version:version(db,org),meeting:{log:true,date,time}});
}
const manual=(db,user,org,date,text)=>save(db,user,{id:org,version:version(db,org),requestId:randomUUID(),fields:{},note:{type:'Meeting',date,text}});

test('Gmail invitation first, then the Calendar pop-up: one entry, recognised, and the box is marked',async()=>{
 const{db,alex,hoersel}=await setup();try{
  gmail(db,alex,hoersel);assert.equal(meetings(db).length,1);
  assert.deepEqual(marked(db,alex,[{id:'evt1',title:'Social-Wall Stage Vorstellung',date:'2026-11-30',time:'11:00'}]),['evt1']);
  const r=check(db,alex);assert.ok(r.logged,'the pop-up must say logged');
  // Even if the user logs it from the calendar anyway (e.g. a stale pop-up), no second entry appears.
  logCal(db,alex,hoersel);assert.equal(meetings(db).length,1);
 }finally{db.close();}
});

test('Calendar first, then the invitation, its acceptance and a reminder from Gmail: still one entry',async()=>{
 const{db,alex,hoersel}=await setup();try{
  logCal(db,alex,hoersel);gmail(db,alex,hoersel);
  gmail(db,alex,hoersel,{subject:'Akzeptiert: Social-Wall Stage Vorstellung @ Mo. 30. Nov. 2026 11:00 - 11:30 (MEZ)',body:'Sabine Strebe hat diese Einladung akzeptiert.',links:[MEET]});
  gmail(db,alex,hoersel,{subject:'Erinnerung: Social-Wall Stage Vorstellung @ Mo. 30. Nov. 2026 11:00',body:'Mit Google Meet teilnehmen',links:[MEET]});
  assert.equal(meetings(db).length,1);assert.equal(meetings(db)[0].date,'2026-11-30');
 }finally{db.close();}
});

test('a calendar event without a video link and its invitation email are one meeting',async()=>{
 const{db,alex,hoersel}=await setup();try{
  logCal(db,alex,hoersel,{links:[]});
  gmail(db,alex,hoersel,{subject:'Einladung: Social-Wall Stage Vorstellung @ Mo. 30. Nov. 2026 11:00 - 11:30 (MEZ)',body:'Sabine Strebe hat Sie eingeladen.',links:[]});
  assert.equal(meetings(db).length,1);
 }finally{db.close();}
});

test('two colleagues see the same event: the second one sees it logged and cannot log it again',async()=>{
 const{db,alex,sam,hoersel}=await setup();try{
  logCal(db,alex,hoersel);
  assert.ok(act(db,sam,{action:'calendarCheck',...event(),guests:[{email:'sam@team.test',name:''},...guests]}).logged);
  act(db,sam,{action:'calendarLog',confirmed:true,requestId:randomUUID(),...event(),organisationId:hoersel,version:version(db,hoersel),contactEmails:['strebe@hoersel.test']});
  assert.equal(meetings(db).length,1);
  // Sam also saves the invitation from their own mailbox.
  gmail(db,sam,hoersel,{mailbox:'sam@team.test',id:'sam-copy'});assert.equal(meetings(db).length,1);
 }finally{db.close();}
});

test('an event moved in Google Calendar after its invitation was logged is offered as an update, not a second meeting',async()=>{
 const{db,alex,hoersel}=await setup();try{
  gmail(db,alex,hoersel);
  const r=check(db,alex,{date:'2026-12-02',time:'09:30'});
  assert.ok(r.logged,'the moved event must be recognised by its Meet link');assert.equal(r.logged.date,'2026-11-30');
  logCal(db,alex,hoersel,{date:'2026-12-02',time:'09:30'});
  assert.deepEqual(meetings(db).map(m=>m.date),['2026-12-02']);assert.match(meetings(db)[0].body,/09:30 Uhr/);
  // The box on the new day is marked, the old day has nothing left.
  assert.deepEqual(marked(db,alex,[{id:'evt1'}]),['evt1']);
 }finally{db.close();}
});

test('a repeating meeting with one Meet link stays one entry per occurrence',async()=>{
 const{db,alex,hoersel}=await setup();try{
  const week1={eventId:'series_20261130T100000Z',date:'2026-11-30',title:'Jour fixe'},week2={eventId:'series_20261207T100000Z',date:'2026-12-07',title:'Jour fixe'};
  logCal(db,alex,hoersel,week1);
  const r=check(db,alex,week2);assert.equal(r.logged,null,'next week is a different meeting');
  logCal(db,alex,hoersel,week2);
  assert.deepEqual(meetings(db).map(m=>m.date),['2026-11-30','2026-12-07']);
  assert.ok(check(db,alex,week1).logged);assert.equal(check(db,alex,week1).logged.date,'2026-11-30');
 }finally{db.close();}
});

test('a personal Zoom room used for two different client meetings never merges them',async()=>{
 const{db,alex,hoersel}=await setup();try{
  const zoom='https://zoom.us/j/4155550123';
  logCal(db,alex,hoersel,{eventId:'a1',title:'Kickoff',date:'2026-11-30',links:[zoom]});
  const r=check(db,alex,{eventId:'b1',title:'Workshop',date:'2026-12-10',time:'14:00',links:[zoom]});
  assert.equal(r.logged,null,'another day with the same personal room is another meeting');
  logCal(db,alex,hoersel,{eventId:'b1',title:'Workshop',date:'2026-12-10',time:'14:00',links:[zoom]});
  assert.equal(meetings(db).length,2);
 }finally{db.close();}
});

test('a meeting typed into the CRM or phone app is found from the calendar, and the calendar box agrees with the pop-up',async()=>{
 const{db,alex,hoersel}=await setup();try{
  manual(db,alex,hoersel,'2026-11-30','Vorstellung Social-Wall, 11:00 Uhr bei Hörsel');
  const r=check(db,alex);assert.ok(r.logged,'same organisation, day and time');
  logCal(db,alex,hoersel);assert.equal(meetings(db).length,1,'logging again must not duplicate it');
  assert.deepEqual(marked(db,alex,[{id:'evt1',title:'Social-Wall Stage Vorstellung',date:'2026-11-30',time:'11:00'}]),['evt1']);
 }finally{db.close();}
});

test('a typed meeting without a time is not claimed by two different calendar events on that day',async()=>{
 const{db,alex,hoersel}=await setup();try{
  manual(db,alex,hoersel,'2026-11-30','Termin bei Hörsel');
  const first=check(db,alex,{eventId:'m1',time:'10:00',title:'Workshop Teil 1',links:[]});
  assert.ok(first.logged);logCal(db,alex,hoersel,{eventId:'m1',time:'10:00',title:'Workshop Teil 1',links:[]});
  const second=check(db,alex,{eventId:'m2',time:'15:00',title:'Workshop Teil 2',links:[]});
  assert.equal(second.logged,null,'the typed entry already belongs to the 10:00 event');
  logCal(db,alex,hoersel,{eventId:'m2',time:'15:00',title:'Workshop Teil 2',links:[]});
  assert.equal(meetings(db).length,2);
 }finally{db.close();}
});

test('the same event cannot end up in two organisations',async()=>{
 const{db,alex,hoersel,suhl}=await setup();try{
  const both=[...guests,{email:'uwe@suhl.test',name:''}];
  const r=check(db,alex,{guests:both});assert.equal(r.organisation,null);assert.deepEqual(r.candidates.map(c=>c.name).sort(),['Hörsel GmbH','Stadthalle Suhl']);
  logCal(db,alex,hoersel,{guests:both});
  assert.equal(check(db,alex,{guests:both}).logged.organisation.id,hoersel);
  assert.throws(()=>act(db,alex,{action:'calendarLog',confirmed:true,requestId:randomUUID(),...event({guests:both}),organisationId:suhl,version:version(db,suhl),contactEmails:['uwe@suhl.test']}),/Already logged in Hörsel GmbH/);
  assert.equal(meetings(db).length,1);
 }finally{db.close();}
});

test('a cancelled meeting stays cancelled when the calendar is checked, and a renamed event keeps its entry',async()=>{
 const{db,alex,hoersel}=await setup();try{
  logCal(db,alex,hoersel);
  gmail(db,alex,hoersel,{subject:'Abgesagter Termin: Social-Wall Stage Vorstellung @ Mo. 30. Nov. 2026 11:00 - 11:30 (MEZ)',body:'Dieser Termin wurde abgesagt.',links:[MEET]});
  assert.equal(meetings(db).length,1);assert.equal(meetings(db)[0].cancelled,1);
  assert.equal(check(db,alex).logged.cancelled,true);
  const renamed=check(db,alex,{title:'Social-Wall Demo (neu)'});assert.ok(renamed.logged);
  assert.deepEqual(marked(db,alex,[{id:'evt1',title:'Social-Wall Demo (neu)',date:'2026-11-30',time:'11:00'}]),['evt1']);
 }finally{db.close();}
});

test('an organisation edited while the card is open is still logged into, without a conflict',async()=>{
 const{db,alex,hoersel}=await setup();try{
  const stale=version(db,hoersel);manual(db,alex,hoersel,'2026-10-01','Altes Treffen');
  act(db,alex,{action:'calendarLog',confirmed:true,requestId:randomUUID(),...event(),organisationId:hoersel,version:stale,contactEmails:['strebe@hoersel.test']});
  assert.equal(meetings(db,hoersel).length,2);
 }finally{db.close();}
});

test('an invitation email joins the entry at its own time, not an earlier one without a time',async()=>{
 const{db,alex,hoersel}=await setup();try{
  manual(db,alex,hoersel,'2026-11-30','Termin bei Hörsel');manual(db,alex,hoersel,'2026-11-30','Workshop, 15:00 Uhr');
  gmail(db,alex,hoersel,{subject:'Einladung: Workshop @ Mo. 30. Nov. 2026 15:00 - 16:00 (MEZ)',body:'Sabine Strebe hat Sie eingeladen.',links:[],time:'15:00'});
  assert.deepEqual(meetings(db).map(m=>m.body),['Termin bei Hörsel','Workshop, 15:00 Uhr']);
  // The email's contact is linked to the 15:00 entry, the one it is about.
  assert.deepEqual(db.prepare("SELECT a.body FROM activity_contacts ac JOIN activities a ON a.id=ac.activity_id WHERE a.kind='Meeting'").all().map(r=>r.body),['Workshop, 15:00 Uhr']);
 }finally{db.close();}
});
