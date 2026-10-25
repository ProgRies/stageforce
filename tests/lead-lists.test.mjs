import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,listData,save,getOrg} from '../server/crm.mjs';
import {deleteOrganisation} from '../server/lifecycle.mjs';
import {prepareCall,saveCall} from '../server/calls.mjs';
import {reserveQueue} from '../server/leads.mjs';
import {eligibleFor} from '../src/domain.ts';
async function setup(){const db=openDB(':memory:');const users=[];for(const[email,name]of[['alex@team.test','Alex'],['bea@team.test','Bea']]){const id=await addUser(db,email,name,'long-password-1234');users.push(db.prepare('SELECT * FROM users WHERE id=?').get(id));}return{db,alex:users[0],bea:users[1]};}
const byId=(db,id)=>listData(db).entities.find(e=>e.id===id);
test('colleagues never get the same organisation on their call lists',async()=>{const{db,alex,bea}=await setup();try{
 const free=createOrg(db,alex,'Free'),mine=createOrg(db,alex,'Mine'),theirs=createOrg(db,alex,'Theirs');
 save(db,alex,{id:mine.id,version:mine.version,requestId:randomUUID(),fields:{11:alex.id}});save(db,alex,{id:theirs.id,version:theirs.version,requestId:randomUUID(),fields:{11:bea.id}});
 assert.deepEqual(reserveQueue(db,alex,{ids:[free.id,mine.id,theirs.id]}).ids,[free.id,mine.id]);
 assert.deepEqual(reserveQueue(db,bea,{ids:[free.id,mine.id,theirs.id]}).ids,[theirs.id]);
 const entities=listData(db).entities;assert.equal(entities.find(e=>e.id===free.id).reservedBy,alex.id);
 assert.deepEqual(eligibleFor(entities,bea.id).map(e=>e.id),[theirs.id]);assert.deepEqual(eligibleFor(entities,alex.id).map(e=>e.id).sort(),[free.id,mine.id].sort());
 reserveQueue(db,alex,{ids:[mine.id]});assert.deepEqual(reserveQueue(db,bea,{ids:[free.id]}).ids,[free.id],'a new list releases the previous hold');
 assert.throws(()=>reserveQueue(db,alex,{ids:'x'}),/Anrufliste/);
}finally{db.close();}});
test('the first saved call claims an unowned organisation; owner changes need a real user',async()=>{const{db,alex,bea}=await setup();try{
 const o=createOrg(db,alex,'Lead'),cid=addContact(db,o.id,{name:'Pat',telefone:['030 1234567']});
 const call=prepareCall(db,bea,{organisationId:o.id,contactId:cid,phone:'030 1234567',startedAt:new Date().toISOString(),requestId:randomUUID()});saveCall(db,bea,{callId:call.callId,notes:'Hi'});
 assert.equal(byId(db,o.id).ownerId,bea.id);
 const again=prepareCall(db,alex,{organisationId:o.id,contactId:cid,phone:'030 1234567',startedAt:new Date().toISOString(),requestId:randomUUID()});saveCall(db,alex,{callId:again.callId});assert.equal(byId(db,o.id).ownerId,bea.id,'a colleague calling does not take it over');
 const v=getOrg(db,o.id).version;assert.throws(()=>save(db,alex,{id:o.id,version:v,requestId:randomUUID(),fields:{11:'Somebody'}}),/Team/);
 save(db,alex,{id:o.id,version:v,requestId:randomUUID(),fields:{11:alex.id}});assert.equal(byId(db,o.id).ownerId,alex.id);
 reserveQueue(db,alex,{ids:[o.id]});const fresh=getOrg(db,o.id);deleteOrganisation(db,alex,{id:o.id,version:fresh.version,confirmName:'Lead'});
}finally{db.close();}});
test('legacy free-text owners resolve to matching users and stay unowned otherwise',async()=>{const{db,alex}=await setup();try{
 const a=createOrg(db,alex,'A'),b=createOrg(db,alex,'B');db.prepare("UPDATE organisations SET owner='alex' WHERE id=?").run(a.id);db.prepare("UPDATE organisations SET owner='Ex-Kollege' WHERE id=?").run(b.id);
 assert.equal(byId(db,a.id).ownerId,alex.id);assert.equal(byId(db,b.id).ownerId,'');assert.deepEqual(listData(db).users.map(u=>u.name),['Alex','Bea']);
}finally{db.close();}});
