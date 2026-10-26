import test from 'node:test';
import assert from 'node:assert/strict';
import {contactName,organisationSubtitle} from '../src/domain.ts';
import {openDB} from '../server/db.mjs';
import {createOrg,addContact,contacts,contactSave,getOrg} from '../server/crm.mjs';
import {extensionAction} from '../server/extension.mjs';
import {addUser} from '../server/auth.mjs';
test('email names support personal and shared addresses without overwriting entered names',()=>{
 assert.equal(contactName('', 'paul.schubert@s-f.com'),'Paul Schubert');
 assert.equal(contactName('socialmedia@client.com','socialmedia@client.com'),'Socialmedia');
 assert.equal(contactName('', 'jane_doe+campaign@example.com'),'Jane Doe');
 assert.equal(contactName('Dr. McDonald','jane_doe@example.com'),'Dr. McDonald');
 assert.equal(contactName('', '12345@example.com'),'');
 const values=[];values[2]='Unklar';assert.equal(organisationSubtitle({values}),'');values[4]='Berlin';assert.equal(organisationSubtitle({values}),'Berlin');
});
test('new imports infer names; known names win in lookup and contact editing preserves legacy primary state',async()=>{
 const db=openDB(':memory:');try{const id=await addUser(db,'alex@team.test','Alex','long-password-1234'),user=db.prepare('SELECT * FROM users WHERE id=?').get(id),org=createOrg(db,user,'Client');
 const cid=addContact(db,org.id,{e_mails:['socialmedia@client.com']},true);assert.equal(contacts(db,org.id)[0].name,'Socialmedia');
 contactSave(db,user,{id:org.id,version:String(getOrg(db,org.id).version),contactId:cid,name:'Media Team',emails:'socialmedia@client.com',phones:'',role:''});
 assert.equal(contacts(db,org.id)[0].primary,true);
 const r=extensionAction(db,user,{action:'lookup',mailbox:user.email,from:{email:'socialmedia@client.com',name:''},recipients:[{email:user.email}]},'http://localhost:3000');assert.equal(r.participants[0].name,'Media Team');
 }finally{db.close();}
});
