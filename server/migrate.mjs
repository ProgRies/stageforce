import {createHash} from 'node:crypto';
import {HEADERS,dateISO,validDate} from '../src/domain.ts';
import {transaction,uid,now,reindex} from './db.mjs';
import {addContact} from './crm.mjs';
export function migrateSnapshot(db,snapshot){
 if(snapshot.formatVersion!==1||!Array.isArray(snapshot.crmRows)||!Array.isArray(snapshot.linkRows))throw Error('Expected a Stage CRM snapshot, formatVersion 1.');
 if(JSON.stringify(snapshot.crmRows[0])!==JSON.stringify(HEADERS))throw Error('Unexpected CRM headers. Nothing imported.');
 const fingerprint=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');const existing=db.prepare('SELECT report_json FROM migrations WHERE id=?').get(fingerprint);if(existing)return{...JSON.parse(existing.report_json),alreadyImported:true};
 if(db.prepare('SELECT count(*) AS n FROM organisations').get().n)throw Error('Migration requires an empty CRM. Existing records will not be overwritten.');
 const rows=snapshot.crmRows.slice(1).filter(r=>r.some(v=>v!==''&&v!=null)),ids=new Set();const report={organisations:0,contacts:0,activities:0,links:0,sourceReferences:0,warnings:[],snapshotExportedAt:snapshot.exportedAt,fingerprint};
 const warn=(id,field,message)=>report.warnings.push({id,field,message});
 const list=(v,id,field)=>{try{const a=JSON.parse(v||'[]');if(!Array.isArray(a))throw Error();return a;}catch{warn(id,field,'Unparsed value preserved in migration archive.');return[];}};
 const date=(v,id,field)=>{if(v==null||v==='')return null;const d=dateISO(v);if(validDate(d))return d;warn(id,field,'Unknown date preserved in migration archive.');return null;};
 for(const r of rows){if(!r[0]||ids.has(r[0])||!r[1])throw Error('Missing or duplicate organisation ID/name. Nothing imported.');ids.add(r[0]);}
 return transaction(db,()=>{
  for(const r of rows){const id=String(r[0]),s=i=>String(r[i]??'');const size=r[7]===''||r[7]==null?null:Number(r[7]);
   db.prepare('INSERT INTO organisations(id,name,type,fastbill_url,city,state,website,size,size_unit,status,phase,owner,last_contact,summary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,s(1),s(2),s(3),s(4),s(5),s(6),Number.isFinite(size)?size:null,s(8),s(9),s(10),s(11),date(r[15],id,'last_contact'),s(18),now(),now());report.organisations++;
   db.prepare('INSERT INTO migration_archive VALUES(?,?,?)').run(uid(),id,JSON.stringify({row:r}));
   const addSources=(items,activityId=null,contactId=null)=>{for(const source of items||[]){db.prepare('INSERT INTO source_references VALUES(?,?,?,?,?)').run(uid(),id,activityId,contactId,JSON.stringify(source));report.sourceReferences++;}};
   let primary=false;const contactList=list(r[20],id,'contacts');
   for(const c of contactList){const emails=Array.isArray(c.e_mails)?c.e_mails.map(String):[],phones=Array.isArray(c.telefone)?c.telefone.map(String):[];const matches=!primary&&((s(13)&&emails.some(e=>e.toLowerCase()===s(13).toLowerCase()))||(!s(13)&&s(12)&&c.name===s(12))||(!s(13)&&!s(12)&&s(14)&&phones.includes(s(14))&&contactList.filter(x=>(x.telefone||[]).includes(s(14))).length===1));const cid=addContact(db,id,{name:c.name||'',rolle:c.rolle||'',e_mails:emails,telefone:phones,legacy:c},matches);if(matches){primary=true;
    // Scalar main-contact fields are the visible current values; retain alternates as addresses.
    if(s(12))db.prepare('UPDATE contacts SET name=? WHERE id=?').run(s(12),cid);
    for(const [kind,v]of[['email',s(13)],['phone',s(14)]])if(v){db.prepare('UPDATE contact_addresses SET position=position+1 WHERE contact_id=? AND kind=?').run(cid,kind);const old=db.prepare('SELECT id FROM contact_addresses WHERE contact_id=? AND kind=? AND value=?').get(cid,kind,v);if(old)db.prepare('UPDATE contact_addresses SET position=0 WHERE id=?').run(old.id);else db.prepare('INSERT INTO contact_addresses VALUES(?,?,?,?,0)').run(uid(),cid,kind,v);}
   }report.contacts++;addSources(c.quellen,null,cid);}
   if(!primary&&(s(12)||s(13)||s(14))){addContact(db,id,{name:s(12),e_mails:s(13)?[s(13)]:[],telefone:s(14)?[s(14)]:[]},true);report.contacts++;warn(id,'contacts','Main contact not found in contacts JSON; preserved as a separate contact.');}
   for(const h of list(r[21],id,'history')){const aid=uid(),occurred=date(h.datum,id,'history.date');db.prepare('INSERT INTO activities VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(aid,id,String(h.art||'Historische Notiz'),occurred,now(),null,h.autor_name||h.autor||null,String(h.text||''),['Kontakt','Telefonat','E-Mail erhalten','E-Mail gesendet'].includes(h.art)&&occurred?1:0,null,JSON.stringify(h));report.activities++;addSources(h.quellen,aid);}
   addSources(list(r[23],id,'sources'));
   if(s(16)||r[17])db.prepare('INSERT INTO followups VALUES(?,?,?,?,?,NULL)').run(uid(),id,s(16),date(r[17],id,'followup.date'),s(11));
   if(s(19))db.prepare('INSERT INTO review_issues VALUES(?,?,?,NULL)').run(uid(),id,s(19));
  }
  const putLink=(id,a,b,note,mirror=false)=>{if(!ids.has(a)||!ids.has(b)||a===b){warn(a,'links','Unresolved relationship preserved in migration archive.');return;}[a,b]=[a,b].sort();const prior=db.prepare('SELECT * FROM organisation_links WHERE a=? AND b=?').get(a,b);if(prior){if(prior.note!==note)warn(a,'links','Different relationship notes: canonical tab retained; original row retained in archive.');return;}db.prepare('INSERT INTO organisation_links VALUES(?,?,?,?)').run(id||uid(),a,b,note||'');report.links++;};
  db.prepare('INSERT INTO migration_archive VALUES(?,NULL,?)').run(uid(),JSON.stringify({links:snapshot.linkRows}));
  for(const r of snapshot.linkRows.slice(1).filter(r=>r[0]))putLink(r[0],r[1],r[3],r[5]);
  for(const r of rows)for(const link of list(r[22],r[0],'linked_entities'))putLink(null,r[0],link.entitaet_id,link.notiz,true);
  for(const id of ids)reindex(db,id);
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Migration failed relationship validation.');
  db.prepare('INSERT INTO migrations VALUES(?,?,?)').run(fingerprint,now(),JSON.stringify(report));return report;
 });
}
