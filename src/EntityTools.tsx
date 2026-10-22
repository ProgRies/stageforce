import PhoneCall from './PhoneCall';
import {useEffect,useState} from 'react';
import {X,Plus,Link2,UserRound,Copy,Pencil} from 'lucide-react';
import {api} from './api';
import OrganisationPicker from './OrganisationPicker';
import {jsonList,text,type Entity,type EntityLink} from './domain';
type Props={entity:Entity;entities:Entity[];links:EntityLink[];disabled:boolean;onSaved:()=>void;onPick:(id:string)=>void;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void};
export default function EntityTools({entity,entities,links,disabled,onSaved,onPick,onDirtyChange,onBusyChange}:Props){
 const[mode,setMode]=useState(''),[cid,setCid]=useState(''),[name,setName]=useState(''),[role,setRole]=useState(''),[emails,setEmails]=useState(''),[phones,setPhones]=useState(''),[primary,setPrimary]=useState(false),[other,setOther]=useState(''),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[version,setVersion]=useState(entity.version);
 const [calling,setCalling]=useState<Record<string,boolean>>({}),[callBusy,setCallBusy]=useState<Record<string,boolean>>({});
 const hasCalls=Object.values(calling).some(Boolean),isCalling=Object.values(callBusy).some(Boolean);
 useEffect(()=>{onBusyChange(busy||isCalling);},[busy,isCalling,onBusyChange]);
 const contacts=jsonList(entity.values[20]),conflict=!!mode&&version!==entity.version;
 useEffect(()=>{onDirtyChange(!!mode||busy||hasCalls);},[mode,busy,hasCalls,onDirtyChange]);
 function pick(id:string){const c=contacts.find(c=>c.id===id);setCid(id);setName(c?.name||'');setRole(c?.rolle||'');setEmails((c?.e_mails||[]).join('\n'));setPhones((c?.telefone||[]).join('\n'));setPrimary(c?.primary||false);setVersion(entity.version);setError('');setMode('contact');}
 function close(){if(busy)return;if(window.confirm('Ungespeicherte Eingaben verwerfen?')){setMode('');setError('');}}
 async function save(){if(busy||conflict)return;setBusy(true);setError('');try{await api(mode==='contact'?{action:'contact',id:entity.id,version,contactId:cid||null,name,role,emails,phones,primary}:{action:'link',id:entity.id,version,other,note});setMode('');onSaved();}catch(e:any){setError(e.message);if(e.status==='conflict')onSaved();}finally{setBusy(false);}}
 async function copy(value:string){try{await navigator.clipboard.writeText(value);}catch{setError('Bitte die E-Mail-Adresse markieren und kopieren.');}}
 return <section className="inline-contacts" data-tour="contacts">
  <div className="section-heading"><h3>Kontakte <small>{contacts.length}</small></h3><button className="icon-button" disabled={disabled||!!mode||hasCalls} title="Kontakt hinzufügen" aria-label="Kontakt hinzufügen" onClick={()=>pick('')}><Plus size={17}/></button></div>
  <div className="contact-cards">{contacts.map(c=><article className="contact-card" key={c.id}><header><strong>{c.name||c.e_mails?.[0]||'Kontakt'}</strong><button className="icon-button tiny" aria-label={`${c.name||'Kontakt'} bearbeiten`} disabled={disabled||!!mode||hasCalls} onClick={()=>pick(c.id)}><Pencil size={14}/></button></header>{c.rolle&&<small>{c.rolle}</small>}{(c.telefone||[]).map((p:string,i:number)=><PhoneCall key={i} organisationId={entity.id} contactId={c.id} number={p} disabled={disabled||!!mode||hasCalls} onSaved={onSaved} onPending={value=>setCalling(old=>old[c.id+':'+i]===value?old:{...old,[c.id+':'+i]:value})} onBusy={value=>setCallBusy(old=>old[c.id+':'+i]===value?old:{...old,[c.id+':'+i]:value})}/>)}{(c.e_mails||[]).map((address:string,i:number)=><button className="contact-email" title="E-Mail-Adresse kopieren" key={i} onClick={()=>copy(address)}>{address}<Copy size={12}/></button>)}</article>)}</div>
  {!contacts.length&&!mode&&<button className="empty-contact" disabled={disabled} onClick={()=>pick('')}><UserRound size={18}/>Kontakt hinzufügen</button>}
  <div className="linked-organisations">{links.map(l=>{const other=l.a===entity.id?l.b:l.a;return <button className="linked-entity" key={l.id} onClick={()=>onPick(other)}><Link2 size={15}/><span>{entities.find(e=>e.id===other)?.values[1]||other}<small>{l.note}</small></span></button>;})}</div>
  {!mode&&<button className="text-button" disabled={disabled||hasCalls} onClick={()=>{setError('');setOther('');setNote('');setVersion(entity.version);setMode('link');}}><Link2 size={14}/>Organisation verknüpfen</button>}
  {mode&&<form className="inline-contact-editor" onSubmit={e=>{e.preventDefault();save();}}><header><strong>{mode==='contact'?(cid?'Kontakt bearbeiten':'Neuer Kontakt'):'Verknüpfen'}</strong><button type="button" className="icon-button" disabled={busy} onClick={close} aria-label="Bearbeitung abbrechen"><X size={17}/></button></header><fieldset disabled={busy||disabled}>
  {mode==='contact'?<div className="inline-field-grid"><label className="field"><span>Name</span><input autoFocus value={name} onChange={e=>setName(e.target.value)}/></label><label className="field"><span>Rolle</span><input value={role} onChange={e=>setRole(e.target.value)}/></label><label className="field span2"><span>E-Mail-Adressen</span><textarea rows={2} value={emails} onChange={e=>setEmails(e.target.value)}/></label><label className="field span2"><span>Telefonnummern</span><textarea rows={2} value={phones} onChange={e=>setPhones(e.target.value)}/></label><label className="checkbox span2"><input type="checkbox" checked={primary} onChange={e=>setPrimary(e.target.checked)}/>Hauptkontakt</label></div>:<><OrganisationPicker entities={entities.filter(e=>e.id!==entity.id)} value={other} onChange={setOther} disabled={busy}/><label className="field"><span>Beziehung</span><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Betreut Stage für diese Organisation …"/></label></>}
  {conflict&&<p className="save-error" role="alert">Der Datensatz wurde inzwischen geändert. Bitte Eingaben kopieren, die Bearbeitung schließen und erneut öffnen.</p>}
  <button className="button primary wide" disabled={conflict||(mode==='link'&&!other)}>{busy?'Speichert …':'Speichern'}</button></fieldset></form>}
  {error&&<p className="save-error" role="alert">{error}</p>}
 </section>;
}
