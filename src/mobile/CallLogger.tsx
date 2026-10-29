import {useCallback,useEffect,useRef,useState} from 'react';
import {Phone,PhoneIncoming,MessageSquareText,UserPlus,Search,X,ChevronLeft,Settings,LogOut,Trash2,Sun,Moon,Monitor,Flag,MessageCircleCheck,CalendarClock,CalendarCheck,Mail,ThumbsDown,PhoneMissed,Check,Clock,History,LoaderCircle,Pause,Play,Building2,type LucideIcon} from 'lucide-react';
import {api} from '../api';
import {useAppearance} from '../Appearance';
import {todayBerlin,defaultNextCall,nextCallDay,type NextCall} from '../domain';
type Contact={id:string;name:string;role:string;phones:string[];primary:boolean};
type Caller={id:string;name:string;version:string;subtitle:string;status:string;contacts:Contact[]};
type Outcome={key:string;label:string;next:string};
type LiveCall={callId:string;organisation:{id:string;name:string;version:string};contact?:{id:string;name:string};phone:string;dial:string;direction:'in'|'out';startedAt:string;notes:string;outcomes:Outcome[];results:{key:string;label:string;days:number|null}[];nextPicks:{label:string;date:string}[];followUp:string|null;bookingUrl:string};
type View={kind:'home'}|{kind:'org';org:Caller}|{kind:'new';name:string}|{kind:'call';call:LiveCall;isNew:boolean}|{kind:'saved';org:string;label:string};
const ICONS:Record<string,LucideIcon>={talked:MessageCircleCheck,callback:CalendarClock,meeting:CalendarCheck,email:Mail,no_interest:ThumbsDown,not_reached:PhoneMissed};
const clock=(ms:number)=>{const s=Math.max(0,Math.floor(ms/1000)),p=(v:number)=>String(v).padStart(2,'0');return Math.floor(s/3600)?`${Math.floor(s/3600)}:${p(Math.floor(s/60)%60)}:${p(s%60)}`:`${p(Math.floor(s/60))}:${p(s%60)}`;};
const noteKey=(id:string)=>'stageforce-m-note:'+id;
const keep=(id:string,value:string)=>{try{if(value)localStorage.setItem(noteKey(id),value);else localStorage.removeItem(noteKey(id));}catch{}};
const kept=(id:string)=>{try{return localStorage.getItem(noteKey(id))||'';}catch{return'';}};
// The same call button as on the desktop and in Gmail: phone, number, and the StageForce mark that says "this logs to the CRM".
function CallButton({contact,onPick,disabled}:{contact:Contact;onPick:()=>void;disabled?:boolean}){
 return <button type="button" className="sf-phone-number m-call-button" disabled={disabled} onClick={onPick}><Phone size={18} aria-hidden="true"/><span><strong>{contact.name||'Ohne Namen'}</strong><small>{contact.phones[0]||'Keine Nummer gespeichert'}{contact.role?` · ${contact.role}`:''}</small></span><img src="/assets/stageforce-icon.svg" alt="" width="26" height="26"/></button>;
}
function OrgRow({org,onPick,hint}:{org:Caller;onPick:()=>void;hint?:string}){
 return <button type="button" className="m-row" onClick={onPick}><span className="m-row-icon"><Building2 size={18} aria-hidden="true"/></span><span className="m-row-text"><strong>{org.name}</strong><small>{[hint,org.subtitle,org.contacts.length===1?org.contacts[0].name:org.contacts.length?`${org.contacts.length} Kontakte`:'Noch kein Kontakt'].filter(Boolean).join(' · ')}</small></span></button>;
}
export default function CallLogger({user,onLogout}:{user:{name:string;email:string};onLogout:()=>void}){
 const[view,setView]=useState<View>({kind:'home'}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[settings,setSettings]=useState(false);
 // The call started about when the app was opened, not when the caller was found: that moment is kept as the start time.
 const opened=useRef(new Date().toISOString());
 const go=(next:View)=>{setError('');setView(next);window.scrollTo({top:0});};
 // A call logged here and left open (the app was closed mid-call) comes back on the next open.
 const resume=useCallback(async()=>{try{const{call}=await api({action:'callOpen'});if(call?.direction==='in')setView(v=>v.kind==='call'&&v.call.callId===call.callId?v:{kind:'call',call:{...call,notes:call.notes||kept(call.callId)},isNew:false});else setView(v=>v.kind==='call'?{kind:'home'}:v);}catch{}},[]);
 useEffect(()=>{resume();const back=()=>{if(document.visibilityState!=='visible')return;setView(v=>{if(v.kind==='home'||v.kind==='saved')opened.current=new Date().toISOString();return v.kind==='saved'?{kind:'home'}:v;});resume();};document.addEventListener('visibilitychange',back);return()=>document.removeEventListener('visibilitychange',back);},[resume]);
 async function start(body:object,isNew:boolean){
  if(busy)return;setBusy(true);setError('');
  try{const call=await api({action:'callIncoming',requestId:crypto.randomUUID(),startedAt:opened.current,...body});go({kind:'call',call,isNew});}
  catch(e:any){setError(e.status===409&&/note/i.test(e.message)?'Am Rechner ist noch ein Anruf mit Notiz offen. Bitte dort speichern oder verwerfen.':e.message||'Der Anruf konnte nicht angelegt werden.');}
  finally{setBusy(false);}
 }
 return <div className="m-app">
  <header className="m-top">
   {view.kind==='org'||view.kind==='new'?<button type="button" className="m-icon-button glass" aria-label="Zurück" onClick={()=>go({kind:'home'})}><ChevronLeft size={22}/></button>:<div className="m-brand small"><div className="m-mark"><i/><i/><i/></div><span>Stage <b>Force</b></span></div>}
   <button type="button" className="m-icon-button glass" aria-label="Einstellungen" onClick={()=>setSettings(true)}><Settings size={20}/></button>
  </header>
  {error&&<p role="alert" className="m-error glass">{error}</p>}
  {view.kind==='home'&&<Home onPick={org=>go({kind:'org',org})} onNew={name=>go({kind:'new',name})}/>}
  {view.kind==='org'&&<OrgStep org={view.org} busy={busy} onStart={start}/>}
  {view.kind==='new'&&<NewLead initial={view.name} busy={busy} onStart={start}/>}
  {view.kind==='call'&&<LiveCallCard key={view.call.callId} call={view.call} isNew={view.isNew} onDone={(org,label)=>{keep(view.call.callId,'');go({kind:'saved',org,label});}} onDiscard={()=>{keep(view.call.callId,'');go({kind:'home'});}}/>}
  {view.kind==='saved'&&<Saved org={view.org} label={view.label} onNext={()=>{opened.current=new Date().toISOString();go({kind:'home'});}}/>}
  {settings&&<SettingsSheet user={user} onClose={()=>setSettings(false)} onLogout={()=>{setSettings(false);onLogout();}}/>}
 </div>;
}
function Home({onPick,onNew}:{onPick:(org:Caller)=>void;onNew:(name:string)=>void}){
 const[query,setQuery]=useState(''),[results,setResults]=useState<Caller[]|null>(null),[home,setHome]=useState<{due:Caller[];recent:Caller[]}|null>(null),[searching,setSearching]=useState(false);
 useEffect(()=>{let live=true;api({action:'mobileHome'}).then(r=>{if(live)setHome(r);}).catch(()=>{});return()=>{live=false;};},[]);
 useEffect(()=>{if(!query.trim()){setResults(null);setSearching(false);return;}setSearching(true);let live=true;const t=setTimeout(()=>api({action:'mobileSearch',query}).then(r=>{if(live)setResults(r.items);}).catch(()=>{}).finally(()=>{if(live)setSearching(false);}),180);return()=>{live=false;clearTimeout(t);};},[query]);
 const empty=!!query.trim()&&results?.length===0&&!searching;
 return <main className="m-screen m-home">
  <section className="m-hero"><span className="m-eyebrow"><PhoneIncoming size={15} aria-hidden="true"/>Anruf loggen</span><h1>Wer ruft an?</h1></section>
  <label className="m-search glass"><Search size={20} aria-hidden="true"/><input type="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="Name, Organisation oder Nummer" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Anrufer suchen"/>{searching?<LoaderCircle size={18} className="m-spin" aria-hidden="true"/>:query&&<button type="button" className="m-clear" aria-label="Suche leeren" onClick={()=>setQuery('')}><X size={16}/></button>}</label>
  {query.trim()?<div className="m-list glass">{results?.map(org=><OrgRow key={org.id} org={org} onPick={()=>onPick(org)}/>)}{empty&&<p className="m-empty">Nichts gefunden. Ein neuer Lead?</p>}</div>
  :home&&(home.due.length||home.recent.length)?<>
   {home.due.length>0&&<><h2 className="m-label"><Clock size={14} aria-hidden="true"/>Heute fällig</h2><div className="m-list glass">{home.due.map(org=><OrgRow key={org.id} org={org} onPick={()=>onPick(org)}/>)}</div></>}
   {home.recent.length>0&&<><h2 className="m-label"><History size={14} aria-hidden="true"/>Zuletzt gesprochen</h2><div className="m-list glass">{home.recent.map(org=><OrgRow key={org.id} org={org} onPick={()=>onPick(org)}/>)}</div></>}
  </>:home&&<p className="m-hint">Tippe ein paar Buchstaben des Namens oder die letzten Ziffern der Nummer.</p>}
  <div className="m-dock"><button type="button" className={`m-primary ${empty?'is-suggested':''}`} onClick={()=>onNew(empty?query.trim():'')}><UserPlus size={21} aria-hidden="true"/>Neuer Lead</button></div>
 </main>;
}
function OrgStep({org,busy,onStart}:{org:Caller;busy:boolean;onStart:(body:object,isNew:boolean)=>void}){
 const[other,setOther]=useState(!org.contacts.length),[name,setName]=useState(''),[phone,setPhone]=useState('');
 return <main className="m-screen">
  <section className="m-hero"><span className="m-eyebrow"><Building2 size={15} aria-hidden="true"/>{org.subtitle||org.status}</span><h1 className="m-title">{org.name}</h1></section>
  {org.contacts.length>0&&<><h2 className="m-label">Wer ist dran?</h2><div className="m-stack">{org.contacts.map(c=><CallButton key={c.id} contact={c} disabled={busy} onPick={()=>onStart({organisationId:org.id,contactId:c.id},false)}/>)}</div></>}
  {other?<form className="m-form glass" onSubmit={e=>{e.preventDefault();onStart({organisationId:org.id,contactName:name,phone},false);}}>
   <h2>Neue Person</h2>
   <label className="m-field"><span>Name des Anrufers</span><input autoComplete="off" value={name} onChange={e=>setName(e.target.value)} placeholder="Vor- und Nachname"/></label>
   <label className="m-field"><span>Nummer · optional</span><input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+49 …"/></label>
   <button className="m-primary" disabled={busy||(!name.trim()&&!phone.trim())}><MessageSquareText size={20} aria-hidden="true"/>{busy?'Wird angelegt …':'Weiter zur Notiz'}</button>
  </form>:<div className="m-dock"><button type="button" className="m-secondary glass" onClick={()=>setOther(true)}><UserPlus size={19} aria-hidden="true"/>Andere Person</button></div>}
 </main>;
}
function NewLead({initial,busy,onStart}:{initial:string;busy:boolean;onStart:(body:object,isNew:boolean)=>void}){
 const[org,setOrg]=useState(initial),[name,setName]=useState(''),[phone,setPhone]=useState('');
 return <main className="m-screen">
  <section className="m-hero"><span className="m-eyebrow"><UserPlus size={15} aria-hidden="true"/>Während des Anrufs</span><h1>Neuer Lead</h1></section>
  <form className="m-form glass" onSubmit={e=>{e.preventDefault();onStart({newOrganisation:org,contactName:name,phone},true);}}>
   <label className="m-field"><span>Organisation</span><input autoFocus autoComplete="off" required value={org} onChange={e=>setOrg(e.target.value)} placeholder="z. B. Stadt Musterstadt"/></label>
   <label className="m-field"><span>Name des Anrufers</span><input autoComplete="off" value={name} onChange={e=>setName(e.target.value)} placeholder="Vor- und Nachname"/></label>
   <label className="m-field"><span>Nummer · optional</span><input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+49 …"/></label>
   <p className="m-flag"><Flag size={15} aria-hidden="true"/>Neue Organisationen landen in Prüfen, damit jemand die Daten am Rechner kontrolliert.</p>
   <button className="m-primary" disabled={busy||!org.trim()||(!name.trim()&&!phone.trim())}><MessageSquareText size={20} aria-hidden="true"/>{busy?'Wird angelegt …':'Weiter zur Notiz'}</button>
  </form>
 </main>;
}
function LiveCallCard({call,isNew,onDone,onDiscard}:{call:LiveCall;isNew:boolean;onDone:(org:string,label:string)=>void;onDiscard:()=>void}){
 const[notes,setNotes]=useState(call.notes||''),[now,setNow]=useState(Date.now()),[result,setResult]=useState(''),[next,setNext]=useState<NextCall>(null),[touched,setTouched]=useState(false),[custom,setCustom]=useState(false),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[synced,setSynced]=useState(true);
 const drafted=useRef(call.notes||''),timer=useRef<ReturnType<typeof setTimeout>>(undefined),latest=useRef(notes);latest.current=notes;
 const flush=useCallback(()=>{clearTimeout(timer.current);const value=latest.current;if(value===drafted.current)return;api({action:'callDraft',callId:call.callId,notes:value}).then(()=>{drafted.current=value;if(latest.current===value)setSynced(true);}).catch(()=>{});},[call.callId]);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);const hide=()=>{if(document.visibilityState==='hidden')flush();};document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',flush);return()=>{clearInterval(t);document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',flush);flush();};},[flush]);
 function type(value:string){setNotes(value);setSynced(false);keep(call.callId,value);clearTimeout(timer.current);timer.current=setTimeout(flush,700);}
 // The same choice as the call card and the Anruf tab: the result, then the next call (preselected from the result), then Speichern.
 const today=todayBerlin(),planned=call.followUp&&call.followUp>today?call.followUp:'',date=next?.kind==='date'?next.date:'';
 const ready=!!result&&!!next&&(next.kind!=='date'||next.date>=today);
 function choose(key:string){setResult(key);if(!touched){setNext(defaultNextCall(key,call.followUp||'',today));setCustom(false);}}
 function pick(value:NextCall,isCustom=false){setTouched(true);setCustom(isCustom);setNext(value);}
 const selected=!next&&!custom?'':next?.kind==='keep'?'keep':next?.kind==='none'?'none':!custom&&call.nextPicks.some(p=>p.date===date)?'d:'+date:'custom';
 function chooseNext(v:string){if(v==='keep')pick({kind:'keep'});else if(v==='none')pick({kind:'none'});else if(v==='custom')pick(date?{kind:'date',date}:null,true);else if(v.startsWith('d:'))pick({kind:'date',date:v.slice(2)});}
 async function save(){
  if(busy||!ready||!next)return;
  setBusy(true);setError('');
  try{await api({action:'callSave',callId:call.callId,notes,outcome:result,next:next.kind==='date'?{kind:'date',date:next.date,time:next.time||undefined}:{kind:next.kind}});onDone(call.organisation.name,call.results.find(r=>r.key===result)?.label||'Gespeichert');}
  catch(e:any){setBusy(false);setError(e.message||'Speichern fehlgeschlagen. Die Notiz bleibt erhalten.');}
 }
 async function discard(){setBusy(true);setError('');try{await api({action:'callCancel',callId:call.callId});onDiscard();}catch(e:any){setBusy(false);setError(e.message||'Verwerfen fehlgeschlagen.');}}
 return <main className="m-screen m-call">
  <section className="m-live glass" aria-label="Laufender Anruf">
   <div className="m-live-top"><span className="m-pulse" aria-hidden="true"/><span>Eingehender Anruf</span><time>{clock(now-Date.parse(call.startedAt))}</time></div>
   <h1 className="m-title">{call.organisation.name}</h1>
   <p className="m-live-who">{[call.contact?.name,call.phone].filter(Boolean).join(' · ')||'Anrufer'}</p>
   {isNew&&<p className="m-flag"><Flag size={14} aria-hidden="true"/>Neu angelegt · wird in Prüfen markiert</p>}
  </section>
  <label className="m-note glass"><span className="m-note-head"><span>Gesprächsnotiz</span><small aria-live="polite">{notes?synced?<><Check size={12} aria-hidden="true"/>gesichert</>:'…':''}</small></span><textarea value={notes} onChange={e=>type(e.target.value)} rows={5} placeholder="Worum geht es? Kurze Stichpunkte reichen." disabled={busy}/></label>
  {error&&<p role="alert" className="m-error glass">{error}</p>}
  {confirm?<section className="m-sheet-inline glass">
   <h2>Anruf ohne Eintrag verwerfen?</h2><p className="m-hint">{isNew?'Die neu angelegte Organisation bleibt in Prüfen stehen.':'Die Notiz geht verloren.'}</p>
   <div className="m-pair"><button type="button" className="m-secondary glass" disabled={busy} onClick={()=>setConfirm(false)}>Zurück</button><button type="button" className="m-danger" disabled={busy} onClick={discard}><Trash2 size={18} aria-hidden="true"/>Verwerfen</button></div>
  </section>:<>
   <h2 className="m-label">Ergebnis</h2>
   <div className="m-chips" role="group" aria-label="Ergebnis">{call.results.map(r=>{const Icon=ICONS[r.key]||Check;return <button key={r.key} type="button" className={result===r.key?'is-on':''} aria-pressed={result===r.key} disabled={busy} onClick={()=>choose(r.key)}><Icon size={16} aria-hidden="true"/> {r.label}</button>;})}</div>
   {result==='meeting'&&call.bookingUrl&&<a className="m-text-button" href={call.bookingUrl} target="_blank" rel="noopener">Buchungsseite öffnen ↗</a>}
   <h2 className="m-label">Nächster Anruf</h2>
   <div className="m-field"><select aria-label="Nächster Anruf" value={selected} disabled={busy} onChange={e=>chooseNext(e.target.value)}>
    {selected===''&&<option value="">Bitte wählen …</option>}
    {planned&&<option value="keep">Unverändert · {nextCallDay(planned,today)}</option>}
    {call.nextPicks.map(p=><option key={p.label} value={'d:'+p.date}>{p.label} · {nextCallDay(p.date,today)}</option>)}
    <option value="custom">{selected==='custom'&&date?nextCallDay(date,today)+(next?.kind==='date'&&next.time?' · '+next.time+' Uhr':''):'Datum und Uhrzeit wählen …'}</option>
    <option value="none">Kein Anruf planen</option>
   </select></div>
   {selected==='custom'&&<div className="m-pair"><label className="m-field"><span>Datum</span><input type="date" min={today} value={date} disabled={busy} onChange={e=>pick(e.target.value?{kind:'date',date:e.target.value,time:next?.kind==='date'?next.time:''}:null,true)}/></label><label className="m-field"><span>Uhrzeit · optional</span><input type="time" step={300} value={next?.kind==='date'?next.time||'':''} disabled={busy||!date} onChange={e=>pick({kind:'date',date,time:e.target.value},true)}/></label></div>}
   <button type="button" className="m-primary" disabled={busy||!ready} onClick={save}><Check size={19} aria-hidden="true"/>{busy?'Wird gespeichert …':'Speichern'}</button>
   <button type="button" className="m-text-button" disabled={busy} onClick={()=>setConfirm(true)}><X size={15} aria-hidden="true"/>Ohne Eintrag verwerfen</button>
  </>}
 </main>;
}
function Saved({org,label,onNext}:{org:string;label:string;onNext:()=>void}){
 useEffect(()=>{const t=setTimeout(onNext,4000);return()=>clearTimeout(t);},[onNext]);
 return <main className="m-screen m-center m-saved"><div className="m-check" aria-hidden="true"><Check size={42} strokeWidth={2.6}/></div><h1>Eingetragen</h1><p>{label} · {org}</p><div className="m-dock"><button type="button" className="m-secondary glass" onClick={onNext}>Fertig</button></div></main>;
}
function SettingsSheet({user,onClose,onLogout}:{user:{name:string;email:string};onClose:()=>void;onLogout:()=>void}){
 const{mode,setMode,paused,toggleMotion}=useAppearance();
 useEffect(()=>{const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',esc);return()=>document.removeEventListener('keydown',esc);},[onClose]);
 return <div className="m-sheet-backdrop" onClick={onClose}><section className="m-sheet glass" role="dialog" aria-modal="true" aria-label="Einstellungen" onClick={e=>e.stopPropagation()}>
  <div className="m-grabber" aria-hidden="true"/>
  <header><div><strong>{user.name}</strong><small>{user.email}</small></div><button type="button" className="m-icon-button" aria-label="Schließen" onClick={onClose}><X size={20}/></button></header>
  <h2 className="m-label">Darstellung</h2>
  <div className="m-segmented" role="radiogroup" aria-label="Darstellung">{([['system','System',Monitor],['light','Hell',Sun],['dark','Dunkel',Moon]] as const).map(([value,label,Icon])=><button key={value} type="button" role="radio" aria-checked={mode===value} className={mode===value?'is-on':''} onClick={()=>setMode(value)}><Icon size={17} aria-hidden="true"/>{label}</button>)}</div>
  <button type="button" className="m-row-button" onClick={toggleMotion}>{paused?<Play size={18} aria-hidden="true"/>:<Pause size={18} aria-hidden="true"/>}{paused?'Hintergrundanimation fortsetzen':'Hintergrundanimation pausieren'}</button>
  <button type="button" className="m-row-button danger" onClick={onLogout}><LogOut size={18} aria-hidden="true"/>Auf diesem Handy abmelden</button>
  <p className="m-hint">Dieses Handy bleibt angemeldet, solange du die App mindestens alle 90 Tage öffnest. Am Rechner unter Einstellungen · Handy-App kannst du es jederzeit abmelden.</p>
 </section></div>;
}
