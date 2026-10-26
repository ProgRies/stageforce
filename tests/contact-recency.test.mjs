import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDB} from '../server/db.mjs';
import {addUser} from '../server/auth.mjs';
import {createOrg,addContact,addActivity,contacts} from '../server/crm.mjs';
import {prepareCall,saveCall} from '../server/calls.mjs';
test('contacts prioritize recorded communication time within their organization, with alphabetical fallback',async()=>{
 const db=openDB(':memory:');try{
 const id=await addUser(db,'alex@team.test','Alex','long-password-1234'),user={id},org=createOrg(db,user,'One'),other=createOrg(db,user,'Two');
 const ids=Object.fromEntries(['Alpha','Bravo','Charlie','Zulu'].map(name=>[name,addContact(db,org.id,{name,telefone:['+49301234567']},name==='Alpha')]));
 assert.deepEqual(contacts(db,org.id).map(c=>c.name),['Alpha','Bravo','Charlie','Zulu']);
 const message=(cid,orgId,at)=>{const mid=randomUUID();db.prepare("INSERT INTO messages(id,dedupe_key,sender_json,recipients_json,sent_at,direction,body) VALUES(?,?,?, ?,?,'incoming','')").run(mid,mid,'[]','[]',at);const aid=addActivity(db,orgId,user,{type:'E-Mail erhalten',messageId:mid,date:at.slice(0,10)});db.prepare('INSERT INTO activity_contacts VALUES(?,?)').run(aid,cid);};
 message(ids.Charlie,org.id,'2026-10-22T12:00:00.000Z');
 message(ids.Zulu,org.id,'2020-01-01T12:00:00.000Z');
 db.prepare('INSERT INTO organisation_contacts VALUES(?,?,0)').run(other.id,ids.Alpha);message(ids.Alpha,other.id,'2026-10-23T12:00:00.000Z');
 assert.deepEqual(contacts(db,org.id).map(c=>c.name),['Charlie','Zulu','Alpha','Bravo']);
 const call=prepareCall(db,user,{requestId:randomUUID(),organisationId:org.id,contactId:ids.Bravo,phone:'+49301234567',startedAt:'2026-10-22T15:00:00.000Z'});
 assert.equal(contacts(db,org.id)[0].name,'Charlie');
 saveCall(db,user,{callId:call.callId,notes:'Called'});
 assert.deepEqual(contacts(db,org.id).map(c=>c.name),['Bravo','Charlie','Zulu','Alpha']);
 }finally{db.close();}
});
