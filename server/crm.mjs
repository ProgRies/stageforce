import {uid,now,transaction,reindex} from './db.mjs';
import {email} from './auth.mjs';
import {contactName,STATUSES,PHASES,TYPES,HEADERS,validDate,todayBerlin,fastbillURL,websiteURL} from '../src/domain.ts';
export class Problem extends Error{constructor(message,status=400,code='invalid'){super(message);this.http=status;this.code=code;}}
const cols={1:'name',2:'type',3:'fastbill_url',4:'city',5:'state',6:'website',7:'size',8:'size_unit',9:'status',10:'phase',11:'owner',15:'last_contact',18:'summary'};
export const getOrg=(db,id)=>{const o=db.prepare('SELECT * FROM organisations WHERE id=?').get(id);if(!o)throw new Problem('Organisation nicht gefunden.',404,'not_found');return o;};
export function assertVersion(o,v){if(String(o.version)!==String(v))throw new Problem('Dieser Eintrag wurde inzwischen geändert. Bitte prüfen und erneut speichern.',409,'conflict');}
export function audit(db,id,user,action,changes){db.prepare('INSERT INTO audit_log VALUES(?,?,?,?,?,?)').run(uid(),id,user?.id||null,now(),action,JSON.stringify(changes));}
export function contacts(db,id){return db.prepare(`SELECT c.*,oc.is_primary FROM contacts c
 JOIN organisation_contacts oc ON oc.contact_id=c.id
 LEFT JOIN (SELECT ac.contact_id,MAX(COALESCE(ca.started_at,m.sent_at,a.occurred_on||'T00:00:00.000Z',a.created_at)) AS latest
 FROM activity_contacts ac JOIN activities a ON a.id=ac.activity_id
 LEFT JOIN messages m ON m.id=a.message_id LEFT JOIN call_attempts ca ON ca.activity_id=a.id
 WHERE a.organisation_id=? AND (a.message_id IS NOT NULL OR ca.activity_id IS NOT NULL)
 GROUP BY ac.contact_id) recent ON recent.contact_id=c.id
 WHERE oc.organisation_id=? ORDER BY recent.latest DESC,c.name COLLATE NOCASE,c.id`).all(id,id).map(c=>{const addresses=db.prepare('SELECT kind,value FROM contact_addresses WHERE contact_id=? ORDER BY position,id').all(c.id);return{id:c.id,name:c.name,rolle:c.role,primary:!!c.is_primary,e_mails:addresses.filter(a=>a.kind==='email').map(a=>a.value),telefone:addresses.filter(a=>a.kind==='phone').map(a=>a.value)};});}
export function entity(db,id,full=false){const o=getOrg(db,id);const cs=contacts(db,id),primary=cs.find(c=>c.primary);const f=db.prepare('SELECT * FROM followups WHERE organisation_id=? AND completed_at IS NULL').get(id);const review=db.prepare('SELECT text FROM review_issues WHERE organisation_id=? AND resolved_at IS NULL').all(id).map(r=>r.text).join('\n');
 const values=[o.id,o.name,o.type,o.fastbill_url,o.city,o.state,o.website,o.size??'',o.size_unit,o.status,o.phase,o.owner,primary?.name||'',primary?.e_mails[0]||'',primary?.telefone[0]||cs.flatMap(c=>c.telefone)[0]||'',o.last_contact||'',f?.text||'',f?.due_date||'',o.summary,review,full?JSON.stringify(cs):'[]','[]','[]','[]'];
 if(full){values[23]=JSON.stringify(db.prepare('SELECT payload_json FROM source_references WHERE organisation_id=? AND activity_id IS NULL AND contact_id IS NULL').all(id).map(s=>JSON.parse(s.payload_json)));}
 return{id:o.id,row:0,values,version:String(o.version)};
}
export function listData(db){
 const addresses=new Map(),validPhones=new Map();for(const a of db.prepare('SELECT contact_id,kind,value FROM contact_addresses ORDER BY position,id').all()){const key=a.contact_id+':'+a.kind;if(!addresses.has(key))addresses.set(key,a.value);if(a.kind==='phone'&&a.value.replace(/\D/g,'').length>=6&&!validPhones.has(a.contact_id))validPhones.set(a.contact_id,a.value);}
 const primary=new Map(),fallback=new Map();for(const c of db.prepare('SELECT oc.organisation_id,oc.is_primary,c.id,c.name FROM organisation_contacts oc JOIN contacts c ON c.id=oc.contact_id ORDER BY oc.is_primary DESC,c.name,c.id').all()){const phone=addresses.get(c.id+':phone')||'',callable=validPhones.get(c.id);if(!fallback.has(c.organisation_id)&&callable)fallback.set(c.organisation_id,callable);if(c.is_primary)primary.set(c.organisation_id,{name:c.name,email:addresses.get(c.id+':email')||'',phone});}
 const followups=new Map(db.prepare('SELECT * FROM followups WHERE completed_at IS NULL').all().map(f=>[f.organisation_id,f]));const reviews=new Map();for(const r of db.prepare('SELECT organisation_id,text FROM review_issues WHERE resolved_at IS NULL').all())reviews.set(r.organisation_id,[reviews.get(r.organisation_id),r.text].filter(Boolean).join('\n'));
 const entities=db.prepare('SELECT * FROM organisations ORDER BY name COLLATE NOCASE').all().map(o=>{const c=primary.get(o.id),f=followups.get(o.id);return{id:o.id,row:0,version:String(o.version),values:[o.id,o.name,o.type,o.fastbill_url,o.city,o.state,o.website,o.size??'',o.size_unit,o.status,o.phase,o.owner,c?.name||'',c?.email||'',(c?.phone?.replace(/\D/g,'').length>=6?c.phone:fallback.get(o.id)||c?.phone||''),o.last_contact||'',f?.text||'',f?.due_date||'',o.summary,reviews.get(o.id)||'','[]','[]','[]','[]']};});
 return{entities,links:db.prepare('SELECT * FROM organisation_links').all(),loadedAt:now()};
}
const communicationSQL="(a.message_id IS NOT NULL OR a.kind='Kontakt' OR a.kind='Notiz' OR lower(a.kind) LIKE '%mail%' OR lower(a.kind) LIKE '%telefon%' OR lower(a.kind) LIKE '%anruf%' OR lower(a.kind) LIKE '%phone%' OR lower(a.kind) LIKE '%call%')";
const historyOrder="a.occurred_on DESC, COALESCE(m.sent_at, ca.started_at, CASE WHEN a.kind='Notiz' THEN a.created_at ELSE '' END) DESC, a.created_at DESC, a.rowid DESC";
const historyItem=a=>({ereignis_id:a.id,datum:a.occurred_on,art:a.kind,text:a.body,autor_name:a.user_name||a.author_label||'',message_id:a.message_id,subject:a.subject,direction:a.direction,sent_at:a.sent_at||a.call_started_at,call_phone:a.call_phone,call_contact:a.call_contact,call_contact_id:a.call_contact_id,call_source:a.call_source,attachments:a.attachments_json?JSON.parse(a.attachments_json):[],is_contact:!!a.is_contact});
export function history(db,id,offset=0,kind='all'){
 getOrg(db,id);if(!['all','communication','internal'].includes(kind))throw new Problem('Ungültiger Verlauf.');const safe=Math.max(0,Math.floor(Number(offset)||0));
 const filter=kind==='communication'?' AND '+communicationSQL:kind==='internal'?' AND NOT '+communicationSQL:'';
 const rows=db.prepare(`SELECT a.*,u.name AS user_name,m.subject,m.direction,m.sent_at,m.attachments_json,ca.started_at AS call_started_at,ca.phone AS call_phone,c.name AS call_contact,ca.contact_id AS call_contact_id,ca.source_message_id AS call_source FROM activities a LEFT JOIN users u ON u.id=a.author_id LEFT JOIN messages m ON m.id=a.message_id LEFT JOIN call_attempts ca ON ca.activity_id=a.id LEFT JOIN contacts c ON c.id=ca.contact_id WHERE a.organisation_id=?${filter} ORDER BY ${historyOrder} LIMIT 40 OFFSET ?`).all(id,safe);
 return{items:rows.map(historyItem),total:db.prepare(`SELECT count(*) AS n FROM activities a WHERE a.organisation_id=?${filter}`).get(id).n};
}
export function timelinePosition(db,user,b){
 const p=importPreview(db,user,b.importId);if(!validDate(b.date)||b.date>todayBerlin())throw new Problem('Bitte ein gültiges E-Mail-Datum angeben.');
 if(!b.id)return{position:1,total:1,before:null,after:null,sameDay:0};getOrg(db,b.id);
 const rows=db.prepare(`SELECT a.id,a.occurred_on,a.kind,substr(a.body,1,180) body,a.message_id,a.created_at,m.subject,m.sent_at FROM activities a LEFT JOIN messages m ON m.id=a.message_id LEFT JOIN call_attempts ca ON ca.activity_id=a.id LEFT JOIN contacts c ON c.id=ca.contact_id WHERE a.organisation_id=? AND ${communicationSQL} ORDER BY ${historyOrder}`).all(b.id);
 const at=rows.findIndex(r=>(r.occurred_on||'')<b.date||((r.occurred_on||'')===b.date&&(r.sent_at||'')<=(p.sentAt||'')));
 const index=at<0?rows.length:at;
 return{position:index+1,total:rows.length+1,before:rows[index-1]?historyItem(rows[index-1]):null,after:rows[index]?historyItem(rows[index]):null,sameDay:rows.filter(r=>r.occurred_on===b.date).length};
}
export function search(db,q){const words=String(q||'').slice(0,300).match(/[\p{L}\p{N}]+/gu)||[];if(!words.length)return[];const match=words.map(w=>'"'+w+'"*').join(' AND ');return db.prepare('SELECT organisation_id FROM search_docs WHERE search_docs MATCH ? LIMIT 10000').all(match).map(r=>r.organisation_id);}
function str(x,max=12000){if(typeof x!=='string'||x.length>max)throw new Problem('Ungültige oder zu lange Eingabe.');return x.trim();}
export function fieldsValidated(fields={}){if(!fields||Array.isArray(fields)||typeof fields!=='object')throw new Problem('Ungültige Felder.');const out={};for(const[k,v]of Object.entries(fields)){const c=Number(k);if(!Number.isInteger(c)||c<1||c>19)throw new Problem('Dieses Feld kann nicht geändert werden.');const s=str(v);if([15,17].includes(c)&&s&&!validDate(s))throw new Problem('Ungültiges Datum.');if(c===15&&s>todayBerlin())throw new Problem('Letzter Kontakt liegt in der Zukunft.');if(c===1&&!s)throw new Problem('Name erforderlich.');if(c===2&&!TYPES.includes(s))throw new Problem('Ungültiger Typ.');if(c===9&&!STATUSES.includes(s))throw new Problem('Ungültiger Status.');if(c===10&&!PHASES.includes(s))throw new Problem('Ungültige Phase.');if(c===3&&s&&!fastbillURL(s))throw new Problem('Bitte eine HTTPS-FastBill-Kundenseite eingeben.');if(c===6&&s&&!websiteURL(s))throw new Problem('Ungültige Website.');if(c===13&&s&&!email(s))throw new Problem('Ungültige E-Mail-Adresse.');if(c===7&&s&&(!Number.isFinite(Number(s))||Number(s)<0))throw new Problem('Ungültige Größe.');out[c]=s;}return out;}
export function addActivity(db,id,user,{type='Notiz',text='',date=null,contacted=false,messageId=null,legacy=null,authorLabel=null}){const activityId=uid();db.prepare('INSERT INTO activities VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(activityId,id,type,date,now(),user?.id||null,authorLabel,text,contacted?1:0,messageId,legacy?JSON.stringify(legacy):null);if(contacted&&date)db.prepare('UPDATE organisations SET last_contact=CASE WHEN last_contact IS NULL OR last_contact<? THEN ? ELSE last_contact END WHERE id=?').run(date,date,id);return activityId;}
function setPrimaryField(db,id,c,value){let row=db.prepare('SELECT contact_id FROM organisation_contacts WHERE organisation_id=? AND is_primary=1').get(id);let cid=row?.contact_id;if(!cid){cid=uid();db.prepare('INSERT INTO contacts(id) VALUES(?)').run(cid);db.prepare('INSERT INTO organisation_contacts VALUES(?,?,1)').run(id,cid);}if(c===12)db.prepare('UPDATE contacts SET name=? WHERE id=?').run(value,cid);else{const kind=c===13?'email':'phone',old=db.prepare('SELECT id FROM contact_addresses WHERE contact_id=? AND kind=? ORDER BY position,id LIMIT 1').get(cid,kind);if(old)db.prepare('DELETE FROM contact_addresses WHERE id=?').run(old.id);if(value)db.prepare('INSERT OR IGNORE INTO contact_addresses VALUES(?,?,?,?,?)').run(uid(),cid,kind,value,0);}}
export function applyFields(db,id,fields){for(const[c0,value]of Object.entries(fields)){const c=Number(c0);if(cols[c])db.prepare(`UPDATE organisations SET ${cols[c]}=? WHERE id=?`).run(c===7?(value===''?null:Number(value)):c===15?(value||null):value,id);else if([12,13,14].includes(c))setPrimaryField(db,id,c,value);}
 if('16'in fields||'17'in fields||'11'in fields){let f=db.prepare('SELECT * FROM followups WHERE organisation_id=? AND completed_at IS NULL').get(id);const text=fields[16]??f?.text??'',due=fields[17]??f?.due_date??'',owner=fields[11]??f?.owner??'';if(f)db.prepare('UPDATE followups SET text=?,due_date=?,owner=? WHERE id=?').run(text,due||null,owner,f.id);else if(text||due)db.prepare('INSERT INTO followups VALUES(?,?,?,?,?,NULL)').run(uid(),id,text,due||null,owner);}
 if('19'in fields){db.prepare('UPDATE review_issues SET resolved_at=? WHERE organisation_id=? AND resolved_at IS NULL').run(now(),id);if(fields[19])db.prepare('INSERT INTO review_issues VALUES(?,?,?,NULL)').run(uid(),id,fields[19]);}
}
export function save(db,user,b){const fields=fieldsValidated(b.fields);let note=b.note;if(note){if(!['E-Mail','E-Mail erhalten','E-Mail gesendet','Telefonat','Anrufversuch','Notiz'].includes(note.type)||!validDate(note.date)||note.date>todayBerlin())throw new Problem('Ungültige Notiz oder Datum.');note={...note,text:str(note.text),contacted:!!note.contacted&&['E-Mail','E-Mail erhalten','E-Mail gesendet','Telefonat'].includes(note.type)};if(!note.text)throw new Problem('Notiz ist leer.');}
 if(typeof b.requestId!=='string'||b.requestId.length>100)throw new Problem('Anfrage-ID fehlt.');
 return transaction(db,()=>{const prior=db.prepare('SELECT * FROM requests WHERE id=?').get(b.requestId);if(prior){if(prior.user_id!==user.id||prior.organisation_id!==b.id)throw new Problem('Anfrage-ID bereits verwendet.',409);return{entity:entity(db,b.id,true),alreadySaved:true};}const o=getOrg(db,b.id);assertVersion(o,b.version);if(!Object.keys(fields).length&&!note)throw new Problem('Keine Änderung.');const before=entity(db,b.id).values;applyFields(db,b.id,fields);if(note)addActivity(db,b.id,user,note);const changes=Object.fromEntries(Object.entries(fields).map(([c,v])=>[HEADERS[+c],{from:before[+c],to:v}]));audit(db,b.id,user,'update',changes);if(Object.keys(fields).length)addActivity(db,b.id,user,{type:'CRM-Änderung',text:Object.keys(changes).join(', '),date:todayBerlin()});db.prepare('UPDATE organisations SET version=version+1,updated_at=? WHERE id=?').run(now(),b.id);db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(b.requestId,user.id,b.id,now());reindex(db,b.id);return{entity:entity(db,b.id,true)};});}
export function createOrg(db,user,name){name=str(name,500);if(!name)throw new Problem('Name erforderlich.');return transaction(db,()=>{const id='STG-'+uid();db.prepare('INSERT INTO organisations(id,name,created_at,updated_at) VALUES(?,?,?,?)').run(id,name,now(),now());audit(db,id,user,'create',{name});reindex(db,id);return entity(db,id,true);});}
export function activitySave(db,user,b){
 const text=str(b.text,12000);
 return transaction(db,()=>{
  getOrg(db,b.id);
  const activity=db.prepare('SELECT * FROM activities WHERE id=? AND organisation_id=?').get(b.activityId,b.id);
  if(!activity)throw new Problem('Aktivität nicht gefunden.',404,'not_found');
  const isNote=activity.kind==='Notiz';
  if(activity.message_id||(!isNote&&!/telefon|anruf|phone|call/i.test(activity.kind)))throw new Problem('Nur Anrufnotizen und Notizen können bearbeitet werden.');
  const next=text||(isNote?'':'Anruf gestartet · keine Notiz');
  if(!next)throw new Problem('Notiz ist leer.');
  if(typeof b.originalText!=='string'||activity.body!==b.originalText){
   if(activity.body===next)return{entity:entity(db,b.id,true),activityId:activity.id,text:next};
   throw new Problem('Diese Notiz wurde inzwischen geändert. Bitte den aktuellen Stand laden und erneut prüfen.',409,'conflict');
  }
  if(activity.body!==next){
   db.prepare('UPDATE activities SET body=? WHERE id=?').run(next,activity.id);
   audit(db,b.id,user,'activity_edit',{activityId:activity.id,from:activity.body,to:next});
   db.prepare('UPDATE organisations SET version=version+1,updated_at=? WHERE id=?').run(now(),b.id);
   reindex(db,b.id);
  }
  return{entity:entity(db,b.id,true),activityId:activity.id,text:next};
 });
}
export function addContact(db,id,c,primary=false){const cid=uid();db.prepare('INSERT INTO contacts VALUES(?,?,?,?)').run(cid,contactName(c.name,c.e_mails?.[0]),c.rolle||'',c.legacy?JSON.stringify(c.legacy):null);db.prepare('INSERT INTO organisation_contacts VALUES(?,?,?)').run(id,cid,primary?1:0);for(const[k,list]of [['email',c.e_mails||[]],['phone',c.telefone||[]]])list.forEach((v,i)=>{if(v)db.prepare('INSERT OR IGNORE INTO contact_addresses VALUES(?,?,?,?,?)').run(uid(),cid,k,String(v),i);});return cid;}
export function contactSave(db,user,b){const name=contactName(str(b.name||'',300),String(b.emails||'').split(/[\n,;]+/)[0]),role=str(b.role||'',500),emails=str(b.emails||'',2000).split(/[\n,;]+/).map(s=>s.trim().toLowerCase()).filter(Boolean),phones=str(b.phones||'',2000).split(/[\n;]+/).map(s=>s.trim()).filter(Boolean);if(emails.some(e=>!email(e)))throw new Problem('Ungültige E-Mail-Adresse.');if(!name&&!emails.length&&!phones.length)throw new Problem('Kontakt ist leer.');return transaction(db,()=>{assertVersion(getOrg(db,b.id),b.version);if(b.messageId&&!db.prepare('SELECT 1 FROM activities WHERE message_id=? AND organisation_id=?').get(b.messageId,b.id))throw new Problem('E-Mail gehört nicht zu dieser Organisation.',404);let cid=b.contactId;if(cid){if(!db.prepare('SELECT 1 FROM organisation_contacts WHERE organisation_id=? AND contact_id=?').get(b.id,cid))throw new Problem('Kontakt nicht gefunden.',404);db.prepare('UPDATE contacts SET name=?,role=? WHERE id=?').run(name,role,cid);db.prepare('DELETE FROM contact_addresses WHERE contact_id=?').run(cid);for(const[k,vs]of [['email',emails],['phone',phones]])vs.forEach((v,i)=>db.prepare('INSERT OR IGNORE INTO contact_addresses VALUES(?,?,?,?,?)').run(uid(),cid,k,v,i));}else cid=addContact(db,b.id,{name,rolle:role,e_mails:emails,telefone:phones});if(b.primary){db.prepare('UPDATE organisation_contacts SET is_primary=0 WHERE organisation_id=?').run(b.id);db.prepare('UPDATE organisation_contacts SET is_primary=1 WHERE organisation_id=? AND contact_id=?').run(b.id,cid);}else if(b.primary===false){db.prepare('UPDATE organisation_contacts SET is_primary=0 WHERE organisation_id=? AND contact_id=?').run(b.id,cid);}if(b.messageId)for(const a of db.prepare('SELECT id FROM activities WHERE message_id=? AND organisation_id=?').all(b.messageId,b.id))db.prepare('INSERT OR IGNORE INTO activity_contacts VALUES(?,?)').run(a.id,cid);audit(db,b.id,user,'contact',{contactId:cid,name,emails,phones,role});for(const row of db.prepare('SELECT organisation_id FROM organisation_contacts WHERE contact_id=?').all(cid)){db.prepare('UPDATE organisations SET version=version+1,updated_at=? WHERE id=?').run(now(),row.organisation_id);reindex(db,row.organisation_id);}addActivity(db,b.id,user,{type:'CRM-Änderung',text:'Kontakt aktualisiert: '+(name||emails[0]||phones[0]),date:todayBerlin()});return{entity:entity(db,b.id,true),contactId:cid};});}
export function linkSave(db,user,b){const note=str(b.note||'',2000);return transaction(db,()=>{assertVersion(getOrg(db,b.id),b.version);getOrg(db,b.other);if(b.id===b.other)throw new Problem('Andere Organisation auswählen.');const[a,other]=[b.id,b.other].sort();db.prepare('INSERT INTO organisation_links VALUES(?,?,?,?) ON CONFLICT(a,b) DO UPDATE SET note=excluded.note').run(uid(),a,other,note);audit(db,b.id,user,'link',{other:b.other,note});for(const id of[a,other]){db.prepare('UPDATE organisations SET version=version+1,updated_at=? WHERE id=?').run(now(),id);reindex(db,id);}return{entity:entity(db,b.id,true)};});}
export function stageImport(db,user,payload){db.prepare('DELETE FROM email_imports WHERE expires_at<?').run(Date.now());const count=db.prepare('SELECT count(*) AS n FROM email_imports WHERE user_id=?').get(user.id).n;if(count>=30)throw new Problem('Bitte vorhandene Importe prüfen oder verwerfen.',429);const id=uid();db.prepare('INSERT INTO email_imports VALUES(?,?,?,?)').run(id,user.id,JSON.stringify(payload),Date.now()+86400000);return importPreview(db,user,id);}
const publicDomains=new Set(['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','yahoo.de','gmx.de','gmx.net','web.de','icloud.com','me.com','aol.com','t-online.de','proton.me','protonmail.com']);
const domainOf=value=>String(value||'').toLowerCase().split('@')[1]||'';
function mailParticipants(db,p,user){
 const team=new Set(db.prepare('SELECT email FROM users').all().map(u=>u.email.toLowerCase()));team.add(user.email.toLowerCase());if(p.mailbox)team.add(p.mailbox.toLowerCase());
 const domains=new Set([...team].map(domainOf).filter(d=>!publicDomains.has(d)));
 const people=new Map();for(const [role,list]of [['sender',p.sender],['recipient',p.recipients],['cc',p.cc]])for(const a of list||[]){const address=String(a.email).toLowerCase();if(!people.has(address))people.set(address,{name:contactName(a.name,address),email:address,role,internal:team.has(address)||domains.has(domainOf(address))});}
 // Only explicit forwarded/quoted address headers, never arbitrary addresses in prose.
 let quotedHeaders=0;for(const line of String(p.original||'').split('\n')){const header=line.replace(/^\s*>\s*/,'').match(/^\s*(From|Von|To|An|Cc):\s*(.+)$/i);if(!header)continue;if(++quotedHeaders>30)break;
  for(const m of header[2].slice(0,2000).matchAll(/(?:([^<>;,]*?)\s*<)?([A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/gi)){const address=m[2].toLowerCase();if(!people.has(address)&&email(address))people.set(address,{name:(m[1]||'').trim().replace(/^"|"$/g,'').slice(0,300),email:address,role:'quoted',internal:team.has(address)||domains.has(domainOf(address))});}
  if(people.size>200)break;
 }
 return [...people.values()].slice(0,200);
}
export function importPreview(db,user,id){
 const row=db.prepare('SELECT * FROM email_imports WHERE id=? AND user_id=? AND expires_at>?').get(id,user.id,Date.now());if(!row)throw new Problem('Import nicht gefunden oder abgelaufen.',404);return matchEmail(db,user,JSON.parse(row.payload_json),id);
}
export function matchEmail(db,user,p,id=''){
 const participants=mailParticipants(db,p,user),candidates=new Map();
 const direction=participants.some(a=>a.role==='sender'&&a.internal)?'outgoing':p.direction;const preferred=direction==='outgoing'?'recipient':'sender';
 const add=(o,score,reason)=>{if(!candidates.has(o.id)||candidates.get(o.id).score<score)candidates.set(o.id,{id:o.id,name:o.name,score,reason});};
 for(const a of participants.filter(a=>!a.internal)){
  const score=a.role===preferred?100:a.role==='quoted'?50:80;
  for(const o of db.prepare("SELECT DISTINCT o.id,o.name FROM organisations o JOIN organisation_contacts oc ON o.id=oc.organisation_id JOIN contact_addresses ca ON ca.contact_id=oc.contact_id WHERE ca.kind='email' AND ca.value=? COLLATE NOCASE").all(a.email))add(o,score,'E-Mail-Adresse bekannt');
 }
 const externalDomains=new Set(participants.filter(a=>!a.internal&&a.role!=='quoted').map(a=>domainOf(a.email)).filter(d=>!publicDomains.has(d)));
 if(externalDomains.size){
  for(const o of db.prepare("SELECT DISTINCT o.id,o.name,ca.value FROM organisations o JOIN organisation_contacts oc ON o.id=oc.organisation_id JOIN contact_addresses ca ON ca.contact_id=oc.contact_id WHERE ca.kind='email'").all())if(externalDomains.has(domainOf(o.value)))add(o,30,'Gleiche E-Mail-Domain');
  for(const o of db.prepare("SELECT id,name,website FROM organisations WHERE website<>''").all()){try{if(externalDomains.has(new URL(websiteURL(o.website)).hostname.replace(/^www\./,'')))add(o,30,'Domain der Website');}catch{}}
 }
 const matches=[...candidates.values()].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)),best=matches.length&&(!matches[1]||matches[0].score>matches[1].score)?matches[0].id:'';
 const person=participants.find(a=>!a.internal&&a.role===preferred)||participants.find(a=>!a.internal),domain=domainOf(person?.email);
 const suggestedName=domain&&!publicDomains.has(domain)?domain.split('.')[0].split(/[-_]/).map(s=>s[0]?.toUpperCase()+s.slice(1)).join(' '):person?.name||'';
 const existing=db.prepare('SELECT a.organisation_id,a.occurred_on AS date,m.id,m.direction FROM messages m JOIN activities a ON a.message_id=m.id WHERE m.dedupe_key=?').get(p.dedupeKey);
 return{id,...p,direction,suggestedContacted:participants.some(a=>!a.internal&&a.role!=='quoted'),participants,candidates:matches,bestId:existing?.organisation_id||best,suggestedName,existing:existing||null};
}
export function confirmImport(db,user,b){
 const previous=db.prepare('SELECT * FROM requests WHERE id=?').get('import:'+b.importId);
 if(previous){if(previous.user_id!==user.id||(!b.newOrganisation&&previous.organisation_id!==b.id))throw new Problem('Import nicht gefunden.',404);return{entity:entity(db,previous.organisation_id,true),alreadySaved:true};}
 const p=importPreview(db,user,b.importId),body=str(b.body??p.cleaned,500000),summary=str(b.summary||'',12000),direction=['incoming','outgoing'].includes(b.direction)?b.direction:p.direction,date=str(b.date||'');
 if(!validDate(date)||date>todayBerlin())throw new Problem('Bitte das tatsächliche E-Mail-Datum angeben.');const sourceUrl=str(b.sourceUrl||'',2000);if(sourceUrl&&(!/^https:\/\//i.test(sourceUrl)||!websiteURL(sourceUrl)))throw new Problem('Quellverweis muss eine gültige HTTPS-URL sein.');
 const fields=fieldsValidated(b.fields||{});if(Object.keys(fields).some(k=>!['9','10','16','17'].includes(k)))throw new Problem('Nur Status und nächsten Schritt im E-Mail-Import ändern.');
 if(fields[9]&&!['Kunde','Lead'].includes(fields[9]))throw new Problem('Bitte Kunde oder Lead wählen.');
 const selected=b.contactEmails??(b.addContact?[b.contactEmail]:[]);if(!Array.isArray(selected)||selected.length>200||selected.some(x=>typeof x!=='string'))throw new Problem('Ungültige Kontaktauswahl.');
 const participants=[...new Set(selected.map(x=>x.toLowerCase()))].map(address=>{const a=p.participants.find(a=>a.email===address);if(!a)throw new Problem('Kontakt bitte aus den Beteiligten auswählen.');return a;});
 return transaction(db,()=>{
  const existing=db.prepare('SELECT m.id,a.organisation_id FROM messages m JOIN activities a ON a.message_id=m.id WHERE m.dedupe_key=?').get(p.dedupeKey);
  if(existing){if(b.newOrganisation||existing.organisation_id!==b.id)throw new Problem('Diese E-Mail ist bereits einer anderen Organisation zugeordnet.',409,'duplicate');getOrg(db,b.id);db.prepare('INSERT OR IGNORE INTO message_sources VALUES(?,?,?,?)').run(existing.id,user.id,user.email,sourceUrl);db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run('import:'+b.importId,user.id,b.id,now());db.prepare('DELETE FROM email_imports WHERE id=?').run(b.importId);return{entity:entity(db,b.id,true),duplicate:true};}
  let id=b.id;
  if(b.newOrganisation){const name=str(b.newOrganisation.name,500),status=b.newOrganisation.status||'Lead';if(!name||!['Lead','Kunde'].includes(status))throw new Problem('Name und Kundenstatus prüfen.');
   const same=db.prepare('SELECT id FROM organisations WHERE name=? COLLATE NOCASE').get(name);if(same)throw new Problem('Eine Organisation mit diesem Namen existiert bereits. Bitte im ersten Schritt auswählen.',409,'duplicate');
   id='STG-'+uid();db.prepare('INSERT INTO organisations(id,name,status,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,name,status,now(),now());audit(db,id,user,'create',{name,status,via:'email_import'});
  }else assertVersion(getOrg(db,id),b.version);
  const mid=uid();db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?)').run(mid,p.dedupeKey,p.messageId||null,p.subject,JSON.stringify(p.sender),JSON.stringify([...p.recipients,...p.cc]),p.sentAt,direction,body,JSON.stringify(p.attachments));db.prepare('INSERT INTO message_sources VALUES(?,?,?,?)').run(mid,user.id,user.email,sourceUrl);
  const aid=addActivity(db,id,user,{type:direction==='outgoing'?'E-Mail gesendet':'E-Mail erhalten',text:summary||p.subject,date,contacted:b.contacted===undefined?p.suggestedContacted!==false:b.contacted!==false,messageId:mid});
  const contactIds=[];for(const selected of participants){
   const found=db.prepare("SELECT c.id FROM contacts c JOIN organisation_contacts oc ON c.id=oc.contact_id JOIN contact_addresses ca ON ca.contact_id=c.id WHERE oc.organisation_id=? AND ca.kind='email' AND ca.value=? COLLATE NOCASE ORDER BY oc.is_primary DESC,c.id").all(id,selected.email);
   // Reuse an address only inside the selected organisation; never merge agency/client contacts.
   const cid=found[0]?.id||addContact(db,id,{name:selected.name,e_mails:[selected.email]});contactIds.push(cid);
   db.prepare('INSERT OR IGNORE INTO activity_contacts VALUES(?,?)').run(aid,cid);
  }
  applyFields(db,id,fields);audit(db,id,user,'email_import',{messageId:mid,direction,fields,contactIds});db.prepare('UPDATE organisations SET version=version+1,updated_at=? WHERE id=?').run(now(),id);db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run('import:'+b.importId,user.id,id,now());db.prepare('DELETE FROM email_imports WHERE id=?').run(b.importId);reindex(db,id);return{entity:entity(db,id,true)};
 });
}
