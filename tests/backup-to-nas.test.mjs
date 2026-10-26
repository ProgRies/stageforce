import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readdirSync,readFileSync,chmodSync,utimesSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {openDB} from '../server/db.mjs';
import {takeSnapshot} from '../server/snapshots.mjs';

// docker, rsync and ssh are replaced by stubs: docker runs the CLI locally, rsync copies, ssh runs the remote command locally.
function setup(){
 const dir=mkdtempSync(join(tmpdir(),'stage-nas-')),bin=join(dir,'bin'),data=join(dir,'data'),nas=join(dir,'nas');for(const d of [bin,data,nas])mkdirSync(d);
 const stub=(name,body)=>{writeFileSync(join(bin,name),'#!/bin/sh\n'+body);chmodSync(join(bin,name),0o755);};
 stub('docker',`shift 5; cd '${resolve('.')}' && DATA_DIR='${data}' exec '${process.execPath}' --no-warnings "$@"\n`);
 stub('rsync','last=; for a in "$@"; do last=$a; done; skip=; for a in "$@"; do if [ -n "$skip" ]; then skip=; continue; fi; case "$a" in -e) skip=1;; -*) ;; "$last") ;; *) cp -p "$a" "${last#*:}";; esac; done\n');
 stub('ssh','while [ $# -gt 0 ]; do case "$1" in -o|-i) shift 2;; *) break;; esac; done; shift; exec sh -c "$1"\n');
 const run=(env={})=>spawnSync('sh',['scripts/backup-to-nas.sh'],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH,NAS_TARGET:'nas:'+nas,STAGING_DIR:join(dir,'stage'),...env}});
 return {dir,data,nas,run};
}

test('NAS backup uploads a verified copy with checksum and prunes only old copies',async()=>{const {dir,data,nas,run}=setup();try{
 const db=openDB(join(data,'crm.sqlite'));await takeSnapshot(db,join(data,'snapshots'));db.close();
 writeFileSync(join(nas,'stageforce-20200101T000000Z.sqlite'),'old');const old=new Date(Date.now()-40*86400000);utimesSync(join(nas,'stageforce-20200101T000000Z.sqlite'),old,old);
 writeFileSync(join(nas,'unrelated.txt'),'keep');utimesSync(join(nas,'unrelated.txt'),old,old);
 const r=run();assert.equal(r.status,0,r.stderr);
 const files=readdirSync(nas).sort();assert.equal(files.length,3,files.join());assert.ok(files.includes('unrelated.txt'));
 const copy=files.find(f=>/^stageforce-\d{8}T\d{6}Z\.sqlite$/.test(f));assert.ok(copy);
 assert.equal(readFileSync(join(nas,copy)).subarray(0,15).toString(),'SQLite format 3');
 assert.match(readFileSync(join(nas,copy+'.sha256'),'utf8'),new RegExp(copy.replace('.','\\.')+'$','m'));
 assert.match(r.stderr,/pruned on NAS: \.\/stageforce-20200101T000000Z\.sqlite/);
}finally{rmSync(dir,{recursive:true,force:true});}});

test('NAS backup fails without a fresh healthy snapshot and leaves the NAS untouched',async()=>{const {dir,data,nas,run}=setup();try{
 writeFileSync(join(nas,'stageforce-20200101T000000Z.sqlite'),'old');const old=new Date(Date.now()-40*86400000);utimesSync(join(nas,'stageforce-20200101T000000Z.sqlite'),old,old);
 let r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/No healthy snapshot/);assert.match(r.stderr,/FAILED/);
 const db=openDB(join(data,'crm.sqlite'));await takeSnapshot(db,join(data,'snapshots'),new Date(Date.now()-24*3600000));db.close();
 r=run({MAX_AGE_HOURS:'12'});assert.notEqual(r.status,0);assert.match(r.stderr,/older than 12 h/);
 assert.deepEqual(readdirSync(nas),['stageforce-20200101T000000Z.sqlite']);
 assert.deepEqual(readdirSync(join(dir,'stage')),[],'no partial copy is left behind');
}finally{rmSync(dir,{recursive:true,force:true});}});
