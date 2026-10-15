import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from '../src/api.ts';

test('expected sign-in 401s stay quiet; protected-request 401s still expire the session',async()=>{
 const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
 const events=new EventTarget();let expired=0;
 events.addEventListener('session-expired',()=>expired++);
 globalThis.window=events;
 globalThis.fetch=async()=>new Response(JSON.stringify({status:'unauthorized',message:'Bitte anmelden.'}),{status:401,headers:{'Content-Type':'application/json'}});
 try{
  await assert.rejects(request('/api/session'),e=>e.status==='unauthorized');
  assert.equal(expired,0,'A fresh visit without a session is normal.');
  await assert.rejects(request('/api/login',{email:'demo@example.test',password:'incorrect'}),e=>e.status==='unauthorized');
  assert.equal(expired,0,'An invalid password belongs to the login form.');
  await assert.rejects(request('/api/crm',{action:'load'}),e=>e.status==='unauthorized');
  assert.equal(expired,1,'Protected requests must still return the user to login.');
 }finally{globalThis.fetch=originalFetch;if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;}
});
