import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {openDB} from '../server/db.mjs';
import {createOrg} from '../server/crm.mjs';
import {takeSnapshot,listSnapshots,latestHealthy,pruneSnapshots} from '../server/snapshots.mjs';

test('snapshots are self-contained, verified and readable while the database stays open',async()=>{const dir=mkdtempSync(join(tmpdir(),'stage-snap-'));const db=openDB(join(dir,'crm.sqlite'));try{
 createOrg(db,null,'Beispielstadt · DEMO');const s=await takeSnapshot(db,join(dir,'snapshots'));
 assert.equal(s.organisations,1);assert.match(s.sha256,/^[0-9a-f]{64}$/);
 assert.deepEqual(readdirSync(join(dir,'snapshots')).sort(),[s.file,s.file+'.json']);
 assert.equal(latestHealthy(join(dir,'snapshots')).file,s.file);
 assert.equal(latestHealthy(join(dir,'snapshots')).file,s.file,'Verification must not modify the snapshot.');
 const restored=openDB(s.path);assert.equal(restored.prepare('SELECT count(*) n FROM organisations').get().n,1);restored.close();
}finally{db.close();rmSync(dir,{recursive:true,force:true});}});

test('latest healthy snapshot skips damaged or unverified files and enforces a maximum age',async()=>{const dir=mkdtempSync(join(tmpdir(),'stage-snap-'));const snaps=join(dir,'snapshots');const db=openDB(join(dir,'crm.sqlite'));try{
 const good=await takeSnapshot(db,snaps,new Date(Date.now()-3*3600000));
 const damaged=await takeSnapshot(db,snaps,new Date(Date.now()-2*3600000));const bytes=readFileSync(damaged.path);bytes[bytes.length-100]^=0xff;writeFileSync(damaged.path,bytes);
 writeFileSync(join(snaps,'crm-29990101T000000Z.sqlite'),'not a database');
 assert.equal(latestHealthy(snaps).file,good.file);
 assert.throws(()=>latestHealthy(snaps,{maxAgeHours:1}),/older than 1 h/);
 assert.throws(()=>latestHealthy(join(dir,'missing')),/No healthy snapshot/);
}finally{db.close();rmSync(dir,{recursive:true,force:true});}});

test('rotation keeps the newest healthy snapshots',async()=>{const dir=mkdtempSync(join(tmpdir(),'stage-snap-'));const snaps=join(dir,'snapshots');const db=openDB(join(dir,'crm.sqlite'));try{
 const made=[];for(let i=5;i>=1;i--)made.push(await takeSnapshot(db,snaps,new Date(Date.now()-i*3600000)));
 assert.equal(pruneSnapshots(snaps,2).length,3);
 assert.deepEqual(listSnapshots(snaps).map(s=>s.file),[made[4].file,made[3].file]);
 assert.ok(!existsSync(made[0].path+'.json'));
}finally{db.close();rmSync(dir,{recursive:true,force:true});}});

test('CLI streams the latest healthy snapshot byte-for-byte',async()=>{const dir=mkdtempSync(join(tmpdir(),'stage-snap-'));try{
 const env={...process.env,DATA_DIR:dir};
 const path=execFileSync(process.execPath,['server/cli.mjs','snapshot'],{env,encoding:'utf8'}).trim();
 assert.equal(execFileSync(process.execPath,['server/cli.mjs','snapshot:latest'],{env,encoding:'utf8'}).trim(),path);
 assert.deepEqual(execFileSync(process.execPath,['server/cli.mjs','snapshot:latest','--stdout'],{env}),readFileSync(path));
 assert.equal(JSON.parse(execFileSync(process.execPath,['server/cli.mjs','snapshot:latest','--json'],{env,encoding:'utf8'})).path,path);
}finally{rmSync(dir,{recursive:true,force:true});}});
