import {uid,now,transaction,reindex} from './db.mjs';
import {formatPhone,CALL_OUTCOMES,BOOKING_URL,addDays,validDate,todayBerlin} from '../src/domain.ts';
import {claimOnCall} from './leads.mjs';
import {Problem,getOrg,contacts,createOrg,addContact,audit,addActivity,assertVersion} from './crm.mjs';
const field=(v,max=1000)=>{if(typeof v!=='string'||v.length>max||v.includes('\0'))throw new Problem('Invalid field.');return v.trim();};
export const dialNumber=value=>{const s=formatPhone(field(value,100)).replace(/[^+\d]/g,'');if(!/^\+?\d{6,15}$/.test(s))throw new Problem('Check the phone number.');return s;};
export function mergePhones(db,user,orgId,contact,phones){
 if(!Array.isArray(phones)||phones.length>10)throw new Problem('Check phone numbers.');
 let changed=false;
 for(const raw of phones){const number=dialNumber(raw);if(contact.telefone.some(p=>{try{return dialNumber(p)===number;}catch{return false;}}))continue;
 db.prepare("INSERT OR IGNORE INTO contact_addresses VALUES(?,?,'phone',?,?)").run(uid(),contact.id,formatPhone(field(raw,100)),contact.telefone.length);contact.telefone.push(formatPhone(raw));changed=true;}
 if(changed){audit(db,orgId,user,'contact_phone',{contactId:contact.id,phones});for(const row of db.prepare('SELECT organisation_id FROM organisation_contacts WHERE contact_id=?').all(contact.id)){db.prepare('UPDATE organisations SET version=version+1,updated_at=? WHERE id=?').run(now(),row.organisation_id);reindex(db,row.organisation_id);}}
}
export function prepareCall(db,user,b,{participant=null}={}){
 const requestId=field(b.requestId,36);if(!/^[a-f0-9-]{36}$/.test(requestId))throw new Problem('Invalid request ID.');
 return transaction(db,()=>{
 const prior=db.prepare('SELECT * FROM call_attempts WHERE id=?').get(requestId);if(prior){if(prior.user_id!==user.id)throw new Problem('Call not found.',404);return callView(db,prior);}
 // One call at a time. An older open call without a note was left behind (a closed tab, an unanswered dial) and gives way;
 // one with a note is kept, and its card is shown instead.
 const open=openAttempt(db,user);if(open){if((db.prepare('SELECT notes FROM call_drafts WHERE call_id=?').get(open.id)?.notes||'').trim())throw new Problem('Another call with a note is still open. Save or discard it first.',409);db.prepare('DELETE FROM call_attempts WHERE id=?').run(open.id);}
 const phone=field(b.phone,100),dial=dialNumber(phone),startedAt=field(b.startedAt,50);
 if(!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(startedAt)||!Number.isFinite(Date.parse(startedAt))||Date.parse(startedAt)>Date.now()+300000)throw new Problem('Check call time.');
 let id=b.organisationId;
 if(!id){if(!participant||!b.newOrganisation)throw new Problem('Select or create an organisation before calling.');const name=field(b.newOrganisation,500);if(!name)throw new Problem('Organisation name required.');id=db.prepare('SELECT id FROM organisations WHERE name=? COLLATE NOCASE').get(name)?.id||createOrg(db,user,name).id;}
 else {getOrg(db,id);if(participant)assertVersion(getOrg(db,id),b.version);}
 let contact=contacts(db,id).find(c=>c.id===b.contactId);
 if(participant){const matches=contacts(db,id).filter(c=>c.e_mails.some(e=>e.toLowerCase()===participant.email));if(matches.length>1)throw new Problem('Several contacts share this address. Resolve this in the CRM first.');contact=matches[0];if(!contact){const cid=addContact(db,id,{name:participant.name,e_mails:[participant.email]});contact=contacts(db,id).find(c=>c.id===cid);audit(db,id,user,'contact_create',{contactId:cid,via:'call'});}mergePhones(db,user,id,contact,[phone]);}
 if(!contact||!contact.telefone.some(p=>{try{return dialNumber(p)===dial;}catch{return false;}}))throw new Problem('Save this contact and phone number under the organisation before calling.');
 const source=b.messageId||null;if(source&&!db.prepare('SELECT 1 FROM activities WHERE message_id=? AND organisation_id=?').get(source,id))throw new Problem('Email does not belong to this organisation.');
 const row={id:requestId,user_id:user.id,organisation_id:id,contact_id:contact.id,phone,started_at:new Date(startedAt).toISOString(),source_message_id:source};
 db.prepare('INSERT INTO call_attempts VALUES(?,?,?,?,?,?,?,NULL)').run(row.id,row.user_id,id,contact.id,phone,row.started_at,source);reindex(db,id);return callView(db,row);
 });
}
// Everything the call card needs to show or resume a call, including the result buttons, so the CRM and the extension render the same card.
const OUTCOMES=Object.entries(CALL_OUTCOMES).map(([key,o])=>({key,label:o.label,next:o.next}));
function callView(db,r){const o=getOrg(db,r.organisation_id);return{callId:r.id,organisation:{id:o.id,name:o.name,version:String(o.version)},contact:contacts(db,o.id).find(c=>c.id===r.contact_id),phone:r.phone,dial:dialNumber(r.phone),startedAt:r.started_at,notes:db.prepare('SELECT notes FROM call_drafts WHERE call_id=?').get(r.id)?.notes||'',outcomes:OUTCOMES,bookingUrl:BOOKING_URL};}
// An unsaved call from the last twelve hours is still open; older attempts were abandoned and are left alone.
const openAttempt=(db,user)=>db.prepare('SELECT * FROM call_attempts WHERE user_id=? AND activity_id IS NULL AND started_at>? ORDER BY started_at DESC LIMIT 1').get(user.id,new Date(Date.now()-12*3600000).toISOString());
export function openCall(db,user){const row=openAttempt(db,user);return{call:row?callView(db,row):null};}
// The note is kept while the call runs, so a closed tab or window loses nothing and another surface can resume it.
export function draftCall(db,user,b){
 const call=db.prepare('SELECT * FROM call_attempts WHERE id=? AND user_id=?').get(field(b.callId,36),user.id);if(!call)throw new Problem('Call not found.',404);if(call.activity_id)return{saved:false,closed:true};
 db.prepare('INSERT INTO call_drafts VALUES(?,?,?) ON CONFLICT(call_id) DO UPDATE SET notes=excluded.notes,updated_at=excluded.updated_at').run(call.id,field(b.notes,12000),now());return{saved:true};
}
export function saveCall(db,user,b){return transaction(db,()=>{
 const call=db.prepare('SELECT * FROM call_attempts WHERE id=? AND user_id=?').get(field(b.callId,36),user.id);if(!call)throw new Problem('Call not found.',404);if(call.activity_id)return{saved:true,duplicate:true,organisation:{id:call.organisation_id,version:String(getOrg(db,call.organisation_id).version)}};
 const note=field(b.notes||'',12000),date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(call.started_at));
 if(b.outcome!=null&&!Object.hasOwn(CALL_OUTCOMES,b.outcome))throw new Problem('Unknown call result.');const outcome=b.outcome==null?null:CALL_OUTCOMES[b.outcome];
 let due=null;if(outcome){due=b.outcome==='callback'&&b.callbackDate?field(b.callbackDate,10):addDays(todayBerlin(),outcome.days);if(!validDate(due)||due<todayBerlin())throw new Problem('Check the call-back date.');}
 const aid=addActivity(db,call.organisation_id,user,{type:outcome?'Anruf · '+outcome.label:'Anruf gestartet',text:note||(outcome?outcome.label:'Anruf gestartet · keine Notiz'),date,contacted:!!outcome?.contacted});
 if(outcome)applyOutcome(db,user,call.organisation_id,outcome,due);
 db.prepare('INSERT INTO activity_contacts VALUES(?,?)').run(aid,call.contact_id);db.prepare('UPDATE call_attempts SET activity_id=? WHERE id=?').run(aid,call.id);db.prepare('DELETE FROM call_drafts WHERE call_id=?').run(call.id);
 audit(db,call.organisation_id,user,'call',{activityId:aid,outcome:b.outcome??null,due,contactId:call.contact_id,phone:call.phone,startedAt:call.started_at,sourceMessageId:call.source_message_id});
 claimOnCall(db,user,call.organisation_id);
 db.prepare('UPDATE organisations SET version=version+1,updated_at=? WHERE id=?').run(now(),call.organisation_id);reindex(db,call.organisation_id);return{saved:true,organisation:{id:call.organisation_id,version:String(getOrg(db,call.organisation_id).version)}};
 });}
// The open follow-up always holds the next call; a phase change or a handoff to Prüfen comes with some results.
function applyOutcome(db,user,id,outcome,due){
 const open=db.prepare('SELECT id FROM followups WHERE organisation_id=? AND completed_at IS NULL').get(id);
 if(open)db.prepare('UPDATE followups SET text=?,due_date=?,owner=? WHERE id=?').run(outcome.next,due,user.id,open.id);
 else db.prepare('INSERT INTO followups VALUES(?,?,?,?,?,NULL)').run(uid(),id,outcome.next,due,user.id);
 if(outcome.phase)db.prepare('UPDATE organisations SET phase=? WHERE id=?').run(outcome.phase,id);
 if(outcome.review&&!db.prepare('SELECT 1 FROM review_issues WHERE organisation_id=? AND resolved_at IS NULL AND text=?').get(id,outcome.review))db.prepare('INSERT INTO review_issues VALUES(?,?,?,NULL)').run(uid(),id,outcome.review);
}
export function cancelCall(db,user,b){const call=db.prepare('SELECT * FROM call_attempts WHERE id=?').get(field(b.callId,36));if(!call)return{cancelled:true};if(call.user_id!==user.id)throw new Problem('Call not found.',404);if(call.activity_id)throw new Problem('This call has already been saved.');db.prepare('DELETE FROM call_attempts WHERE id=? AND activity_id IS NULL').run(call.id);return{cancelled:true};}
