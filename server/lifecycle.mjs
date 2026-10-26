import {now,transaction,reindex} from './db.mjs';
import {Problem,getOrg,assertVersion,audit,addActivity,entity} from './crm.mjs';
import {todayBerlin} from '../src/domain.ts';
const ids=(db,sql,...args)=>db.prepare(sql).all(...args).map(r=>Object.values(r)[0]);
const bump=(db,id)=>{db.prepare('UPDATE organisations SET version=version+1,updated_at=? WHERE id=?').run(now(),id);reindex(db,id);};
const linkedTo=(db,id)=>ids(db,'SELECT CASE WHEN a=? THEN b ELSE a END AS other FROM organisation_links WHERE a=? OR b=?',id,id,id);

// Removes one organisation with everything that only belongs to it: emails, notes, calls,
// follow-ups and contacts not shared with another organisation. The audit entry keeps only id and name.
export function deleteOrganisation(db,user,b){return transaction(db,()=>{
 const o=getOrg(db,b.id);assertVersion(o,b.version);
 if(typeof b.confirmName!=='string'||b.confirmName.trim()!==o.name.trim())throw new Problem('Zur Bestätigung den Namen der Organisation eingeben.');
 const id=o.id,others=linkedTo(db,id);
 const messages=ids(db,'SELECT message_id FROM activities WHERE organisation_id=? AND message_id IS NOT NULL',id);
 const own=ids(db,'SELECT contact_id FROM organisation_contacts WHERE organisation_id=? AND contact_id NOT IN (SELECT contact_id FROM organisation_contacts WHERE organisation_id<>?)',id,id);
 const counts={emails:messages.length,activities:ids(db,'SELECT count(*) FROM activities WHERE organisation_id=?',id)[0],contacts:own.length};
 db.prepare('DELETE FROM call_attempts WHERE organisation_id=?').run(id);
 for(const m of messages){db.prepare('UPDATE call_attempts SET source_message_id=NULL WHERE source_message_id=?').run(m);db.prepare('DELETE FROM message_sources WHERE message_id=?').run(m);db.prepare('DELETE FROM extension_message_refs WHERE message_id=?').run(m);}
 for(const c of own){db.prepare('DELETE FROM activity_contacts WHERE contact_id=?').run(c);db.prepare('DELETE FROM source_references WHERE contact_id=?').run(c);}
 db.prepare('DELETE FROM source_references WHERE organisation_id=?').run(id);
 db.prepare('DELETE FROM activities WHERE organisation_id=?').run(id);
 for(const m of messages)db.prepare('DELETE FROM messages WHERE id=?').run(m);
 db.prepare('DELETE FROM organisation_contacts WHERE organisation_id=?').run(id);
 for(const c of own)db.prepare('DELETE FROM contacts WHERE id=?').run(c);
 for(const table of ['followups','review_issues','requests','migration_archive','audit_log','fastbill_decisions','fastbill_mappings','organisation_locations'])db.prepare(`DELETE FROM ${table} WHERE organisation_id=?`).run(id);
 db.prepare("UPDATE fastbill_rows SET organisation_id=NULL,status='pending',note='' WHERE organisation_id=?").run(id);
 db.prepare('DELETE FROM organisation_links WHERE a=? OR b=?').run(id,id);
 db.prepare('DELETE FROM search_docs WHERE organisation_id=?').run(id);
 db.prepare('DELETE FROM organisations WHERE id=?').run(id);
 audit(db,null,user,'organisation_delete',{id,name:o.name,...counts});
 for(const other of others)bump(db,other);
 return{deleted:id,...counts};
});}

// Moves everything from one organisation into another and removes the source. The target keeps
// its own values; empty target fields are filled from the source.
export function mergeOrganisations(db,user,b){return transaction(db,()=>{
 const from=getOrg(db,b.id),into=getOrg(db,b.into);assertVersion(from,b.version);
 if(from.id===into.id)throw new Problem('Bitte eine andere Organisation auswählen.');
 const source=from.id,target=into.id,time=now();
 const targetPrimary=!!db.prepare('SELECT 1 FROM organisation_contacts WHERE organisation_id=? AND is_primary=1').get(target);
 for(const link of db.prepare('SELECT contact_id,is_primary FROM organisation_contacts WHERE organisation_id=?').all(source)){
  if(db.prepare('SELECT 1 FROM organisation_contacts WHERE organisation_id=? AND contact_id=?').get(target,link.contact_id))db.prepare('DELETE FROM organisation_contacts WHERE organisation_id=? AND contact_id=?').run(source,link.contact_id);
  else db.prepare('UPDATE organisation_contacts SET organisation_id=?,is_primary=? WHERE organisation_id=? AND contact_id=?').run(target,targetPrimary?0:link.is_primary,source,link.contact_id);
 }
 const openSource=db.prepare('SELECT * FROM followups WHERE organisation_id=? AND completed_at IS NULL').get(source);
 const openTarget=db.prepare('SELECT 1 FROM followups WHERE organisation_id=? AND completed_at IS NULL').get(target);
 if(openSource&&openTarget)db.prepare('UPDATE followups SET completed_at=? WHERE id=?').run(time,openSource.id);
 for(const table of ['activities','call_attempts','followups','review_issues','source_references','requests','audit_log','migration_archive','fastbill_rows','fastbill_decisions'])db.prepare(`UPDATE ${table} SET organisation_id=? WHERE organisation_id=?`).run(target,source);
 db.prepare('INSERT OR IGNORE INTO fastbill_mappings SELECT scope,source_key,? FROM fastbill_mappings WHERE organisation_id=?').run(target,source);
 db.prepare('DELETE FROM fastbill_mappings WHERE organisation_id=?').run(source);
 const others=[];for(const l of db.prepare('SELECT * FROM organisation_links WHERE a=? OR b=?').all(source,source)){
  const other=l.a===source?l.b:l.a;db.prepare('DELETE FROM organisation_links WHERE id=?').run(l.id);if(other===target)continue;
  const [a,z]=[target,other].sort();db.prepare('INSERT OR IGNORE INTO organisation_links VALUES(?,?,?,?)').run(l.id,a,z,l.note);others.push(other);
 }
 const fill=(col,empty='')=>(into[col]===empty||into[col]==null)&&from[col]!==empty&&from[col]!=null?from[col]:into[col];
 const summary=[into.summary,from.summary].map(s=>s.trim()).filter(Boolean).filter((s,i,all)=>all.indexOf(s)===i).join('\n\n');
 const lastContact=[into.last_contact,from.last_contact].filter(Boolean).sort().pop()||null;
 db.prepare('UPDATE organisations SET type=?,fastbill_url=?,city=?,state=?,website=?,size=?,size_unit=?,owner=?,summary=?,last_contact=? WHERE id=?').run(fill('type','Unklar'),fill('fastbill_url'),fill('city'),fill('state'),fill('website'),into.size??from.size,fill('size_unit'),fill('owner'),summary,lastContact,target);
 db.prepare('INSERT OR IGNORE INTO organisation_locations SELECT ?,lat,lng,updated_at FROM organisation_locations WHERE organisation_id=?').run(target,source);
 db.prepare('DELETE FROM search_docs WHERE organisation_id=?').run(source);
 db.prepare('DELETE FROM organisations WHERE id=?').run(source);
 audit(db,target,user,'organisation_merge',{from:{id:source,name:from.name},followupClosed:!!(openSource&&openTarget)});
 addActivity(db,target,user,{type:'CRM-Änderung',text:`Zusammengeführt mit „${from.name}“`,date:todayBerlin()});
 bump(db,target);for(const other of others)bump(db,other);
 return{entity:entity(db,target,true),merged:source};
});}
