import test from 'node:test';
import assert from 'node:assert/strict';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,save,history,getOrg} from '../server/crm.mjs';
import {issues,buildQueue} from '../src/domain.ts';
test('notes join the timeline while summary edits stay internal and partner status is supported',async()=>{
 const db=openDB(':memory:');try{
 const id=await addUser(db,'notes@example.test','Notes','long-password-1234'),user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
 let org=createOrg(db,user,'Agency');
 org=save(db,user,{id:org.id,version:org.version,requestId:'note-1',fields:{},note:{type:'Notiz',text:'Meeting preparation',date:'2026-10-22',contacted:false}}).entity;
 assert.equal(history(db,org.id,0,'communication').items[0].art,'Notiz');assert.equal(history(db,org.id,0,'internal').total,0);assert.equal(getOrg(db,org.id).last_contact,null);
 org=save(db,user,{id:org.id,version:org.version,requestId:'summary-1',fields:{18:'General context',9:'Partner / Agentur'}}).entity;
 assert.equal(history(db,org.id,0,'communication').total,1);assert.equal(history(db,org.id,0,'internal').items[0].art,'CRM-Änderung');assert.equal(org.values[18],'General context');assert.equal(org.values[9],'Partner / Agentur');assert.ok(!issues(org).some(s=>s.includes('Zahlenden Kundenstatus')));assert.deepEqual(buildQueue([org]),[]);
 }finally{db.close();}
});
