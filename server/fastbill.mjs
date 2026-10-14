import {createHash} from 'node:crypto';
import {uid,now,transaction,reindex} from './db.mjs';
import {Problem,entity,getOrg,assertVersion,fieldsValidated,applyFields,contacts,addContact,addActivity,audit} from './crm.mjs';
import {email} from './auth.mjs';
import {normalize,todayBerlin} from '../src/domain.ts';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const norm=value=>normalize(String(value||'')).replace(/[^a-z0-9]/g,'');
const clean=(value,max=2000)=>{const s=String(value??'').trim();if(s.length>max)throw new Problem('Ein Importfeld ist zu lang. Bitte die Spaltenzuordnung prüfen.');return s;};
export const COLUMNS={
 customerNumber:['Kundennummer','Kunden-Nr.','customer_number'],customerId:['customer_id','Kunden-ID'],
 name:['Firmenname','Firma','Organisation','organization','company'],firstName:['Vorname','first_name'],lastName:['Nachname','last_name'],
 contactName:['Ansprechpartner','Kontaktname','contact_name'],role:['Position','Rolle','position'],
 email:['E-Mail','Email','E-Mail-Adresse'],phone:['Telefon','Telefonnummer','phone'],phone2:['Telefon 2','phone_2'],mobile:['Mobil','Mobiltelefon','mobile'],
 city:['Ort','Stadt','city'],website:['Website','Webseite','Internet'],url:['FastBill URL','FastBill-Kundenseite','customer_url'],
 reference:['Rechnungsnummer','invoice_number'],date:['Datum','Rechnungsdatum','invoice_date'],title:['Titel','invoice_title'],description:['Beschreibung','description'],
 documentType:['Typ','type'],canceled:['Storniert?','is_canceled'],state:['Rechnungsstatus','state'],
};
// Strict quoted CSV reader: no evaluation, spreadsheet formulas remain plain text.
export function parseCSV(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>8*1024*1024)throw new Problem('CSV: maximal 8 MB.');
 text=text.replace(/^\uFEFF/,'');let sep='';if(/^sep=[;,\t]\r?\n/i.test(text)){sep=text[4];text=text.slice(text.indexOf('\n')+1);}
 if(!sep){const line=text.split(/\r?\n/,1)[0];let quoted=false;const counts={';':0,',':0,'\t':0};for(let i=0;i<line.length;i++){if(line[i]==='"'){if(quoted&&line[i+1]==='"'){i++;continue;}quoted=!quoted;}else if(!quoted&&line[i] in counts)counts[line[i]]++;}sep=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];}
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 const pushCell=()=>{row.push(cell);cell='';closed=false;if(row.length>160)throw new Problem('CSV: zu viele Spalten.');};
 const pushRow=()=>{pushCell();if(row.some(x=>x.trim()))rows.push(row);row=[];if(rows.length>10001)throw new Problem('CSV: maximal 10.000 Datenzeilen.');};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}else if(c===sep)pushCell();else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;pushRow();}else if(c==='"'&&!cell&&!closed)quoted=true;else{if(closed||c==='"')throw new Problem('Ungültige CSV-Anführungszeichen. Bitte unveränderten Export verwenden.');cell+=c;}if(cell.length>100000)throw new Problem('CSV-Zelle ist zu groß.');}
 if(quoted)throw new Problem('CSV endet innerhalb eines Textfelds.');if(cell||row.length||closed)pushRow();
 if(rows.length<2)throw new Problem('CSV enthält keine Datenzeilen.');const headers=rows.shift().map(h=>h.trim());
 if(headers.some(h=>!h)||new Set(headers.map(norm)).size!==headers.length)throw new Problem('CSV-Spalten müssen eindeutige, nicht leere Überschriften haben.');
 const invalid=rows.findIndex(r=>r.length!==headers.length);if(invalid>=0)throw new Problem(`CSV-Zeile ${invalid+2}: Spaltenzahl passt nicht zur Überschrift.`);
 const mapping={};for(const[k,aliases]of Object.entries(COLUMNS)){const i=headers.findIndex(h=>aliases.some(a=>norm(a)===norm(h)));if(i>=0)mapping[k]=i;}
 return{headers,rows,mapping};
}
export function inspectCSV(text){const p=parseCSV(text);return{headers:p.headers,mapping:p.mapping,sample:p.rows.slice(0,3),count:p.rows.length};}
export function csvRecords(text,mapping,kind='customers'){
 if(!['customers','invoices'].includes(kind))throw new Problem('Ungültiger Exporttyp.');const p=parseCSV(text);mapping=mapping??p.mapping;
 if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))throw new Problem('Spaltenzuordnung fehlt.');
 const indexes=Object.values(mapping);if(indexes.some(i=>!Number.isInteger(i)||i<0||i>=p.headers.length)||new Set(indexes).size!==indexes.length||Object.keys(mapping).some(k=>!Object.hasOwn(COLUMNS,k)))throw new Problem('Ungültige Spaltenzuordnung.');
 if(!['name','contactName','lastName','customerNumber','customerId'].some(k=>k in mapping))throw new Problem('Bitte mindestens Name oder Kundennummer zuordnen.');
 if(kind==='invoices'&&!('reference'in mapping))throw new Problem('Bitte Rechnungsnummer zuordnen.');
 return p.rows.map(row=>{const v=Object.fromEntries(Object.entries(mapping).map(([k,i])=>[k,row[i]]));return record(v,kind);});
}
function record(v,kind){
 const r={kind,customerId:clean(v.customerId),customerNumber:clean(v.customerNumber),name:clean(v.name),contactName:clean(v.contactName||[v.firstName,v.lastName].filter(Boolean).join(' ')),role:clean(v.role),email:clean(v.email).toLowerCase(),phones:[v.phone,v.phone2,v.mobile].map(x=>clean(x)).filter(Boolean),city:clean(v.city),website:clean(v.website),url:clean(v.url),reference:clean(v.reference),date:clean(v.date),title:clean(v.title),description:clean(v.description,12000),documentType:clean(v.documentType),canceled:clean(v.canceled),state:clean(v.state)};
 r.phones=[...new Set(r.phones)];if(!r.name&&!r.contactName&&!r.customerNumber&&!r.customerId)throw new Problem('Eine Zeile hat weder Namen noch Kundenkennung. Bitte Export/Spaltenzuordnung prüfen.');
 if(!r.name)r.name=r.contactName||'Kunde '+(r.customerNumber||r.customerId);
 return r;
}
const keysOf=r=>[r.customerNumber?'number:'+r.customerNumber:'',r.customerId?'id:'+r.customerId:''].filter(Boolean);
const keyOf=r=>keysOf(r)[0]||'';
function scopeOf(scope){scope=clean(scope,120).toLowerCase();if(!scope)throw new Problem('FastBill-Konto benennen.');return scope;}
function batchFor(db,user,id){const b=db.prepare('SELECT * FROM fastbill_batches WHERE id=? AND user_id=?').get(id,user.id);if(!b)throw new Problem('Import nicht gefunden.',404);return b;}
export function stageFastbill(db,user,{scope='main',label='FastBill',records,batchId}){
 scope=scopeOf(scope);label=clean(label,250);if(!Array.isArray(records)||!records.length||records.length>10000)throw new Problem('Keine Daten oder zu viele Datensätze.');
 if(!batchId&&db.prepare('SELECT count(*) n FROM fastbill_batches WHERE user_id=?').get(user.id).n>=20)throw new Problem('Bitte alte Importläufe löschen (maximal 20).',429);
 return transaction(db,()=>{const id=batchId||uid();if(batchId){const b=batchFor(db,user,batchId);if(b.scope!==scope||b.label!==label)throw new Problem('Importlauf gehört zu einem anderen Konto oder Datentyp.');}else db.prepare('INSERT INTO fastbill_batches VALUES(?,?,?,?,?)').run(id,user.id,scope,label,now());const seen=new Set(db.prepare('SELECT fingerprint FROM fastbill_rows WHERE batch_id=?').all(id).map(r=>r.fingerprint));let duplicates=0,added=0;
 for(const r of records){const fingerprint=hash(r);if(seen.has(fingerprint)){duplicates++;continue;}seen.add(fingerprint);added++;if(seen.size>10000)throw new Problem('Maximal 10.000 Einträge pro Importlauf.');
 const decision=db.prepare('SELECT decision,organisation_id FROM fastbill_decisions WHERE scope=? AND fingerprint=?').get(scope,fingerprint);
 db.prepare('INSERT INTO fastbill_rows VALUES(?,?,?,?,?,?,?,?)').run(uid(),id,keyOf(r),fingerprint,JSON.stringify(r),decision?.decision||'pending',decision?.organisation_id||null,decision?'Aus früherem Import übernommen':'');}
 return{id,duplicates,count:seen.size,added};});
}
export function fastbillBatches(db,user){return db.prepare("SELECT b.*,count(r.id) total,sum(CASE WHEN r.status='pending' THEN 1 ELSE 0 END) pending FROM fastbill_batches b LEFT JOIN fastbill_rows r ON r.batch_id=b.id WHERE b.user_id=? GROUP BY b.id ORDER BY b.created_at DESC,b.rowid DESC").all(user.id);}
export function fastbillRows(db,user,{batchId,status='pending',query='',offset=0}){batchFor(db,user,batchId);if(!['pending','applied','ignored','all'].includes(status))throw new Problem('Ungültiger Filter.');offset=Math.max(0,Math.floor(Number(offset)||0));const where="batch_id=? AND (?='all' OR status=?) AND payload_json LIKE ?";const args=[batchId,status,status,'%'+clean(query,200)+'%'];return{items:db.prepare(`SELECT * FROM fastbill_rows WHERE ${where} ORDER BY rowid LIMIT 100 OFFSET ?`).all(...args,offset).map(r=>({...r,payload:JSON.parse(r.payload_json),payload_json:undefined})),total:db.prepare(`SELECT count(*) n FROM fastbill_rows WHERE ${where}`).get(...args).n};}
function rowFor(db,user,id){const r=db.prepare('SELECT r.*,b.scope FROM fastbill_rows r JOIN fastbill_batches b ON b.id=r.batch_id WHERE r.id=? AND b.user_id=?').get(id,user.id);if(!r)throw new Problem('Importzeile nicht gefunden.',404);return{...r,payload:JSON.parse(r.payload_json)};}
export function fastbillPreview(db,user,id){const row=rowFor(db,user,id),p=row.payload,candidates=new Map();
 const previous=db.prepare('SELECT decision,organisation_id,note FROM fastbill_decisions WHERE scope=? AND fingerprint=?').get(row.scope,row.fingerprint);if(row.status==='pending'&&previous){row.status=previous.decision;row.organisation_id=previous.organisation_id;row.note=previous.note;}
 for(const key of keysOf(p))for(const c of db.prepare('SELECT o.id,o.name FROM fastbill_mappings m JOIN organisations o ON o.id=m.organisation_id WHERE m.scope=? AND m.source_key=?').all(row.scope,key))candidates.set(c.id,{...c,reason:'Bestätigte Zuordnung',score:3});
 if(p.email)for(const c of db.prepare("SELECT DISTINCT o.id,o.name FROM organisations o JOIN organisation_contacts oc ON oc.organisation_id=o.id JOIN contact_addresses a ON a.contact_id=oc.contact_id WHERE a.kind='email' AND a.value=? COLLATE NOCASE").all(p.email))if(!candidates.has(c.id))candidates.set(c.id,{...c,reason:'Gleiche E-Mail-Adresse',score:2});
 for(const c of db.prepare('SELECT id,name FROM organisations').all())if(norm(c.name)===norm(p.name)&&!candidates.has(c.id))candidates.set(c.id,{...c,reason:'Gleicher Name',score:1});
 return{...row,payload_json:undefined,candidates:[...candidates.values()].sort((a,b)=>b.score-a.score)};
}
export function decideFastbill(db,user,b){return transaction(db,()=>{
 const r=rowFor(db,user,b.rowId);if(b.decision==='pending'){
  const old=db.prepare('SELECT organisation_id FROM fastbill_decisions WHERE scope=? AND fingerprint=?').get(r.scope,r.fingerprint);
  if(old?.organisation_id){for(const key of keysOf(r.payload))db.prepare('DELETE FROM fastbill_mappings WHERE scope=? AND source_key=? AND organisation_id=?').run(r.scope,key,old.organisation_id);audit(db,old.organisation_id,user,'fastbill_reopen',{scope:r.scope,keys:keysOf(r.payload)});}
  db.prepare('DELETE FROM fastbill_decisions WHERE scope=? AND fingerprint=?').run(r.scope,r.fingerprint);
  db.prepare("UPDATE fastbill_rows SET status='pending',organisation_id=NULL,note='' WHERE id=?").run(r.id);return{};
 }
 if(!['applied','ignored'].includes(b.decision))throw new Problem('Ungültige Entscheidung.');
 if(r.status!=='pending'){if(r.status===b.decision&&(b.decision==='ignored'||r.organisation_id===b.id))return{alreadySaved:true};throw new Problem('Zeile wurde bereits bearbeitet. Bitte erneut öffnen.',409,'conflict');}
 // Another user/batch may have handled the same evidence since this queue was loaded.
 if(db.prepare('SELECT 1 FROM fastbill_decisions WHERE scope=? AND fingerprint=?').get(r.scope,r.fingerprint))throw new Problem('Dieser Datensatz wurde in einem anderen Import geprüft. Import neu laden oder Zeile erneut öffnen.',409,'conflict');
 const note=clean(b.note||'',4000);let orgId=null;
 if(b.decision==='applied'){
  const o=getOrg(db,b.id);assertVersion(o,b.version);orgId=o.id;const fields=fieldsValidated(b.fields||{});
  if(Object.keys(fields).some(k=>!['3','4','6'].includes(k)))throw new Problem('FastBill-Import darf nur Link, Ort und Website ändern.');
  const before=entity(db,o.id).values;applyFields(db,o.id,fields);
  const p=r.payload;let contactId=null,contactChanges=null;
  if(b.addContact){
   const name=clean(b.contact?.name??p.contactName,300),role=clean(b.contact?.role??p.role,500),em=clean(b.contact?.email??p.email).toLowerCase();
   const phones=clean(b.contact?.phones??p.phones.join('\n')).split(/[\n;]+/).map(s=>s.trim()).filter(Boolean);
   if(em&&!email(em))throw new Problem('Kontakt-E-Mail bitte korrigieren.');if(phones.some(s=>s.replace(/\D/g,'').length<6))throw new Problem('Telefonnummer bitte prüfen.');if(!name&&!em&&!phones.length)throw new Problem('Kontakt ist leer.');
   const existing=contacts(db,o.id).find(c=>norm(c.name)===norm(name)&&(!em||c.e_mails.map(x=>x.toLowerCase()).includes(em))&&phones.every(p=>c.telefone.some(x=>x.replace(/\D/g,'')===p.replace(/\D/g,''))));
   // Do not silently mutate shared contacts. Identical payloads dedupe; changed contacts need explicit review.
   if(b.contact?.existingId){
    const chosen=contacts(db,o.id).find(c=>c.id===b.contact.existingId);if(!chosen)throw new Problem('Kontakt gehört nicht zu dieser Organisation.');
    if(db.prepare('SELECT count(*) n FROM organisation_contacts WHERE contact_id=?').get(chosen.id).n!==1)throw new Problem('Gemeinsam genutzten Kontakt bitte im Kontakteditor bearbeiten.');
    contactId=chosen.id;for(const[k,list]of [['email',em?[em]:[]],['phone',phones]])for(const value of list){const current=k==='email'?chosen.e_mails:chosen.telefone;if(!current.some(x=>k==='email'?x.toLowerCase()===value:x.replace(/\D/g,'')===value.replace(/\D/g,'')))db.prepare('INSERT OR IGNORE INTO contact_addresses VALUES(?,?,?,?,?)').run(uid(),contactId,k,value,current.length+1);}
   }else contactId=existing?.id||addContact(db,o.id,{name,rolle:role,e_mails:em?[em]:[],telefone:phones});
   contactChanges={contactId,name,role,email:em,phones,mode:b.contact?.existingId?'append':'add-or-reuse'};
  }
  const provenance={art:'FastBill-Zuordnung',quelle:'FastBill',konto:r.scope,kundennummer:r.payload.customerNumber,kunden_id:r.payload.customerId,importiert_am:now(),notiz:note};
  db.prepare('INSERT INTO source_references VALUES(?,?,NULL,NULL,?)').run(uid(),o.id,JSON.stringify(provenance));
  for(const key of keysOf(r.payload))db.prepare('INSERT OR IGNORE INTO fastbill_mappings VALUES(?,?,?)').run(r.scope,key,o.id);
  const changes=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,{from:before[+k],to:v}]));
  audit(db,o.id,user,'fastbill_import',{...provenance,fields:changes,contactId,contactChanges});
  addActivity(db,o.id,user,{type:'CRM-Änderung',text:'FastBill-Zuordnung geprüft'+(note?': '+note:'.'),date:todayBerlin(),contacted:false});
  db.prepare('UPDATE organisations SET version=version+1,updated_at=? WHERE id=?').run(now(),o.id);reindex(db,o.id);
 }
 db.prepare('INSERT INTO fastbill_decisions VALUES(?,?,?,?,?,?,?)').run(r.scope,r.fingerprint,b.decision,orgId,user.id,now(),note);
 db.prepare('UPDATE fastbill_rows SET status=?,organisation_id=?,note=? WHERE id=?').run(b.decision,orgId,note,r.id);
 return{entity:orgId?entity(db,orgId,true):null};
});}
export function deleteFastbillBatch(db,user,id){batchFor(db,user,id);db.prepare('DELETE FROM fastbill_batches WHERE id=?').run(id);return{};}

// Fixed endpoint and read-only service list. Credentials are used only for this call.
export async function fetchFastbillPage({email:address,apiKey,kind='customers',offset=0},fetcher=fetch){
 if(!email(address)||String(address).includes(':')||typeof apiKey!=='string'||!apiKey.trim()||apiKey.length>512)throw new Problem('FastBill-E-Mail und API-Key prüfen.');
 const services={customers:['customer.get','CUSTOMERS'],contacts:['contact.get','CONTACTS'],invoices:['invoice.get','INVOICES']};
 if(!Object.hasOwn(services,kind)||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new Problem('Ungültiger API-Abruf.');
 const[service,container]=services[kind];let result;
 try{const response=await fetcher('https://my.fastbill.com/api/1.0/api.php',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':'Basic '+Buffer.from(address.trim()+':'+apiKey.trim()).toString('base64')},body:JSON.stringify({SERVICE:service,LIMIT:100,OFFSET:offset})});
 if(!response.ok)throw Error();const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>8*1024*1024)throw Error();chunks.push(chunk);}result=JSON.parse(Buffer.concat(chunks).toString());
 }catch{throw new Problem('FastBill-Abruf fehlgeschlagen. Zugangsdaten, Verbindung oder Tariflimit prüfen. Es wurde nichts importiert.',502);}
 if(result.ERRORS||result.RESPONSE?.ERRORS)throw new Problem('FastBill meldet einen Fehler. Zugangsdaten und Tariflimit prüfen.',502);
 const list=result.RESPONSE?.[container];if(!Array.isArray(list)||list.length>100)throw new Problem('Unerwartetes FastBill-Antwortformat. Es wurde nichts importiert.',502);
 const records=list.map(v=>record({customerId:v.CUSTOMER_ID,customerNumber:v.CUSTOMER_NUMBER,name:v.ORGANIZATION,firstName:v.FIRST_NAME,lastName:v.LAST_NAME,role:v.POSITION,email:v.EMAIL,phone:v.PHONE,phone2:v.PHONE_2,mobile:v.MOBILE,city:v.CITY,website:v.WEBSITE,reference:v.INVOICE_NUMBER,date:v.INVOICE_DATE,title:v.INVOICE_TITLE,documentType:v.TYPE,canceled:v.IS_CANCELED,state:v.STATE,description:Array.isArray(v.ITEMS)?v.ITEMS.map(x=>x.DESCRIPTION||'').join('\n'):''},kind));
 return{records,nextOffset:list.length===100?offset+100:null,count:list.length};
}
