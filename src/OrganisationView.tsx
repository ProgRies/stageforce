import ContactSelection from './ContactSelection';
import type {ContactSuggestion} from './contactExtraction';
import OrganisationHeader from './OrganisationHeader';
import PhoneCall from './PhoneCall';
import {useEffect,useRef,useState} from 'react';
import {Mail,Phone,ChevronDown,ArrowUpRight,Plus,Check,X,AlertCircle,MessageSquare} from 'lucide-react';
import {api} from './api';
import OrganisationFields from './OrganisationFields';
import EntityTools from './EntityTools';
import {text,jsonList,formatDate,todayBerlin,gmailSearch,websiteURL,type Entity,type EntityLink} from './domain';
type Props={entity:Entity;entities:Entity[];links:EntityLink[];history:any[];historyTotal:number;loading:boolean;issues:string[];onMore:()=>void;onEdit:(type?:string)=>void;onPick:(id:string)=>void;onSaved:()=>void;onCallSaved:()=>void;callReason?:string;onSkip:()=>void;accountEmail:string;onPendingChange:(pending:boolean)=>void;onBusyChange:(busy:boolean)=>void};
export default function OrganisationView({entity,entities,links,history,historyTotal,loading,issues,onMore,onEdit,onPick,onSaved,onCallSaved,callReason,onSkip,accountEmail,onPendingChange,onBusyChange}:Props){
 const [messages,setMessages]=useState<Record<string,any>>({}),[messageErrors,setMessageErrors]=useState<Record<string,string>>({}),[moreOpen,setMoreOpen]=useState(false),[internal,setInternal]=useState<any[]>([]),[internalTotal,setInternalTotal]=useState(0),[internalOpen,setInternalOpen]=useState(false),[error,setError]=useState('');
 const [noteOpen,setNoteOpen]=useState(false),[note,setNote]=useState(''),[date,setDate]=useState(todayBerlin()),[busy,setBusy]=useState(false),[noteError,setNoteError]=useState('');
 const [historyCalls,setHistoryCalls]=useState<Record<string,boolean>>({}),[historyBusy,setHistoryBusy]=useState<Record<string,boolean>>({});
 const historyCalling=Object.values(historyCalls).some(Boolean),historySaving=Object.values(historyBusy).some(Boolean);
 const [queueCalling,setQueueCalling]=useState(false),[queueBusy,setQueueBusy]=useState(false);
 const [fieldsDirty,setFieldsDirty]=useState(false),[toolsDirty,setToolsDirty]=useState(false);
 const [openEvents,setOpenEvents]=useState<Record<string,boolean>>({});
 const [extracted,setExtracted]=useState<ContactSuggestion>();
 const [headerBusy,setHeaderBusy]=useState(false);
 const [fieldsBusy,setFieldsBusy]=useState(false),[toolsBusy,setToolsBusy]=useState(false);
 useEffect(()=>{onBusyChange(busy||headerBusy||fieldsBusy||toolsBusy||queueBusy||historySaving);},[busy,headerBusy,fieldsBusy,toolsBusy,queueBusy,historySaving,onBusyChange]);
 useEffect(()=>()=>onBusyChange(false),[onBusyChange]);
 const pending=fieldsDirty||toolsDirty||noteOpen||queueCalling||historyCalling;
 useEffect(()=>{onPendingChange(pending);},[pending,onPendingChange]);
 useEffect(()=>()=>onPendingChange(false),[onPendingChange]);
 const pendingMessages=useRef(new Set<string>()),requestId=useRef<string|null>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const sources=jsonList(entity.values[23]),gmail=gmailSearch(entity,accountEmail);
 const quickContact=jsonList(entity.values[20]).find(c=>c.telefone?.some((p:string)=>/^\+?\d{6,15}$/.test(p.replace(/\(0\)/g,'').replace(/[^+\d]/g,''))));
 const quickNumber=quickContact?.telefone.find((p:string)=>/^\+?\d{6,15}$/.test(p.replace(/\(0\)/g,'').replace(/[^+\d]/g,'')))||'';
 async function message(id:string,force=false){if((messages[id]&&!force)||pendingMessages.current.has(id))return;pendingMessages.current.add(id);setMessageErrors(v=>({...v,[id]:''}));try{const r=await api({action:'message',id});if(mounted.current)setMessages(v=>({...v,[id]:r}));}catch(e:any){if(mounted.current)setMessageErrors(v=>({...v,[id]:e.message}));}finally{pendingMessages.current.delete(id);}}
 async function internalHistory(offset=0){try{const r=await api({action:'history',id:entity.id,kind:'internal',offset});if(mounted.current){setInternal(v=>offset?[...v,...r.items]:r.items);setInternalTotal(r.total);}}catch(e:any){setError(e.message);}}
 useEffect(()=>{if(internalOpen)internalHistory();},[internalOpen,entity.version]);
 function openNote(){setNote('');setDate(todayBerlin());setNoteError('');requestId.current=null;setNoteOpen(true);}
 async function saveNote(){if(busy||!note.trim())return;setBusy(true);setNoteError('');requestId.current??=crypto.randomUUID();try{
  await api({action:'save',id:entity.id,version:entity.version,requestId:requestId.current,fields:{},note:{type:'Notiz',text:note.trim(),date,contacted:false}});
  setNoteOpen(false);onSaved();
 }catch(e:any){setNoteError(e.message);if(e.status==='conflict')onSaved();}finally{setBusy(false);}}
 return <><OrganisationHeader entity={entity} disabled={busy||fieldsBusy||toolsDirty||noteOpen||queueCalling||historyCalling||loading} onSaved={onSaved} onBusy={setHeaderBusy}/><div className="organisation-overview"><section className="communication-column" aria-label="Kommunikationsverlauf" data-tour="timeline">
 {callReason&&<div className="compact-followup"><p>{callReason}</p><button className="text-button" disabled={busy} onClick={onSkip}>Überspringen</button></div>}
 <div className="timeline-heading"><h3>Aktivitäten</h3><div className="timeline-actions"><button className="button secondary" disabled={fieldsDirty||toolsDirty||noteOpen||historyCalling||queueCalling||loading} onClick={openNote}><Plus size={16}/>Notiz hinzufügen</button><div className="quick-call">{quickContact?<PhoneCall organisationId={entity.id} contactId={quickContact.id} number={quickNumber} title={quickContact.name||quickContact.e_mails?.[0]} disabled={fieldsDirty||toolsDirty||noteOpen||historyCalling||loading} onSaved={onCallSaved} onPending={setQueueCalling} onBusy={setQueueBusy}/>:<button className="sf-phone-number" disabled title="Telefonnummer bei einem Kontakt ergänzen"><Phone size={16}/><span>Keine Telefonnummer</span><img src="/assets/stageforce-icon.svg" alt="StageForce" width="23" height="23"/></button>}</div></div></div>
 {noteOpen&&<section className="inline-note" aria-labelledby="note-title"><header><h2 id="note-title">Notiz hinzufügen</h2><button className="icon-button" aria-label="Notiz verwerfen" disabled={busy} onClick={()=>{if(!note.trim()||window.confirm('Ungespeicherte Notiz verwerfen?'))setNoteOpen(false);}}><X size={18}/></button></header><fieldset disabled={busy}><textarea autoFocus rows={4} aria-label="Notiz" placeholder="Was möchtest du festhalten?" value={note} onChange={e=>{setNote(e.target.value);requestId.current=null;}}/><input aria-label="Datum der Notiz" type="date" max={todayBerlin()} value={date} onChange={e=>{setDate(e.target.value);requestId.current=null;}}/>{noteError&&<p className="save-error" role="alert">{noteError}</p>}<button className="button primary" disabled={!note.trim()||!date} onClick={saveNote}><Check size={17}/>Speichern</button></fieldset></section>}
 <div className="timeline-stream">{loading?<p className="muted">Verlauf wird geladen …</p>:history.length?history.map(h=>{const isNote=h.art==='Notiz',isLegacyContact=h.art==='Kontakt',isEmail=!!h.message_id||/mail/i.test(h.art),m=h.message_id?messages[h.message_id]:null;return <details className={`communication-event ${isNote?'note':isLegacyContact?'contact':isEmail?'email':'call'}`} key={h.ereignis_id} open={!!openEvents[h.ereignis_id]} onToggle={e=>{const open=e.currentTarget.open;setOpenEvents(v=>v[h.ereignis_id]===open?v:{...v,[h.ereignis_id]:open});if(e.currentTarget.open&&h.message_id)message(h.message_id);}}><summary><span className={`communication-icon ${isNote?'note':isEmail?'email':'call'}`}>{isNote||isLegacyContact?<MessageSquare size={21}/>:isEmail?<Mail size={21}/>:<Phone size={21}/>}</span><span className="communication-title"><span className="event-meta"><span>{isNote?'Notiz':isLegacyContact?'Kontakt':isEmail?(h.direction==='outgoing'?'E-Mail gesendet':'E-Mail'):'Anruf'}</span><time dateTime={h.datum}>{formatDate(h.datum)}{h.sent_at&&' · '+new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'}).format(new Date(h.sent_at))}</time></span><strong>{isNote?'Notiz':isLegacyContact?'Kontakt':isEmail?h.subject||h.text||'E-Mail':h.art==='Anrufversuch'?'Nicht erreicht':h.art==='Anruf gestartet'?'Anruf gestartet':'Telefonat'}</strong>{h.text&&h.text!==h.subject&&<span className="event-preview">{h.text}</span>}</span><ChevronDown size={15}/></summary><div className="communication-body">
 {h.message_id?m?<><p className="email-envelope">Von: {m.sender.map((a:any)=>a.name?`${a.name} <${a.email}>`:a.email).join(', ')}<br/>An: {m.recipients.map((a:any)=>a.name?`${a.name} <${a.email}>`:a.email).join(', ')}</p>{m.contacts?.length>0&&<p className="muted">Zugeordnet: {m.contacts.map((c:any)=>c.name||'Kontakt').join(', ')}</p>}{h.text&&h.text!==h.subject&&<p>{h.text}</p>}<ContactSelection body={m.body} messageId={h.message_id} disabled={fieldsDirty||toolsDirty||noteOpen||queueCalling||historyCalling||loading} onExtract={setExtracted}/>{m.sources.map((s:any,i:number)=><div className="message-source" key={i}><span>{s.mailbox}</span>{websiteURL(s.source_url)&&<a href={websiteURL(s.source_url)} target="_blank" rel="noopener noreferrer">Original öffnen <ArrowUpRight size={13}/></a>}</div>)}</>:messageErrors[h.message_id]?<p className="save-error">{messageErrors[h.message_id]} <button className="text-button" onClick={()=>message(h.message_id)}>Erneut laden</button></p>:<p className="muted">E-Mail wird geladen …</p>:<div>{h.call_contact&&<p>{h.call_contact}</p>}{h.call_phone&&h.call_contact_id&&<PhoneCall organisationId={entity.id} contactId={h.call_contact_id} number={h.call_phone} disabled={fieldsDirty||toolsDirty||queueCalling||noteOpen||loading} onSaved={onSaved} onPending={v=>setHistoryCalls(old=>old[h.ereignis_id]===v?old:{...old,[h.ereignis_id]:v})} onBusy={v=>setHistoryBusy(old=>old[h.ereignis_id]===v?old:{...old,[h.ereignis_id]:v})}/>}<p className="call-note">{h.text||'Keine weitere Notiz.'}</p></div>}
 {h.attachments?.length>0&&<p className="muted">Anhänge im Postfach: {h.attachments.map((a:any)=>a.name).join(', ')}</p>}{h.autor_name&&<small className="muted">Erfasst von {h.autor_name}</small>}
 </div></details>;}):<p className="timeline-empty">Noch keine Aktivitäten hinterlegt.</p>}
 </div>
 {historyTotal>history.length&&<button className="load-more" onClick={onMore}>Ältere Aktivitäten <ChevronDown size={15}/></button>}
 <button className="overview-action" aria-expanded={moreOpen} onClick={()=>setMoreOpen(v=>!v)}><span>Änderungen & Quellen</span><ChevronDown size={15}/></button>
 {moreOpen&&<div className="overview-details"><p className="muted">Letzter belegter Kontakt: {formatDate(entity.values[15])}</p>
 <details className="data-details" open={internalOpen} onToggle={e=>setInternalOpen(e.currentTarget.open)}><summary>Änderungsprotokoll</summary>{internal.map(h=><article className="internal-event" key={h.ereignis_id}><small>{formatDate(h.datum)} · {h.art}</small><p>{h.text}</p>{h.autor_name&&<small>{h.autor_name}</small>}</article>)}{internalTotal>internal.length&&<button className="text-button" onClick={()=>internalHistory(internal.length)}>Ältere Einträge</button>}</details>
 {(text(entity,16)||text(entity,19))&&<details className="data-details"><summary>Weitere Angaben</summary>{text(entity,16)&&<p>Nächster Schritt: {text(entity,16)}</p>}{text(entity,19)&&<p>Prüfnotizen: {text(entity,19)}</p>}</details>}
 <details className="data-details"><summary>Quellen ({sources.length})</summary>{sources.map((s,i)=><div className="source" key={i}>{websiteURL(s.url)&&<a href={websiteURL(s.url)} target="_blank" rel="noopener noreferrer">Quelle öffnen</a>}<pre>{JSON.stringify(s,null,2)}</pre></div>)}</details></div>}{error&&<p className="save-error">{error}</p>}
 </section><aside className="organisation-sidebar" aria-label="Organisation im Überblick">

 <a className="button secondary gmail-search" data-tour="gmail" href={gmail.url} title={gmail.query} target="_blank" rel="noopener noreferrer"><Mail size={17}/>In Gmail suchen <ArrowUpRight size={14}/></a>
 <EntityTools extracted={extracted} entity={entity} entities={entities} links={links} disabled={headerBusy||fieldsBusy||fieldsDirty||noteOpen||queueCalling||historyCalling||loading} onSaved={()=>{onSaved();for(const id of Object.keys(messages))message(id,true);}} onPick={onPick} onDirtyChange={setToolsDirty} onBusyChange={setToolsBusy}/>

 <OrganisationFields entity={entity} accountEmail={accountEmail} disabled={headerBusy||toolsDirty||noteOpen||queueCalling||historyCalling||loading} onSaved={onSaved} onDirtyChange={setFieldsDirty} onBusyChange={setFieldsBusy}/>

 </aside>

 </div></>;
}
