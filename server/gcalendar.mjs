import {contactName} from '../src/domain.ts';
import {email} from './auth.mjs';
import {transaction,now} from './db.mjs';
import {Problem,ourAddresses,notificationSender,getOrg,contacts,createOrg,contactSave} from './crm.mjs';
import {detectMeeting,findMeeting,logMeeting,meetingText} from './meetings.mjs';
import {meetingTime} from './calendar.mjs';
// Google Calendar in the browser extension: the event pop-up says whether a meeting is in an organisation's timeline and can log it,
// and event boxes in the grid get a small mark. Calendar event ids are shared by everyone invited to the same event, so a meeting
// one colleague logged is recognised in the others' calendars too. Nothing is read from Google itself: only what the page shows.
const brief=o=>({id:o.id,name:o.name,version:String(o.version)});
const field=(v,max=1000)=>{if(typeof v!=='string'||v.length>max||v.includes('\0'))throw new Problem('Invalid field.');return v.trim();};
const DAY=/^\d{4}-\d{2}-\d{2}$/,HOUR=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const day=v=>{const d=field(v||'',10);if(d&&(!DAY.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))))throw new Problem('Check the meeting date.');return d;};
const hour=v=>{const t=field(v||'',5);if(t&&!HOUR.test(t))throw new Problem('Check the meeting time.');return t;};
export const eventId=v=>{const id=field(v||'',300);if(id&&!/^[\w.:@-]+$/.test(id))throw new Problem('Invalid calendar event.');return id;};
const titleKey=s=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
// A meeting entry reads "Zoom · 14:30 Uhr · Title": the title is what is left without the provider and the time.
const PROVIDER=/^(?:zoom|microsoft teams|google meet|webex|goto meeting|whereby|jitsi|skype)$/i;
const entryTitle=body=>titleKey(String(body||'').split('\n')[0].split(' · ').filter(p=>!/^\s*(?:[01]?\d|2[0-3])[:.][0-5]\d\s*Uhr\s*$/.test(p)&&!PROVIDER.test(p.trim())).join(' · '));
function linksIn(b){if(b.links===undefined)return[];if(!Array.isArray(b.links)||b.links.length>50)throw new Problem('Too many links.');return b.links.map(l=>field(l,4000));}
// Guests as the pop-up lists them. The user's own addresses, colleagues and notification senders are never clients.
function guestsIn(db,user,b){
 if(b.guests===undefined)return[];if(!Array.isArray(b.guests)||b.guests.length>200)throw new Problem('Too many guests.');
 const self=field(b.mailbox||'',254).toLowerCase(),ours=ourAddresses(db,user,email(self)?self:''),seen=new Map();
 for(const g of b.guests){const address=field(g?.email,254).toLowerCase();if(!email(address))throw new Problem('Check the guest addresses.');if(!seen.has(address))seen.set(address,{email:address,name:field(g.name||'',300),internal:ours.internal(address)||notificationSender(address)});}
 return[...seen.values()];
}
// The meeting as the logging code knows it: a video link gives the same key an invitation email gets, so a meeting logged from
// Gmail is found again; without a link the calendar event itself is the key. Date and time always come from the calendar.
// A Google Meet or Teams link belongs to one meeting, so the same link on another day means the meeting was moved. Not so for a
// repeating event (every occurrence shares the link; its id ends in the occurrence's start) or a personal Zoom or Webex room.
const UNIQUE_LINK=new Set(['Google Meet','Microsoft Teams']),occurrence=id=>/_\d{8}(?:T\d{6}Z?)?$/.test(id);
function calendarMeeting(b){
 const title=field(b.title||'',300)||'Meeting',id=eventId(b.eventId),date=day(b.date),time=hour(b.time);
 const found=detectMeeting({subject:title,body:'',links:linksIn(b)});
 const linked=found?.link?found:null;
 return{provider:linked?.provider||'',title,link:linked?.link||'',date,time,cancelled:false,moves:true,updated:!!linked&&UNIQUE_LINK.has(linked.provider)&&!occurrence(id),likely:true,key:linked?linked.key:('Kalender:'+(id||titleKey(title))).slice(0,500)};
}
// Entries another calendar event already stands for; a match on the day alone must not hand them to this event too.
const takenBy=(db,id)=>{const other=db.prepare('SELECT 1 FROM calendar_event_refs WHERE activity_id=? AND event_id<>? LIMIT 1');return activityId=>!!other.get(activityId,id||'');};
const refOf=(db,id)=>id?db.prepare("SELECT a.id,a.organisation_id,a.occurred_on AS date,a.body FROM calendar_event_refs r JOIN activities a ON a.id=r.activity_id WHERE r.event_id=? AND a.kind='Meeting'").get(id):null;
const remember=(db,id,activityId)=>{if(id)db.prepare('INSERT INTO calendar_event_refs VALUES(?,?,?) ON CONFLICT(event_id) DO UPDATE SET activity_id=excluded.activity_id,created_at=excluded.created_at').run(id,activityId,now());};
function loggedView(db,a){
 const names=db.prepare('SELECT c.name,(SELECT value FROM contact_addresses WHERE contact_id=c.id AND kind=\'email\' ORDER BY position LIMIT 1) AS email FROM activity_contacts ac JOIN contacts c ON c.id=ac.contact_id WHERE ac.activity_id=? ORDER BY c.name COLLATE NOCASE').all(a.id).map(c=>contactName(c.name,c.email));
 const cancelled=!!db.prepare('SELECT 1 FROM meeting_status WHERE activity_id=?').get(a.id);
 return{activityId:a.id,organisation:brief(getOrg(db,a.organisation_id)),date:a.date||'',time:meetingTime(a.body),text:a.body,contacts:names.slice(0,5),cancelled};
}
// Organisations the external guests are saved under: exact addresses only, so a shared domain never decides on its own.
function guestOrganisations(db,guests){
 const found=new Map(),by=db.prepare("SELECT DISTINCT o.id,o.name,o.version FROM organisations o JOIN organisation_contacts oc ON oc.organisation_id=o.id JOIN contact_addresses ca ON ca.contact_id=oc.contact_id WHERE ca.kind='email' AND ca.value=? COLLATE NOCASE ORDER BY o.name COLLATE NOCASE");
 for(const g of guests.filter(g=>!g.internal))for(const o of by.all(g.email)){if(!found.has(o.id))found.set(o.id,{...brief(o),guests:[]});found.get(o.id).guests.push(g.email);}
 return[...found.values()];
}
function participants(db,guests,organisationId){
 const known=organisationId?contacts(db,organisationId):[],where=db.prepare("SELECT c.name,o.id,o.name AS organisation FROM contact_addresses ca JOIN contacts c ON c.id=ca.contact_id JOIN organisation_contacts oc ON oc.contact_id=c.id JOIN organisations o ON o.id=oc.organisation_id WHERE ca.kind='email' AND ca.value=? COLLATE NOCASE ORDER BY o.name COLLATE NOCASE");
 return guests.map(g=>{const c=known.find(c=>c.e_mails.some(e=>e.toLowerCase()===g.email)),rows=g.internal?[]:where.all(g.email);
  return{email:g.email,name:contactName(c?.name&&!c.name.includes('@')?c.name:rows[0]?.name||g.name,g.email),internal:g.internal,known:!!c,contactId:c?.id,elsewhere:rows.filter(r=>r.id!==organisationId).map(r=>({id:r.id,name:r.organisation})).slice(0,3)};});
}
// The pop-up check: is this event in a timeline, and which organisation would it go to? Only a match on the event id or the
// video link is remembered for the grid marks; a match on day and time is shown but not stored, so a wrong guess never sticks.
export function calendarCheck(db,user,b){
 const meeting=calendarMeeting(b),id=eventId(b.eventId),guests=guestsIn(db,user,b);
 const ref=refOf(db,id);if(ref)return{logged:loggedView(db,ref),organisation:brief(getOrg(db,ref.organisation_id)),candidates:[],participants:participants(db,guests,ref.organisation_id),meeting:publicMeeting(meeting)};
 const candidates=guestOrganisations(db,guests),chosen=b.organisationId?brief(getOrg(db,field(b.organisationId,100))):candidates.length===1?candidates[0]:null;
 for(const o of chosen?[chosen]:candidates){
  const hit=findMeeting(db,o.id,meeting,meeting.date||null,meeting.time,takenBy(db,id));
  if(hit&&hit.match==='key'&&takenBy(db,id)(hit.id))continue;
  if(hit){if(hit.match==='key')remember(db,id,hit.id);const a=db.prepare('SELECT id,organisation_id,occurred_on AS date,body FROM activities WHERE id=?').get(hit.id);return{logged:loggedView(db,a),organisation:brief(getOrg(db,a.organisation_id)),candidates,participants:participants(db,guests,a.organisation_id),meeting:publicMeeting(meeting)};}
 }
 return{logged:null,organisation:chosen?{id:chosen.id,name:chosen.name,version:chosen.version}:null,candidates,participants:participants(db,guests,chosen?.id),meeting:publicMeeting(meeting)};
}
const publicMeeting=m=>({provider:m.provider,title:m.title,date:m.date,time:m.time,link:m.link});
// Logs (or moves) the meeting in one organisation, with the ticked guests as its contacts. A guest not yet saved there becomes a contact.
export function calendarLog(db,user,b){
 if(b.confirmed!==true)throw new Problem('Explicit confirmation required.');
 if(typeof b.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(b.requestId))throw new Problem('Invalid request ID.');
 const meeting=calendarMeeting(b),id=eventId(b.eventId),guests=guestsIn(db,user,b);if(!meeting.date)throw new Problem('Check the meeting date.');
 if(!Array.isArray(b.contactEmails)||b.contactEmails.length>100)throw new Problem('Invalid contacts.');
 const allowed=new Map(guests.filter(g=>!g.internal).map(g=>[g.email,g])),chosen=[...new Set(b.contactEmails.map(e=>field(e,254).toLowerCase()))];
 if(chosen.some(e=>!allowed.has(e)))throw new Problem('Select contacts from the event guests.');
 const receipt='calendar:'+b.requestId;
 return transaction(db,()=>{
  const prior=db.prepare('SELECT * FROM requests WHERE id=?').get(receipt);
  if(prior){if(prior.user_id!==user.id)throw new Problem('Request not found.',404);const ref=refOf(db,id);return{saved:true,duplicate:true,organisation:brief(getOrg(db,prior.organisation_id)),logged:ref?loggedView(db,ref):null};}
  let org;
  // Adding a meeting changes none of the organisation's fields, so an edit made meanwhile is no conflict (contacts check it themselves).
  if(b.organisationId)org=getOrg(db,field(b.organisationId,100));
  else{const name=field(b.newOrganisation||'',500);if(!name)throw new Problem('Select or create an organisation first.');if(db.prepare('SELECT 1 FROM organisations WHERE name=? COLLATE NOCASE').get(name))throw new Problem('This organisation already exists. Select it from the search results.');org=createOrg(db,user,name);}
  const contactIds=[];
  for(const address of chosen){
   const all=contacts(db,org.id),match=all.filter(c=>c.e_mails.some(e=>e.toLowerCase()===address));if(match.length>1)throw new Problem('Several contacts share '+address+'. Choose the contact in the CRM.');
   if(match.length){contactIds.push(match[0].id);continue;}
   const saved=contactSave(db,user,{id:org.id,version:getOrg(db,org.id).version,name:allowed.get(address).name,role:'',emails:address,phones:''});contactIds.push(saved.contactId);
  }
  // The same event logged before keeps its entry (and moves with the calendar); otherwise the usual meeting matching applies.
  const ref=refOf(db,id);let activityId;
  if(ref&&ref.organisation_id!==org.id)throw new Problem('Already logged in '+getOrg(db,ref.organisation_id).name+'. Open it there to change or delete it.',409,'calendar_logged_elsewhere');
  if(ref&&ref.organisation_id===org.id){db.prepare('UPDATE activities SET occurred_on=?,body=? WHERE id=?').run(meeting.date,meetingText(meeting),ref.id);for(const cid of contactIds)db.prepare('INSERT OR IGNORE INTO activity_contacts VALUES(?,?)').run(ref.id,cid);activityId=ref.id;}
  else activityId=logMeeting(db,user,{organisationId:org.id,meeting,date:meeting.date,time:meeting.time,messageId:null,contactIds,taken:takenBy(db,id)});
  remember(db,id,activityId);
  db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(receipt,user.id,org.id,now());
  const a=db.prepare('SELECT id,organisation_id,occurred_on AS date,body FROM activities WHERE id=?').get(activityId);
  return{saved:true,duplicate:false,organisation:brief(getOrg(db,org.id)),logged:loggedView(db,a)};
 });
}
// Grid marks: which of the listed events are in a timeline. Only ids go back, no CRM data. An event never opened in the pop-up is
// still recognised when a meeting with the same title is logged on that day at that time (as meetings logged from invitations are).
export function calendarStatus(db,user,b){
 if(!Array.isArray(b.events)||b.events.length>150)throw new Problem('Invalid events.');
 const byId=db.prepare("SELECT 1 FROM calendar_event_refs r JOIN activities a ON a.id=r.activity_id WHERE r.event_id=? AND a.kind='Meeting'"),onDay=db.prepare("SELECT body FROM activities WHERE kind='Meeting' AND occurred_on=?"),days=new Map(),logged=[];
 for(const e of b.events){
  const id=eventId(e?.id);if(!id)throw new Problem('Invalid events.');
  if(byId.get(id)){logged.push(id);continue;}
  const date=day(e.date),time=hour(e.time),title=titleKey(field(e.title||'',300));if(!date||!title)continue;
  if(!days.has(date))days.set(date,onDay.all(date).map(a=>({title:entryTitle(a.body),time:meetingTime(a.body)})));
  if(days.get(date).some(a=>a.title===title&&(!time||!a.time||a.time===time)))logged.push(id);
 }
 return{logged:[...new Set(logged)]};
}
