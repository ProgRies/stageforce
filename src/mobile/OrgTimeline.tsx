import {useCallback,useEffect,useRef,useState} from 'react';
import {CalendarCheck,Mail,MessageSquare,Phone,Pencil,Trash2,Plus,Check,X,LoaderCircle,History} from 'lucide-react';
import {api} from '../api';
import {activityLabel,formatDate,todayBerlin} from '../domain';
// The organisation's timeline on the phone: the same entries as "Aktivitäten" on the desktop, loaded a page at a time while
// scrolling. Kept basic on purpose: add a note, fix the text of a note, call or meeting, or delete one (asked twice). Emails are read-only.
type Item={ereignis_id:string;datum:string|null;art:string;text:string;autor_name:string;message_id:string|null;subject?:string;direction?:string;sender_name?:string;preview?:string;sent_at?:string;meeting_cancelled?:boolean;call_contact?:string};
type Kind='meeting'|'note'|'email'|'call'|'contact';
const kindOf=(h:Item):Kind=>h.art==='Meeting'?'meeting':h.art==='Notiz'?'note':h.art==='Kontakt'?'contact':h.message_id||/mail/i.test(h.art)&&!h.art.startsWith('Anruf')?'email':'call';
const NAMES:Record<Kind,string>={meeting:'Meeting',note:'Notiz',email:'E-Mail',call:'Anruf',contact:'Kontakt'};
const time=(iso?:string)=>iso?new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'}).format(new Date(iso)):'';
export default function OrgTimeline({orgId}:{orgId:string}){
 const[items,setItems]=useState<Item[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const[open,setOpen]=useState(''),[edit,setEdit]=useState<{id:string;text:string;original:string}|null>(null),[confirm,setConfirm]=useState<{id:string;step:1|2}|null>(null),[busy,setBusy]=useState(false),[itemError,setItemError]=useState('');
 const[note,setNote]=useState<string|null>(null),[mails,setMails]=useState<Record<string,string>>({});
 const paging=useRef(false),sentinel=useRef<HTMLDivElement>(null),noteRequest=useRef<string|null>(null);
 const load=useCallback(async(offset:number)=>{if(paging.current)return;paging.current=true;if(!offset)setLoading(true);setError('');
  try{const r=await api({action:'history',id:orgId,kind:'communication',offset});setItems(v=>offset?[...v,...r.items.filter((x:Item)=>!v.some(y=>y.ereignis_id===x.ereignis_id))]:r.items);setTotal(r.total);}
  catch(e:any){setError(e.message||'Verlauf konnte nicht geladen werden.');}
  finally{paging.current=false;setLoading(false);}},[orgId]);
 useEffect(()=>{load(0);},[load]);
 // The next page loads shortly before the end of the list comes into view.
 const more=items.length<total&&!error;
 useEffect(()=>{const el=sentinel.current;if(!el||!more)return;const io=new IntersectionObserver(e=>{if(e[0].isIntersecting)load(items.length);},{rootMargin:'600px 0px'});io.observe(el);return()=>io.disconnect();},[more,items.length,load]);
 function toggle(h:Item){if(edit||confirm||busy)return;const next=open===h.ereignis_id?'':h.ereignis_id;setOpen(next);setItemError('');
  if(next&&h.message_id&&mails[h.message_id]===undefined)api({action:'message',id:h.message_id}).then(m=>setMails(v=>({...v,[h.message_id!]:String(m.body||'')}))).catch(e=>{setMails(v=>({...v,[h.message_id!]:''}));setItemError(e.message||'E-Mail konnte nicht geladen werden.');});}
 async function saveEdit(){if(!edit||busy)return;setBusy(true);setItemError('');
  try{const r=await api({action:'activitySave',id:orgId,activityId:edit.id,text:edit.text,originalText:edit.original});setItems(v=>v.map(h=>h.ereignis_id===r.activityId?{...h,text:r.text}:h));setEdit(null);}
  catch(e:any){setItemError(e.status==='conflict'?'Der Eintrag wurde inzwischen geändert. Der aktuelle Stand ist geladen.':e.message||'Speichern fehlgeschlagen.');if(e.status==='conflict'){setEdit(null);load(0);}}
  finally{setBusy(false);}}
 async function remove(h:Item){if(busy)return;setBusy(true);setItemError('');
  try{await api({action:'activityDelete',id:orgId,activityId:h.ereignis_id,originalText:h.text});setItems(v=>v.filter(x=>x.ereignis_id!==h.ereignis_id));setTotal(n=>Math.max(0,n-1));setConfirm(null);setOpen('');}
  catch(e:any){setConfirm(null);setItemError(e.status==='conflict'?'Der Eintrag wurde inzwischen geändert. Bitte noch einmal prüfen.':e.message||'Löschen fehlgeschlagen.');if(e.status==='conflict')load(0);}
  finally{setBusy(false);}}
 // A new note needs the organisation's current version; a colleague's change in between is picked up and the note saved once more.
 async function addNote(){const text=(note||'').trim();if(!text||busy)return;setBusy(true);setError('');noteRequest.current??=crypto.randomUUID();
  const send=async()=>{const{version}=await api({action:'mobileOrg',id:orgId});return api({action:'save',id:orgId,version,requestId:noteRequest.current,fields:{},note:{type:'Notiz',text,date:todayBerlin()}});};
  try{try{await send();}catch(e:any){if(e.status!=='conflict')throw e;await send();}noteRequest.current=null;setNote(null);await load(0);}
  catch(e:any){setError(e.message||'Notiz konnte nicht gespeichert werden.');}
  finally{setBusy(false);}}
 return <section className="m-timeline" aria-label="Verlauf">
  <div className="m-timeline-head"><h2 className="m-label"><History size={14} aria-hidden="true"/>Verlauf{total?` · ${total}`:''}</h2>{note===null&&<button type="button" className="m-chip-button" disabled={busy||!!edit} onClick={()=>{noteRequest.current=null;setNote('');}}><Plus size={16} aria-hidden="true"/>Notiz</button>}</div>
  {note!==null&&<div className="m-sheet-inline glass">
   <label className="m-note-plain"><span>Neue Notiz</span><textarea autoFocus rows={4} maxLength={12000} value={note} disabled={busy} onChange={e=>{setNote(e.target.value);noteRequest.current=null;}} placeholder="Was möchtest du festhalten?"/></label>
   <div className="m-pair"><button type="button" className="m-secondary glass" disabled={busy} onClick={()=>setNote(null)}>Abbrechen</button><button type="button" className="m-primary" disabled={busy||!note.trim()} onClick={addNote}><Check size={18} aria-hidden="true"/>{busy?'Speichert …':'Speichern'}</button></div>
  </div>}
  {error&&<p role="alert" className="m-error glass">{error}</p>}
  {loading&&!items.length?<div className="m-list glass m-today-loading" aria-busy="true"/>:items.length?<ol className="m-events">{items.map(h=>{const kind=kindOf(h),isOpen=open===h.ereignis_id,editing=edit?.id===h.ereignis_id,asking=confirm?.id===h.ereignis_id,editable=kind!=='email'&&kind!=='contact',Icon=kind==='meeting'?CalendarCheck:kind==='email'?Mail:kind==='call'?Phone:MessageSquare;
   const title=kind==='email'?h.subject||'E-Mail':kind==='call'?activityLabel(h.art).replace(/^Anruf · /,''):(kind==='meeting'||kind==='note')&&h.text?h.text:NAMES[kind];
   const meta=kind==='email'?(h.direction==='outgoing'?'Gesendet':'Erhalten')+(h.sender_name?' · '+h.sender_name:''):[NAMES[kind],h.call_contact].filter(Boolean).join(' · ');
   const body=kind==='email'?(h.text&&h.text!==h.subject?h.text:h.preview||''):h.text;
   return <li key={h.ereignis_id} className={`m-event is-${kind}${isOpen?' is-open':''}${h.meeting_cancelled?' is-cancelled':''}`}>
    <button type="button" className="m-event-head" aria-expanded={isOpen} onClick={()=>toggle(h)}>
     <span className="m-event-icon"><Icon size={17} aria-hidden="true"/></span>
     <span className="m-event-text"><small>{meta}{h.meeting_cancelled?' · Abgesagt':''}</small><strong className={kind==='meeting'||kind==='note'?'is-text':''}>{title}</strong>{!isOpen&&body&&body!==title&&<span className="m-event-preview">{body}</span>}</span>
     <time dateTime={h.datum||undefined}>{formatDate(h.datum).slice(0,6)}{h.datum&&h.datum.slice(0,4)!==todayBerlin().slice(0,4)?h.datum.slice(2,4):''}{h.sent_at?<><br/>{time(h.sent_at)}</>:null}</time>
    </button>
    {isOpen&&<div className="m-event-body">
     {editing&&edit?<><textarea autoFocus rows={5} maxLength={12000} value={edit.text} disabled={busy} onChange={e=>setEdit({...edit,text:e.target.value})} aria-label={`${NAMES[kind]} bearbeiten`}/>
      <div className="m-pair"><button type="button" className="m-secondary glass" disabled={busy} onClick={()=>{setEdit(null);setItemError('');}}>Abbrechen</button><button type="button" className="m-primary" disabled={busy||(kind==='note'||kind==='meeting')&&!edit.text.trim()} onClick={saveEdit}><Check size={18} aria-hidden="true"/>{busy?'Speichert …':'Speichern'}</button></div></>
     :<p className="m-event-full">{kind==='email'&&h.message_id?mails[h.message_id]===undefined?<LoaderCircle size={16} className="m-spin" aria-label="Lädt"/>:mails[h.message_id]||body:body||'Keine weitere Notiz.'}</p>}
     {h.autor_name&&!editing&&<small className="m-event-by">Erfasst von {h.autor_name}</small>}
     {itemError&&<p role="alert" className="m-error glass">{itemError}</p>}
     {asking&&confirm?<div className="m-confirm" role="group" aria-label="Löschen bestätigen">
      <h3>{confirm.step===1?`${NAMES[kind]} löschen?`:`${NAMES[kind]} endgültig löschen?`}</h3>
      <p>{confirm.step===1?'Der Eintrag verschwindet für alle aus dem Verlauf. Ein geplanter nächster Anruf bleibt, wie er ist.':'Das lässt sich nicht rückgängig machen.'}</p>
      <div className="m-pair"><button type="button" className="m-secondary glass" disabled={busy} onClick={()=>setConfirm(confirm.step===1?null:{id:h.ereignis_id,step:1})}>{confirm.step===1?'Abbrechen':'Zurück'}</button>{confirm.step===1?<button type="button" className="m-danger" disabled={busy} onClick={()=>setConfirm({id:h.ereignis_id,step:2})}>Weiter</button>:<button type="button" className="m-danger" disabled={busy} onClick={()=>remove(h)}><Trash2 size={17} aria-hidden="true"/>{busy?'Löscht …':'Endgültig löschen'}</button>}</div>
     </div>:editable&&!editing&&<div className="m-event-actions"><button type="button" className="m-chip-button" disabled={busy||!!edit||note!==null} onClick={()=>{setItemError('');setEdit({id:h.ereignis_id,text:h.text||'',original:h.text||''});}}><Pencil size={15} aria-hidden="true"/>Bearbeiten</button><button type="button" className="m-chip-button is-danger" disabled={busy||!!edit} onClick={()=>{setItemError('');setConfirm({id:h.ereignis_id,step:1});}}><Trash2 size={15} aria-hidden="true"/>Löschen</button></div>}
    </div>}
   </li>;})}</ol>:!error&&<p className="m-hint m-today-free">Noch keine Aktivitäten.</p>}
  {more&&<div ref={sentinel} className="m-timeline-more"><LoaderCircle size={18} className="m-spin" aria-label="Weitere werden geladen"/></div>}
 </section>;
}
