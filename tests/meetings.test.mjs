import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {history} from '../server/crm.mjs';
import {extensionAction} from '../server/extension.mjs';
import {detectMeeting,meetingDate} from '../server/meetings.mjs';
const origin='http://localhost:3000';
const msg={mailbox:'alex@team.test',from:{name:'Pat',email:'pat@customer.test'},recipients:[{email:'alex@team.test',name:'Alex'}],timestamp:'2026-10-13T10:07:00Z',timestampRaw:'13.10.2026, 12:07',direction:'incoming',sourceUrl:'https://mail.google.com/mail/u/0/#inbox/example',contactEmails:['pat@customer.test']};
async function setup(){const db=openDB(':memory:');const id=await addUser(db,msg.mailbox,'Alex','long-password-1234');return{db,user:db.prepare('SELECT * FROM users WHERE id=?').get(id)};}
const save=(db,user,b)=>extensionAction(db,user,{...msg,action:'save',confirmed:true,requestId:randomUUID(),subject:b.originalSubject,body:b.originalBody,...b},origin);

test('detects the common video-call invitations with their date and time',()=>{
 const google=detectMeeting({subject:'Einladung: Projekt-Kickoff @ Di. 27. Okt. 2026 10:00 - 11:00 (MEZ) (alex@team.test)',body:'Mit Google Meet teilnehmen\nmeet.google.com/abc-defg-hij',links:['https://meet.google.com/abc-defg-hij?hs=224']});
 assert.deepEqual([google.provider,google.title,google.date,google.time,google.key,google.likely],['Google Meet','Projekt-Kickoff','2026-10-27','10:00','Google Meet:abc-defg-hij',true]);
 const english=detectMeeting({subject:'Invitation: Demo @ Tue Oct 27, 2026 2pm - 3pm (CET) (alex@team.test)',body:'Join with Google Meet'});
 assert.deepEqual([english.provider,english.title,english.date,english.time],['Google Meet','Demo','2026-10-27','14:00']);
 const teams=detectMeeting({subject:'Abstimmung Angebot',body:'Microsoft Teams-Besprechung\nJetzt an der Besprechung teilnehmen\nBesprechungs-ID: 312 445 112\nWann: Mittwoch, 4. November 2026 09:30-10:00 (UTC+01:00) Amsterdam, Berlin',links:['https://teams.microsoft.com/l/meetup-join/19%3ameeting_NzQ1YjE2%40thread.v2/0?context=%7b%7d']});
 assert.deepEqual([teams.provider,teams.date,teams.time,teams.key],['Microsoft Teams','2026-11-04','09:30','Microsoft Teams:meeting_NzQ1YjE2']);
 const zoom=detectMeeting({subject:'Zoom meeting invitation - Workshop',body:'Topic: Workshop\nTime: Nov 12, 2026 03:00 PM Amsterdam, Berlin\nJoin Zoom Meeting\nhttps://us02web.zoom.us/j/81234567890?pwd=abc123'});
 assert.deepEqual([zoom.provider,zoom.date,zoom.time,zoom.key],['Zoom','2026-11-12','15:00','Zoom:81234567890']);
 const webex=detectMeeting({subject:'Webex meeting invitation: Quartalsgespräch',body:'Datum: 18.11.2026 14:00 Uhr\nhttps://acme.webex.com/acme/j.php?MTID=m5f2c1a'});
 assert.deepEqual([webex.provider,webex.date,webex.time,webex.key],['Webex','2026-11-18','14:00','Webex:m5f2c1a']);
 assert.equal(meetingDate('Monday, October 27, 2026 10:00 AM-11:00 AM').time,'10:00');
 assert.equal(meetingDate('31.02.2026'),null);
});
test('ordinary emails, invitation replies and loose mentions are told apart',()=>{
 assert.equal(detectMeeting({subject:'Angebot',body:'Anbei das Angebot.'}),null);
 assert.equal(detectMeeting({subject:'Abgelehnt: Projekt-Kickoff',body:'https://meet.google.com/abc-defg-hij'}),null);
 const loose=detectMeeting({subject:'Re: Angebot',body:'Sollen wir kurz per Google Meet sprechen?'});
 assert.equal(loose.likely,false);assert.equal(loose.date,'');
 assert.equal(detectMeeting({subject:'Abgesagt: Projekt-Kickoff',body:'https://meet.google.com/abc-defg-hij'}).cancelled,true);
});
test('calendar and booking confirmations without a video link are offered as meetings',()=>{
 const accepted=detectMeeting({subject:'Akzeptiert: Kickoff @ Di. 27. Okt. 2026 10:00 - 11:00 (MEZ) (pat@customer.test)',body:'Pat hat diese Einladung angenommen.'});
 assert.deepEqual([accepted.provider,accepted.title,accepted.date,accepted.time,accepted.likely],['','Kickoff','2026-10-27','10:00',true]);
 const calendly=detectMeeting({subject:'New Event: Pat Doe - 30 Minute Meeting',body:'Event Type: 30 Minute Meeting\nDate: Nov 3, 2026 02:00 PM (Central European Time)\nPowered by Calendly'});
 assert.deepEqual([calendly.date,calendly.time,calendly.likely],['2026-11-03','14:00',true]);
 const german=detectMeeting({subject:'Terminbestätigung: Beratungsgespräch',body:'Ihr Termin am 05.11.2026 um 15:30 Uhr ist bestätigt.\nAdresse: Hauptstraße 1, Berlin'});
 assert.deepEqual([german.title,german.date,german.time,german.likely],['Beratungsgespräch','2026-11-05','15:30',true]);
 assert.equal(detectMeeting({subject:'Projekt',body:'Siehe Anhang',attachments:['invite.ics']}).likely,true);
 assert.equal(detectMeeting({subject:'Abgelehnt: Kickoff',body:''}),null);
 assert.equal(detectMeeting({subject:'Re: Angebot',body:'Passt gut.\n\nGruß Pat\nTermin buchen: calendly.com/pat'}),null);
 assert.equal(detectMeeting({subject:'Rechnung 2026-11',body:'Fällig am 05.11.2026'}),null);
});
test('saving an invitation logs one meeting that later invitations move or cancel',async()=>{
 const{db,user}=await setup();try{
  const invite={originalSubject:'Einladung: Kickoff @ Di. 27. Okt. 2026 10:00 - 11:00 (MEZ)',originalBody:'Mit Google Meet teilnehmen',links:['https://meet.google.com/abc-defg-hij']};
  assert.deepEqual(extensionAction(db,user,{action:'meeting',...invite,timestamp:msg.timestamp},origin).meeting,{provider:'Google Meet',title:'Kickoff',date:'2026-10-27',time:'10:00',likely:true,cancelled:false,logged:null});
  const r=save(db,user,{...invite,newOrganisation:'Customer',meeting:{log:true,date:'2026-10-27'}}),id=r.organisation.id;
  const meeting=()=>db.prepare("SELECT * FROM activities WHERE kind='Meeting'").all();
  assert.equal(meeting().length,1);assert.equal(meeting()[0].occurred_on,'2026-10-27');assert.equal(meeting()[0].body,'Google Meet · 10:00 Uhr · Kickoff');
  assert.equal(db.prepare("SELECT count(*) n FROM activity_contacts ac JOIN activities a ON a.id=ac.activity_id WHERE a.kind='Meeting'").get().n,1);
  assert.equal(db.prepare('SELECT last_contact FROM organisations WHERE id=?').get(id).last_contact,'2026-10-13');
  const version=()=>db.prepare('SELECT version FROM organisations WHERE id=?').get(id).version;
  save(db,user,{originalSubject:'Aktualisierte Einladung: Kickoff @ Do. 29. Okt. 2026 11:00 - 12:00 (MEZ)',originalBody:'Mit Google Meet teilnehmen',links:invite.links,organisationId:id,version:version(),timestamp:'2026-10-14T10:07:00Z',meeting:{log:true,date:'2026-10-29',time:'11:00'}});
  assert.equal(meeting().length,1);assert.equal(meeting()[0].occurred_on,'2026-10-29');assert.equal(meeting()[0].body,'Google Meet · 11:00 Uhr · Kickoff');
  save(db,user,{originalSubject:'Abgesagter Termin: Kickoff @ Do. 29. Okt. 2026 11:00 - 12:00 (MEZ)',originalBody:'',links:invite.links,organisationId:id,version:version(),timestamp:'2026-10-15T10:07:00Z',meeting:{log:true}});
  assert.equal(meeting().length,1);assert.equal(meeting()[0].body,'Google Meet · 11:00 Uhr · Kickoff');assert.equal(db.prepare('SELECT count(*) n FROM meeting_status').get().n,1);
  assert.ok(history(db,id,0,'communication').items.some(i=>i.art==='Meeting'));
  save(db,user,{originalSubject:'Angebot',originalBody:'Per Google Meet?',organisationId:id,version:version(),timestamp:'2026-10-16T10:07:00Z'});
  assert.equal(meeting().length,1);
  save(db,user,{originalSubject:'Re: Kurzer Austausch',originalBody:'Danke für das Gespräch heute.',organisationId:id,version:version(),timestamp:'2026-10-16T11:07:00Z',meeting:{log:true,date:'2026-10-16',time:'09:00'}});
  save(db,user,{originalSubject:'Re: Kurzer Austausch',originalBody:'Noch eine Frage.',organisationId:id,version:version(),timestamp:'2026-10-16T11:37:00Z',meeting:{log:true,date:'2026-10-16'}});
  const manual=meeting().filter(m=>m.body.includes('Kurzer Austausch'));
  assert.equal(manual.length,1,'a second ticked email about the same day joins that meeting');assert.equal(manual[0].body,'09:00 Uhr · Kurzer Austausch');
  assert.equal(db.prepare('SELECT last_contact FROM organisations WHERE id=?').get(id).last_contact,'2026-10-16');
  assert.throws(()=>save(db,user,{...invite,originalSubject:'Einladung: Zwei',organisationId:id,version:version(),timestamp:'2026-10-16T12:07:00Z',meeting:{log:true,date:'27.10.2026'}}),/meeting date/);
 }finally{db.close();}
});
test('invite, acceptance, reminder and booking confirmation of one meeting stay one entry',async()=>{
 const{db,user}=await setup();try{
  const r=save(db,user,{originalSubject:'Einladung: Kickoff @ Di. 27. Okt. 2026 10:00 - 11:00 (MEZ)',originalBody:'Mit Google Meet teilnehmen',links:['https://meet.google.com/abc-defg-hij'],newOrganisation:'Customer',meeting:{log:true}}),id=r.organisation.id;
  const version=()=>db.prepare('SELECT version FROM organisations WHERE id=?').get(id).version,meetings=()=>db.prepare("SELECT * FROM activities WHERE kind='Meeting'").all();
  const ask=b=>extensionAction(db,user,{action:'meeting',timestamp:msg.timestamp,organisationId:id,...b},origin).meeting.logged;
  const accepted={originalSubject:'Akzeptiert: Kickoff @ Di. 27. Okt. 2026 10:00 - 11:00 (MEZ)',originalBody:'Pat hat angenommen.'};
  assert.deepEqual(ask(accepted),{date:'2026-10-27',text:'Google Meet · 10:00 Uhr · Kickoff',update:false});
  save(db,user,{...accepted,organisationId:id,version:version(),timestamp:'2026-10-14T10:07:00Z',meeting:{log:true}});
  save(db,user,{originalSubject:'Erinnerung: Kickoff @ Di. 27. Okt. 2026 10:00 - 11:00 (MEZ)',originalBody:'Mit Google Meet teilnehmen',links:['https://meet.google.com/abc-defg-hij'],organisationId:id,version:version(),timestamp:'2026-10-15T10:07:00Z',meeting:{log:true}});
  save(db,user,{originalSubject:'Terminbestätigung: Kickoff',originalBody:'Ihr Termin am 27.10.2026 um 10:00 Uhr ist bestätigt.',organisationId:id,version:version(),timestamp:'2026-10-16T10:07:00Z',meeting:{log:true}});
  assert.equal(meetings().length,1);assert.equal(meetings()[0].body,'Google Meet · 10:00 Uhr · Kickoff');
  assert.equal(ask({originalSubject:'Aktualisierte Einladung: Kickoff @ Do. 29. Okt. 2026 10:00 - 11:00 (MEZ)',originalBody:'',links:['https://meet.google.com/abc-defg-hij']}).update,true);
  save(db,user,{originalSubject:'Terminbestätigung: Workshop',originalBody:'Ihr Termin am 27.10.2026 um 15:00 Uhr ist bestätigt.',organisationId:id,version:version(),timestamp:'2026-10-16T11:07:00Z',meeting:{log:true}});
  assert.equal(meetings().length,2,'a second meeting the same day at another time stays separate');
  assert.equal(ask({originalSubject:'Neuer Termin: Nächste Woche',originalBody:'Datum: 05.11.2026 09:00'}),null);
 }finally{db.close();}
});
