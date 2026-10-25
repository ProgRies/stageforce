import {contactName,formatPhone} from '../src/domain.ts';
import {appearance} from './appearance.mjs';
import {prepareCall,saveCall,cancelCall,mergePhones,dialNumber} from './calls.mjs';
import {randomBytes,createHash} from 'node:crypto';
import {hashToken,limited,email} from './auth.mjs';
import {transaction,now} from './db.mjs';
import {Problem,ourAddresses,matchEmail,stageImport,confirmImport,getOrg,contacts,createOrg,linkSave,contactSave,assertVersion} from './crm.mjs';
const brief=o=>({id:o.id,name:o.name,version:String(o.version)});
const field=(v,max=1000)=>{if(typeof v!=='string'||v.length>max||v.includes('\0'))throw new Problem('Invalid field.');return v.trim();};
export function extensionStatus(db,user){const k=db.prepare('SELECT created_at,expires_at,last_used_at FROM extension_keys WHERE user_id=?').get(user.id);return{email:user.email,connected:!!k&&k.expires_at>Date.now(),...k};}
export function extensionRevoke(db,user){db.prepare('DELETE FROM extension_keys WHERE user_id=?').run(user.id);return extensionStatus(db,user);}
export function extensionCreate(db,user){const token='sf_ext_'+randomBytes(32).toString('base64url'),t=Date.now();db.prepare('INSERT INTO extension_keys(user_id,token_hash,created_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,expires_at=excluded.expires_at,last_used_at=NULL').run(user.id,hashToken(token),t,t+90*86400000);return{...extensionStatus(db,user),token};}
export function authorizeExtension(db,req,rateLimit=true){
 const origin=req.headers.origin;if(origin&&!/^chrome-extension:\/\/[a-p]{32}$/.test(origin))throw new Problem('Extension requests only.',403);
 const m=/^Bearer (sf_ext_[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||'');
 const user=m&&db.prepare('SELECT u.* FROM extension_keys k JOIN users u ON u.id=k.user_id WHERE k.token_hash=? AND k.expires_at>? AND u.active=1').get(hashToken(m[1]),Date.now());
 if(!user)throw new Problem('Connect your extension in Stage Force settings.',401);
 if(rateLimit&&limited(db,'extension:'+user.id,180,60000))throw new Problem('Please wait a minute.',429);
 db.prepare('UPDATE extension_keys SET last_used_at=? WHERE user_id=?').run(Date.now(),user.id);return user;
}
function envelope(b,user,db){
 const mailbox=field(b.mailbox,254).toLowerCase();if(mailbox!==user.email.toLowerCase())throw new Problem('The Gmail mailbox must match your CRM account. Check the selected mailbox.',403);
 const address=a=>{const e=field(a?.email,254).toLowerCase();if(!email(e))throw new Problem('Check the sender and recipient addresses.');return{name:field(a.name||'',300),email:e};};
 const sender=[address(b.from)];if(!Array.isArray(b.recipients)||b.recipients.length>100)throw new Problem('Invalid participants.');
 return{sender,recipients:b.recipients.map(address),cc:[],mailbox,direction:ourAddresses(db,user,mailbox).internal(sender[0].email)?'outgoing':'incoming',original:'',dedupeKey:''};
}
function identity(b,user){const mailbox=field(b.mailbox,254).toLowerCase();if(mailbox!==user.email.toLowerCase())throw new Problem('The Gmail mailbox must match your CRM account.',403);return{mailbox,gmailId:field(b.gmailMessageId||'',200)};}
function fingerprint(b){return createHash('sha256').update('extension-v1:'+JSON.stringify([field(b.from?.email,254).toLowerCase(),field(b.timestampRaw||b.timestamp,150),field(b.originalSubject,1000),field(b.originalBody,500000)])).digest('hex');}
function existingMessage(db,user,b){const {mailbox,gmailId}=identity(b,user);let m=gmailId?db.prepare('SELECT m.*,a.organisation_id FROM extension_message_refs r JOIN messages m ON m.id=r.message_id JOIN activities a ON a.message_id=m.id WHERE r.mailbox=? AND r.gmail_id=?').get(mailbox,gmailId):null;
 if(!m&&(typeof b.originalBody==='string'||/^[a-f0-9]{64}$/.test(b.legacyFingerprint||''))){m=db.prepare('SELECT m.*,a.organisation_id FROM messages m JOIN activities a ON a.message_id=m.id WHERE m.dedupe_key=?').get(b.legacyFingerprint||fingerprint(b));if(m&&gmailId)db.prepare('INSERT OR IGNORE INTO extension_message_refs VALUES(?,?,?)').run(mailbox,gmailId,m.id);}return m;}
// Where an address is already stored in the CRM, across all organisations, so the popup can say so before saving.
function crmContact(db,address){const rows=db.prepare("SELECT c.name,o.id,o.name AS organisation FROM contact_addresses ca JOIN contacts c ON c.id=ca.contact_id JOIN organisation_contacts oc ON oc.contact_id=c.id JOIN organisations o ON o.id=oc.organisation_id WHERE ca.kind='email' AND ca.value=? COLLATE NOCASE ORDER BY o.name COLLATE NOCASE").all(address);if(!rows.length)return null;const organisations=[...new Map(rows.map(r=>[r.id,{id:r.id,name:r.organisation}])).values()];return{name:contactName(rows.find(r=>r.name)?.name,address),organisations:organisations.slice(0,5),more:Math.max(0,organisations.length-5)};}
function attachReference(db,user,b,mid){const {mailbox,gmailId}=identity(b,user),thread=threadId(b);if(gmailId)db.prepare('INSERT OR IGNORE INTO extension_message_refs VALUES(?,?,?)').run(mailbox,gmailId,mid);if(thread)db.prepare('INSERT OR IGNORE INTO extension_thread_refs VALUES(?,?,?)').run(mailbox,thread,mid);}
const threadId=b=>{const t=field(b.gmailThreadId||'',200);if(t&&!/^[\w:.#-]+$/.test(t))throw new Problem('Invalid conversation.');return t;};
// A Gmail conversation whose saved emails all sit in one organisation prefills that organisation for its other emails.
function conversationOrganisation(db,user,b){const thread=threadId(b);if(!thread)return null;const rows=db.prepare('SELECT DISTINCT a.organisation_id AS id FROM extension_thread_refs t JOIN activities a ON a.message_id=t.message_id WHERE t.mailbox=? AND t.thread_id=?').all(identity(b,user).mailbox,thread);return rows.length===1?rows[0].id:null;}
function attachmentRefs(value){if(value===undefined)return[];if(!Array.isArray(value)||value.length>100)throw new Problem('Too many attachment references.');return value.map(a=>({name:field(a.name,500),size:field(a.size||'',100),type:field(a.type||'',100),referenceOnly:true})).filter(a=>a.name);}
export function extensionAction(db,user,b,origin){
 if(b.action==='check')return{email:user.email,appearance:appearance(db,user)||'system'};
 if(b.action==='messageStatus'){
  const m=existingMessage(db,user,b);if(!m)return{saved:false};
  const organisation=brief(getOrg(db,m.organisation_id));if(!b.detail)return{saved:true,organisation};
  return{saved:true,organisation,message:{id:m.id,subject:m.subject,body:m.body,timestamp:m.sent_at,direction:m.direction,attachments:JSON.parse(m.attachments_json)},participants:db.prepare('SELECT c.id FROM activity_contacts ac JOIN contacts c ON c.id=ac.contact_id JOIN activities a ON a.id=ac.activity_id WHERE a.message_id=?').all(m.id).map(r=>contacts(db,m.organisation_id).find(c=>c.id===r.id)).filter(Boolean).map(c=>({contactId:c.id,email:c.e_mails[0]||'',name:contactName(c.name,c.e_mails[0]),phones:c.telefone,known:true}))};
 }
 if(b.action==='contactSave'){
  identity(b,user);if(b.confirmed!==true)throw new Problem('Explicit contact confirmation required.');
  const name=field(b.name||'',300),role=field(b.role||'',500),address=field(b.email||'',254).toLowerCase();
  if(address&&!email(address))throw new Problem('Check the email address.');
  if(!Array.isArray(b.phones)||b.phones.length>10)throw new Problem('Check phone numbers.');
  const phones=[...new Set(b.phones.map(p=>{dialNumber(p);return formatPhone(field(p,100));}))];
  if(!address&&!phones.length)throw new Problem('Enter an email address or phone number.');
  return transaction(db,()=>{
   let id=b.organisationId;
   if(id)assertVersion(getOrg(db,id),b.version);
   else{const organisationName=field(b.newOrganisation||'',500);if(!organisationName)throw new Problem('Select or create an organisation first.');const existing=db.prepare('SELECT id FROM organisations WHERE name=? COLLATE NOCASE').get(organisationName);if(existing)throw new Problem('This organisation already exists. Select it from the search results.');id=createOrg(db,user,organisationName).id;}
   if(b.messageId){const message=existingMessage(db,user,b);if(!message||message.id!==b.messageId||message.organisation_id!==id)throw new Problem('Email not found.',404);}
   const all=contacts(db,id);let current=b.contactId?all.find(c=>c.id===b.contactId):null;
   if(b.contactId&&!current)throw new Problem('Contact does not belong to this organisation.',404);
   if(!current&&address){const matches=all.filter(c=>c.e_mails.some(e=>e.toLowerCase()===address));if(matches.length>1)throw new Problem('Several contacts share this address. Choose the contact in the CRM.');current=matches[0];}
   if(!current&&!address){const matches=all.filter(c=>c.name.toLowerCase()===name.toLowerCase()&&c.telefone.some(p=>{try{return phones.some(n=>dialNumber(n)===dialNumber(p));}catch{return false;}}));if(matches.length>1)throw new Problem('Several contacts match this phone number. Choose the contact in the CRM.');current=matches[0];}
   const addresses=[...new Set([...(current?.e_mails||[]),...(address?[address]:[])])];
   const numbers=b.contactId?phones:[...new Set([...(current?.telefone||[]),...phones])];
   const result=contactSave(db,user,{id,version:getOrg(db,id).version,contactId:current?.id,name:name||current?.name||'',role:role||current?.rolle||'',emails:addresses.join(';'),phones:numbers.join(';'),messageId:b.messageId});
   const c=contacts(db,id).find(c=>c.id===result.contactId);
   return{saved:true,organisation:brief(getOrg(db,id)),contact:{contactId:c.id,name:contactName(c.name,c.e_mails[0]),email:address||c.e_mails[0]||'',phones:c.telefone,known:true}};
  });
 }
 if(b.action==='callPrepare'){
  const e=envelope(b,user,db),person=[...e.sender,...e.recipients].find(p=>p.email===b.contactEmail&&p.email!==e.mailbox);
  // Saved message contacts may have changed in the CRM after import.
  if(b.messageId){identity(b,user);const m=existingMessage(db,user,b);if(!m||m.id!==b.messageId||m.organisation_id!==b.organisationId)throw new Problem('Email not found.',404);return prepareCall(db,user,b);}
  if(b.confirmedContact===true&&b.contactId)return prepareCall(db,user,b);
  if(!person)throw new Problem('Select a contact from the email headers.');return prepareCall(db,user,b,{participant:person});
 }
 if(b.action==='callCancel')return cancelCall(db,user,b);
 if(b.action==='callSave')return saveCall(db,user,b);
 if(b.action==='search'){
  const q=field(b.query,300);if(q.length<2)return{items:[]};
  return{items:db.prepare('SELECT id,name,version FROM organisations WHERE instr(lower(name),lower(?))>0 ORDER BY name COLLATE NOCASE LIMIT 20').all(q).map(brief)};
 }
 if(b.action==='lookup'){
  const p=matchEmail(db,user,envelope(b,user,db));
  const candidates=p.candidates.map(c=>({...brief(getOrg(db,c.id)),reason:c.reason,score:c.score}));
  // Only an unambiguous exact external address selects an organisation automatically.
  const exact=candidates.filter(c=>c.score>=80),best=exact.length===1?exact[0]:null;
  const conversation=b.organisationId?null:conversationOrganisation(db,user,b),selected=b.organisationId?brief(getOrg(db,field(b.organisationId,100))):conversation?brief(getOrg(db,conversation)):best;
  const known=selected?contacts(db,selected.id):[];
  const linked=selected?db.prepare('SELECT o.id,o.name,o.version FROM organisation_links l JOIN organisations o ON o.id=CASE WHEN l.a=? THEN l.b ELSE l.a END WHERE l.a=? OR l.b=?').all(selected.id,selected.id,selected.id).map(brief):[];
  return{organisation:selected,conversation:!!conversation,direction:p.direction,candidates,participants:p.participants.filter(a=>!a.internal&&a.role!=='quoted').map(a=>{const c=known.find(c=>c.e_mails.some(e=>e.toLowerCase()===a.email)),crm=crmContact(db,a.email);return{...a,name:contactName(c?.name&&!c.name.includes('@')?c.name:crm?.name||a.name,a.email),known:!!c,contactId:c?.id,phones:c?.telefone||[],crm};}),linked:linked.length===1?linked[0]:null};
 }
 if(b.action!=='save'||b.confirmed!==true)throw new Problem('Explicit confirmation required.');
 if(typeof b.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(b.requestId))throw new Problem('Invalid request ID.');
 const receipt='extension:'+b.requestId;
 const response=(id,duplicate=false)=>({saved:true,duplicate,organisation:brief(getOrg(db,id)),organisationUrl:origin+'/?organisation='+encodeURIComponent(id)});
 return transaction(db,()=>{
  const prior=db.prepare('SELECT * FROM requests WHERE id=?').get(receipt);
  if(prior){if(prior.user_id!==user.id)throw new Problem('Request not found.',404);return response(prior.organisation_id,true);}
  const found=existingMessage(db,user,b);if(found){let source='';try{const u=new URL(b.sourceUrl);if(u.origin==='https://mail.google.com'&&u.href.length<=2000)source=u.href;}catch{}db.prepare('INSERT OR IGNORE INTO message_sources VALUES(?,?,?,?)').run(found.id,user.id,user.email,source);attachReference(db,user,b,found.id);db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(receipt,user.id,found.organisation_id,now());return response(found.organisation_id,true);}
  const p=envelope(b,user,db),original=field(b.originalBody,500000),subject=field(b.subject,1000),originalSubject=field(b.originalSubject,1000);
  const stamp=field(b.timestamp,50);if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(stamp)||!Number.isFinite(Date.parse(stamp))||Date.parse(stamp)>Date.now()+300000)throw new Problem('Check the email timestamp.');
  const sentAt=new Date(stamp).toISOString();
  const direction=['incoming','outgoing'].includes(b.direction)?b.direction:p.direction;
  const dedupeKey=fingerprint(b);
  let sourceUrl='';try{const u=new URL(b.sourceUrl);if(u.origin==='https://mail.google.com'&&u.href.length<=2000)sourceUrl=u.href;}catch{}
  const payload={...p,subject,sentAt,direction,original,cleaned:original,removed:'',warnings:[],attachments:attachmentRefs(b.attachments),messageId:'',dedupeKey,sourceUrl};
  const staged=stageImport(db,user,payload);
  const allowed=new Set(staged.participants.filter(a=>!a.internal&&a.role!=='quoted').map(a=>a.email));
  if(!Array.isArray(b.contactEmails)||b.contactEmails.some(e=>!allowed.has(e)))throw new Problem('Select contacts from the message headers.');
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(sentAt));
  const result=confirmImport(db,user,{importId:staged.id,id:b.organisationId,version:b.version,newOrganisation:b.newOrganisation?{name:field(b.newOrganisation,500),status:'Lead'}:undefined,body:field(b.body,500000),date,direction,contactEmails:b.contactEmails,sourceUrl});
  const id=result.entity.id;
  const mid=db.prepare('SELECT id FROM messages WHERE dedupe_key=?').get(dedupeKey).id;attachReference(db,user,b,mid);
  // The stored body may be the reply alone; the full loaded text, quoted history included, is kept beside it.
  if(original!==field(b.body,500000))db.prepare('INSERT OR IGNORE INTO message_originals VALUES(?,?)').run(mid,original);
  if(b.extraContactIds!==undefined){
   if(!Array.isArray(b.extraContactIds)||b.extraContactIds.length>100)throw new Problem('Invalid selected contacts.');
   for(const cid of new Set(b.extraContactIds)){
    if(typeof cid!=='string'||!db.prepare('SELECT 1 FROM organisation_contacts WHERE organisation_id=? AND contact_id=?').get(id,cid))throw new Problem('Contact does not belong to this organisation.',404);
    for(const a of db.prepare('SELECT id FROM activities WHERE message_id=? AND organisation_id=?').all(mid,id))db.prepare('INSERT OR IGNORE INTO activity_contacts VALUES(?,?)').run(a.id,cid);
   }
  }

  if(b.contactPhones!==undefined){if(!Array.isArray(b.contactPhones)||b.contactPhones.length>100)throw new Problem('Invalid contacts.');for(const item of b.contactPhones){if(!b.contactEmails.includes(item.email))continue;const matches=contacts(db,id).filter(c=>c.e_mails.some(e=>e.toLowerCase()===item.email));if(matches.length===1)mergePhones(db,user,id,matches[0],item.phones);}}

  if(b.linked&&!result.duplicate){
   let other;if(b.linked.id)other=getOrg(db,field(b.linked.id,100)).id;
   else if(b.linked.name){const name=field(b.linked.name,500);if(name.toLowerCase()===getOrg(db,id).name.toLowerCase())throw new Problem('Choose a different linked organisation.');other=db.prepare('SELECT id FROM organisations WHERE name=? COLLATE NOCASE').get(name)?.id||createOrg(db,user,name).id;}
   if(!other||other===id)throw new Problem('Choose a different linked organisation.');
   const [a,z]=[id,other].sort();if(!db.prepare('SELECT 1 FROM organisation_links WHERE a=? AND b=?').get(a,z))linkSave(db,user,{id,version:getOrg(db,id).version,other,note:''});
  }
  db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(receipt,user.id,id,now());return response(id,!!result.duplicate);
 });
}
