import test from 'node:test';
import assert from 'node:assert/strict';
import {gmailSearch} from '../src/domain.ts';
const record=(name,primary='',contacts=[])=>({id:'test',row:0,version:'1',values:Object.assign(Array(24).fill(''),{1:name,13:primary,20:JSON.stringify(contacts)})});
test('Gmail shortcut searches organisation OR contact addresses in the signed-in CRM user mailbox',()=>{
 const result=gmailSearch(record('Stadt Heidelberg','PAT@EXAMPLE.TEST',[{e_mails:['pat@example.test','other+tag@example.test','alex@example.test']}]),'alex@example.test');
 const url=new URL(result.url);
 assert.equal(url.origin,'https://mail.google.com');assert.equal(url.searchParams.get('authuser'),'alex@example.test');
 assert.equal(decodeURIComponent(url.hash.slice(8)),result.query);
 assert.equal(result.query,'{"Heidelberg" from:pat@example.test to:pat@example.test from:other+tag@example.test to:other+tag@example.test}');
 assert.doesNotMatch(result.query,/alex@example/);
});
test('Gmail shortcut safely encodes organisation names and works without contacts',()=>{
 const {query,url}=gmailSearch(record('Müller & Söhne "Berlin"\n{Test}'),'alex+work@example.test');
 assert.equal(query,'"Müller & Söhne Berlin Test"');
 assert.equal(new URL(url).searchParams.get('authuser'),'alex+work@example.test');
 assert.equal(decodeURIComponent(new URL(url).hash.slice(8)),query);
 assert.equal(gmailSearch(record('Stadt'),'alex@example.test').query,'"Stadt"');
});
test('Gmail shortcut bounds long URLs without truncating operators or emoji',()=>{
 const addresses=Array.from({length:30},(_,i)=>`${'p'.repeat(60)}${i}@${'d'.repeat(60)}.test`);
 const result=gmailSearch(record('🔵'.repeat(120),'',[{e_mails:addresses}]),'alex@example.test');
 assert.ok(result.url.length<=1900);assert.ok(!result.query.includes('\uFFFD'));
 assert.equal((result.query.match(/from:/g)||[]).length,(result.query.match(/to:/g)||[]).length);
});
