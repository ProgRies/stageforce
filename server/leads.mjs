import {now,transaction,reindex} from './db.mjs';
import {Problem,getOrg,audit} from './crm.mjs';
import {todayBerlin} from '../src/domain.ts';
// Each organisation belongs to at most one user ("Zuständig intern"). Older rows may still hold a
// name or email as free text, so ownership is resolved against the user list when reading.
export const teamUsers=db=>db.prepare('SELECT id,name,email FROM users WHERE active=1 ORDER BY name COLLATE NOCASE').all();
export function ownerResolver(db){const users=db.prepare('SELECT id,name,email FROM users').all(),by=new Map();for(const u of users){by.set(u.id,u.id);by.set(u.email.toLowerCase(),u.id);if(!by.has(u.name.trim().toLowerCase()))by.set(u.name.trim().toLowerCase(),u.id);}return owner=>by.get(String(owner||'').trim().toLowerCase())||'';}
export function reservations(db,day=todayBerlin()){return new Map(db.prepare('SELECT organisation_id,user_id FROM call_reservations WHERE day=?').all(day).map(r=>[r.organisation_id,r.user_id]));}
export function validOwner(db,value){if(value&&!db.prepare('SELECT 1 FROM users WHERE id=? AND active=1').get(value))throw new Problem('Bitte eine Person aus dem Team auswählen.');return value;}
// Holds the organisations of a freshly built call list for this user today. Organisations owned
// by or already held for a colleague are refused; the caller gets back the ids it may keep.
export function reserveQueue(db,user,b){
 if(!Array.isArray(b.ids)||b.ids.length>100||b.ids.some(id=>typeof id!=='string'||id.length>100))throw new Problem('Ungültige Anrufliste.');
 const day=todayBerlin(),resolve=ownerResolver(db);
 return transaction(db,()=>{
  db.prepare('DELETE FROM call_reservations WHERE day<?').run(day);
  db.prepare('DELETE FROM call_reservations WHERE day=? AND user_id=?').run(day,user.id);
  const granted=[];for(const id of new Set(b.ids)){const o=db.prepare('SELECT owner FROM organisations WHERE id=?').get(id);if(!o)continue;const owner=resolve(o.owner);if(owner&&owner!==user.id)continue;
   const held=db.prepare('SELECT user_id FROM call_reservations WHERE organisation_id=? AND day=?').get(id,day);if(held&&held.user_id!==user.id)continue;
   if(!owner)db.prepare('INSERT OR IGNORE INTO call_reservations VALUES(?,?,?)').run(id,day,user.id);granted.push(id);}
  return{ids:granted};
 });
}
// The first saved call to an organisation nobody owns makes the caller its owner.
export function claimOnCall(db,user,id){const o=getOrg(db,id);if(ownerResolver(db)(o.owner))return false;db.prepare('UPDATE organisations SET owner=?,updated_at=? WHERE id=?').run(user.id,now(),id);db.prepare('UPDATE followups SET owner=? WHERE organisation_id=? AND completed_at IS NULL').run(user.id,id);audit(db,id,user,'owner_claim',{before:o.owner,after:user.id});reindex(db,id);return true;}
