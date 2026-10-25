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
 assert.equal(detectMeeting({subject:'Akzeptiert: Projekt-Kickoff',body:'https://meet.google.com/abc-defg-hij'}),null);
 const loose=detectMeeting({subject:'Re: Angebot',body:'Sollen wir kurz per Google Meet sprechen?'});
 assert.equal(loose.likely,false);assert.equal(loose.date,'');
 assert.equal(detectMeeting({subject:'Abgesagt: Projekt-Kickoff',body:'https://meet.google.com/abc-defg-hij'}).cancelled,true);
});
test('saving an invitation logs one meeting that later invitations move or cancel',async()=>{
 const{db,user}=await setup();try{
  const invite={originalSubject:'Einladung: Kickoff @ Di. 27. Okt. 2026 10:00 - 11:00 (MEZ)',originalBody:'Mit Google Meet teilnehmen',links:['https://meet.google.com/abc-defg-hij']};
  assert.deepEqual(extensionAction(db,user,{action:'meeting',...invite,timestamp:msg.timestamp},origin).meeting,{provider:'Google Meet',title:'Kickoff',date:'2026-10-27',time:'10:00',likely:true,cancelled:false});
  const r=save(db,user,{...invite,newOrganisation:'Customer',meeting:{log:true,date:'2026-10-27'}}),id=r.organisation.id;
  const meeting=()=>db.prepare("SELECT * FROM activities WHERE kind='Meeting'").all();
  assert.equal(meeting().length,1);assert.equal(meeting()[0].occurred_on,'2026-10-27');assert.equal(meeting()[0].body,'Google Meet · 10:00 Uhr · Kickoff');
  assert.equal(db.prepare("SELECT count(*) n FROM activity_contacts ac JOIN activities a ON a.id=ac.activity_id WHERE a.kind='Meeting'").get().n,1);
  assert.equal(db.prepare('SELECT last_contact FROM organisations WHERE id=?').get(id).last_contact,'2026-10-13');
  const version=()=>db.prepare('SELECT version FROM organisations WHERE id=?').get(id).version;
  save(db,user,{originalSubject:'Aktualisierte Einladung: Kickoff @ Do. 29. Okt. 2026 11:00 - 12:00 (MEZ)',originalBody:'Mit Google Meet teilnehmen',links:invite.links,organisationId:id,version:version(),timestamp:'2026-10-14T10:07:00Z',meeting:{log:true,date:'2026-10-29',time:'11:00'}});
  assert.equal(meeting().length,1);assert.equal(meeting()[0].occurred_on,'2026-10-29');assert.equal(meeting()[0].body,'Google Meet · 11:00 Uhr · Kickoff');
  save(db,user,{originalSubject:'Abgesagter Termin: Kickoff @ Do. 29. Okt. 2026 11:00 - 12:00 (MEZ)',originalBody:'',links:invite.links,organisationId:id,version:version(),timestamp:'2026-10-15T10:07:00Z',meeting:{log:true}});
  assert.equal(meeting().length,1);assert.match(meeting()[0].body,/^Abgesagt · /);
  assert.ok(history(db,id,0,'communication').items.some(i=>i.art==='Meeting'));
  save(db,user,{originalSubject:'Angebot',originalBody:'Per Google Meet?',organisationId:id,version:version(),timestamp:'2026-10-16T10:07:00Z'});
  assert.equal(meeting().length,1);
  assert.throws(()=>save(db,user,{originalSubject:'Angebot 2',originalBody:'Anbei',organisationId:id,version:version(),timestamp:'2026-10-16T11:07:00Z',meeting:{log:true}}),/No meeting/);
  assert.throws(()=>save(db,user,{...invite,originalSubject:'Einladung: Zwei',organisationId:id,version:version(),timestamp:'2026-10-16T12:07:00Z',meeting:{log:true,date:'27.10.2026'}}),/meeting date/);
 }finally{db.close();}
});
