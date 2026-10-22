import test from 'node:test';
import assert from 'node:assert/strict';
import {openDB} from '../server/db.mjs';
import {addUser,createSession} from '../server/auth.mjs';
import {appearance,saveAppearance} from '../server/appearance.mjs';
import {extensionAction} from '../server/extension.mjs';
import {makeServer} from '../server/http.mjs';
test('appearance is user scoped, validated, and shared with the extension and session',async()=>{
 const db=openDB(':memory:');const a=await addUser(db,'a@example.test','A','long-password-1234'),b=await addUser(db,'b@example.test','B','long-password-1234');const user=db.prepare('SELECT * FROM users WHERE id=?').get(a),other={id:b};
 assert.equal(appearance(db,user),null);saveAppearance(db,user,{mode:'dark'});assert.equal(appearance(db,other),null);assert.throws(()=>saveAppearance(db,user,{mode:'invalid'}));assert.equal(extensionAction(db,user,{action:'check'},'http://localhost:3000').appearance,'dark');
 const session=createSession(db,user),origin='http://localhost:3000',server=makeServer(db,{origin});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,headers={Origin:origin,Cookie:'stage_session='+session.token,'Content-Type':'application/json'};
 try{assert.equal((await(await fetch(base+'/api/session',{headers})).json()).data.appearance,'dark');assert.equal((await fetch(base+'/api/crm',{method:'POST',headers,body:JSON.stringify({action:'appearanceSave',mode:'light'})})).status,403);assert.equal((await fetch(base+'/api/crm',{method:'POST',headers:{...headers,'X-CSRF-Token':session.csrf},body:JSON.stringify({action:'appearanceSave',mode:'system'})})).status,200);assert.equal(appearance(db,user),'system');}finally{await new Promise(r=>server.close(r));db.close();}
});
