import {useEffect,useRef,useState} from 'react';
import {Check} from 'lucide-react';
import {api} from './api';
import {text,type Entity} from './domain';
type Draft={text:string;base:string};
type Props={entity:Entity;accountEmail:string;disabled:boolean;onSaved:()=>void;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void};
export default function OrganisationFields({entity,accountEmail,disabled,onSaved,onDirtyChange,onBusyChange}:Props){
 const key=`stageforce-notes:${accountEmail}:${entity.id}`;
 const [draft,setDraft]=useState<Draft>(()=>{try{const d=JSON.parse(sessionStorage.getItem(key)||'null');if(typeof d?.text==='string'&&typeof d?.base==='string'&&d.text!==text(entity,18))return d;}catch{}return{text:text(entity,18),base:text(entity,18)};});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[draftStored,setDraftStored]=useState(true);
 const requestId=useRef<string|null>(null),lock=useRef(false),area=useRef<HTMLTextAreaElement>(null);
 const dirty=draft.text!==text(entity,18),conflict=dirty&&draft.base!==text(entity,18);
 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
 useEffect(()=>{onDirtyChange(dirty&&!draftStored);return()=>onDirtyChange(false);},[dirty,draftStored,onDirtyChange]);
 useEffect(()=>{if(draft.text===draft.base)setDraft({text:text(entity,18),base:text(entity,18)});},[entity]);
 useEffect(()=>{if(area.current){area.current.style.height='auto';area.current.style.height=Math.max(100,area.current.scrollHeight)+'px';}},[draft.text]);
 function change(value:string){const next={...draft,text:value};setDraft(next);requestId.current=null;setSaved(false);setError('');try{sessionStorage.setItem(key,JSON.stringify(next));setDraftStored(true);}catch{setDraftStored(false);}}
 async function save(){if(lock.current||!dirty||conflict)return;lock.current=true;setBusy(true);setError('');requestId.current??=crypto.randomUUID();try{await api({action:'save',id:entity.id,version:entity.version,requestId:requestId.current,fields:{18:draft.text}});try{sessionStorage.removeItem(key);}catch{}setDraft({text:draft.text,base:draft.text});setSaved(true);await onSaved();}catch(e:any){setError(e.message);if(e.status==='conflict'){requestId.current=null;onSaved();}}finally{lock.current=false;setBusy(false);}}
 return <form className="organisation-notes" data-tour="fields" onSubmit={e=>{e.preventDefault();save();}}><label className="field"><span>Notizen {dirty&&<small className="notes-unsaved" role="status">Ungespeichert</small>}</span><textarea ref={area} aria-label="Organisationsnotizen" placeholder="Was ist für diese Organisation wichtig?" value={draft.text} disabled={disabled||busy} onChange={e=>change(e.target.value)}/></label>
 {conflict&&<div className="save-error" role="alert">Die gespeicherten Notizen wurden inzwischen geändert. Dein Entwurf bleibt erhalten.<details><summary>Gespeicherten Stand ansehen</summary><p>{text(entity,18)||'Keine Notizen'}</p></details><button type="button" className="text-button" onClick={()=>{const next={...draft,base:text(entity,18)};setDraft(next);try{sessionStorage.setItem(key,JSON.stringify(next));}catch{setDraftStored(false);}requestId.current=null;}}>Geprüft · meinen Entwurf speichern können</button></div>}
 {error&&<p className="save-error" role="alert">{error}</p>}
 <div className="notes-save"><small>{busy?'Speichert …':dirty?(draftStored?'Entwurf bleibt in diesem Tab erhalten.':'Entwurf bitte vor dem Wechsel speichern.'):saved?'Gespeichert':''}</small><button type="submit" className="button primary" disabled={disabled||busy||!dirty||conflict}><Check size={16}/>{busy?'Speichert …':'Speichern'}</button></div>
 </form>;
}
