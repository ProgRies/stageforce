import {now,transaction,reindex} from './db.mjs';
import {Problem,getOrg,assertVersion,audit,addActivity,addContact,entity} from './crm.mjs';
import {contactName,todayBerlin} from '../src/domain.ts';
// An email is tied to its organisation by its one timeline entry (activities.message_id is unique). Moving it re-points that entry and
// what hangs off it; the email itself, who saved it and its Gmail references carry no organisation and stay as they are. No schema change.
function emailEntry(db,org,activityId){
 const a=typeof activityId==='string'&&db.prepare('SELECT a.*,m.subject,m.sent_at,m.direction,m.sender_json FROM activities a JOIN messages m ON m.id=a.message_id WHERE a.id=? AND a.organisation_id=?').get(activityId,org);
 if(!a)throw new Problem('E-Mail nicht gefunden. Bitte die Ansicht neu laden.',404,'not_found');return a;
}
const brief=a=>({activityId:a.id,subject:a.subject||a.body||'E-Mail',date:a.occurred_on,sentAt:a.sent_at,direction:a.direction});
// Other saved emails of the same Gmail conversation(s), in any mailbox that saved this email, still in this organisation.
function conversation(db,org,a){return db.prepare(`SELECT DISTINCT a.*,m.subject,m.sent_at,m.direction FROM extension_thread_refs t JOIN extension_thread_refs t2 ON t2.mailbox=t.mailbox AND t2.thread_id=t.thread_id
 JOIN activities a ON a.message_id=t2.message_id JOIN messages m ON m.id=a.message_id WHERE t.message_id=? AND a.organisation_id=? AND a.id<>? ORDER BY m.sent_at,a.id`).all(a.message_id,org,a.id);}
// A meeting logged from this email moves with it; a meeting another email created stays.
const meetingOf=(db,org,messageId)=>db.prepare('SELECT a.* FROM meeting_refs r JOIN activities a ON a.id=r.activity_id WHERE r.message_id=? AND a.organisation_id=?').get(messageId,org);
const addresses=(db,cid,kind)=>db.prepare('SELECT value FROM contact_addresses WHERE contact_id=? AND kind=? ORDER BY position,id').all(cid,kind).map(r=>r.value);
// The contact in the target with one of this contact's email addresses; contacts are never shared between organisations.
function targetContact(db,into,cid){
 for(const e of addresses(db,cid,'email')){const hit=db.prepare("SELECT c.id,c.name FROM contacts c JOIN organisation_contacts oc ON oc.contact_id=c.id JOIN contact_addresses ca ON ca.contact_id=c.id WHERE oc.organisation_id=? AND ca.kind='email' AND ca.value=? COLLATE NOCASE ORDER BY oc.is_primary DESC,c.id").get(into,e);if(hit)return hit;}
 return null;
}
function linkedContacts(db,activityIds){if(!activityIds.length)return[];return db.prepare(`SELECT DISTINCT c.id,c.name,c.role FROM activity_contacts ac JOIN contacts c ON c.id=ac.contact_id WHERE ac.activity_id IN (${activityIds.map(()=>'?').join(',')}) ORDER BY c.name COLLATE NOCASE,c.id`).all(...activityIds);}
const subjectKey=v=>String(v||'').toLowerCase().replace(/^(?:\s*(?:re|aw|antw|wg|fw|fwd)\s*(?:\[\d+\])?\s*:)+/,'').replace(/\s+/g,' ').trim();
// A separately saved copy in the target (other record, e.g. an .eml import): same sender, minute and subject. Only a warning.
function copyInTarget(db,into,a){
 const t=Date.parse(a.sent_at||'');if(!Number.isFinite(t))return false;const start=Math.floor(t/60000)*60000;let from='';try{from=String(JSON.parse(a.sender_json)[0]?.email||'').toLowerCase();}catch{}
 return db.prepare('SELECT m.subject,m.sender_json FROM messages m JOIN activities x ON x.message_id=m.id WHERE x.organisation_id=? AND m.id<>? AND m.sent_at>=? AND m.sent_at<?').all(into,a.message_id,new Date(start).toISOString(),new Date(start+60000).toISOString())
  .some(m=>{let f='';try{f=String(JSON.parse(m.sender_json)[0]?.email||'').toLowerCase();}catch{}return f===from&&subjectKey(m.subject)===subjectKey(a.subject);});
}
function selection(db,from,b){
 const a=emailEntry(db,from,b.activityId),siblings=conversation(db,from,a);
 if(b.siblingIds!==undefined&&(!Array.isArray(b.siblingIds)||b.siblingIds.length>200))throw new Problem('Ungültige Auswahl.');
 const chosen=[...new Set(b.siblingIds||[])].map(id=>{const s=siblings.find(s=>s.id===id);if(!s)throw new Problem('Die Unterhaltung hat sich geändert. Bitte die Ansicht neu laden.',409,'conflict');return s;});
 return{a,siblings,emails:[a,...chosen]};
}
function target(db,from,into){const o=getOrg(db,typeof into==='string'?into:'');if(o.id===from)throw new Problem('Bitte eine andere Organisation auswählen.');return o;}
export function emailMovePreview(db,user,b){
 const from=getOrg(db,b.id),{a,siblings}=selection(db,from.id,{activityId:b.activityId});
 const into=b.into?target(db,from.id,b.into):null,emails=[a,...siblings];
 const contacts=linkedContacts(db,[a.id]).map(c=>{const e=addresses(db,c.id,'email')[0]||'',hit=into&&targetContact(db,into.id,c.id);return{contactId:c.id,name:contactName(c.name,e),email:e,...(into?{existing:!!hit}:{})};});
 const meeting=meetingOf(db,from.id,a.message_id);
 return{email:brief(a),siblings:siblings.map(brief),contacts,meeting:meeting?{activityId:meeting.id,text:meeting.body,date:meeting.occurred_on}:null,
  calls:db.prepare('SELECT count(*) n FROM call_attempts WHERE source_message_id IN ('+emails.map(()=>'?').join(',')+') AND organisation_id=?').get(...emails.map(e=>e.message_id),from.id).n,
  ...(into?{into:{id:into.id,name:into.name},copyInTarget:copyInTarget(db,into.id,a)}:{})};
}
export function emailMove(db,user,b){return transaction(db,()=>{
 const from=getOrg(db,b.id);assertVersion(from,b.version);const into=target(db,from.id,b.into),{emails}=selection(db,from.id,b);
 const moved=[],meetings=[],created=[],mapping=new Map();
 const contactFor=cid=>{if(mapping.has(cid))return mapping.get(cid);const hit=targetContact(db,into.id,cid);let id=hit?.id;
  if(!id){const c=db.prepare('SELECT name,role FROM contacts WHERE id=?').get(cid);id=addContact(db,into.id,{name:c.name,rolle:c.role,e_mails:addresses(db,cid,'email'),telefone:addresses(db,cid,'phone')});created.push(id);}
  mapping.set(cid,id);return id;};
 const relink=activityId=>{for(const {contact_id} of db.prepare('SELECT contact_id FROM activity_contacts WHERE activity_id=?').all(activityId)){const next=contactFor(contact_id);if(next===contact_id)continue;db.prepare('INSERT OR IGNORE INTO activity_contacts VALUES(?,?)').run(activityId,next);db.prepare('DELETE FROM activity_contacts WHERE activity_id=? AND contact_id=?').run(activityId,contact_id);}};
 const move=a=>{relink(a.id);db.prepare('UPDATE activities SET organisation_id=? WHERE id=?').run(into.id,a.id);};
 for(const a of emails){
  const meeting=meetingOf(db,from.id,a.message_id);
  move(a);moved.push({activityId:a.id,messageId:a.message_id,date:a.occurred_on,contact:!!a.is_contact});
  if(meeting){move(meeting);meetings.push({activityId:meeting.id,date:meeting.occurred_on,contact:!!meeting.is_contact});}
 }
 // "Letzter Kontakt": the old organisation falls back to its newest remaining contact entry when a moved entry had set it (as when a
 // note is deleted); the new one takes the moved date when it is newer.
 const dates=[...moved,...meetings].filter(x=>x.contact&&x.date).map(x=>x.date).sort();
 if(dates.length){
  if(from.last_contact&&dates.includes(from.last_contact)){const latest=db.prepare('SELECT MAX(occurred_on) AS d FROM activities WHERE organisation_id=? AND is_contact=1').get(from.id).d||null;db.prepare('UPDATE organisations SET last_contact=? WHERE id=?').run(latest,from.id);}
  const newest=dates.at(-1);db.prepare('UPDATE organisations SET last_contact=CASE WHEN last_contact IS NULL OR last_contact<? THEN ? ELSE last_contact END WHERE id=?').run(newest,newest,into.id);
 }
 // Contacts of the old organisation that no longer have any entry there are only named, never removed.
 const unused=[...mapping.keys()].filter(cid=>!db.prepare('SELECT 1 FROM activity_contacts ac JOIN activities a ON a.id=ac.activity_id WHERE ac.contact_id=? AND a.organisation_id=? UNION SELECT 1 FROM call_attempts WHERE contact_id=? AND organisation_id=?').get(cid,from.id,cid,from.id)&&db.prepare('SELECT 1 FROM organisation_contacts WHERE contact_id=? AND organisation_id=?').get(cid,from.id))
  .map(cid=>{const c=db.prepare('SELECT name FROM contacts WHERE id=?').get(cid);return contactName(c.name,addresses(db,cid,'email')[0]);});
 const record={from:{id:from.id,name:from.name},into:{id:into.id,name:into.name},emails:moved.map(({activityId,messageId})=>({activityId,messageId})),meetings:meetings.map(m=>m.activityId),contacts:Object.fromEntries(mapping),createdContacts:created,lastContact:{from:from.last_contact,into:into.last_contact}};
 audit(db,from.id,user,'email_move',record);audit(db,into.id,user,'email_move',record);
 const what=moved.length===1?`E-Mail „${emails[0].subject||'ohne Betreff'}“`:`${moved.length} E-Mails einer Unterhaltung`;
 addActivity(db,from.id,user,{type:'CRM-Änderung',text:`${what} verschoben nach „${into.name}“`,date:todayBerlin()});
 addActivity(db,into.id,user,{type:'CRM-Änderung',text:`${what} übernommen von „${from.name}“`,date:todayBerlin()});
 for(const id of [from.id,into.id]){db.prepare('UPDATE organisations SET version=version+1,updated_at=? WHERE id=?').run(now(),id);reindex(db,id);}
 return{entity:entity(db,from.id,true),into:{id:into.id,name:into.name},moved:[...moved.map(m=>m.activityId),...meetings.map(m=>m.activityId)],createdContacts:created.length,unusedContacts:unused};
});}
