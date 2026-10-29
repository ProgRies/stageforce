// The live call card, shared by the CRM and the Gmail extension. A started call belongs to the user, not to the page:
// the card floats in an always-on-top Picture-in-Picture window, so other tabs, sites and apps stay usable while it runs.
// Where that window is unavailable or closed, the card stays fixed in the top-right corner of the page that started it.
// The server keeps the open call and its draft note. A card only appears where the call was started (and again after reloading
// that tab); other tabs never open one on their own, they only drop a card whose call was saved or discarded elsewhere.
(() => {
 const CSS=`
.sf-call{--bg:#fff;--panel:#f6f5fc;--ink:#252b44;--muted:#646b86;--line:#d8d4ea;--accent:#6b55b8;--accent-ink:#fff;--input:#fff;--danger:#b4234a;--live:#1f9d63;
 box-sizing:border-box;width:340px;max-width:calc(100vw - 24px);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);border:1px solid #8d77bd;border-radius:16px;box-shadow:0 18px 50px #1b1f4a40,0 2px 8px #1b1f4a1f;overflow:hidden}
.sf-call[data-theme="dark"]{--bg:#1e2140;--panel:#262a4d;--ink:#e8e9f5;--muted:#a3a8c8;--line:#3a3f68;--accent:#7a64d0;--input:#141731;--danger:#ff7d9b;--live:#5fd59b;border-color:#7a64b0;box-shadow:0 18px 50px #00000080,0 2px 8px #0000004d}
.sf-call *{box-sizing:border-box}
.sf-call button,.sf-call input,.sf-call textarea{font:inherit;color:inherit}
.sf-call header{display:flex;align-items:center;gap:8px;padding:10px 8px 10px 14px}
.sf-call .pulse{flex:none;width:9px;height:9px;border-radius:50%;background:var(--live);box-shadow:0 0 0 0 var(--live);animation:sf-pulse 2s infinite}
@keyframes sf-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--live) 60%,transparent)}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion:reduce){.sf-call .pulse{animation:none}}
.sf-call .who{flex:1;min-width:0;display:flex;flex-direction:column}
.sf-call .org{all:unset;cursor:pointer;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sf-call .org:hover{text-decoration:underline}.sf-call .org:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
.sf-call .meta{color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sf-call .time{flex:none;font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px}
.sf-call .icon{flex:none;display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer}
.sf-call .icon:hover:not(:disabled){background:var(--panel);color:var(--ink)}.sf-call .icon svg{width:17px;height:17px}
.sf-call .body{padding:0 14px 14px;display:flex;flex-direction:column;gap:8px}
.sf-call textarea{width:100%;min-height:92px;resize:vertical;border:1px solid var(--line);border-radius:10px;padding:9px 10px;background:var(--input);line-height:1.45}
.sf-call textarea:focus,.sf-call input:focus{outline:2px solid var(--accent);outline-offset:-1px}
.sf-call .dial{align-self:flex-start;font-size:12px;color:var(--accent);text-decoration:none}.sf-call[data-theme="dark"] .dial{color:#b9a8ff}.sf-call .dial:hover{text-decoration:underline}
.sf-call .row{display:grid;grid-template-columns:1fr 1fr;gap:6px}.sf-call .row>.wide{grid-column:span 2}
.sf-call .button{min-height:34px;padding:6px 8px;border:1px solid var(--line);border-radius:9px;background:var(--panel);cursor:pointer;font-size:13px;font-weight:600}
.sf-call .button:hover:not(:disabled){border-color:var(--accent)}
.sf-call .button.primary{background:linear-gradient(135deg,#5b5fc7,#8a4fbf);border-color:transparent;color:var(--accent-ink)}
.sf-call .button.danger{background:var(--danger);border-color:transparent;color:#fff}
.sf-call button:disabled,.sf-call input:disabled,.sf-call textarea:disabled{opacity:.6;cursor:default}
.sf-call .later input{min-width:0;border:1px solid var(--line);border-radius:9px;padding:6px 10px;background:var(--input);color-scheme:light}.sf-call[data-theme="dark"] .later input{color-scheme:dark}
.sf-call .confirm p{grid-column:span 2;margin:0;font-weight:600}
.sf-call .error{margin:0;color:var(--danger);font-size:12px}.sf-call .error:empty{display:none}
.sf-call .hint{margin:0;color:var(--muted);font-size:12px}
.sf-call .keep{display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--line);border-radius:9px;background:var(--panel);font-size:12px;cursor:pointer}.sf-call .keep input{margin:0;accent-color:var(--accent)}
.sf-call .picker{display:flex;flex-direction:column;gap:8px}
.sf-call .label{margin:2px 0 -2px;font-size:12px;font-weight:650;color:var(--muted)}
.sf-call .chips{display:flex;flex-wrap:wrap;gap:5px}
.sf-call .chip{min-height:30px;padding:4px 9px;border:1px solid var(--line);border-radius:8px;background:var(--panel);cursor:pointer;font-size:12.5px}
.sf-call .chip:hover:not(:disabled){border-color:var(--accent)}
.sf-call .chip[aria-pressed="true"]{background:linear-gradient(135deg,#5b5fc7,#8a4fbf);border-color:transparent;color:var(--accent-ink);font-weight:600}
.sf-call .results .chip{flex:1 1 calc(50% - 5px)}
.sf-call select.next{width:100%;min-height:36px;border:1px solid var(--line);border-radius:9px;padding:6px 9px;background:var(--input);color-scheme:light}.sf-call[data-theme="dark"] select.next{color-scheme:dark}
.sf-call .when{display:flex;gap:6px}.sf-call .when input{min-width:0;flex:1;border:1px solid var(--line);border-radius:9px;padding:5px 9px;background:var(--input);color-scheme:light}.sf-call[data-theme="dark"] .when input{color-scheme:dark}
.sf-call .booking{align-self:flex-start;font-size:12px;color:var(--accent);text-decoration:none}.sf-call[data-theme="dark"] .booking{color:#b9a8ff}.sf-call .booking:hover{text-decoration:underline}
.sf-call [hidden]{display:none!important}
.sf-call.is-minimized header{cursor:pointer}
.sf-call.in-pip{width:100%;max-width:none;min-height:100vh;border:0;border-radius:0;box-shadow:none;overflow:visible}
body.sf-pip{margin:0;background:#fff}body.sf-pip.dark{background:#1e2140}`;
 const ICONS={pop:'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',min:'M5 12h14',max:'M6 9l6 6 6-6',close:'M18 6 6 18M6 6l12 12'};
 const berlin=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const plusDays=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 const shortDay=(day,today)=>new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))+(day.slice(0,4)!==today.slice(0,4)?day.slice(2,4):'');
 const dayLabel=day=>new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
 const clock=ms=>{const s=Math.max(0,Math.floor(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s/60)%60,p=v=>String(v).padStart(2,'0');return(h?h+':'+p(m):p(m))+':'+p(s%60);};
 const supported=()=>typeof window.documentPictureInPicture?.requestWindow==='function';
 function create({api,theme=()=>'light',onChange=()=>{},onSaved=()=>{},onOpen=null,rememberKey=''}){
  let call=null,notes='',later='',laterTime='',keep=true,result='',next=null,touched=false,custom=false,busy=false,confirming=false,minimized=false,error='',pip=null,host=null,tick=null,draftTimer=null,drafted='';
  const doc=document,el=(tag,props={},...children)=>{const e=Object.assign(doc.createElement(tag),props);e.append(...children);return e;};
  const icon=name=>{const s=doc.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');const p=doc.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',ICONS[name]);for(const[k,v]of Object.entries({fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round'}))p.setAttribute(k,v);s.append(p);return s;};
  const org=el('button',{type:'button',className:'org'}),meta=el('span',{className:'meta'}),time=el('span',{className:'time'});
  const pop=el('button',{type:'button',className:'icon',title:'Über allen Fenstern anzeigen'},icon('pop')),min=el('button',{type:'button',className:'icon'}),discard=el('button',{type:'button',className:'icon',title:'Anruf ohne Eintrag verwerfen'},icon('close'));
  const area=el('textarea',{placeholder:'Gesprächsnotiz · optional',rows:4});area.setAttribute('aria-label','Gesprächsnotiz');
  const dial=el('a',{className:'dial',textContent:'Wähl-App erneut öffnen'}),outcomes=el('div',{className:'row'}),errorLine=el('p',{className:'error'});errorLine.setAttribute('role','alert');
  const date=el('input',{type:'date'}),at=el('input',{type:'time',step:300}),later_=el('div',{className:'row later'},date,at,el('button',{type:'button',className:'button',textContent:'Zurück',onclick:()=>{later=laterTime='';update();}}),el('button',{type:'button',className:'button primary',textContent:'Speichern',onclick:e=>save('callback',e)}));date.setAttribute('aria-label','Wann erneut anrufen');at.setAttribute('aria-label','Uhrzeit (optional)');at.title='Uhrzeit (optional)';
  const confirm_=el('div',{className:'row confirm'},el('p',{textContent:'Anruf ohne Eintrag verwerfen?'}),el('button',{type:'button',className:'button',textContent:'Zurück',onclick:()=>{confirming=false;update();}}),el('button',{type:'button',className:'button danger',textContent:'Verwerfen',onclick:cancel}));
  const hint=el('p',{className:'hint',textContent:'Mit ↗ schwebt der Anruf über allen Tabs und Fenstern.'});
  // A call before the planned date (e.g. not reached) keeps that date unless unticked; "Später anrufen" always sets the picked one.
  const keepBox=el('input',{type:'checkbox',checked:true}),keepText=el('span'),keep_=el('label',{className:'keep'},keepBox,keepText);
  keepBox.onchange=()=>{keep=keepBox.checked;update();};
  const planned=()=>call?.followUp&&call.followUp>berlin()?call.followUp:'';
  // Cards from 0.3.16 on: pick the result, then the next call (preselected from the result), then Speichern. Older servers send no
  // `results`, and the card falls back to the one-tap buttons above.
  const results=el('div',{className:'chips results'}),nextSelect=el('select',{className:'next'}),nextDate=el('input',{type:'date'}),nextTime=el('input',{type:'time',step:300});
  nextSelect.setAttribute('aria-label','Nächster Anruf');nextDate.setAttribute('aria-label','Datum des nächsten Anrufs');nextTime.setAttribute('aria-label','Uhrzeit (optional)');nextTime.title='Uhrzeit (optional)';
  const when=el('div',{className:'when'},nextDate,nextTime),booking=el('a',{className:'booking',textContent:'Buchungsseite öffnen ↗',target:'_blank',rel:'noopener'});
  const saveButton=el('button',{type:'button',className:'button primary',textContent:'Speichern',onclick:()=>save(result)});
  const picker=el('div',{className:'picker'},el('p',{className:'label',textContent:'Ergebnis'}),results,booking,el('p',{className:'label',textContent:'Nächster Anruf'}),nextSelect,when,saveButton);
  const choose=key=>{result=key;if(!touched){const r=call.results.find(r=>r.key===key);next=planned()?{kind:'keep'}:r?.days?{kind:'date',date:plusDays(berlin(),r.days)}:null;custom=false;}drawPicker();};
  const pickNext=value=>{touched=true;next=value;drawPicker();};
  nextSelect.onchange=()=>{const v=nextSelect.value,date=next?.kind==='date'?next.date:'';custom=v==='custom';pickNext(v==='keep'?{kind:'keep'}:v==='none'?{kind:'none'}:v==='custom'?(date?{kind:'date',date,time:nextTime.value}:null):v.startsWith('d:')?{kind:'date',date:v.slice(2)}:null);};
  nextDate.oninput=()=>pickNext(nextDate.value?{kind:'date',date:nextDate.value,time:nextTime.value}:null);
  nextTime.oninput=()=>{if(next?.kind==='date')pickNext({...next,time:nextTime.value});};
  const ready=()=>!!result&&!!next&&(next.kind!=='date'||next.date>=berlin());
  const body=el('div',{className:'body'},area,dial,keep_,outcomes,later_,picker,confirm_,errorLine,hint);
  const header=el('header',{},el('span',{className:'pulse'}),el('div',{className:'who'},org,meta),time,pop,min,discard);
  const card=el('section',{className:'sf-call'},header,body);card.setAttribute('role','region');card.setAttribute('aria-label','Laufender Anruf');
  area.oninput=()=>{notes=area.value;clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,800);};
  date.oninput=()=>{later=date.value;update();};at.oninput=()=>{laterTime=at.value;update();};
  org.onclick=e=>{e.stopPropagation();if(call&&onOpen)onOpen(call.organisation.id);};
  pop.onclick=e=>{e.stopPropagation();popOut();};
  min.onclick=e=>{e.stopPropagation();minimized=!minimized;update();if(pip)try{pip.resizeTo(pip.outerWidth,minimized?header.offsetHeight+(pip.outerHeight-pip.innerHeight):card.scrollHeight+(pip.outerHeight-pip.innerHeight));}catch{}};
  header.onclick=()=>{if(minimized)min.click();};
  discard.onclick=e=>{e.stopPropagation();if(busy)return;minimized=false;later='';confirming=true;update();};
  function saveDraft(){clearTimeout(draftTimer);if(!call||notes===drafted)return;const value=notes,id=call.callId;api({action:'callDraft',callId:id,notes:value}).then(()=>{if(call?.callId===id)drafted=value;},()=>{});}
  function update(){
   if(!call)return;
   card.dataset.theme=theme()==='dark'?'dark':'light';if(pip)pip.document.body.classList.toggle('dark',card.dataset.theme==='dark');
   card.classList.toggle('is-minimized',minimized);body.hidden=minimized;
   org.textContent=call.organisation.name;org.title=onOpen?'Organisation öffnen':'';org.disabled=!onOpen;
   meta.textContent=[call.contact?.name,call.phone].filter(Boolean).join(' · ');
   time.textContent=clock(Date.now()-Date.parse(call.startedAt));
   pop.hidden=!!pip||!supported();min.title=min.ariaLabel=minimized?'Aufklappen':'Minimieren';min.replaceChildren(icon(minimized?'max':'min'));
   dial.href='tel:'+call.dial;if(area.value!==notes)area.value=notes;
   keep_.hidden=!planned()||!!later||confirming;keepText.textContent='Geplanten Anruf ('+(planned()?dayLabel(planned()):'')+') behalten';keepBox.checked=keep;
   const modern=!!call.results;
   keep_.hidden||=modern;picker.hidden=!modern||confirming;
   for(const e of [area,keepBox,discard,...outcomes.children,...later_.querySelectorAll('button,input'),...picker.querySelectorAll('.chip,input,select'),...confirm_.querySelectorAll('button')])e.disabled=busy;
   if(modern)saveButton.disabled=busy||!ready();
   later_.lastChild.disabled=busy||!later;
   outcomes.hidden=modern||!!later||confirming;later_.hidden=!later||confirming;confirm_.hidden=!confirming;date.min=berlin();if(date.value!==later)date.value=later;if(at.value!==laterTime)at.value=laterTime;
   errorLine.textContent=error;hint.hidden=!!pip||!supported();
  }
  // Drawn when a choice changes (not on the clock's tick), so a click or keyboard focus is never lost to a redraw.
  function drawPicker(){
   if(!call?.results)return update();
   // "Unverändert" only while the planned call is still ahead; a call that was due needs a new date (or none).
   const chip=(label,on,onclick)=>{const b=el('button',{type:'button',className:'chip',textContent:label,onclick});b.setAttribute('aria-pressed',String(on));return b;};
   results.replaceChildren(...call.results.map(r=>chip(r.label,result===r.key,()=>choose(r.key))));
   // One field for the next call: the result fills it in, so usually it only needs a look.
   const date=next?.kind==='date'?next.date:'',today=berlin(),selected=!next&&!custom?'':next?.kind==='keep'?'keep':next?.kind==='none'?'none':!custom&&call.nextPicks.some(p=>p.date===date)?'d:'+date:'custom';
   const option=(value,text)=>el('option',{value,textContent:text});
   nextSelect.replaceChildren(...[selected===''&&option('','Bitte wählen …'),planned()&&option('keep','Unverändert · '+shortDay(planned(),today)),...call.nextPicks.map(p=>option('d:'+p.date,p.label+' · '+shortDay(p.date,today))),
    option('custom',selected==='custom'&&date?shortDay(date,today)+(nextTime.value?' · '+nextTime.value+' Uhr':''):'Datum und Uhrzeit wählen …'),option('none','Kein Anruf planen')].filter(Boolean));nextSelect.value=selected;
   when.hidden=!custom;nextTime.disabled=!date;nextDate.min=berlin();if(nextDate.value!==date)nextDate.value=date;if(!date&&nextTime.value)nextTime.value='';
   booking.hidden=result!=='meeting'||!call.bookingUrl;booking.href=call.bookingUrl||'';
   update();
  }
  function show(){
   outcomes.replaceChildren(...call.outcomes.map((o,i,all)=>el('button',{type:'button',className:'button'+(o.key==='meeting'?' primary':'')+(i===all.length-1&&all.length%2?' wide':''),textContent:o.label,title:o.next,onclick:e=>o.key==='callback'?(later=planned()||plusDays(berlin(),1),laterTime=planned()&&call.followUpTime||'',update()):save(o.key,e)})));
   if(!pip&&!host){host=doc.createElement('div');host.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647';const root=host.attachShadow({mode:'closed'});root.append(el('style',{textContent:CSS}),card);doc.documentElement.append(host);}
   if(!keysIsolated){keysIsolated=true;for(const type of ['keydown','keyup','keypress'])window.addEventListener(type,isolate,true);}
   clearInterval(tick);tick=setInterval(update,1000);drawPicker();remember(call.callId);onChange(call);
  }
  // Opening the dialler is a tel: navigation, so the page would ask "Leave site?" for unsaved input. Nothing is left: skip that one prompt.
  // Registered when the card is created, so it runs before the page's own beforeunload handlers.
  let dialing=0;window.addEventListener('beforeunload',e=>{if(Date.now()<dialing)e.stopImmediatePropagation();},true);
  dial.addEventListener('click',()=>{dialing=Date.now()+2000;});
  // Typing a note must not trigger the page's own shortcuts (Gmail reads keys from the whole page).
  let keysIsolated=false;const isolate=e=>{if(host&&e.composedPath().includes(host))e.stopImmediatePropagation();};
  function finish(){
   clearInterval(tick);clearTimeout(draftTimer);call=null;notes=drafted=later=laterTime=error=result='';busy=confirming=minimized=touched=custom=false;keep=true;next=null;nextTime.value='';
   const w=pip;pip=null;w?.close();host?.remove();host=null;card.remove();card.classList.remove('in-pip');remember('');onChange(null);
  }
  // Picture-in-Picture needs the click that started it, and opening the dialler uses that click up: the window is requested first,
  // before anything is awaited. A later attempt comes from the arrow in the card.
  function requestPip(){if(!supported())return null;try{return window.documentPictureInPicture.requestWindow({width:360,height:minimized?64:600}).catch(()=>null);}catch{return null;}}
  async function popOut(){if(pip||!call)return false;const w=await requestPip();return adopt(w);}
  function adopt(w){
   if(!w)return false;if(!call||pip){w.close();return false;}
   pip=w;const d=w.document;d.title='Anruf · '+call.organisation.name;d.head.replaceChildren(Object.assign(d.createElement('style'),{textContent:CSS}));d.body.className='sf-pip';
   card.classList.add('in-pip');d.body.replaceChildren(card);host?.remove();host=null;update();
   // Closing the floating window puts the card back into the page, collapsed; the call itself stays open.
   w.addEventListener('pagehide',()=>{if(pip!==w)return;pip=null;card.classList.remove('in-pip');if(call){minimized=true;show();}},{once:true});
   return true;
  }
  async function save(outcome,event){
   if(busy||!call)return;
   // The booking page no longer opens on its own; "Termin vereinbart" shows a link to it instead.
   const modern=!!call.results;if(modern&&!ready())return;
   busy=true;error='';update();
   try{const done=call,r=await api(modern?{action:'callSave',callId:done.callId,notes,outcome,next:next.kind==='date'?{kind:'date',date:next.date,time:next.time||undefined}:{kind:next.kind}}:{action:'callSave',callId:done.callId,notes,outcome,callbackDate:outcome==='callback'?later:undefined,callbackTime:outcome==='callback'&&laterTime||undefined,keepFollowUp:outcome!=='callback'&&!!planned()&&keep});finish();onSaved(done,r);}
   catch(e){busy=false;error=e.message||'Speichern fehlgeschlagen.';update();}
  }
  async function cancel(){
   if(busy||!call)return;busy=true;error='';update();
   try{await api({action:'callCancel',callId:call.callId});finish();}catch(e){busy=false;error=e.message||'Verwerfen fehlgeschlagen.';update();}
  }
  // Per browser tab, so a reload brings back this tab's call and no other tab's.
  function remember(id){if(!rememberKey)return;try{if(id)sessionStorage.setItem(rememberKey,id);else sessionStorage.removeItem(rememberKey);}catch{}}
  const remembered=()=>{try{return rememberKey?sessionStorage.getItem(rememberKey)||'':'';}catch{return'';}};
  // Coming back to a tab re-checks a shown call, so one saved in another tab or in Gmail disappears here too.
  let checked=0;const recheck=()=>{if(call&&!busy&&document.visibilityState==='visible'&&Date.now()-checked>3000){checked=Date.now();sync();}};
  document.addEventListener('visibilitychange',recheck);window.addEventListener('focus',recheck);
  function resume(open,{collapsed=false}={}){if(!open||(call&&call.callId===open.callId))return;if(call)return;call=open;notes=drafted=open.notes||'';minimized=collapsed;show();}
  return{
   get call(){return call;},
   get busy(){return busy;},
   // Called from the click on a number: prepare the call on the server, open the dialler, then float the card above everything.
   async begin(prepare){
    if(call||busy)throw new Error('Bitte zuerst den laufenden Anruf speichern oder verwerfen.');
    busy=true;const floating=requestPip();
    floating?.then(w=>{if(w&&busy){const d=w.document;d.head.replaceChildren(Object.assign(d.createElement('style'),{textContent:CSS}));d.body.className='sf-pip'+(theme()==='dark'?' dark':'');d.body.replaceChildren(Object.assign(d.createElement('p'),{className:'sf-call',textContent:'Anruf wird vorbereitet …',style:'margin:0;padding:16px;border:0;box-shadow:none'}));}});
    try{const r=await prepare();busy=false;resume(r);dial.click();adopt(await floating);area.focus();return r;}
    // Usually another call is still open: show it next to the error.
    catch(e){busy=false;(await floating)?.close();await sync({show:true});throw e;}
   },
   resume,
   sync,
   popOut,
   refresh:update,
  };
  // Drops a shown call that was saved or discarded elsewhere. It only shows an open call when asked: right after a refused start
  // (usually because that call is still open), or after a reload of the tab that started it.
  async function sync({show=false,restore=false}={}){
   if(busy)return;let open=null;try{open=(await api({action:'callOpen'})).call;}catch{return;}if(busy)return;
   if(call&&call.callId!==open?.callId)finish();
   if(open&&!call&&(show||(restore&&open.callId===remembered())))resume(open,{collapsed:!show});
  }
 }
 globalThis.stageForceCallCard={create,supported};
})();
