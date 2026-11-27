import {Problem,getOrg,contacts,search} from './crm.mjs';
// The phone app's caller picker: small answers with only what one tap needs (organisation, contacts, numbers),
// instead of the whole list the desktop loads.
const digits=s=>String(s||'').replace(/\D/g,'');
function caller(db,id){
 const o=getOrg(db,id),place=[o.city,o.type].find(v=>v&&v!=='Unklar')||'';
 return{id:o.id,name:o.name,version:String(o.version),subtitle:place,status:o.status,
  contacts:contacts(db,id).map(c=>({id:c.id,name:c.name,role:c.rolle,phones:c.telefone,emails:c.e_mails,primary:c.primary}))};
}
// What a call is most likely about: the organisations the user spoke to last. Today's planned calls are listed by the
// calendar below (TodaySchedule), so they are not repeated here; `due` stays empty for phones still running an older page.
export function mobileHome(db,user){
 const recent=db.prepare('SELECT organisation_id AS id,MAX(started_at) AS at FROM call_attempts WHERE user_id=? AND activity_id IS NOT NULL GROUP BY organisation_id ORDER BY at DESC LIMIT 5').all(user.id).map(r=>r.id);
 return{due:[],recent:recent.map(id=>caller(db,id))};
}
// Letters search names, places and notes; four or more digits also match the end or middle of a saved number.
export function mobileSearch(db,query){
 const q=String(query??'');if(q.length>200)throw new Problem('Suche ist zu lang.');
 const typed=digits(q),byPhone=[];
 if(typed.length>=4&&typed.length*2>=q.replace(/\s/g,'').length)for(const r of db.prepare("SELECT DISTINCT oc.organisation_id AS id,a.value FROM contact_addresses a JOIN organisation_contacts oc ON oc.contact_id=a.contact_id WHERE a.kind='phone'").all())if(digits(r.value).includes(typed)&&!byPhone.includes(r.id))byPhone.push(r.id);
 const words=q.trim()?search(db,q):[];const name=q.trim().toLowerCase();
 const byName=words.map(id=>({id,name:getOrg(db,id).name.toLowerCase()})).sort((a,b)=>Number(!a.name.startsWith(name))-Number(!b.name.startsWith(name))||Number(!a.name.includes(name))-Number(!b.name.includes(name))).map(r=>r.id);
 return{items:[...new Set([...byPhone,...byName])].slice(0,12).map(id=>caller(db,id))};
}
// One organisation as the phone app shows it, for a tap on today's schedule and to pick up a new version before a note is added
// or a contact is saved. The contact's e-mail addresses come along so saving a changed number from the phone keeps them.
export function mobileOrg(db,id){if(typeof id!=='string'||id.length>100)throw new Problem('Organisation nicht gefunden.',404);return caller(db,id);}
