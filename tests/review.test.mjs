import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {phone,todayBerlin} from '../src/domain.ts';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,entity,listData,save,reviewDone,stageImport,confirmImport,history} from '../server/crm.mjs';
import {prepareCall,saveCall} from '../server/calls.mjs';
import {parseEmail} from '../server/email.mjs';
async function setup(){const db=openDB(':memory:');const id=await addUser(db,'alex@our-team.test','Alex','long-password-1234');return{db,user:db.prepare('SELECT * FROM users WHERE id=?').get(id)};}
const call=(db,user,org,outcome,notes='',extra={})=>{const cid=addContact(db,org.id,{name:'Pat',telefone:['030 1234567']});const r=prepareCall(db,user,{organisationId:org.id,contactId:cid,phone:'030 1234567',startedAt:new Date().toISOString(),requestId:randomUUID()});return saveCall(db,user,{callId:r.callId,notes,outcome,...extra});};
const outgoing=id=>parseEmail(Buffer.from(`From: Alex <alex@our-team.test>\r\nTo: Pat <pat@customer.test>\r\nMessage-ID: <${id}@example.test>\r\nDate: Tue, 13 Oct 2026 10:00:00 +0200\r\nSubject: Angebot\r\n\r\nAnbei das Angebot.`),'alex@our-team.test');

test('a blank database has nothing to review; old field checks no longer flag organisations',async()=>{const{db,user}=await setup();try{
 createOrg(db,user,'Without phone or FastBill');assert.deepEqual(listData(db).review,[]);
}finally{db.close();}});
test('Prüfen lists flagged organisations with the latest timeline entry and who wrote it',async()=>{const{db,user}=await setup();try{
 const org=createOrg(db,user,'Stadt Beispiel');call(db,user,org,'email','Angebot für 30 Lizenzen schicken');
 const [item]=listData(db).review;assert.equal(item.id,org.id);assert.equal(item.text,'E-Mail senden');
 assert.equal(item.last.kind,'Anruf · E-Mail nötig');assert.equal(item.last.text,'Angebot für 30 Lizenzen schicken');assert.equal(item.last.author,'Alex');
 const later=save(db,user,{id:org.id,version:entity(db,org.id).version,requestId:randomUUID(),fields:{},note:{type:'Notiz',text:'Bitte an Herrn Muster',date:todayBerlin(),contacted:false}});
 assert.equal(listData(db).review[0].last.text,'Bitte an Herrn Muster');assert.ok(later.entity);
}finally{db.close();}});
test('Erledigt resolves every open point once, checks the version and logs it internally',async()=>{const{db,user}=await setup();try{
 const org=createOrg(db,user,'Kreis Muster');call(db,user,org,'email');
 assert.throws(()=>reviewDone(db,user,{id:org.id,version:'0'}),/geändert/);
 const v=entity(db,org.id).version;const r=reviewDone(db,user,{id:org.id,version:v});assert.equal(r.entity.values[19],'');assert.deepEqual(listData(db).review,[]);
 assert.match(history(db,org.id,0,'internal').items[0].text,/Erledigt: E-Mail senden/);
 assert.equal(reviewDone(db,user,{id:org.id,version:r.entity.version}).entity.version,r.entity.version);
}finally{db.close();}});
test('saving an outgoing email to the organisation resolves "E-Mail senden" but keeps other points',async()=>{const{db,user}=await setup();try{
 const org=createOrg(db,user,'Gemeinde Test');call(db,user,org,'email');
 save(db,user,{id:org.id,version:entity(db,org.id).version,requestId:randomUUID(),fields:{19:'Vertrag prüfen'}});
 assert.equal(listData(db).review[0].text,'Vertrag prüfen');
 call(db,user,org,'email');assert.deepEqual(listData(db).review[0].text.split('\n').sort(),['E-Mail senden','Vertrag prüfen']);
 const p=stageImport(db,user,await outgoing('send-1'));confirmImport(db,user,{importId:p.id,id:org.id,version:entity(db,org.id).version,date:'2026-10-13',direction:'outgoing'});
 assert.equal(listData(db).review[0].text,'Vertrag prüfen');
}finally{db.close();}});
test('phone checks agree between compact lists and full records when primary numbers are unusable',()=>{
 const db=openDB(':memory:');try{
  const org=createOrg(db,null,'Fictional customer');
  addContact(db,org.id,{name:'Primary',telefone:['123']},true);
  addContact(db,org.id,{name:'Other',telefone:['?', '+49 123456789']});
  const compact=listData(db).entities[0],full=entity(db,org.id,true);
  assert.equal(phone(compact),'+49 123456789');assert.equal(phone(full),phone(compact));
 }finally{db.close();}
});
