import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDB} from '../server/db.mjs';
import {addUser,createSession} from '../server/auth.mjs';
import {extensionCreate} from '../server/extension.mjs';
import {makeServer} from '../server/http.mjs';
const origin='http://localhost:3000';
async function fixture(run,path=':memory:'){
 const db=openDB(path);const users=[];
 for(const [mail,name] of [['alex@team.test','Alex'],['sam@team.test','Sam']]){const id=await addUser(db,mail,name,'long-password-1234');const user=db.prepare('SELECT * FROM users WHERE id=?').get(id),session=createSession(db,user);users.push({user,session,auth:{Origin:origin,Cookie:'stage_session='+session.token,'X-CSRF-Token':session.csrf}});}
 const server=makeServer(db,{origin});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,headers)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}).then(r=>r.json());
 try{await run({db,users,base,post,server});}finally{await new Promise(r=>server.close(r));db.close();}
}
// Reads Server-Sent Events from a stream and lets the test wait for the next one of a kind.
async function listen(base,headers){
 const res=await fetch(base+'/api/live',{headers});if(res.status!==200)return{status:res.status};
 const reader=res.body.pipeThrough(new TextDecoderStream()).getReader(),events=[],waiters=[];let buffer='',closed=false;
 (async()=>{try{for(;;){const{value,done}=await reader.read();if(done)break;buffer+=value;let i;while((i=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,i);buffer=buffer.slice(i+2);const event=block.match(/^event: (.*)$/m)?.[1],data=block.match(/^data: (.*)$/m)?.[1];if(event){events.push({event,data:JSON.parse(data)});waiters.splice(0).forEach(w=>w());}}}}catch{}closed=true;waiters.splice(0).forEach(w=>w());})();
 async function next(event,ms=2000){const end=Date.now()+ms;for(;;){const i=events.findIndex(e=>e.event===event);if(i>=0)return events.splice(i,1)[0].data;if(closed||Date.now()>end)return null;await new Promise(r=>{waiters.push(r);setTimeout(r,end-Date.now());});}}
 return{status:200,res,next,events,isClosed:()=>closed,stop:()=>reader.cancel()};
}

test('the live stream needs a valid session and rejects other origins',()=>fixture(async({base,users})=>{
 assert.equal((await fetch(base+'/api/live')).status,401);
 assert.equal((await fetch(base+'/api/live',{headers:{Cookie:'stage_session=forged'}})).status,401);
 assert.equal((await fetch(base+'/api/live',{headers:{Cookie:users[0].auth.Cookie,Origin:'https://evil.test'}})).status,403);
 const live=await listen(base,{Cookie:users[0].auth.Cookie});assert.equal(live.status,200);
 assert.equal(live.res.headers.get('content-type'),'text/event-stream; charset=utf-8');assert.equal(live.res.headers.get('cache-control'),'no-store');
 assert.deepEqual(await live.next('ready'),{});live.stop();
}));

test('a colleague sees which organisation changed and who changed it, but not its contents',()=>fixture(async({base,users,post})=>{
 const[alex,sam]=users;const live=await listen(base,{Cookie:sam.auth.Cookie});await live.next('ready');
 const created=(await post('/api/crm',{action:'create',name:'Secret Client GmbH'},alex.auth)).data.entity;
 const change=await live.next('change');assert.deepEqual(change,{ids:[created.id],all:false,by:[alex.user.id]});
 assert(!JSON.stringify(live.events).includes('Secret'));
 await post('/api/crm',{action:'load'},alex.auth);await post('/api/crm',{action:'search',query:'Secret'},alex.auth);
 assert.equal(await live.next('change',600),null,'Reads are not announced.');
 live.stop();
}));

test('an email saved through the extension reaches open tabs',()=>fixture(async({db,base,users,post})=>{
 const[alex,sam]=users;const key=extensionCreate(db,alex.user).token;const live=await listen(base,{Cookie:sam.auth.Cookie});await live.next('ready');
 const r=await post('/api/integrations/extension',{action:'save',confirmed:true,newOrganisation:'Mail Client',requestId:randomUUID(),mailbox:'alex@team.test',from:{email:'pat@client.test',name:'Pat'},recipients:[{email:'alex@team.test'}],subject:'Offer',originalSubject:'Offer',originalBody:'Hello',body:'Hello',timestamp:'2026-10-22T12:00:00Z',timestampRaw:'22.10.2026 14:00',gmailMessageId:'msg:1',contactEmails:['pat@client.test']},{Authorization:'Bearer '+key});
 assert.equal(r.data.saved,true);
 const change=await live.next('change');assert(change.ids.includes(r.data.organisation.id));assert.deepEqual(change.by,[alex.user.id]);
 live.stop();
}));

test('bursts are combined, logout ends the stream, and closing the server ends open streams',()=>fixture(async({base,users,post,server})=>{
 const[alex,sam]=users;const live=await listen(base,{Cookie:sam.auth.Cookie});await live.next('ready');
 const ids=[];for(const name of ['A','B','C'])ids.push((await post('/api/crm',{action:'create',name},alex.auth)).data.entity.id);
 const change=await live.next('change');assert.deepEqual(change.ids.sort(),ids.sort());assert.equal(await live.next('change',400),null);
 const other=await listen(base,{Cookie:alex.auth.Cookie});await other.next('ready');
 await post('/api/logout',{},sam.auth);assert.deepEqual(await live.next('expired'),{});await live.next('none',500);assert(live.isClosed());
 assert.equal((await fetch(base+'/api/live',{headers:{Cookie:sam.auth.Cookie}})).status,401);
 assert.equal(server.live.size,1);
}));

test('one person cannot hold more than a handful of streams; the oldest is closed first',()=>fixture(async({base,users,server})=>{
 const streams=[];for(let i=0;i<7;i++){const s=await listen(base,{Cookie:users[0].auth.Cookie});await s.next('ready');streams.push(s);}
 await streams[0].next('none',300);assert(streams[0].isClosed());assert.equal(server.live.size,6);
 for(const s of streams)s.stop();
}));

test('writes from another process such as the CLI are noticed',async()=>{const dir=mkdtempSync(join(tmpdir(),'stageforce-live-'));try{await fixture(async({base,users})=>{
 const live=await listen(base,{Cookie:users[0].auth.Cookie});await live.next('ready');
 const other=new DatabaseSync(join(dir,'crm.sqlite'));other.prepare('UPDATE users SET name=? WHERE id=?').run('Alexandra',users[0].user.id);other.close();
 assert.deepEqual(await live.next('change',4000),{ids:[],all:true,by:[]});live.stop();
},join(dir,'crm.sqlite'));}finally{rmSync(dir,{recursive:true,force:true});}});
