import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('worker keeps token out of content scripts and limits destinations and actions',async()=>{
 const id='a'.repeat(32),root='chrome-extension://'+id+'/',token='sf_ext_'+'a'.repeat(43),calls=[],stored={connection:{origin:'http://localhost:3000',token,email:'alex@team.test'}};let listener,access;
 const context=vm.createContext({URL,AbortSignal,fetch:async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>({status:'success',data:{email:'alex@team.test'}})};},chrome:{storage:{local:{setAccessLevel:async x=>{access=x;},get:async()=>stored,set:async x=>Object.assign(stored,x),remove:async k=>delete stored[k]}},runtime:{id,getURL:path=>root+path,onMessage:{addListener:fn=>listener=fn},openOptionsPage:async()=>{}},action:{onClicked:{addListener:()=>{}}},tabs:{create:async()=>{}}}});
 vm.runInContext(readFileSync(new URL('../integrations/chrome/worker.js',import.meta.url),'utf8'),context);
 const send=(m,s={id,url:'https://mail.google.com/mail/u/0',tab:{id:1}})=>new Promise(resolve=>listener(m,s,resolve));
 assert.equal((await send({type:'status'})).data.email,'alex@team.test');assert.equal(access.accessLevel,'TRUSTED_CONTEXTS');assert.ok(!JSON.stringify(await send({type:'status'})).includes(token));
 assert.equal((await send({type:'settings'})).ok,false);assert.equal((await send({type:'connect',origin:'https://evil.test',token})).ok,false);
 assert.equal((await send({type:'api',payload:{action:'load'}})).ok,false);assert.equal((await send({type:'api',payload:{action:'check'}})).ok,false);
 assert.equal((await send({type:'api',payload:{action:'search',query:'customer'},url:'https://evil.test'})).ok,true);assert.equal(calls[0].url,'http://localhost:3000/api/integrations/extension');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.headers.Authorization,'Bearer '+token);
 assert.equal((await send({type:'api',payload:{action:'search',query:'customer'}},{id,url:'https://evil.test',tab:{id:2}})).ok,false);
 // Every action the Gmail scripts send must pass the worker; a missing one fails silently in the popup (the meeting preview did).
 for(const action of new Set(['content.js','call-card.js'].flatMap(f=>[...readFileSync(new URL('../integrations/chrome/'+f,import.meta.url),'utf8').matchAll(/action:'(\w+)'/g)].map(m=>m[1]))))assert.equal((await send({type:'api',payload:{action}})).ok,true,action);
 const options={id,url:root+'options.html'};assert.equal((await send({type:'connect',origin:'http://192.168.1.2:3000',token},options)).ok,false);assert.equal((await send({type:'connect',origin:'https://crm.test/path',token},options)).ok,false);
 assert.equal((await send({type:'disconnect'},options)).ok,true);assert.equal((await send({type:'status'})).ok,false);
});

test('worker reload reuses saved pairing; missing keys and invalid acknowledgements cannot report success',async()=>{
 const id='b'.repeat(32),token='sf_ext_'+'b'.repeat(43),stored={connection:{origin:'http://localhost:3000',token,email:'alex@team.test'}};let listener,calls=0,mode='ok';
 const context=()=>vm.createContext({URL,AbortSignal,fetch:async()=>{calls++;if(mode==='offline')throw new TypeError('Failed to fetch');return{ok:mode!=='revoked',status:mode==='revoked'?401:200,json:async()=>mode==='malformed'?{data:{}}:mode==='revoked'?{message:'Connect your extension'}:{status:'success',data:{email:'alex@team.test'}}};},chrome:{storage:{local:{setAccessLevel:async()=>{},get:async()=>stored,set:async x=>Object.assign(stored,x),remove:async k=>delete stored[k]}},runtime:{id,getURL:p=>'chrome-extension://'+id+'/'+p,onMessage:{addListener:fn=>listener=fn},openOptionsPage:async()=>{}},action:{onClicked:{addListener:()=>{}}},tabs:{create:async()=>{}}}});
 const code=readFileSync(new URL('../integrations/chrome/worker.js',import.meta.url),'utf8'),sender={id,url:'https://mail.google.com/mail/u/0',tab:{id:1}},send=m=>new Promise(resolve=>listener(m,sender,resolve));
 vm.runInContext(code,context());assert.equal((await send({type:'status'})).ok,true);
 vm.runInContext(code,context());assert.equal((await send({type:'status'})).ok,true);
 mode='revoked';assert.equal((await send({type:'status'})).code,'connection_required');mode='offline';assert.equal((await send({type:'status'})).code,'connection_unavailable');mode='malformed';assert.equal((await send({type:'status'})).code,'invalid_response');
 delete stored.connection;const before=calls;assert.equal((await send({type:'api',payload:{action:'save'}})).code,'connection_required');assert.equal(calls,before);
});

test('Google Calendar may only search and check, log and mark meetings; Gmail keeps every action',async()=>{
 const id='c'.repeat(32),token='sf_ext_'+'c'.repeat(43),stored={connection:{origin:'http://localhost:3000',token,email:'alex@team.test'}},calls=[];let listener;
 const context=vm.createContext({URL,AbortSignal,fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return{ok:true,json:async()=>({status:'success',data:{email:'alex@team.test',logged:[]}})};},chrome:{storage:{local:{setAccessLevel:async()=>{},get:async()=>stored,set:async x=>Object.assign(stored,x),remove:async()=>{}}},action:{onClicked:{addListener(){}}},runtime:{id,getURL:p=>'chrome-extension://'+id+'/'+p,onMessage:{addListener:f=>{listener=f;}},openOptionsPage:async()=>{}},tabs:{create:async()=>{}}}});
 vm.runInContext(readFileSync(new URL('../integrations/chrome/worker.js',import.meta.url),'utf8'),context);
 const send=(m,url)=>new Promise(resolve=>listener(m,{id,url,tab:{id:1}},resolve)),calendar='https://calendar.google.com/calendar/u/0/r/week',gmail='https://mail.google.com/mail/u/0';
 assert.equal((await send({type:'status'},calendar)).ok,true);
 const used=new Set([...readFileSync(new URL('../integrations/chrome/calendar.js',import.meta.url),'utf8').matchAll(/action:\s*'(\w+)'/g)].map(m=>m[1]));
 assert.deepEqual([...used].sort(),['calendarCheck','calendarLog','calendarStatus','search']);
 for(const action of used)assert.equal((await send({type:'api',payload:{action}},calendar)).ok,true,action);
 for(const action of ['save','lookup','contactSave','callSave','messageStatus'])assert.equal((await send({type:'api',payload:{action}},calendar)).ok,false,action);
 assert.equal((await send({type:'api',payload:{action:'calendarCheck'}},gmail)).ok,false,'Gmail does not need the calendar actions');
 assert.equal((await send({type:'api',payload:{action:'calendarStatus'}},'https://calendar.google.com.evil.test/')).ok,false);
 const manifest=JSON.parse(readFileSync(new URL('../integrations/chrome/manifest.json',import.meta.url),'utf8'));
 assert.deepEqual(manifest.content_scripts.map(c=>c.matches),[['https://mail.google.com/*'],['https://calendar.google.com/*']]);assert.deepEqual(manifest.permissions,['storage']);
});
