import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,readFileSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
export const uid=()=>randomUUID();
export const now=()=>new Date().toISOString();
export function openDB(path=resolve(process.env.DATA_DIR||'data','crm.sqlite')){
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const db=new DatabaseSync(path,{timeout:5000});
 db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
 const version=db.prepare('PRAGMA user_version').get().user_version;if(version>2)throw Error('Database is newer than this application. Upgrade the application.');
 transaction(db,()=>{db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));db.exec('PRAGMA user_version=2');});
 if(path!==':memory:')chmodSync(path,0o600);return db;
}
export function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
export async function backupDB(db,path){mkdirSync(dirname(resolve(path)),{recursive:true,mode:0o700});await backup(db,path);chmodSync(path,0o600);}
export function reindex(db,id){
 const o=db.prepare('SELECT * FROM organisations WHERE id=?').get(id);if(!o)return;
 const parts=[...Object.values(o),...db.prepare('SELECT c.name,c.role,a.value FROM organisation_contacts oc JOIN contacts c ON c.id=oc.contact_id LEFT JOIN contact_addresses a ON a.contact_id=c.id WHERE oc.organisation_id=?').all(id).flatMap(Object.values),...db.prepare('SELECT a.body,m.body AS email_body,m.subject FROM activities a LEFT JOIN messages m ON m.id=a.message_id WHERE a.organisation_id=?').all(id).flatMap(Object.values),...db.prepare('SELECT text,due_date,owner FROM followups WHERE organisation_id=? AND completed_at IS NULL').all(id).flatMap(Object.values),...db.prepare('SELECT text FROM review_issues WHERE organisation_id=? AND resolved_at IS NULL').all(id).flatMap(Object.values),...db.prepare('SELECT note FROM organisation_links WHERE a=? OR b=?').all(id,id).flatMap(Object.values),...db.prepare('SELECT payload_json FROM source_references WHERE organisation_id=?').all(id).flatMap(Object.values)];
 db.prepare('DELETE FROM search_docs WHERE organisation_id=?').run(id);db.prepare('INSERT INTO search_docs(organisation_id,content) VALUES(?,?)').run(id,parts.filter(x=>x!=null).join(' '));
}
