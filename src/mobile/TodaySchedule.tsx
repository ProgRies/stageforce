import {useEffect,useState} from 'react';
import {CalendarCheck,CalendarDays,Phone} from 'lucide-react';
import {api} from '../api';
import {todayBerlin,mondayOf,dayItems,type CalendarItem,type CalendarWeek} from '../domain';
// Today from the Follow-ups calendar, on the phone: the same rules (my planned calls, everyone's meetings in green,
// overdue calls first), one day only. It reads the week the desktop calendar reads, so both always agree.
const short=(d:string)=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
export default function TodaySchedule({onPick}:{onPick:(item:CalendarItem)=>void}){
 const today=todayBerlin(),[items,setItems]=useState<CalendarItem[]|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let live=true;(api({action:'calendar',from:mondayOf(today)}) as Promise<CalendarWeek>).then(w=>{if(live)setItems(dayItems(w,today));}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[today]);
 const title=new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(today+'T12:00:00Z'));
 if(failed)return null;
 return <section className="m-today" aria-label="Heute im Kalender">
  <h2 className="m-label"><CalendarDays size={14} aria-hidden="true"/>Heute · {title}</h2>
  {items===null?<div className="m-list glass m-today-loading" aria-busy="true"/>:items.length?<div className="m-list glass">{items.map(item=><button key={item.key} type="button" className={`m-row m-slot is-${item.kind}${item.overdue?' is-overdue':''}${item.other?' is-other':''}`} onClick={()=>onPick(item)}>
   <span className="m-slot-time">{item.kind==='meeting'?<CalendarCheck size={15} aria-hidden="true"/>:<Phone size={15} aria-hidden="true"/>}<b>{item.overdue?`seit ${short(item.overdue)}`:item.time||(item.kind==='meeting'?'Meeting':'Offen')}</b></span>
   <span className="m-row-text"><strong>{item.name}</strong>{item.detail&&<small>{item.detail}</small>}</span>
  </button>)}</div>:<p className="m-hint m-today-free">Heute ist nichts geplant.</p>}
 </section>;
}
