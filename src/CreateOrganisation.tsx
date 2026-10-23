import {useEffect,useRef,useState} from 'react';
import {Plus,X,ArrowUpRight} from 'lucide-react';
import {api} from './api';
import {normalize,text,type Entity} from './domain';
type Props={initialName:string;entities:Entity[];onClose:()=>void;onOpen:(entity:Entity)=>void};
export default function CreateOrganisation({initialName,entities,onClose,onOpen}:Props){
 const [name,setName]=useState(initialName),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false);
 const key=normalize(name).trim(),matches=key?entities.filter(e=>normalize(text(e,1)).includes(key)).slice(0,5):[];
 const exact=entities.find(e=>normalize(text(e,1)).trim()===key);
 useEffect(()=>{const focused=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();focused?.focus();};},[]);
 async function submit(e:React.FormEvent){e.preventDefault();if(lock.current||!name.trim())return;if(exact){onOpen(exact);return;}lock.current=true;setBusy(true);setError('');try{
  const current=await api({action:'load'}),existing=current.entities.find((e:Entity)=>normalize(text(e,1)).trim()===key);
  const entity=existing||(await api({action:'create',name:name.trim()})).entity;onOpen(entity);
 }catch(e:any){setError(e.message||'Organisation konnte nicht gespeichert werden.');}finally{lock.current=false;setBusy(false);}}
 return <dialog ref={dialog} className="create-organisation" aria-labelledby="create-organisation-title" onCancel={e=>{e.preventDefault();if(!lock.current)onClose();}}>
  <form onSubmit={submit}><header><h2 id="create-organisation-title">Organisation erstellen</h2><button type="button" className="icon-button" aria-label="Schließen" disabled={busy} onClick={onClose}><X size={18}/></button></header>
   <input autoFocus required maxLength={500} aria-label="Name der Organisation" placeholder="Name der Organisation" value={name} disabled={busy} onChange={e=>{setName(e.target.value);setError('');}}/>
   {!!matches.length&&<div className="organisation-matches"><small>Bereits im CRM</small>{matches.map(e=><button type="button" key={e.id} disabled={busy} onClick={()=>onOpen(e)}><span>{text(e,1)}</span><ArrowUpRight size={16}/></button>)}</div>}
   {error&&<p className="save-error" role="alert">{error}</p>}
   <footer><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Abbrechen</button><button className="button primary" disabled={busy||!key}>{exact?<ArrowUpRight size={16}/>:<Plus size={16}/>} {busy?'Speichern …':exact?'Organisation öffnen':'Erstellen & öffnen'}</button></footer>
  </form>
 </dialog>;
}
