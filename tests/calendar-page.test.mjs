import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
// The Calendar content script reads Google Calendar's page; these are the parts that turn what the page shows into event data.
function load(pathname='/calendar/u/0/r/week/2026/11/29'){
 const context={atob,btoa,URL,setTimeout:()=>0,clearTimeout(){},location:{pathname},crypto:globalThis.crypto,
  document:{hidden:false,body:{},addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null},
  MutationObserver:class{observe(){}},getComputedStyle:()=>({backgroundColor:'rgb(255, 255, 255)',position:'absolute'}),matchMedia:()=>({matches:false}),
  addEventListener(){},setInterval:()=>0,chrome:{runtime:{sendMessage:async()=>({ok:false,error:'not connected'})}}};
 context.window=context;context.globalThis=context;vm.createContext(context);
 vm.runInContext(readFileSync(new URL('../integrations/chrome/calendar.js',import.meta.url),'utf8'),context);return context.stageForceCalendarTest;
}
test('calendar event ids are decoded from data-eventid and kept per repeating instance',()=>{
 const c=load();
 assert.equal(c.eventId(btoa('abc123def_20261130T100000Z christian@example.test')),'abc123def_20261130T100000Z');
 assert.equal(c.eventId(btoa('abc123def christian@example.test').replace(/=+$/,'')),'abc123def');
 assert.equal(c.eventId('not base64 <x>'),'not_base64__x_');assert.equal(c.eventId(''),'');
});
test('pop-up date lines in German and English give the date and start time',()=>{
 const c=load(),w=s=>{const r=c.parseWhen(s);return r&&r.date+' '+r.time;};
 assert.equal(w('Montag, 30. November ⋅ 11:00 bis 11:30AM'),'2026-11-30 11:00');
 assert.equal(w('Montag, 30. November · 14:00 bis 15:30'),'2026-11-30 14:00');
 assert.equal(w('Monday, November 30 ⋅ 2:30 – 3:30pm'),'2026-11-30 14:30');
 assert.equal(w('Monday, November 30 ⋅ 11am – 12pm'),'2026-11-30 11:00');
 assert.equal(w('Monday, November 30 ⋅ 11:30am – 1:00pm'),'2026-11-30 11:30');
 assert.equal(w('Dienstag, 1. Dezember 2026'),'2026-12-01 ');
 assert.equal(w('30.11.2026, 9:15 Uhr'),'2026-11-30 09:15');
 // Without a year, the date nearest to the shown week is meant.
 assert.equal(w('Dienstag, 5. Januar ⋅ 10:00 bis 11:00'),'2027-01-05 10:00');
 assert.equal(w('10 Minuten vorher'),null);assert.equal(w('3 Gäste'),null);
});
test('day columns name their date in data-datekey',()=>{
 const c=load(),col=key=>({closest:()=>({getAttribute:()=>String(key)})});
 assert.equal(c.datekey(col(((2026-1970)<<9)|(11<<5)|30)),'2026-11-30');
 assert.equal(c.datekey(col(((2026-1970)<<9)|(2<<5)|30)),'');assert.equal(c.datekey({closest:()=>null}),'');
});
