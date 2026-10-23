(() => {
'use strict';
if (window.__stageforceLab) return;
window.__stageforceLab = true;
const ROOT = 'stageforce-lab';
const unique = a => [...new Set(a.filter(Boolean))];
const emails = s => unique((s || '').match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []);
const text = e => e ? (e.innerText || e.textContent || '').trim() : '';
const visible = e => !!(e && e.getClientRects().length);
const bodies = () => [...document.querySelectorAll('.a3s')].filter(visible);
const container = b => b.closest('.adn') || b.closest('[data-message-id]') || b.parentElement;
const nodes = () => unique(bodies().map(container));
const subject = () => text(document.querySelector('h2.hP')) || text(document.querySelector('h2[data-thread-perm-id]'));
function account() {
 const a = document.querySelector('a[aria-label*="Google Account"],a[aria-label*="Google-Konto"]');
 return emails(a?.getAttribute('aria-label'))[0] || '';
}
function messageId(n){return n.getAttribute('data-legacy-message-id')||n.querySelector('[data-legacy-message-id]')?.getAttribute('data-legacy-message-id')||n.getAttribute('data-message-id')||n.querySelector('[data-message-id]')?.getAttribute('data-message-id')||'';}
function extract(n) {
 const body = n.querySelector('.a3s');
 const sender = n.querySelector('.gD[email],.gD');
 const recipients = [...n.querySelectorAll('.g2[email]')];
 const date = n.querySelector('.g3[title],.g3[data-tooltip],time');
 const rawDate = date?.getAttribute('title') || date?.getAttribute('data-tooltip') || date?.getAttribute('datetime') || text(date);
 // Only machine-readable values are normalized. Localized dates remain verbatim for review.
 const iso = rawDate && /^\d{4}-\d{2}-\d{2}T/.test(rawDate) && !Number.isNaN(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null;
 const fullBody=completeBody(body);
 const copy = body?.cloneNode(true);
 copy?.querySelectorAll('.gmail_quote,blockquote,.gmail_extra').forEach(e => e.remove());
 const from = (sender?.getAttribute('email') || emails(text(sender))[0] || '').toLowerCase();
 const to = unique(recipients.map(e => e.getAttribute('email')));
 const me = account();
 const warnings = [];
 if (!from) warnings.push('Sender email address not found.');
 warnings.push('Recipient roles (To / Cc / Bcc) are not verified. Open Gmail’s recipient details to check completeness.');
 if (!rawDate) warnings.push('Original timestamp not found.');
 else if (!iso) warnings.push('Timestamp retained exactly as Gmail displays it; timezone / normalized time needs review.');
 if (!me) warnings.push('Current mailbox not detected; direction is unknown.');
 if (!fullBody) warnings.push('No loaded message body found.');
 return {gmailMessageId:messageId(n),subject:subject(),from:{name:text(sender),email:from},visibleRecipients:to,mailbox:me,direction:!me || !from ? 'unknown' : from.toLowerCase() === me.toLowerCase() ? 'sent' : to.some(e=>e.toLowerCase()===me.toLowerCase()) ? 'received' : 'unknown',timestampRaw:rawDate || '',timestampISO:iso,bodyText:fullBody,signaturePhones:globalThis.stageForceExtract.phones(completeBody(copy),[...(copy?.querySelectorAll('a[href^="tel:"]')||[])].map(a=>a.getAttribute('href').slice(4))),attachments:globalThis.stageForceExtract.attachments(n),warnings};
}
const logo='<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><path d="M6 13l2 9M13 8l3 13M21 7l2 10" stroke-width="5" stroke-linecap="round" fill="none" stroke="#9060d0"/><path d="M21 7l2 10" stroke-width="5" stroke-linecap="round" stroke="#e44eb5"/></svg>';
const css=`
:host{--sf-scheme:light;--sf-text:#27334b;--sf-muted:#59677f;--sf-border:#c5c7e3;--sf-surface:#ffffff;--sf-panel-start:#f4f6ff;--sf-panel-end:#efeafb;--sf-hover:#e9e6f8;--sf-accent:#6350b6;--sf-on-accent:#ffffff;--sf-link:#5542a2;--sf-focus:#7959d6;--sf-error:#a12446;--sf-veil:#151a3559}
:host([data-theme="dark"]){--sf-scheme:dark;--sf-text:#edf1ff;--sf-muted:#b6c1db;--sf-border:#455173;--sf-surface:#111a31;--sf-panel-start:#1c2441;--sf-panel-end:#25203e;--sf-hover:#30365a;--sf-accent:#6954bd;--sf-link:#c3b4ff;--sf-focus:#bca8ff;--sf-error:#ff9fba;--sf-veil:#05091999}

:host{--sf-select-chevron:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2359677f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")}
:host([data-theme="dark"]){--sf-select-chevron:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23b6c1db' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")}

:host{all:initial;color-scheme:var(--sf-scheme);font:16px/1.5 system-ui,sans-serif;color:var(--sf-text)}*{box-sizing:border-box}button,input,textarea,select{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible,select:focus-visible{outline:3px solid var(--sf-focus);outline-offset:2px}.veil{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:var(--sf-veil)}.modal{width:min(1400px,100%);max-height:94vh;display:flex;flex-direction:column;border:1px solid var(--sf-surface);border-radius:23px;background:linear-gradient(125deg,var(--sf-panel-start),var(--sf-panel-end));box-shadow:0 26px 100px #23123640;overflow:hidden}header{display:flex;align-items:center;gap:10px;padding:18px 24px}h1{font-size:19px;letter-spacing:-.5px;margin:0}.close{margin-left:auto}.ghost,.primary,.connect{border:1px solid var(--sf-border);border-radius:11px;padding:12px 14px;color:var(--sf-text);background:var(--sf-surface)}.primary{background:var(--sf-accent);color:var(--sf-on-accent);border-color:var(--sf-accent);font-weight:650}.connect{font-size:13px;padding:6px 10px}button:disabled{opacity:.5;cursor:wait}.grid{padding:4px 24px 20px;display:grid;grid-template-columns:minmax(0,3fr) minmax(245px,1fr);gap:25px;overflow:auto}.column{min-width:0;display:flex;flex-direction:column;gap:17px}input,textarea,select{width:100%;background:var(--sf-surface);border:1px solid var(--sf-border);border-radius:11px;padding:13px;color:var(--sf-text)}select{appearance:none;padding-right:36px;background-image:var(--sf-select-chevron);background-position:right 12px center;background-size:16px 16px;background-repeat:no-repeat}@media(forced-colors:active){select{appearance:auto;background-image:none;padding-right:13px}}input::placeholder,textarea::placeholder{color:var(--sf-muted);opacity:1}textarea{resize:vertical;line-height:1.6;min-height:330px;flex:1;font-size:15px}.subject{display:grid;grid-template-columns:1fr 235px;gap:10px}.timestamp{font-size:13px}.organisation-picker{position:relative}.options{position:absolute;left:0;right:0;top:56px;z-index:5;max-height:min(240px,30vh);overflow-y:auto;border:1px solid var(--sf-border);border-radius:10px;box-shadow:0 5px 15px #43215e12}.options:empty{display:none}.optional .options{top:auto;bottom:calc(100% + 5px)}.options button{display:block;width:100%;border:0;background:var(--sf-surface);color:var(--sf-text);text-align:left;padding:10px 12px}.options button:hover{background:var(--sf-hover)}.status{margin-top:6px;font-size:12px;color:var(--sf-muted);min-height:0}.status:empty{visibility:hidden}.organisation-picker>.status{min-height:18px}.contact{display:flex;flex-wrap:wrap;gap:11px;align-items:center;padding:14px;border:1px solid var(--sf-border);border-radius:12px;background:var(--sf-surface);margin-bottom:10px}.contact input[type=checkbox]{width:18px;height:18px;accent-color:#7548b2}.contact strong{font-size:15px;font-weight:600;display:block;overflow-wrap:anywhere}.contact small{font-size:12px;color:var(--sf-muted);display:block;overflow-wrap:anywhere}.pill{margin-left:auto;font-size:11px;white-space:nowrap;color:var(--sf-link);background:var(--sf-hover);border-radius:20px;padding:3px 8px}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}.actions button{flex:1}.optional{margin-top:auto}.optional input{font-size:14px}.error{color:var(--sf-error);font-size:13px;white-space:pre-wrap}.error:empty{display:none}.meta{font-size:12px;color:var(--sf-muted)}details summary{cursor:pointer}details input,details select{margin-top:8px}footer{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:0 24px 18px;font-size:12px;color:var(--sf-muted)}#connection{flex:1;min-width:120px;overflow-wrap:anywhere}.hidden{display:none!important}@media(max-width:760px){.grid{grid-template-columns:1fr}.veil{padding:8px}.subject{grid-template-columns:1fr}.optional{margin-top:0}.actions{margin-top:0}textarea{min-height:220px}}`;
const phoneCSS=`.phone-box{width:100%}.phone-number{display:flex;align-items:center;gap:7px;width:100%;padding:9px;border:1px solid var(--sf-border);background:var(--sf-surface);border-radius:10px;color:var(--sf-text);text-align:left}.phone-number span{flex:1;overflow-wrap:anywhere}.phone-number svg{width:20px;flex:none}.call-note{padding:10px 0}.call-note textarea{min-height:90px;font-size:13px}.call-note .actions{margin-top:6px}.call-note a{font-size:12px;color:var(--sf-link)}.phone-editor{width:100%;font-size:12px;color:var(--sf-muted)}.phone-edit{font-size:12px;padding:8px;width:100%;height:auto}.shake{animation:shake .3s linear 2}@keyframes shake{25%,75%{transform:translateX(-5px)}50%{transform:translateX(5px)}}#attachments{font-size:12px;color:var(--sf-muted);overflow-wrap:anywhere}#full-body{align-self:flex-start;font-size:12px;padding:6px 10px}.phone-hint{font-size:11px;color:var(--sf-muted)}`;
let host,lastFocus;
async function send(message){try{const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw Object.assign(new Error(r?.error||'Extension unavailable. Refresh Gmail.'),{code:r?.code||'request_failed'});return r.data;}catch(error){if(/Extension context invalidated|Receiving end does not exist|Extension unavailable/.test(error.message))throw Object.assign(new Error('The extension was reloaded. Copy any unsaved edits, then refresh Gmail.'),{code:'reload_required'});throw error;}}
const api=payload=>send({type:'api',payload});
async function messageFingerprint(d){const data='extension-v1:'+JSON.stringify([d.from.email,d.timestampRaw,d.subject,d.bodyText]);const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));return[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}
function completeBody(body){if(!body)return '';const c=body.cloneNode(true);c.querySelectorAll('script,style').forEach(e=>e.remove());c.querySelectorAll('br').forEach(e=>e.replaceWith('\n'));c.querySelectorAll('div,p,blockquote,tr,li').forEach(e=>e.append('\n'));return(c.textContent||'').replace(/\n[ \t]*\n[ \t]*\n/g,'\n\n').trim();}
function localInput(d){return new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,19);}
async function open(n){
 if(host)return;lastFocus=document.activeElement;
 const d=extract(n);const requestId=crypto.randomUUID();
 const modalHost=document.createElement('div');host=modalHost;host.id=ROOT;const media=window.matchMedia('(prefers-color-scheme: dark)');let themeMode='system';const applyTheme=()=>{modalHost.dataset.theme=themeMode==='system'?(media.matches?'dark':'light'):themeMode;};applyTheme();media.addEventListener('change',applyTheme);const sh=host.attachShadow({mode:'closed'});
 sh.innerHTML=`<style>${css}${phoneCSS}</style><div class="veil"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="title"><header>${logo}<h1 id="title">Add to StageForce</h1><button class="ghost close" aria-label="Close">✕</button></header><div class="grid"><div class="column"><div class="organisation-picker"><input id="org" aria-label="Organization" placeholder="Find or create an organization" autocomplete="off"><div class="options" id="org-options"></div><div class="status" id="org-status"></div></div><div class="subject"><input id="subject" aria-label="Email subject" placeholder="Email subject"><input class="timestamp" id="date" type="datetime-local" step="1" aria-label="Email timestamp, your browser timezone"></div><textarea id="body" aria-label="Email content" placeholder="Email content"></textarea><button id="full-body" class="ghost hidden">Show / edit full email</button><div id="attachments"></div></div><div class="column"><div id="contacts"></div><details class="meta" id="details"><summary>Message details</summary><div id="extraction-note">Only loaded message text is included. Recipient roles and completeness depend on Gmail’s visible headers.</div><input id="mailbox" type="email" aria-label="Gmail mailbox" placeholder="Your Gmail account email"><select id="direction" aria-label="Message direction"><option value="incoming">Received</option><option value="outgoing">Sent</option></select></details><div class="optional organisation-picker"><input id="linked" aria-label="Linked organization, optional" placeholder="Link another organization · optional" autocomplete="off"><div class="options" id="linked-options"></div><div class="status" id="linked-status"></div></div><div id="error" class="error" role="alert"></div><div class="actions"><button id="save-open" class="ghost" disabled>Save & Open ↗</button><button id="save" class="primary" disabled>Save & Continue</button></div></div></div><footer><span id="connection">Connecting…</span><button class="connect" id="retry" hidden>Retry connection</button><button class="connect" id="settings">Connection</button></footer></section></div>`;
 document.documentElement.append(host);const $=s=>sh.querySelector(s);
 let connected=false,busy=false,checking=0,active=true,selected=null,linked=null,lookupGeneration=0,participants=[],savedMessage=null,fullBody=d.bodyText,expanded=d.bodyText.length<=6000;
 function connectionError(error){
  if(!['connection_required','connection_unavailable','invalid_response','reload_required'].includes(error.code))return false;
  connected=false;$('#connection').textContent=error.code==='reload_required'?'Refresh Gmail to reconnect':'Not connected';$('#retry').hidden=error.code==='reload_required';buttonIssue(messageButton(n),error);controls();return true;
 }
 async function popupApi(payload){try{return await api(payload);}catch(error){connectionError(error);throw error;}}
 const callStates=new Map(),phoneChoices=new Map();
 const choices=new Map();
 $('#subject').value=d.subject;setBody(d.bodyText);showAttachments(d.attachments);$('#mailbox').value=d.mailbox;$('#direction').value=d.direction==='sent'?'outgoing':'incoming';
 const parsed=globalThis.stageForceDate(d.timestampRaw);$('#date').value=parsed?localInput(parsed):'';
 $('#date').title='Time in '+Intl.DateTimeFormat().resolvedOptions().timeZone+' · Gmail: '+d.timestampRaw;
 if(!parsed){$('#error').textContent='Check the email date and time. Gmail shows: '+(d.timestampRaw||'not found');}
 if(!d.mailbox)$('#details').open=true;
 function setBody(value){fullBody=value;expanded=value.length<=6000;$('#body').value=expanded?value:value.slice(0,6000)+'\n…';$('#body').readOnly=!expanded||!!savedMessage;$('#full-body').classList.toggle('hidden',expanded);}
 function showAttachments(items){$('#attachments').textContent=items.length?'📎 '+items.map(a=>a.name+(a.size?' · '+a.size:'')).join(' · ')+' — references only; files remain in the mailbox.':'';}
 $('#full-body').onclick=()=>{expanded=true;$('#body').value=fullBody;$('#body').readOnly=!!savedMessage;$('#full-body').classList.add('hidden');};
 function controls(){const calling=[...callStates.values()].some(c=>c.open||c.busy);for(const e of sh.querySelectorAll('#org,#linked,#mailbox,.phone-edit'))e.disabled=busy||calling;if(savedMessage){$('#save-open').disabled=busy;return;}for(const id of ['#save','#save-open'])$(id).disabled=!connected||busy||checking>0||!selected||!$('#date').value||!$('#mailbox').value||[...callStates.values()].some(c=>c.open||c.busy);}
 const envelope=()=>({mailbox:$('#mailbox').value.trim(),from:d.from,recipients:d.visibleRecipients.map(email=>({email,name:''}))});
 function renderContacts(items){
  participants=items;$('#contacts').replaceChildren();
  for(const person of items){
   if(!choices.has(person.email))choices.set(person.email,true);
   const card=document.createElement('div');card.className='contact';
   const check=document.createElement('input');check.type='checkbox';check.checked=choices.get(person.email);check.disabled=!!savedMessage;check.onchange=()=>choices.set(person.email,check.checked);check.setAttribute('aria-label','Include '+person.email);
   const info=document.createElement('span'),name=document.createElement('strong'),mail=document.createElement('small');name.textContent=person.name||person.email;mail.textContent=person.email;info.append(name,mail);card.append(check,info);
   if(!phoneChoices.has(person.email))phoneChoices.set(person.email,unique([...(person.phones||[]),...(!savedMessage&&person.email===d.from.email?d.signaturePhones:[])]));
   else phoneChoices.set(person.email,unique([...(person.phones||[]),...phoneChoices.get(person.email)]));
   const edit=document.createElement('input');edit.className='phone-edit';edit.placeholder='Phone number · optional';edit.setAttribute('aria-label','Phone numbers for '+(person.name||person.email));edit.value=phoneChoices.get(person.email).join('; ');edit.readOnly=!!savedMessage;
   const numbers=document.createElement('div');numbers.style.width='100%';
   const draw=()=>{numbers.replaceChildren();for(const number of phoneChoices.get(person.email))numbers.append(phoneControl(person,number));};
   edit.onchange=()=>{phoneChoices.set(person.email,edit.value.split(';').map(v=>v.trim()).filter(Boolean));draw();};
   if(phoneChoices.get(person.email).length)card.append(numbers);if(!savedMessage&&phoneChoices.get(person.email).length){const editor=document.createElement('details');editor.className='phone-editor';editor.open=false;const summary=document.createElement('summary');summary.textContent='Edit phone numbers';editor.append(summary,edit);card.append(editor);}draw();$('#contacts').append(card);
  }
  if(!items.length)$('#contacts').textContent='No external contacts found in the loaded headers.';
 }
 function phoneControl(person,number){
  const key=person.email+':'+number;let state=callStates.get(key);if(!state){state={open:false,busy:false,notes:'',requestId:null,startedAt:null,result:null};callStates.set(key,state);}
  const box=document.createElement('div');box.className='phone-box';const button=document.createElement('button');button.type='button';button.className='phone-number';button.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h4l2 5-3 2c2 3 3 4 6 6l2-3 5 2v4c-8 4-21-9-16-16Z" fill="none" stroke="currentColor" stroke-width="2"/></svg><span></span>'+logo;button.querySelector('span').textContent=number;box.append(button);
  const note=document.createElement('div');note.className='call-note';note.innerHTML='<small></small><textarea placeholder="Call notes · optional" aria-label="Call notes"></textarea><a>Open calling app again</a><div class="actions"><button class="primary">Save</button><button class="ghost" aria-label="Discard call note">×</button></div><div class="error" role="alert"></div>';box.append(note);
  const area=note.querySelector('textarea'),saveButton=note.querySelector('.primary'),cancelButton=note.querySelector('.ghost'),retry=note.querySelector('a');
  function refresh(){note.hidden=!state.open;button.disabled=state.busy||state.open;area.value=state.notes;area.disabled=saveButton.disabled=cancelButton.disabled=state.busy;note.querySelector('small').textContent=state.startedAt?'Call started · '+new Date(state.startedAt).toLocaleTimeString():'';retry.href=state.result?'tel:'+state.result.dial:'#';controls();}
  area.oninput=()=>state.notes=area.value;
  cancelButton.onclick=async()=>{if(state.busy)return;state.busy=true;refresh();try{await popupApi({action:'callCancel',callId:state.result.callId});state.open=false;state.notes='';state.requestId=null;state.startedAt=null;state.result=null;}catch(e){note.querySelector('.error').textContent=e.message;}finally{state.busy=false;refresh();}};
  saveButton.onclick=async()=>{if(state.busy)return;state.busy=true;refresh();try{const r=await popupApi({action:'callSave',callId:state.result.callId,notes:state.notes});selected={...selected,...r.organisation};state.open=false;state.notes='';state.requestId=null;state.startedAt=null;state.result=null;$('#connection').textContent='✓ Call recorded';}catch(e){note.querySelector('.error').textContent=e.message;}finally{state.busy=false;refresh();}};
  button.onclick=async()=>{
   if(busy||state.busy||state.open)return;if(!connected||checking){$('#error').textContent='Wait for the CRM connection and contact lookup.';return;}
   if(!selected&&$('#org').value.trim())selected={name:$('#org').value.trim()};
   if(!selected){button.classList.remove('shake');void button.offsetWidth;button.classList.add('shake');$('#org-status').textContent='↑ Select or create an organisation before calling.';$('#org').focus();return;}
   if([...callStates.values()].some(c=>c.busy||c.open)){ $('#error').textContent='Save or cancel the current call note first.';return; }
   state.busy=true;state.requestId??=crypto.randomUUID();state.startedAt??=new Date().toISOString();refresh();$('#error').textContent='';
   try{const r=await popupApi({action:'callPrepare',...envelope(),requestId:state.requestId,startedAt:state.startedAt,organisationId:selected.id,version:selected.version,newOrganisation:selected.id?undefined:selected.name,contactId:person.contactId,contactEmail:person.email,phone:number,messageId:savedMessage?.id,gmailMessageId:d.gmailMessageId,legacyFingerprint:savedMessage?await messageFingerprint(d):undefined});selected=r.organisation;person.contactId=r.contact.id;person.known=true;$('#org-status').textContent='✓ Organisation and contact saved';state.result=r;state.open=true;state.notes='';refresh();retry.click();area.focus();}
   catch(e){$('#error').textContent=e.message;state.requestId=null;state.startedAt=null;}
   finally{state.busy=false;refresh();}
  };refresh();return box;
 }
 async function lookup(auto=false){
  if(!connected||!$('#mailbox').value||savedMessage)return;
  const generation=++lookupGeneration;checking++;controls();
  try{const p=await popupApi({action:'lookup',...envelope(),organisationId:!auto&&selected?.id||undefined});if(!active||generation!==lookupGeneration)return;
   if(auto&&p.organisation){selected=p.organisation;$('#org').value=selected.name;$('#org-status').textContent='✓ Matched by email address';}
   else if(!auto&&selected?.id&&p.organisation)selected=p.organisation;
   renderContacts(p.participants);
   if(auto&&!selected&&p.candidates.length){showResults('org',p.candidates);$('#org-status').textContent='Choose the matching organization';}
   if(p.linked&&!linked){linked=p.linked;$('#linked').value=linked.name;$('#linked-status').textContent='Existing CRM link';}
  }catch(e){if(active&&generation===lookupGeneration)$('#error').textContent=e.message;}finally{checking--;if(active)controls();}
 }
 function showResults(id,items,query=''){
  const list=$('#'+id+'-options');list.replaceChildren();
  function choose(o){if(!active||busy||[...callStates.values()].some(c=>c.open||c.busy))return;$('#'+id).value=o.name;list.replaceChildren();$('#'+id+'-status').textContent=o.id?'':'＋ New organization';if(id==='org'){phoneChoices.clear();callStates.clear();selected=o;linked=null;$('#linked').value='';$('#linked-status').textContent='';if(o.id)lookup();else renderContacts(participants.map(p=>({...p,known:false,contactId:undefined,phones:[]})));}else linked=o;controls();}
  for(const o of items){const b=document.createElement('button');b.type='button';b.textContent=o.name;b.onclick=()=>choose(o);list.append(b);}
  if(query&&!items.some(o=>o.name.toLowerCase()===query.toLowerCase())){const b=document.createElement('button');b.type='button';b.textContent='＋ Create “'+query+'”';b.onclick=()=>choose({name:query});list.append(b);}
 }
 for(const id of ['org','linked']){let timer,sequence=0;const input=$('#'+id);input.oninput=()=>{if([...callStates.values()].some(c=>c.open||c.busy)){input.value=(id==='org'?selected:linked)?.name||'';return;}sequence++;const seq=sequence;clearTimeout(timer);$('#'+id+'-options').replaceChildren();$('#'+id+'-status').textContent='';if(id==='org'){selected=null;++lookupGeneration;renderContacts(participants.map(p=>({...p,known:false})));}else linked=null;controls();const q=input.value.trim();if(!q)return;timer=setTimeout(async()=>{try{const data=await popupApi({action:'search',query:q});if(active&&seq===sequence)showResults(id,data.items,q);}catch(e){if(active&&seq===sequence)$('#error').textContent=e.message;}},200);};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#'+id+'-options button')?.click();}};}
 $('#mailbox').onchange=async()=>{try{await loadSaved();if(!savedMessage)await lookup(true);}catch(e){$('#error').textContent=e.message;}};$('#date').oninput=controls;
 sh.addEventListener('pointerdown',e=>{for(const id of ['org','linked'])if(!e.target.closest('.organisation-picker')||!e.target.closest('.organisation-picker').contains($('#'+id)))$('#'+id+'-options').replaceChildren();});
 $('#settings').onclick=()=>send({type:'options'}).catch(e=>$('#error').textContent=e.message);
 async function save(openCRM){
  if(busy||[...callStates.values()].some(c=>c.busy||c.open))return;if(!connected||checking||!selected){$('#error').textContent='Connect StageForce and select an organization before saving.';controls();return;}if($('#linked').value.trim()&&!linked){$('#error').textContent='Select or create the linked organization, or clear that field.';return;}
  if(!d.from.email){$('#error').textContent='Sender not found. Expand the Gmail message headers and reopen.';return;}
  const date=new Date($('#date').value);if(!Number.isFinite(+date)){ $('#error').textContent='Check the email date and time.';return; }
  busy=true;controls();$('#error').textContent='';sh.querySelectorAll('input,textarea,select').forEach(e=>e.disabled=true);
  try{const r=await popupApi({action:'save',confirmed:true,requestId,...envelope(),gmailMessageId:d.gmailMessageId,attachments:d.attachments,contactPhones:participants.map(p=>({email:p.email,phones:phoneChoices.get(p.email)||[]})),organisationId:selected.id,version:selected.version,newOrganisation:selected.id?undefined:selected.name,linked:linked?{id:linked.id,name:linked.name}:undefined,subject:$('#subject').value,originalSubject:d.subject,body:expanded?$('#body').value:fullBody,originalBody:d.bodyText,timestamp:date.toISOString(),timestampRaw:d.timestampRaw,direction:$('#direction').value,sourceUrl:location.href,contactEmails:participants.filter(p=>choices.get(p.email)).map(p=>p.email)});
   if(r?.saved!==true||!r.organisation?.id)throw Object.assign(new Error('The CRM did not confirm that this email was saved.'),{code:'invalid_response'});
   setMessageButton(n,'saved',true);
   if(openCRM){try{await send({type:'open',organisationId:r.organisation.id});}catch{if(active)$('#error').textContent='Saved. Open Stage Force to view the organization.';busy=false;sh.querySelectorAll('input,textarea,select').forEach(e=>e.disabled=false);controls();return;}}
   close();
  }catch(e){if(active){connectionError(e);$('#error').textContent='Save not confirmed. Your draft is still open. '+e.message;busy=false;sh.querySelectorAll('input,textarea,select').forEach(e=>e.disabled=false);if(/inzwischen geändert/.test(e.message))await lookup();controls();}}
 }
 async function loadSaved(){if(!$('#mailbox').value)return;const r=await popupApi({action:'messageStatus',mailbox:$('#mailbox').value,gmailMessageId:d.gmailMessageId,detail:true,legacyFingerprint:await messageFingerprint(d)});if(!active||!r.saved)return;
  savedMessage=r.message;selected=r.organisation;$('#title').textContent='Already in StageForce';$('#org').value=selected.name;$('#org').readOnly=true;$('#subject').value=savedMessage.subject;$('#subject').readOnly=true;setBody(savedMessage.body);$('#date').value=savedMessage.timestamp?localInput(new Date(savedMessage.timestamp)):'';$('#date').readOnly=true;$('#mailbox').readOnly=true;$('#direction').value=savedMessage.direction;$('#direction').disabled=true;$('.optional').classList.add('hidden');showAttachments(savedMessage.attachments);renderContacts(r.participants);$('#save').classList.add('hidden');$('#save-open').textContent='Open in CRM ↗';$('#save-open').onclick=()=>send({type:'open',organisationId:selected.id}).catch(e=>$('#error').textContent=e.message);$('#error').textContent='';
  setMessageButton(n,'saved');
 }
 $('#save').onclick=()=>save(false);$('#save-open').onclick=()=>save(true);
 async function close(){if(!active||[...callStates.values()].some(c=>c.busy))return;if([...callStates.values()].some(c=>c.open)){if(!window.confirm('Discard the unsaved call note? Organisation and contact remain saved.'))return;try{for(const c of callStates.values())if(c.open&&c.result){c.busy=true;await popupApi({action:'callCancel',callId:c.result.callId});c.open=false;c.busy=false;}}catch(e){for(const c of callStates.values())c.busy=false;$('#error').textContent=e.message;return;}}active=false;media.removeEventListener('change',applyTheme);modalHost.remove();if(host===modalHost)host=null;for(const type of ['keydown','keyup','keypress'])window.removeEventListener(type,keys,true);lastFocus?.focus();}
 function keys(e){if(!e.composedPath().includes(modalHost))return;e.stopImmediatePropagation();if(e.type!=='keydown')return;if(e.key==='Enter'&&['org','linked'].includes(sh.activeElement?.id)){e.preventDefault();$('#'+sh.activeElement.id+'-options button')?.click();return;}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busy)close();return;}if(e.key==='Tab'){const f=[...sh.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,select:not(:disabled)')].filter(visible);const first=f[0],last=f[f.length-1];if(e.shiftKey&&sh.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&sh.activeElement===last){e.preventDefault();first.focus();}}}
 $('.close').onclick=()=>{if(!busy)close();};for(const type of ['keydown','keyup','keypress'])window.addEventListener(type,keys,true);$('#org').focus();
 async function reconnect(){
  if(busy||checking)return;checking++;connected=false;$('#retry').disabled=true;controls();
  try{const c=await send({type:'status'});if(!active)return;connected=true;if(messageButton(n)?.dataset.state!=='saved')setMessageButton(n,'ready');themeMode=['light','dark'].includes(c.appearance)?c.appearance:'system';applyTheme();$('#connection').textContent=new URL(c.origin).host+' · '+c.email;$('#error').textContent='';$('#retry').hidden=true;await loadSaved();if(!savedMessage)await lookup(!selected);}
  catch(e){if(active){connectionError(e);buttonIssue(messageButton(n),e);$('#connection').textContent='Check connection';$('#error').textContent=e.message;}}
  finally{checking--;if(active){$('#retry').disabled=false;controls();}}
 }
 $('#retry').onclick=reconnect;await reconnect();
}
const buttonCSS=`
:host{display:inline-flex;vertical-align:middle;margin:0 12px 0 0;white-space:nowrap}
button{position:relative;isolation:isolate;overflow:hidden;display:inline-flex;align-items:center;gap:7px;cursor:pointer;border:1px solid #887ab6;border-radius:20px;padding:7px 13px;font:600 12px/1.4 system-ui;color:#fff;background:linear-gradient(115deg,#6546b3,#3f58a8);box-shadow:0 2px 5px #25184918;transition:transform .16s ease,box-shadow .16s ease}
button:focus-visible{outline:3px solid #aa8bed;outline-offset:3px}
button:hover{box-shadow:0 3px 9px #25184930;transform:translateY(-1px)}
button:active{transform:scale(.97)}
.symbol{display:inline-block;width:14px;text-align:center;flex:none}
.label{position:relative}
button[data-state="ready"]::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(110deg,transparent 30%,#ffffff30 48%,transparent 65%);transform:translateX(-120%);animation:sf-shimmer 3.5s ease-in-out 2}
button[data-state="ready"]:hover .symbol{animation:sf-spark .55s ease both}
button[data-state="saved"]{color:#145438;background:#e2f4e9;border-color:#76b88e;box-shadow:0 2px 5px #134e2e12}
button[data-state="saved"]:hover{background:#d2efdd}
button[data-state="disconnected"],button[data-state="offline"],button[data-state="attention"]{color:#755018;background:#fff3d7;border-color:#c6a96c;box-shadow:none}
button[data-state="checking"]{color:#526078;background:#edf0f7;border-color:#bbc3d3;box-shadow:none}
button.celebrate .symbol{animation:sf-success .45s ease both}
@keyframes sf-shimmer{0%,55%{transform:translateX(-120%)}90%,100%{transform:translateX(120%)}}
@keyframes sf-spark{50%{transform:rotate(60deg) scale(1.2)}100%{transform:rotate(0) scale(1)}}
@keyframes sf-success{0%{transform:scale(.6)}60%{transform:scale(1.25)}100%{transform:scale(1)}}
@media(prefers-color-scheme:dark){button[data-state="saved"]{color:#c5f3d5;background:#173e2c;border-color:#4f9a70}button[data-state="saved"]:hover{background:#1d4a35}button[data-state="disconnected"],button[data-state="offline"],button[data-state="attention"]{color:#f4d598;background:#40341f;border-color:#927645}button[data-state="checking"]{color:#ccd5e8;background:#273047;border-color:#65718b}}
@media(prefers-reduced-motion:reduce){button{transition:none}button:hover,button:active{transform:none}button::after,button .symbol{animation:none!important}}
`;
function messageButton(n){return n.querySelector('[data-stageforce-button]')?.shadowRoot?.querySelector('button');}
function setMessageButton(n,state,celebrate=false){setButtonState(messageButton(n),state,celebrate);}
function setButtonState(b,state,celebrate=false,detail=''){
 if(!b)return;
 const states={ready:['✦','Add to StageForce','Preview this message in StageForce'],saved:['✓','Already in StageForce · Check','Saved in StageForce — open contacts and email'],disconnected:['○','Connect StageForce','Open extension connection settings'],offline:['○','StageForce · Offline','CRM unavailable — open to retry or check connection'],attention:['!','StageForce · Check','Open to check this message'],checking:['·','StageForce · Checking','Checking whether this message is saved']};
 const [icon,label,title]=states[state];b.dataset.state=state;b.sfRevision=(b.sfRevision||0)+1;b.classList.toggle('celebrate',celebrate);b.querySelector('.symbol').textContent=icon;b.querySelector('.label').textContent=label;b.title=detail||title;
}
function buttonIssue(b,error){const message=error?.message||'Check the StageForce connection.';const state=error?.code==='connection_required'?'disconnected':/Connect Stage Force first|Connect your extension|Connect Stage Force using/.test(message)?'disconnected':/unavailable|Failed to fetch|timeout|timed out|aborted/i.test(message)?'offline':'attention';setButtonState(b,state,false,message);}
function inject(){
 for(const n of nodes()){
 if(n.querySelector('[data-stageforce-button]'))continue;
 const timestamp=n.querySelector('.g3') || n.querySelector('time');
 if(!timestamp) continue;
 const wrap=document.createElement('span');wrap.dataset.stageforceButton='true';
 const sh=wrap.attachShadow({mode:'open'});
 sh.innerHTML='<style>'+buttonCSS+'</style><button type="button"><span class="symbol" aria-hidden="true"></span><span class="label"></span></button>';
 const b=sh.querySelector('button');setButtonState(b,'checking');
 b.onclick=e=>{e.stopPropagation();if(b.dataset.state==='disconnected')send({type:'options'}).catch(error=>buttonIssue(b,error));else open(n);};timestamp.before(wrap);checkButton(n,b);
 }
}
const checkQueue=[];let checkingButtons=false;
function checkButton(n,b){if(b.sfQueued)return;b.sfQueued=true;checkQueue.push({n,b});drainChecks();}
async function drainChecks(){
 if(checkingButtons)return;checkingButtons=true;
 try{while(checkQueue.length){const {n,b}=checkQueue.shift();try{
  if(!n.isConnected)continue;const revision=b.sfRevision,id=messageId(n),mailbox=account();
  try{
   if(!mailbox){await send({type:'status'});if(b.sfRevision===revision)setButtonState(b,'attention',false,'Open to confirm your Gmail mailbox.');continue;}
   let r=await api({action:'messageStatus',mailbox,gmailMessageId:id});
   if(!r.saved){const legacyFingerprint=await messageFingerprint(extract(n));r=await api({action:'messageStatus',mailbox,gmailMessageId:id,legacyFingerprint});}
   if(b.sfRevision===revision)setButtonState(b,r.saved?'saved':'ready');
  }catch(error){if(b.sfRevision===revision)buttonIssue(b,error);}
 }finally{b.sfQueued=false;}}}finally{checkingButtons=false;}
}
let lastRetry=0;
function retryButtons(){if(document.hidden||Date.now()-lastRetry<15000)return;lastRetry=Date.now();for(const n of nodes()){const b=messageButton(n);if(b&&['disconnected','offline','attention'].includes(b.dataset.state))checkButton(n,b);}}
window.addEventListener('focus',retryButtons);window.addEventListener('online',retryButtons);
let pending=false;
new MutationObserver(records=>{if(records.every(r=>r.target===host||host?.contains(r.target)))return;if(!pending){pending=true;setTimeout(()=>{pending=false;inject();},250);}}).observe(document.body,{childList:true,subtree:true});
inject();
})();
