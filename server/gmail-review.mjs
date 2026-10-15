import {limited} from './auth.mjs';
import {Problem,importPreview,confirmImport,contacts,getOrg,search,timelinePosition} from './crm.mjs';
import {validDate,todayBerlin} from '../src/domain.ts';

const brief=o=>({id:o.id,name:o.name,city:o.city||'',version:String(o.version)});
const berlinDate=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const neighbor=e=>e?{date:e.datum,title:e.subject||e.art||'Kontakt',kind:e.art}:null;

// Narrow, user-owned import workflow. No generic CRM read/write action is exposed.
export function reviewGmail(db,user,b,origin){
 if(!user.sidebar_review)throw new Problem('Für die Prüfung in Gmail bitte im CRM einen neuen Schlüssel erstellen und erneut verbinden.',403,'review_key_required');
 if(limited(db,'gmail-review:'+user.id,120,60000))throw new Problem('Bitte kurz warten und erneut versuchen.',429);
 if(!b||typeof b.importId!=='string'||!/^[a-f0-9-]{36}$/.test(b.importId))throw new Problem('Import-ID fehlt.');
 if(!['preview','search','context','confirm'].includes(b.action))throw new Problem('Unbekannter Prüfschritt.');
 const saved=db.prepare('SELECT * FROM requests WHERE id=?').get('import:'+b.importId);
 if(saved){
  if(saved.user_id!==user.id)throw new Problem('Import nicht gefunden.',404);
  const o=getOrg(db,saved.organisation_id);
  return{saved:true,alreadySaved:true,organisation:brief(o),organisationUrl:origin+'/?organisation='+encodeURIComponent(o.id)};
 }
 const p=importPreview(db,user,b.importId); // Ownership and expiry checked before every lookup.
 if(b.action==='search'){
  if(typeof b.query!=='string'||b.query.length>300)throw new Problem('Suchbegriff zu lang.');
  const query=b.query.trim();if(query.length<2)return{items:[]};
  const ids=search(db,query),direct=db.prepare('SELECT * FROM organisations WHERE instr(lower(name),lower(?))>0 ORDER BY name COLLATE NOCASE LIMIT 20').all(query);
  const found=new Map(direct.map(o=>[o.id,brief(o)]));
  for(const id of ids){if(found.size>=20)break;if(!found.has(id))found.set(id,brief(getOrg(db,id)));}
  return{items:[...found.values()]};
 }
 if(b.action==='confirm'){
  if(b.confirmed!==true)throw new Problem('Bitte den Import ausdrücklich bestätigen.');
  if(!['cleaned','original'].includes(b.bodyMode))throw new Problem('Textauswahl fehlt.');
  const result=confirmImport(db,user,{
   importId:b.importId,id:b.id,version:b.version,newOrganisation:b.newOrganisation,
   body:p[b.bodyMode],summary:b.summary,date:b.date,direction:b.direction,
   contactEmails:b.contactEmails,sourceUrl:p.sourceUrl,contacted:b.contacted
  });
  const o=getOrg(db,result.entity.id);
  return{saved:true,duplicate:!!result.duplicate,alreadySaved:!!result.alreadySaved,organisation:brief(o),organisationUrl:origin+'/?organisation='+encodeURIComponent(o.id)};
 }
 const date=b.date||p.existing?.date||(p.sentAt?berlinDate(p.sentAt):todayBerlin());
 if(!validDate(date)||date>todayBerlin())throw new Problem('Bitte ein gültiges E-Mail-Datum angeben.');
 const id=b.id||p.existing?.organisation_id||'';
 const o=id?getOrg(db,id):null;
 const cs=o?contacts(db,o.id):[];
 const bodyMode=b.bodyMode==='original'?'original':'cleaned',text=p[bodyMode];
 const page=Math.max(0,Math.min(Math.floor(Number(b.page)||0),Math.max(0,Math.ceil(text.length/3000)-1)));
 const pos=b.action==='context'&&!p.existing?timelinePosition(db,user,{importId:p.id,id: o?.id,date}):null;
 return{
  id:p.id,subject:p.subject,direction:p.existing?.direction||p.direction,date,
  candidates:p.candidates.slice(0,10),bestId:p.bestId,suggestedName:p.suggestedName,existing:p.existing,
  participants:p.participants.map(a=>({...a,known:cs.some(c=>c.e_mails.some(email=>email.toLowerCase()===a.email))})),
  organisation:o?brief(o):null,contacted:p.suggestedContacted!==false,
  bodyMode,bodyLength:text.length,body:text.length<=12000?text:null,
  page,pages:Math.max(1,Math.ceil(text.length/3000)),excerpt:text.slice(page*3000,(page+1)*3000),
  removed:!!p.removed,warnings:p.warnings,
  position:pos?{position:pos.position,total:pos.total,before:neighbor(pos.before),after:neighbor(pos.after)}:null,
  reviewUrl:origin+'/?import='+encodeURIComponent(p.id)
 };
}
