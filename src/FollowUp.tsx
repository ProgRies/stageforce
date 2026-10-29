import {useEffect,useRef,useState} from 'react';
import {CalendarClock} from 'lucide-react';
import {dateISO,todayBerlin,followUpDistance,FOLLOW_UP_PICKS,CALL_NEXT_PICKS,CALL_RESULTS,type Entity,type NextCall} from './domain';
// The organisation's one planned call ("Wiedervorlage"): shown in the header, changed by hand there or when a call is logged.
const fullDay=(date:string)=>new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
const shortDay=(date:string)=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
function source(entity:Entity){const s=entity.followUpSource;if(!s)return '';const when=new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',timeZone:'Europe/Berlin'}).format(new Date(s.at)),by=s.by?' von '+s.by:'';return s.outcome?`Gesetzt am ${when}${by} nach Anruf „${s.outcome}“`:`Geändert am ${when}${by}`;}
function Picks({picks=FOLLOW_UP_PICKS,value,today,onPick}:{picks?:[string,(today:string)=>string][];value:string;today:string;onPick:(date:string)=>void}){
 return <>{picks.map(([label,pick])=>{const d=pick(today);return <button type="button" key={label} className={`filter ${value===d?'active':''}`} aria-pressed={value===d} onClick={()=>onPick(d)}>{label}</button>;})}</>;
}
export function FollowUpButton({entity,disabled,save}:{entity:Entity;disabled:boolean;save:(fields:Record<string,string>,extra?:{followUpTime:string})=>Promise<boolean>}){
 const due=dateISO(entity.values[17]),planned=due&&entity.followUpTime||'',today=todayBerlin(),[open,setOpen]=useState(false),[value,setValue]=useState(due),[time,setTime]=useState(planned),box=useRef<HTMLSpanElement>(null);
 useEffect(()=>{if(!open){setValue(due>=today?due:'');setTime(due>=today?planned:'');}},[due,planned,open]);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 useEffect(()=>{if(!open)return;const click=(e:MouseEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);},key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('mousedown',click);document.addEventListener('keydown',key);return()=>{document.removeEventListener('mousedown',click);document.removeEventListener('keydown',key);};},[open]);
 // The time is optional; a date saved without one clears the old time.
 async function apply(date:string,at=''){if(await save({'17':date},{followUpTime:date?at:''}))setOpen(false);}
 const label=!due?'Kein Anruf geplant':due<today?`Anruf fällig seit ${shortDay(due)}`:due===today?'Anruf heute':`Anruf ${fullDay(due)}`,at=planned&&due>=today?` · ${planned} Uhr`:'';
 return <span className="followup-wrap" ref={box}>
  <button type="button" className={`followup-pill${!due?' is-empty':due<=today?' is-due':''}`} aria-expanded={open} aria-haspopup="dialog" disabled={disabled} title="Nächsten Anruf planen oder ändern" onClick={()=>setOpen(o=>!o)}><CalendarClock size={15} aria-hidden="true"/><span>{label}{at}</span>{due&&due>today&&<small>· {followUpDistance(due,today)}</small>}</button>
  {open&&<div className="followup-popover" role="dialog" aria-label="Nächster Anruf">
   <h4>Nächster Anruf</h4><p>{due?source(entity)||'Kommt am geplanten Tag in die Anrufliste.':'Noch nichts geplant. Ab dem gewählten Tag steht die Organisation in der Anrufliste.'}</p>
   <div className="followup-picks"><Picks value={value} today={today} onPick={setValue}/></div>
   <div className="followup-when"><input type="date" aria-label="Datum des nächsten Anrufs" min={today} value={value} onChange={e=>setValue(e.target.value)}/><input type="time" step={300} aria-label="Uhrzeit (optional)" title="Uhrzeit (optional)" value={time} onChange={e=>setTime(e.target.value)}/></div>
   <div className="followup-actions">{due?<button type="button" className="followup-clear" onClick={()=>apply('')}>Kein Anruf geplant</button>:<span/>}<button type="button" className="button primary" disabled={!value||value<today||value===due&&time===planned} onClick={()=>apply(value,time)}>Speichern</button></div>
  </div>}
 </span>;
}
// What logging a call does to the planned call (null: not chosen yet). The Anruf tab, the call card (integrations/chrome/call-card.js)
// and the phone app offer the same choice: the result, then the next call, preselected from the result.
export type {NextCall} from './domain';
export const initialNextCall=(entity:Entity):NextCall=>dateISO(entity.values[17])>todayBerlin()?{kind:'keep'}:null;
export function nextCallFields(entity:Entity,next:NextCall):Record<string,string>{return next?.kind==='date'?{'17':next.date}:next?.kind==='none'&&dateISO(entity.values[17])?{'17':''}:{};}
// Sent beside the fields: only a new date carries a time (or clears the old one).
export const nextCallTime=(next:NextCall)=>next?.kind==='date'?{followUpTime:next.time||''}:{};
export function CallResultChoice({results=CALL_RESULTS,value,onChange,className='followup-picks'}:{results?:readonly {key:string;label:string}[];value:string;onChange:(key:string)=>void;className?:string}){
 return <div className="next-call" role="group" aria-label="Ergebnis"><span className="next-call-title">Ergebnis</span><div className={className}>{results.map(r=><button type="button" key={r.key} className={`filter ${value===r.key?'active':''}`} aria-pressed={value===r.key} onClick={()=>onChange(r.key)}>{r.label}</button>)}</div></div>;
}
// "Unverändert" is offered while the planned call is still ahead; a call that was due needs a new date, or none.
export function NextCallChoice({due,value,onChange,className='followup-picks'}:{due:string;value:NextCall;onChange:(next:NextCall)=>void;className?:string}){
 const today=todayBerlin(),[custom,setCustom]=useState(false),date=value?.kind==='date'?value.date:'';
 const time=value?.kind==='date'?value.time||'':'',picked=(d:string)=>{setCustom(false);onChange({kind:'date',date:d,time});};
 return <div className="next-call" role="group" aria-label="Nächster Anruf"><span className="next-call-title">Nächster Anruf</span><div className={className}>
  {due>today&&<button type="button" className={`filter ${value?.kind==='keep'?'active':''}`} aria-pressed={value?.kind==='keep'} onClick={()=>{setCustom(false);onChange({kind:'keep'});}}>{`Unverändert (${shortDay(due)})`}</button>}
  <Picks picks={CALL_NEXT_PICKS} value={custom?'':date} today={today} onPick={picked}/>
  <button type="button" className={`filter ${custom?'active':''}`} aria-pressed={custom} onClick={()=>{setCustom(true);onChange(date?{kind:'date',date,time}:null);}}>Datum …</button>
  <button type="button" className={`filter ${value?.kind==='none'?'active':''}`} aria-pressed={value?.kind==='none'} onClick={()=>{setCustom(false);onChange({kind:'none'});}}>Kein Anruf</button>
 </div>{(custom||date)&&<div className="followup-when">{custom?<input type="date" aria-label="Datum des nächsten Anrufs" min={today} value={date} onChange={e=>onChange(e.target.value?{kind:'date',date:e.target.value,time}:null)}/>:<span className="next-call-day">{fullDay(date)}</span>}{date&&<input type="time" step={300} aria-label="Uhrzeit (optional)" title="Uhrzeit (optional)" value={time} onChange={e=>onChange({kind:'date',date,time:e.target.value})}/>}</div>}</div>;
}
