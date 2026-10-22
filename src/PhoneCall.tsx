import {useEffect,useRef,useState} from 'react';
import {Phone,X} from 'lucide-react';
import {api} from './api';
type Props={organisationId:string;contactId:string;number:string;disabled?:boolean;onSaved:()=>void;onPending?:(value:boolean)=>void;onBusy?:(value:boolean)=>void};
export default function PhoneCall({organisationId,contactId,number,disabled,onSaved,onPending,onBusy}:Props){
 const [call,setCall]=useState<any>(null),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const attempt=useRef<{requestId:string;startedAt:string}|null>(null),lock=useRef(false),dialLink=useRef<HTMLAnchorElement>(null);
 useEffect(()=>{onPending?.(!!call||busy);},[call,busy,onPending]);
 useEffect(()=>{onBusy?.(busy);},[busy,onBusy]);
 async function start(){if(lock.current||call)return;lock.current=true;setBusy(true);setError('');attempt.current??={requestId:crypto.randomUUID(),startedAt:new Date().toISOString()};try{const r=await api({action:'callPrepare',organisationId,contactId,phone:number,...attempt.current});setCall(r);setNotes('');if(dialLink.current){dialLink.current.href='tel:'+r.dial;dialLink.current.click();}}catch(e:any){setError(e.message);}finally{lock.current=false;setBusy(false);}}
 async function cancel(){if(lock.current)return;lock.current=true;setBusy(true);try{await api({action:'callCancel',callId:call.callId});setCall(null);setNotes('');setError('');attempt.current=null;}catch(e:any){setError(e.message);}finally{lock.current=false;setBusy(false);}}
 async function save(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await api({action:'callSave',callId:call.callId,notes});setCall(null);setNotes('');attempt.current=null;onSaved();}catch(e:any){setError(e.message);}finally{lock.current=false;setBusy(false);}}
 return <div className="sf-phone"><button type="button" className="sf-phone-number" disabled={disabled||busy||!!call} onClick={start}><Phone size={16}/><span>{number}</span><img src="/assets/stageforce-icon.svg" alt="StageForce" width="23" height="23"/></button><a ref={dialLink} hidden aria-hidden="true"/>{call&&<div className="sf-call-note"><div><small>Anruf gestartet · {new Date(attempt.current!.startedAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</small><button type="button" aria-label="Anrufnotiz verwerfen" disabled={busy} onClick={cancel}><X size={16}/></button></div><textarea autoFocus rows={3} placeholder="Gesprächsnotiz · optional" value={notes} disabled={busy} onChange={e=>setNotes(e.target.value)}/><a href={'tel:'+call.dial}>Falls nötig: Wähl-App öffnen</a><button type="button" className="button primary" disabled={busy} onClick={save}>Speichern</button></div>}{error&&<p className="save-error" role="alert">{error}</p>}</div>;
}
