import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('worker keeps token out of content scripts and limits destinations and actions',async()=>{
 const id='a'.repeat(32),root='chrome-extension://'+id+'/',token='sf_ext_'+'a'.repeat(43),calls=[],stored={connection:{origin:'http://localhost:3000',token,email:'alex@team.test'}};let listener,access;
 const context=vm.createContext({URL,AbortSignal,fetch:async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>({data:{email:'alex@team.test'}})};},chrome:{storage:{local:{setAccessLevel:async x=>{access=x;},get:async()=>stored,set:async x=>Object.assign(stored,x),remove:async k=>delete stored[k]}},runtime:{id,getURL:path=>root+path,onMessage:{addListener:fn=>listener=fn},openOptionsPage:async()=>{}},action:{onClicked:{addListener:()=>{}}},tabs:{create:async()=>{}}}});
 vm.runInContext(readFileSync(new URL('../integrations/chrome/worker.js',import.meta.url),'utf8'),context);
 const send=(m,s={id,url:'https://mail.google.com/mail/u/0',tab:{id:1}})=>new Promise(resolve=>listener(m,s,resolve));
 assert.equal((await send({type:'status'})).data.email,'alex@team.test');assert.equal(access.accessLevel,'TRUSTED_CONTEXTS');assert.ok(!JSON.stringify(await send({type:'status'})).includes(token));
 assert.equal((await send({type:'settings'})).ok,false);assert.equal((await send({type:'connect',origin:'https://evil.test',token})).ok,false);
 assert.equal((await send({type:'api',payload:{action:'load'}})).ok,false);assert.equal((await send({type:'api',payload:{action:'check'}})).ok,false);
 assert.equal((await send({type:'api',payload:{action:'search',query:'customer'},url:'https://evil.test'})).ok,true);assert.equal(calls[0].url,'http://localhost:3000/api/integrations/extension');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.headers.Authorization,'Bearer '+token);
 assert.equal((await send({type:'api',payload:{action:'search',query:'customer'}},{id,url:'https://evil.test',tab:{id:2}})).ok,false);
 const options={id,url:root+'options.html'};assert.equal((await send({type:'connect',origin:'http://192.168.1.2:3000',token},options)).ok,false);assert.equal((await send({type:'connect',origin:'https://crm.test/path',token},options)).ok,false);
 assert.equal((await send({type:'disconnect'},options)).ok,true);assert.equal((await send({type:'status'})).ok,false);
});
