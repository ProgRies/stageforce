import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
// The Calendar content script in a real browser, against a stand-in page that renders and re-renders like Google Calendar.
// Needs Playwright with Chromium; skipped where it is not installed (CI runs the Node-only tests).
let chromium=null;
try{({chromium}=createRequire(import.meta.url)('playwright'));}catch{}
const skip=!chromium&&'Playwright is not installed';
const fixture=readFileSync(new URL('./fixtures/calendar-page.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../integrations/chrome/calendar.js',import.meta.url),'utf8');

async function open(browser,crm={}){
 const page=await browser.newPage({viewport:{width:1100,height:800}});
 await page.route('https://calendar.google.com/**',r=>r.fulfill({contentType:'text/html',body:fixture}));
 await page.goto('https://calendar.google.com/calendar/u/0/r/week/2026/11/26');
 // A stand-in CRM behind chrome.runtime: logged event ids, a delay, and a number of failures before it answers.
 await page.evaluate(crm=>{
  window.crm={logged:new Set(crm.logged||[]),delay:crm.delay??20,fail:crm.fail||0,calls:[]};
  window.chrome=window.chrome||{};
  window.chrome.runtime={sendMessage:async m=>{
   const c=window.crm,p=m.payload||{};c.calls.push(p.action);await new Promise(r=>setTimeout(r,c.delay));
   if(c.fail>0){c.fail--;return{ok:false,error:'CRM unavailable. Check that Docker is running.',code:'connection_unavailable'};}
   if(p.action==='calendarStatus')return{ok:true,data:{logged:p.events.map(e=>e.id).filter(id=>c.logged.has(id)||c.statusLogged)}};
   const view=name=>({organisation:{id:'o1',name},date:p.date,time:p.time,contacts:['C Arnegger'],cancelled:false});
   if(p.action==='calendarCheck')return{ok:true,data:{logged:c.logged.has(p.eventId)?view('Landkreis Ravensburg'):null,candidates:[],participants:[{email:'c.arnegger@rv.de',name:'C Arnegger',internal:false,known:false,elsewhere:[]}],organisation:null}};
   if(p.action==='search')return{ok:true,data:{items:[]}};
   if(p.action==='calendarLog'){c.lastLog=p;c.logged.add(p.eventId);return{ok:true,data:{saved:true,organisation:{id:'o2',name:p.newOrganisation},logged:view(p.newOrganisation)}};}
   return{ok:true,data:{}};
  }};
 },crm);
 return page;
}
const inject=page=>page.addScriptTag({content:script});
const marks=page=>page.evaluate(()=>[...document.querySelectorAll('[data-eventid]')].filter(c=>c.querySelector('[data-stageforce-calendar="mark"]')).map(c=>c.textContent.split(/\d/)[0].trim()).sort());
async function until(fn,ms=4000){const end=Date.now()+ms;let v;while(Date.now()<end){v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,50));}return v;}
const week=[{id:'meeting-a',day:26,top:20,title:'Feedback Meeting',when:'10 bis 10:45AM'},{id:'meeting-b',day:26,top:120,title:'Jahresgespräch',when:'11AM bis 12PM'},{id:'meeting-c',day:27,top:20,title:'Mama Rathaus',when:'12 bis 2PM'},{id:'meeting-d',day:27,top:120,title:'Dortmund SocialWall',when:'1PM'}];

test('the Meet link stays visible when Calendar finishes rendering the pop-up after the StageForce row is in',{skip},async()=>{
 const browser=await chromium.launch();try{
  const page=await open(browser,{logged:['meeting-b']});
  await page.evaluate(w=>fixture.renderWeek(w),week);await inject(page);
  await page.evaluate(()=>{fixture.chip('meeting-b').click();fixture.renderPopup(false);});
  assert.ok(await until(()=>page.evaluate(()=>/Logged in StageForce/.test(document.querySelector('[data-stageforce-calendar="row"]')?.shadowRoot?.textContent||''))),'row shows the logged state');
  // Now Calendar renders the full event, with the conference section, into the same container.
  await page.evaluate(()=>fixture.renderPopup(true));await page.waitForTimeout(600);
  const state=await page.evaluate(()=>{const a=document.getElementById('join'),row=document.querySelector('[data-stageforce-calendar="row"]');return{join:!!a&&a.getClientRects().length>0&&a.offsetHeight>0,insideRow:!!a?.closest('[data-stageforce-calendar]'),row:!!row?.isConnected,rowText:row?.shadowRoot?.textContent||'',order:[...document.querySelector('#content').children].map(n=>n.matches('[data-stageforce-calendar]')?'stageforce':n.className.replace('section ',''))};});
  assert.equal(state.insideRow,false,'Calendar\'s Meet section must never end up inside the StageForce element');
  assert.equal(state.join,true,'the Meet join link is visible');
  assert.equal(state.row,true);assert.match(state.rowText,/Logged in StageForce/);
  assert.deepEqual(state.order,['header','stageforce','meet','notes','guests','reminder','owner']);
  // Calendar dropped the row while re-rendering; it came back as it was, without checking the meeting again.
  assert.equal(await page.evaluate(()=>crm.calls.filter(a=>a==='calendarCheck').length),1);
 }finally{await browser.close();}
});

test('marks appear on boxes Calendar adds while a status request is still running',{skip},async()=>{
 const browser=await chromium.launch();try{
  const page=await open(browser,{logged:['meeting-a','meeting-b','meeting-c','meeting-d'],delay:700});
  await page.evaluate(w=>fixture.renderWeek(w.slice(0,2)),week);await inject(page);
  await page.waitForTimeout(400);
  await page.evaluate(w=>fixture.renderWeek(w),week);
  assert.deepEqual(await until(async()=>{const m=await marks(page);return m.length===4&&m;},3000)||await marks(page),['Dortmund SocialWall','Feedback Meeting','Jahresgespräch','Mama Rathaus']);
 }finally{await browser.close();}
});

test('a mark comes back when Calendar re-renders the box, and boxes that become visible later get theirs',{skip},async()=>{
 const browser=await chromium.launch();try{
  const page=await open(browser,{logged:['meeting-a','meeting-c']});
  await page.evaluate(w=>fixture.renderWeek(w.map(e=>e.id==='meeting-c'?{...e,cls:'collapsed'}:e)),week);await inject(page);
  assert.deepEqual(await until(async()=>{const m=await marks(page);return m.length===1&&m;}),['Feedback Meeting']);
  // Calendar swaps a box's content without touching the list of boxes; then shows a box only by changing its class.
  await page.waitForTimeout(500);
  await page.evaluate(()=>fixture.chip('meeting-c').classList.remove('collapsed'));
  assert.deepEqual(await until(async()=>{const m=await marks(page);return m.length===2&&m;},5000)||await marks(page),['Feedback Meeting','Mama Rathaus']);
  await page.evaluate(()=>{const c=fixture.chip('meeting-a');c.innerHTML='<span>Feedback Meeting</span><span>10 bis 10:45AM</span>';});
  assert.deepEqual(await until(async()=>{const m=await marks(page);return m.length===2&&m;},5000)||await marks(page),['Feedback Meeting','Mama Rathaus']);
 }finally{await browser.close();}
});

test('marks appear once the CRM answers again after a failed check, without a page refresh',{skip},async()=>{
 const browser=await chromium.launch();try{
  const page=await open(browser,{logged:['meeting-a'],fail:1});
  await page.evaluate(w=>fixture.renderWeek(w),week);await inject(page);
  assert.deepEqual(await until(async()=>{const m=await marks(page);return m.length===1&&m;},9000)||await marks(page),['Feedback Meeting']);
 }finally{await browser.close();}
});

test('logging a new organisation from the pop-up: typing goes into the card, not into Calendar\'s shortcuts or focus trap',{skip},async()=>{
 const browser=await chromium.launch();try{
  const page=await open(browser);
  await page.evaluate(w=>fixture.renderWeek(w),week);await inject(page);
  await page.evaluate(()=>{const b=fixture.chip('meeting-b');b.click();b.classList.add('open');fixture.renderPopup(true);});
  await page.locator('stageforce-row').getByText('Log anyway').click();
  const org=page.locator('[data-stageforce-calendar="card"] #org');
  await org.click();await page.keyboard.type('Theater Weimar cwdm',{delay:15});
  assert.equal(await org.inputValue(),'Theater Weimar cwdm','every key lands in the organisation field');
  assert.deepEqual(await page.evaluate(()=>fixture.opened),[],'no Calendar shortcut fired behind the card');
  await page.locator('[data-stageforce-calendar="card"]').getByText('Create “Theater Weimar cwdm”').click();
  // The other fields take typing and clicks too, and Calendar's pop-up behind the card stays as it was.
  const title=page.locator('[data-stageforce-calendar="card"] #title');
  await title.click();await page.keyboard.press('End');await page.keyboard.type(' 2026');
  assert.equal(await title.inputValue(),'Jahresgespräch Stage / LK Ravensburg 2026');
  assert.equal(await page.evaluate(()=>!!document.querySelector('[role=dialog]')),true,'the event pop-up was not closed by clicks in the card');
  await page.locator('[data-stageforce-calendar="card"] #save').click();
  assert.ok(await until(()=>page.evaluate(()=>!document.querySelector('[data-stageforce-calendar="card"]'))),'card closes after logging');
  assert.equal(await page.evaluate(()=>crm.lastLog?.newOrganisation),'Theater Weimar cwdm');
  assert.deepEqual(await until(async()=>{const m=await marks(page);return m.length===1&&m;})||await marks(page),['Jahresgespräch']);
  assert.match(await page.evaluate(()=>document.querySelector('stageforce-row')?.shadowRoot?.textContent||''),/Logged in StageForce/);
  assert.deepEqual(await page.evaluate(()=>fixture.opened),[]);
 }finally{await browser.close();}
});

test('Escape closes only the card; the event pop-up and Calendar stay as they were',{skip},async()=>{
 const browser=await chromium.launch();try{
  const page=await open(browser);
  await page.evaluate(w=>fixture.renderWeek(w),week);await inject(page);
  await page.evaluate(()=>{fixture.chip('meeting-b').click();fixture.renderPopup(true);});
  await page.locator('stageforce-row').getByText('Log anyway').click();
  await page.locator('[data-stageforce-calendar="card"] #org').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>!!document.querySelector('[data-stageforce-calendar="card"]')),false);
  assert.equal(await page.evaluate(()=>!!document.querySelector('[role=dialog] #join')),true);
 }finally{await browser.close();}
});

test('marks never blink when Calendar re-renders a box: they are back before the next frame',{skip},async()=>{
 const browser=await chromium.launch();try{
  const page=await open(browser,{logged:['meeting-a','meeting-b']});
  await page.evaluate(w=>fixture.renderWeek(w),week);await inject(page);
  assert.ok(await until(async()=>(await marks(page)).length===2));
  // Calendar re-renders boxes (selection, hover, the time line): a patch drops the extra child, here our mark.
  const seen=await page.evaluate(async w=>{const out=[];for(let i=0;i<5;i++){fixture.renderWeek(w.map(e=>({...e,cls:i%2?'selected':'',when:e.when+(i%2?' ':'')})));await new Promise(r=>requestAnimationFrame(()=>{out.push(['meeting-a','meeting-b'].every(id=>fixture.chip(id).querySelector('[data-stageforce-calendar="mark"]')?.shadowRoot));r();}));}return out;},week);
  assert.deepEqual(seen,[true,true,true,true,true]);
 }finally{await browser.close();}
});

test('opening a pop-up whose check finds nothing does not take away a mark the grid check found',{skip},async()=>{
 const browser=await chromium.launch();try{
  const page=await open(browser,{logged:['meeting-b']});
  await page.evaluate(w=>fixture.renderWeek(w),week);await inject(page);
  assert.ok(await until(async()=>(await marks(page)).length===1));
  // The grid check matched by title and time; the pop-up check (by guests) does not find it.
  await page.evaluate(()=>{crm.logged.delete('meeting-b');window.crm.statusLogged=true;fixture.chip('meeting-b').click();fixture.renderPopup(true);});
  await until(()=>page.evaluate(()=>/No client/.test(document.querySelector('stageforce-row')?.shadowRoot?.textContent||'')));
  await page.waitForTimeout(400);
  assert.deepEqual(await marks(page),['Jahresgespräch']);
 }finally{await browser.close();}
});
