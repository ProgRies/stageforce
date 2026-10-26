import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readdirSync,readFileSync,writeFileSync,renameSync,rmSync,statSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {backupDB} from './db.mjs';
// Healthy snapshot = crm-<UTC>.sqlite plus a matching .json manifest, written only after the copy passed SQLite's checks.
export const snapshotDir=()=>resolve(process.env.SNAPSHOT_DIR||join(process.env.DATA_DIR||'data','snapshots'));
const hours=(name,fallback)=>{const v=Number(process.env[name]??fallback);if(!Number.isFinite(v)||v<0)throw Error(name+' must be a non-negative number.');return v;};
export const snapshotConfig=()=>({dir:snapshotDir(),intervalHours:hours('SNAPSHOT_INTERVAL_HOURS',6),keep:Math.max(1,Math.floor(hours('SNAPSHOT_KEEP',28)))});
const sha256=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
function verify(path){
 const db=new DatabaseSync(path,{readOnly:true});try{
  const integrity=db.prepare('PRAGMA integrity_check').all().map(r=>r.integrity_check);if(integrity.join()!=='ok')throw Error('integrity_check: '+integrity.slice(0,5).join('; '));
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('foreign_key_check reported violations');
  return {schema:db.prepare('PRAGMA user_version').get().user_version,organisations:db.prepare('SELECT count(*) n FROM organisations').get().n,users:db.prepare('SELECT count(*) n FROM users').get().n};
 }finally{db.close();}
}
export async function takeSnapshot(db,dir=snapshotDir(),date=new Date()){
 mkdirSync(dir,{recursive:true,mode:0o700});
 const name='crm-'+date.toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z')+'.sqlite',file=join(dir,name),partial=file+'.partial';
 try{
  await backupDB(db,partial);
  // Self-contained file: no -wal/-shm companions, so it can be copied or streamed as one file.
  const copy=new DatabaseSync(partial);try{copy.exec('PRAGMA journal_mode=DELETE');}finally{copy.close();}
  const checks=verify(partial),manifest={file:name,created_at:date.toISOString(),bytes:statSync(partial).size,sha256:sha256(partial),...checks};
  renameSync(partial,file);writeFileSync(file+'.json',JSON.stringify(manifest,null,2),{mode:0o600});
  return {...manifest,path:file};
 }catch(e){rmSync(partial,{force:true});rmSync(partial+'-journal',{force:true});throw e;}
}
export function listSnapshots(dir=snapshotDir()){
 let names;try{names=readdirSync(dir);}catch(e){if(e.code==='ENOENT')return [];throw e;}
 return names.filter(n=>/^crm-\d{8}T\d{6}Z\.sqlite$/.test(n)).sort().reverse().map(n=>{const path=join(dir,n);try{return {...JSON.parse(readFileSync(path+'.json','utf8')),path};}catch{return {file:n,path,healthy:false};}});
}
// Re-checks hash and SQLite integrity at read time, so a file damaged on disk after creation is skipped.
export function latestHealthy(dir=snapshotDir(),{maxAgeHours}={}){
 for(const s of listSnapshots(dir)){if(s.healthy===false)continue;try{if(sha256(s.path)!==s.sha256)continue;verify(s.path);}catch{continue;}
  if(maxAgeHours!=null&&Date.now()-Date.parse(s.created_at)>maxAgeHours*3600000)throw Error(`Latest healthy snapshot ${s.file} is older than ${maxAgeHours} h.`);
  return s;}
 throw Error('No healthy snapshot found in '+dir+'.');
}
export function pruneSnapshots(dir=snapshotDir(),keep=28){
 const removed=[];let healthy=0;
 for(const s of listSnapshots(dir)){if(s.healthy!==false&&++healthy<=keep)continue;if(s.healthy===false&&Date.now()-statSync(s.path).mtimeMs<3600000)continue;rmSync(s.path,{force:true});rmSync(s.path+'.json',{force:true});removed.push(s.file);}
 for(const n of readdirSync(dir))if(n.endsWith('.partial')&&Date.now()-statSync(join(dir,n)).mtimeMs>3600000)rmSync(join(dir,n),{force:true});
 return removed;
}
export const streamSnapshot=s=>createReadStream(s.path);
// Runs inside the application container: checks every 10 minutes and snapshots once the newest one is older than the interval.
export function scheduleSnapshots(db,{dir,intervalHours,keep}=snapshotConfig(),log=console){
 if(!intervalHours){log.log('Automatic snapshots disabled (SNAPSHOT_INTERVAL_HOURS=0).');return ()=>{};}
 let running=false;
 const tick=async()=>{if(running)return;running=true;try{
  const last=listSnapshots(dir).find(s=>s.healthy!==false);if(last&&Date.now()-Date.parse(last.created_at)<intervalHours*3600000)return;
  const s=await takeSnapshot(db,dir);const removed=pruneSnapshots(dir,keep);
  writeFileSync(join(dir,'last-run.json'),JSON.stringify({ok:true,at:new Date().toISOString(),file:s.file},null,2),{mode:0o600});
  log.log(`Snapshot ${s.file} created and verified${removed.length?`; removed ${removed.length} old`:''}.`);
 }catch(e){log.error('Snapshot failed: '+e.message);try{writeFileSync(join(dir,'last-run.json'),JSON.stringify({ok:false,at:new Date().toISOString(),error:e.message},null,2),{mode:0o600});}catch{}}finally{running=false;}};
 const first=setTimeout(tick,60000),timer=setInterval(tick,600000);first.unref();timer.unref();
 return ()=>{clearTimeout(first);clearInterval(timer);};
}
