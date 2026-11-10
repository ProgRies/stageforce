import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {dataCheckIssue,dataCheckList} from '../src/domain.ts';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,getOrg,entity,listData,save} from '../server/crm.mjs';
import {locationSave} from '../server/map.mjs';
import {prepareCall,saveCall} from '../server/calls.mjs';
import {addContact} from '../server/crm.mjs';
async function setup(){const db=openDB(':memory:');const id=await addUser(db,'alex@team.test','Alex','long-password-1234');return{db,user:db.prepare('SELECT * FROM users WHERE id=?').get(id)};}
const org=(name,status,fastbill='',location=null)=>{const values=[];values[1]=name;values[3]=fastbill;values[9]=status;return{id:name,row:0,version:'1',values,location};};
const names=list=>list.map(e=>e.values[1]);
const link='https://my.fastbill.com/index.php?s=abc';

test('FastBill check flags Kunden and ehemalige Kunden without a valid link, nobody else',()=>{
 const all=[org('Kunde ohne','Kunde'),org('Kunde mit','Kunde',link),org('Ehemals ohne','Ehemaliger Kunde'),org('Lead ohne','Lead'),org('Partner ohne','Partner / Agentur'),org('Kunde kaputt','Kunde','https://example.com/fake')];
 assert.deepEqual(names(dataCheckList(all,'fastbill')),['Kunde kaputt','Kunde ohne','Ehemals ohne']);
 assert.equal(dataCheckIssue(all[0],'fastbill'),'FastBill-Link fehlt');
 assert.equal(dataCheckIssue(all[5],'fastbill'),'FastBill-Link ungültig');
 assert.equal(dataCheckIssue(all[3],'fastbill'),'');
});
test('pin check flags every organisation without a pin, Kunden first',()=>{
 const all=[org('Zeta Lead','Lead'),org('Alpha Lead','Lead'),org('Mit Pin','Kunde','',{lat:50,lng:10}),org('Beta Kunde','Kunde'),org('Ehemals','Ehemaliger Kunde')];
 assert.deepEqual(names(dataCheckList(all,'pins')),['Beta Kunde','Ehemals','Alpha Lead','Zeta Lead']);
 assert.equal(dataCheckIssue(all[2],'pins'),'');assert.equal(dataCheckIssue(all[0],'pins'),'Kein Kartenpin');
});
test('checks read the loaded list, clear once link or pin is saved, and leave Prüfen handoffs alone',async()=>{const{db,user}=await setup();try{
 const a=createOrg(db,user,'Stadt Kunde');
 save(db,user,{id:a.id,version:entity(db,a.id).version,requestId:randomUUID(),fields:{9:'Kunde'}});
 const cid=addContact(db,a.id,{name:'Pat',telefone:['030 1234567']});
 const call=prepareCall(db,user,{organisationId:a.id,contactId:cid,phone:'030 1234567',startedAt:new Date().toISOString(),requestId:randomUUID()});
 saveCall(db,user,{callId:call.callId,notes:'',outcome:'email'});
 const before=listData(db);
 assert.deepEqual(before.entities.filter(e=>dataCheckIssue(e,'fastbill')).map(e=>e.id),[a.id]);
 assert.deepEqual(before.entities.filter(e=>dataCheckIssue(e,'pins')).map(e=>e.id),[a.id]);
 save(db,user,{id:a.id,version:entity(db,a.id).version,requestId:randomUUID(),fields:{3:link}});
 locationSave(db,user,{id:a.id,version:getOrg(db,a.id).version,location:{lat:50.1,lng:8.7}});
 const after=listData(db);
 assert.deepEqual(after.entities.filter(e=>dataCheckIssue(e,'fastbill')||dataCheckIssue(e,'pins')),[]);
 // Running the checks writes nothing: the handoff from the call is still the only Prüfen item.
 assert.deepEqual(after.review.map(r=>[r.id,r.text]),[[a.id,'E-Mail senden']]);
}finally{db.close();}});
