import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {ChevronLeft,ChevronRight,Phone,CalendarCheck,LoaderCircle,AlertCircle} from 'lucide-react';
import {api} from './api';
import {addDays,todayBerlin,mondayOf,isoWeek,dayItems,type CalendarWeek as Week} from './domain';
// The Follow-ups week (Monday to Sunday): my planned calls and everyone's meetings, straight from the CRM.
// A call with a time sits at its time; one without a time is listed first on its day. Overdue calls wait on today.
const noon=(d:string)=>new Date(d+'T12:00:00Z');
const fmt=(d:string,o:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('de-DE',{...o,timeZone:'UTC'}).format(noon(d));
const short=(d:string)=>fmt(d,{day:'2-digit',month:'2-digit'});
export default function FollowUpCalendar({stamp,onOpen}:{stamp:string;onOpen:(organisationId:string)=>void}){
 const today=todayBerlin(),current=mondayOf(today),[from,setFrom]=useState(current),[week,setWeek]=useState<Week|null>(null),[direction,setDirection]=useState(0),[error,setError]=useState('');
 // Weeks are fetched once per CRM state; the weeks either side are fetched ahead so paging feels instant.
 const cache=useRef({stamp,weeks:new Map<string,Promise<Week>>()});
 function load(f:string){const c=cache.current;if(c.stamp!==stamp){c.stamp=stamp;c.weeks.clear();}let p=c.weeks.get(f);if(!p){p=api({action:'calendar',from:f}) as Promise<Week>;c.weeks.set(f,p);p.catch(()=>c.weeks.delete(f));}return p;}
 useEffect(()=>{let active=true;setError('');load(from).then(w=>{if(!active)return;setWeek(w);load(addDays(from,7)).catch(()=>{});load(addDays(from,-7)).catch(()=>{});}).catch(e=>{if(active)setError(e.message||'Kalender konnte nicht geladen werden.');});return()=>{active=false;};},[from,stamp]);
 function go(weeks:number){const next=weeks?addDays(from,7*weeks):current;if(next===from)return;setDirection(next>from?1:-1);setFrom(next);}
 useEffect(()=>{const key=(e:KeyboardEvent)=>{const t=e.target as HTMLElement|null;if(e.metaKey||e.ctrlKey||e.altKey||t?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))return;if(e.key==='ArrowLeft')go(-1);else if(e.key==='ArrowRight')go(1);};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
 // Until the next week arrives the shown one stays, so paging never flashes an empty grid.
 const shown=week,count=shown?shown.followUps.length:0,meetings=shown?shown.meetings.length:0;
 return <section className="calendar-pane glass" aria-label="Follow-ups">
  <header className="calendar-head">
   <div className="calendar-nav"><button className="icon-button" aria-label="Vorherige Woche" title="Vorherige Woche (←)" onClick={()=>go(-1)}><ChevronLeft size={19}/></button><button className="button secondary small" disabled={from===current} onClick={()=>go(0)}>Heute</button><button className="icon-button" aria-label="Nächste Woche" title="Nächste Woche (→)" onClick={()=>go(1)}><ChevronRight size={19}/></button></div>
   <h2 aria-live="polite"><span>KW {isoWeek(from)}</span> {short(from)} – {fmt(addDays(from,6),{day:'2-digit',month:'2-digit',year:'numeric'})}</h2>
   <div className="calendar-summary">{week&&week.from===from?<><span className="calendar-key is-call">{count} {count===1?'Anruf':'Anrufe'}</span><span className="calendar-key is-meeting">{meetings} {meetings===1?'Meeting':'Meetings'}</span></>:!error&&<LoaderCircle size={16} className="spin" aria-label="Lädt"/>}</div>
  </header>
  {error&&<p className="save-error" role="alert"><AlertCircle size={15}/> {error}</p>}
  <div className="calendar-scroll">{shown&&<div className="calendar-week" key={shown.from}>{Array.from({length:7},(_,i)=>addDays(shown.from,i)).map((day,i)=>{const items=dayItems(shown,day),firstTimed=items.findIndex(x=>!!x.time&&!x.overdue);return <div key={day} className={`calendar-day${day===today?' is-today':''}${day<today?' is-past':''}${direction>0?' slide-next':direction<0?' slide-prev':''}`} style={{'--i':i} as CSSProperties}>
    <header><span>{fmt(day,{weekday:'short'}).replace('.','')}</span><strong>{fmt(day,{day:'numeric'})}</strong><small>{fmt(day,{month:'short'}).replace('.','')}</small>{items.length>0&&<em aria-label={`${items.length} Einträge`}>{items.length}</em>}</header>
    <div className="calendar-events">{items.length?items.map((item,n)=><div key={item.key} className="calendar-slot">{n===firstTimed&&n>0&&<span className="calendar-divider" aria-hidden="true"/>}<button className={`calendar-event is-${item.kind}${item.overdue?' is-overdue':''}${item.other?' is-other':''}`} title={`${item.name} öffnen`} onClick={()=>onOpen(item.organisationId)}>
      <span className="calendar-event-time">{item.kind==='meeting'?<CalendarCheck size={12} aria-hidden="true"/>:<Phone size={12} aria-hidden="true"/>}{item.overdue?`fällig seit ${short(item.overdue)}`:item.time?`${item.time} Uhr`:item.kind==='meeting'?'Meeting':'Ohne Uhrzeit'}</span>
      <strong>{item.name}</strong>{item.detail&&<small>{item.detail}</small>}
     </button></div>):<p className="calendar-free">{day<today?'—':'Frei'}</p>}</div>
   </div>;})}</div>}
   {!shown&&!error&&<div className="loading-state"><LoaderCircle className="spin" size={24}/><p>Kalender wird geladen</p></div>}
  </div>
 </section>;
}
