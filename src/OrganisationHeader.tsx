import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Pencil,Check,X,ChevronDown} from 'lucide-react';
import {api} from './api';
import {text,fastbillURL,type Entity} from './domain';
type Props={entity:Entity;disabled:boolean;onSaved:()=>void;onBusy:(busy:boolean)=>void};
export default function OrganisationHeader({entity,disabled,onSaved,onBusy}:Props){
 const [current,setCurrent]=useState(entity),[editing,setEditing]=useState(false),[link,setLink]=useState(text(entity,3)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),request=useRef<string|null>(null);
 useEffect(()=>{setCurrent(entity);if(!editing)setLink(text(entity,3));},[entity]);
 useEffect(()=>{onBusy(busy);return()=>onBusy(false);},[busy,onBusy]);
 async function save(fields:Record<string,string>){if(lock.current)return;lock.current=true;setBusy(true);setError('');request.current??=crypto.randomUUID();try{const r=await api({action:'save',id:entity.id,version:current.version,requestId:request.current,fields});setCurrent(r.entity);setEditing(false);request.current=null;await onSaved();}catch(e:any){setError(e.message);if(e.status==='conflict'){request.current=null;onSaved();}}finally{lock.current=false;setBusy(false);}}
 const fb=fastbillURL(current.values[3]),status=text(current,9),options=['Lead','Kunde','Partner / Agentur'];
 return <header className="organisation-header"><div className="organisation-title"><h2>{text(current,1)}</h2><span className="organisation-status-wrap"><select aria-label="Organisationsstatus" className="organisation-status" disabled={disabled||busy} value={status} onChange={e=>{request.current=null;save({'9':e.target.value});}}>{!options.includes(status)&&<option value={status} disabled>{status||'Status wählen'}</option>}{options.map(s=><option key={s}>{s}</option>)}</select><ChevronDown size={15} aria-hidden="true"/></span></div>
 <div className="organisation-fastbill">{editing?<form onSubmit={e=>{e.preventDefault();save({'3':link});}}><input autoFocus aria-label="FastBill-Link" placeholder="FastBill-Kundenlink" value={link} disabled={busy} onChange={e=>{setLink(e.target.value);request.current=null;}}/><button className="icon-button" aria-label="FastBill-Link speichern" disabled={busy||disabled}><Check size={17}/></button><button type="button" className="icon-button" aria-label="FastBill-Bearbeitung schließen" disabled={busy} onClick={()=>{setEditing(false);setError('');}}><X size={17}/></button></form>:<><a className={`button secondary ${fb?'':'empty-fastbill'}`} aria-disabled={!fb} href={fb||undefined} target="_blank" rel="noopener noreferrer">FastBill <ArrowUpRight size={15}/></a><button className="icon-button" aria-label="FastBill-Link bearbeiten" title="FastBill-Link bearbeiten" disabled={disabled||busy} onClick={()=>{setLink(text(current,3));setEditing(true);setError('');request.current=null;}}><Pencil size={15}/></button></>}</div>
 {error&&<p className="save-error" role="alert">{error}</p>}{busy&&<small role="status">Speichert …</small>}
 </header>;
}
