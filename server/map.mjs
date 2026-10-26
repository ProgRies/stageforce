import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {now,transaction} from './db.mjs';
import {Problem,getOrg,assertVersion,audit,addActivity,entity} from './crm.mjs';
import {todayBerlin} from '../src/domain.ts';
const coordinate=(value,limit)=>{const n=Number(value);if(value===''||value==null||!Number.isFinite(n)||Math.abs(n)>limit)throw new Problem('Ungültiger Standort.');return Math.round(n*1e6)/1e6;};

// One optional pin per organisation. null removes it.
export function locationSave(db,user,b){
 const next=b.location==null?null:{lat:coordinate(b.location.lat,90),lng:coordinate(b.location.lng,180)};
 return transaction(db,()=>{
  const o=getOrg(db,b.id);assertVersion(o,b.version);
  const before=db.prepare('SELECT lat,lng FROM organisation_locations WHERE organisation_id=?').get(o.id);const from=before?{lat:before.lat,lng:before.lng}:null;
  if(JSON.stringify(from)===JSON.stringify(next))throw new Problem('Keine Änderung.');
  if(next)db.prepare('INSERT INTO organisation_locations VALUES(?,?,?,?) ON CONFLICT(organisation_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,updated_at=excluded.updated_at').run(o.id,next.lat,next.lng,now());
  else db.prepare('DELETE FROM organisation_locations WHERE organisation_id=?').run(o.id);
  audit(db,o.id,user,'location',{from,to:next});
  addActivity(db,o.id,user,{type:'CRM-Änderung',text:next?(from?'Kartenpin verschoben':'Kartenpin gesetzt'):'Kartenpin entfernt',date:todayBerlin()});
  db.prepare('UPDATE organisations SET version=version+1,updated_at=? WHERE id=?').run(now(),o.id);
  return{entity:entity(db,o.id,true)};
 });
}

// Map tiles and place search go through this server, so browsers never contact the map provider:
// the provider sees the server, not who looks at which organisation. Tiles are cached on disk.
export function mapService({dir=resolve(process.env.DATA_DIR||'data','map-tiles'),tileURL=process.env.MAP_TILE_URL??'https://tile.openstreetmap.org/{z}/{x}/{y}.png',searchURL=process.env.MAP_SEARCH_URL??'https://nominatim.openstreetmap.org/search',agent='StageForce CRM',fresh=30*86400000,fetcher=fetch}={}){
 const running=new Map(),waiting=[];let active=0,lastSearch=0;
 const slot=async()=>{if(active>=4)await new Promise(r=>waiting.push(r));active++;};
 const release=()=>{active--;waiting.shift()?.();};
 async function download(z,x,y){
  await slot();try{const r=await fetcher(tileURL.replace('{z}',z).replace('{x}',x).replace('{y}',y),{headers:{'User-Agent':agent},signal:AbortSignal.timeout(10000)});
   const bytes=Buffer.from(await r.arrayBuffer());if(!r.ok||!String(r.headers.get('content-type')).startsWith('image/png')||bytes.length>1024*1024)throw Error('tile '+r.status);return bytes;}finally{release();}
 }
 async function tile(z,x,y){
  if(!tileURL)throw new Problem('Karte ist deaktiviert.',404,'not_found');
  if(!(z>=0&&z<=19&&x>=0&&y>=0&&x<2**z&&y<2**z))throw new Problem('Nicht gefunden.',404,'not_found');
  const file=resolve(dir,String(z),String(x),y+'.png');let cached=null;
  try{const s=await stat(file);cached=await readFile(file);if(Date.now()-s.mtimeMs<fresh)return cached;}catch{}
  const key=z+'/'+x+'/'+y;if(!running.has(key))running.set(key,download(z,x,y).then(async bytes=>{await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file+'.part',bytes);await rename(file+'.part',file);return bytes;}).finally(()=>running.delete(key)));
  try{return await running.get(key);}catch{if(cached)return cached;throw new Problem('Karte gerade nicht erreichbar.',502,'map_unavailable');}
 }
 // Only what someone typed into the search box is sent, never organisation names or contacts.
 async function search(query){
  const q=String(query||'').replace(/\s+/g,' ').trim().slice(0,120);if(!q)return[];
  if(!searchURL)throw new Problem('Ortssuche ist deaktiviert.',404,'not_found');
  // Nominatim allows one request per second for the whole server.
  const wait=lastSearch+1000-Date.now();lastSearch=Math.max(Date.now(),lastSearch+1000);if(wait>0)await new Promise(r=>setTimeout(r,wait));
  let items;try{const url=new URL(searchURL);url.search=new URLSearchParams({q,format:'jsonv2',limit:'5','accept-language':'de'});const r=await fetcher(url,{headers:{'User-Agent':agent},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('search '+r.status);items=await r.json();}catch{throw new Problem('Ortssuche gerade nicht erreichbar.',502,'map_unavailable');}
  return (Array.isArray(items)?items:[]).map(p=>({label:String(p.display_name||'').slice(0,300),lat:Number(p.lat),lng:Number(p.lon)})).filter(p=>p.label&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180);
 }
 return{tile,search};
}
