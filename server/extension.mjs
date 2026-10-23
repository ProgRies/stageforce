import {contactName} from '../src/domain.ts';
import {appearance} from './appearance.mjs';
import {prepareCall,saveCall,cancelCall,mergePhones} from './calls.mjs';
import {randomBytes,createHash} from 'node:crypto';
import {hashToken,limited,email} from './auth.mjs';
import {transaction,now} from './db.mjs';
import {Problem,matchEmail,stageImport,confirmImport,getOrg,contacts,createOrg,linkSave} from './crm.mjs';
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
function envelope(b,user){
 const mailbox=field(b.mailbox,254).toLowerCase();if(mailbox!==user.email.toLowerCase())throw new Problem('The Gmail mailbox must match your CRM account. Check the selected mailbox.',403);
 const address=a=>{const e=field(a?.email,254).toLowerCase();if(!email(e))throw new Problem('Check the sender and recipient addresses.');return{name:field(a.name||'',300),email:e};};
 const sender=[address(b.from)];if(!Array.isArray(b.recipients)||b.recipients.length>100)throw new Problem('Invalid participants.');
 return{sender,recipients:b.recipients.map(address),cc:[],mailbox,direction:sender[0].email===mailbox?'outgoing':'incoming',original:'',dedupeKey:''};
}
function identity(b,user){const mailbox=field(b.mailbox,254).toLowerCase();if(mailbox!==user.email.toLowerCase())throw new Problem('The Gmail mailbox must match your CRM account.',403);return{mailbox,gmailId:field(b.gmailMessageId||'',200)};}
function fingerprint(b){return createHash('sha256').update('extension-v1:'+JSON.stringify([field(b.from?.email,254).toLowerCase(),field(b.timestampRaw||b.timestamp,150),field(b.originalSubject,1000),field(b.originalBody,500000)])).digest('hex');}
function existingMessage(db,user,b){const {mailbox,gmailId}=identity(b,user);let m=gmailId?db.prepare('SELECT m.*,a.organisation_id FROM extension_message_refs r JOIN messages m ON m.id=r.message_id JOIN activities a ON a.message_id=m.id WHERE r.mailbox=? AND r.gmail_id=?').get(mailbox,gmailId):null;
 if(!m&&(typeof b.originalBody==='string'||/^[a-f0-9]{64}$/.test(b.legacyFingerprint||''))){m=db.prepare('SELECT m.*,a.organisation_id FROM messages m JOIN activities a ON a.message_id=m.id WHERE m.dedupe_key=?').get(b.legacyFingerprint||fingerprint(b));if(m&&gmailId)db.prepare('INSERT OR IGNORE INTO extension_message_refs VALUES(?,?,?)').run(mailbox,gmailId,m.id);}return m;}
function attachReference(db,user,b,mid){const {mailbox,gmailId}=identity(b,user);if(gmailId)db.prepare('INSERT OR IGNORE INTO extension_message_refs VALUES(?,?,?)').run(mailbox,gmailId,mid);}
function attachmentRefs(value){if(value===undefined)return[];if(!Array.isArray(value)||value.length>100)throw new Problem('Too many attachment references.');return value.map(a=>({name:field(a.name,500),size:field(a.size||'',100),type:field(a.type||'',100),referenceOnly:true})).filter(a=>a.name);}
export function extensionAction(db,user,b,origin){
 if(b.action==='check')return{email:user.email,appearance:appearance(db,user)||'system'};
 if(b.action==='messageStatus'){
  const m=existingMessage(db,user,b);if(!m)return{saved:false};
  const organisation=brief(getOrg(db,m.organisation_id));if(!b.detail)return{saved:true,organisation};
  return{saved:true,organisation,message:{id:m.id,subject:m.subject,body:m.body,timestamp:m.sent_at,direction:m.direction,attachments:JSON.parse(m.attachments_json)},participants:db.prepare('SELECT c.id FROM activity_contacts ac JOIN contacts c ON c.id=ac.contact_id JOIN activities a ON a.id=ac.activity_id WHERE a.message_id=?').all(m.id).map(r=>contacts(db,m.organisation_id).find(c=>c.id===r.id)).filter(Boolean).map(c=>({contactId:c.id,email:c.e_mails[0]||'',name:contactName(c.name,c.e_mails[0]),phones:c.telefone,known:true}))};
 }
 if(b.action==='callPrepare'){
  const e=envelope(b,user),person=[...e.sender,...e.recipients].find(p=>p.email===b.contactEmail&&p.email!==e.mailbox);
  // Saved message contacts may have changed in the CRM after import.
  if(b.messageId){identity(b,user);const m=existingMessage(db,user,b);if(!m||m.id!==b.messageId||m.organisation_id!==b.organisationId)throw new Problem('Email not found.',404);return prepareCall(db,user,b);}
  if(!person)throw new Problem('Select a contact from the email headers.');return prepareCall(db,user,b,{participant:person});
 }
 if(b.action==='callCancel')return cancelCall(db,user,b);
 if(b.action==='callSave')return saveCall(db,user,b);
 if(b.action==='search'){
  const q=field(b.query,300);if(q.length<2)return{items:[]};
  return{items:db.prepare('SELECT id,name,version FROM organisations WHERE instr(lower(name),lower(?))>0 ORDER BY name COLLATE NOCASE LIMIT 20').all(q).map(brief)};
 }
 if(b.action==='lookup'){
  const p=matchEmail(db,user,envelope(b,user));
  const candidates=p.candidates.map(c=>({...brief(getOrg(db,c.id)),reason:c.reason,score:c.score}));
  // Only an unambiguous exact external address selects an organisation automatically.
  const exact=candidates.filter(c=>c.score>=80),best=exact.length===1?exact[0]:null;
  const selected=b.organisationId?brief(getOrg(db,field(b.organisationId,100))):best;
  const known=selected?contacts(db,selected.id):[];
  const linked=selected?db.prepare('SELECT o.id,o.name,o.version FROM organisation_links l JOIN organisations o ON o.id=CASE WHEN l.a=? THEN l.b ELSE l.a END WHERE l.a=? OR l.b=?').all(selected.id,selected.id,selected.id).map(brief):[];
  return{organisation:selected,candidates,participants:p.participants.filter(a=>!a.internal&&a.role!=='quoted').map(a=>{const c=known.find(c=>c.e_mails.some(e=>e.toLowerCase()===a.email));return{...a,name:contactName(c?.name&&!c.name.includes('@')?c.name:a.name,a.email),known:!!c,contactId:c?.id,phones:c?.telefone||[]};}),linked:linked.length===1?linked[0]:null};
 }
 if(b.action!=='save'||b.confirmed!==true)throw new Problem('Explicit confirmation required.');
 if(typeof b.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(b.requestId))throw new Problem('Invalid request ID.');
 const receipt='extension:'+b.requestId;
 const response=(id,duplicate=false)=>({saved:true,duplicate,organisation:brief(getOrg(db,id)),organisationUrl:origin+'/?organisation='+encodeURIComponent(id)});
 return transaction(db,()=>{
  const prior=db.prepare('SELECT * FROM requests WHERE id=?').get(receipt);
  if(prior){if(prior.user_id!==user.id)throw new Problem('Request not found.',404);return response(prior.organisation_id,true);}
  const found=existingMessage(db,user,b);if(found){let source='';try{const u=new URL(b.sourceUrl);if(u.origin==='https://mail.google.com'&&u.href.length<=2000)source=u.href;}catch{}db.prepare('INSERT OR IGNORE INTO message_sources VALUES(?,?,?,?)').run(found.id,user.id,user.email,source);db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(receipt,user.id,found.organisation_id,now());return response(found.organisation_id,true);}
  const p=envelope(b,user),original=field(b.originalBody,500000),subject=field(b.subject,1000),originalSubject=field(b.originalSubject,1000);
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
