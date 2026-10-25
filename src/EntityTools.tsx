import PhoneCall from './PhoneCall';
import type {ContactSuggestion} from './contactExtraction';
import {useEffect,useId,useState} from 'react';
import {X,Plus,Link2,UserRound,Copy,Pencil,ChevronDown} from 'lucide-react';
import {api} from './api';
import OrganisationPicker from './OrganisationPicker';
import {contactName,jsonList,type Entity,type EntityLink} from './domain';
type Props={extracted?:ContactSuggestion;liveCall?:boolean;entity:Entity;entities:Entity[];links:EntityLink[];disabled:boolean;onSaved:(entity?:Entity)=>void;onPick:(id:string)=>void;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void};
export default function EntityTools({extracted,liveCall,entity,entities,links,disabled,onSaved,onPick,onDirtyChange,onBusyChange}:Props){
 const[mode,setMode]=useState(''),[cid,setCid]=useState(''),[name,setName]=useState(''),[role,setRole]=useState(''),[emails,setEmails]=useState(''),[phones,setPhones]=useState(''),[other,setOther]=useState(''),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[version,setVersion]=useState(entity.version);
 const [calling,setCalling]=useState<Record<string,boolean>>({}),[callBusy,setCallBusy]=useState<Record<string,boolean>>({});
 const [sourceMessage,setSourceMessage]=useState<string|undefined>(),[suggestion,setSuggestion]=useState<ContactSuggestion|null>(null);
 const [expanded,setExpanded]=useState(false),contactsId=useId();
 useEffect(()=>{setExpanded(false);},[entity.id]);
 const hasCalls=Object.values(calling).some(Boolean),isCalling=Object.values(callBusy).some(Boolean);
 useEffect(()=>{onBusyChange(busy||isCalling);},[busy,isCalling,onBusyChange]);
 const contacts=jsonList(entity.values[20]),conflict=!!mode&&version!==entity.version;
 useEffect(()=>{onDirtyChange(!!mode||busy||hasCalls);},[mode,busy,hasCalls,onDirtyChange]);
 function pick(id:string){setSourceMessage(undefined);setSuggestion(null);if(!id)setExpanded(true);const c=contacts.find(c=>c.id===id);setCid(id);setName(contactName(c?.name,c?.e_mails?.[0]));setRole(c?.rolle||'');setEmails((c?.e_mails||[]).join('; '));setPhones((c?.telefone||[]).join('; '));setVersion(entity.version);setError('');setMode('contact');}
 function close(){if(busy)return;setMode('');setError('');setSuggestion(null);setSourceMessage(undefined);}
 async function save(){if(busy||conflict)return;setBusy(true);setError('');try{const result=await api(mode==='contact'?{action:'contact',id:entity.id,version,contactId:cid||null,name,role,emails,phones,messageId:sourceMessage}:{action:'link',id:entity.id,version,other,note});setMode('');onSaved(result.entity);}catch(e:any){setError(e.message);if(e.status==='conflict')onSaved();}finally{setBusy(false);}}
 function applySuggestion(draft:ContactSuggestion,id:string){
  const c=contacts.find(c=>c.id===id);setCid(id);setName(c?.name||draft.name);setRole(c?.rolle||draft.role||'');
  setEmails([...new Set([...(c?.e_mails||[]),...draft.emails])].join('; '));
  const seen=new Set<string>();setPhones([...(c?.telefone||[]),...draft.phones].filter(p=>{const key=p.replace(/\(0\)/g,'').replace(/[^+\d]/g,'');if(seen.has(key))return false;seen.add(key);return true;}).join('; '));
  setSourceMessage(draft.messageId);setSuggestion(draft);setVersion(entity.version);setError('');setMode('contact');setExpanded(true);
 }
 useEffect(()=>{if(!extracted)return;const matches=contacts.filter(c=>c.e_mails.some((email:string)=>extracted.emails.includes(email.toLowerCase())));applySuggestion(extracted,matches.length===1?matches[0].id:'');},[extracted]);
 async function copy(value:string){try{await navigator.clipboard.writeText(value);}catch{setError('Bitte die E-Mail-Adresse markieren und kopieren.');}}
 const editor=mode&&<form className="inline-contact-editor" onSubmit={e=>{e.preventDefault();save();}}><header><strong>{mode==='contact'?(cid?'Kontakt bearbeiten':'Neuer Kontakt'):'Verknüpfen'}</strong>{!(mode==='contact'&&cid)&&<button type="button" className="icon-button" disabled={busy} onClick={close} aria-label="Bearbeitung abbrechen"><X size={17}/></button>}</header><fieldset disabled={busy||disabled}>
  {suggestion&&<label className="field extraction-target"><span>Zu Kontakt</span><select aria-label="Extrahierten Kontakt zuordnen" value={cid} onChange={e=>applySuggestion(suggestion,e.target.value)}><option value="">Neuen Kontakt anlegen</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name||c.e_mails[0]||'Kontakt'}</option>)}</select></label>}
  {mode==='contact'?<div className="inline-field-grid"><label className="field"><span>Name</span><input autoFocus value={name} onChange={e=>setName(e.target.value)}/></label><label className="field"><span>Rolle</span><input value={role} onChange={e=>setRole(e.target.value)}/></label><label className="field span2"><span>E-Mail-Adressen</span><input type="text" inputMode="email" value={emails} onChange={e=>setEmails(e.target.value)} onBlur={()=>{if(!name.trim())setName(contactName('',emails.split(/[\n,;]+/)[0]));}}/></label><label className="field span2"><span>Telefonnummern</span><input type="text" inputMode="tel" value={phones} onChange={e=>setPhones(e.target.value)}/></label></div>:<><OrganisationPicker entities={entities.filter(e=>e.id!==entity.id)} value={other} onChange={setOther} disabled={busy}/><label className="field"><span>Beziehung</span><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Betreut Stage für diese Organisation …"/></label></>}
  {suggestion&&<p className="muted extraction-review">Vorschlag aus der markierten E-Mail · bitte prüfen.</p>}
  {error&&<p className="save-error" role="alert">{error}</p>}
  {conflict&&<p className="save-error" role="alert">Der Datensatz wurde inzwischen geändert. Bitte Eingaben kopieren, die Bearbeitung schließen und erneut öffnen.</p>}
  <button className="button primary wide" disabled={conflict||(mode==='link'&&!other)}>{busy?'Speichert …':'Speichern'}</button></fieldset></form>;
 return <section className="inline-contacts" data-tour="contacts">
  <div className="section-heading"><h3>Kontakte <small>{contacts.length}</small></h3><button className="icon-button" disabled={disabled||!!mode||hasCalls} title="Kontakt hinzufügen" aria-label="Kontakt hinzufügen" onClick={()=>pick('')}><Plus size={17}/></button></div>
  {mode==='contact'&&!cid&&editor}
  <div className="contact-cards" id={contactsId}>{contacts.map((c,index)=><article className={`contact-card ${mode==='contact'&&cid===c.id?'is-editing':''}`} key={c.id} hidden={!expanded&&index>=2}><header><strong>{contactName(c.name,c.e_mails?.[0])||c.e_mails?.[0]||'Kontakt'}</strong><button className="icon-button tiny" aria-label={mode==='contact'&&cid===c.id?'Bearbeitung abbrechen':`${contactName(c.name,c.e_mails?.[0])||'Kontakt'} bearbeiten`} aria-expanded={mode==='contact'&&cid===c.id} disabled={busy||disabled||hasCalls||!!mode&&cid!==c.id} onClick={()=>mode==='contact'&&cid===c.id?close():pick(c.id)}>{mode==='contact'&&cid===c.id?<X size={16}/>:<Pencil size={14}/>}</button></header>{c.rolle&&<small>{c.rolle}</small>}{(c.telefone||[]).map((p:string,i:number)=><PhoneCall key={i} organisationId={entity.id} contactId={c.id} number={p} disabled={disabled||liveCall||!!mode||hasCalls} onSaved={onSaved} onPending={value=>setCalling(old=>old[c.id+':'+i]===value?old:{...old,[c.id+':'+i]:value})} onBusy={value=>setCallBusy(old=>old[c.id+':'+i]===value?old:{...old,[c.id+':'+i]:value})}/>)}{(c.e_mails||[]).map((address:string,i:number)=><button className="contact-email" title="E-Mail-Adresse kopieren" key={i} onClick={()=>copy(address)}>{address}<Copy size={12}/></button>)}{mode==='contact'&&cid===c.id&&editor}</article>)}</div>
  {contacts.length>2&&<button type="button" className="contacts-toggle" aria-expanded={expanded} aria-controls={contactsId} disabled={disabled||!!mode||hasCalls||busy} onClick={()=>setExpanded(v=>!v)}>{expanded?"Weniger Kontakte":`${contacts.length-2} weitere Kontakte`}<ChevronDown size={16} aria-hidden="true"/></button>}
  {!contacts.length&&!mode&&<button className="empty-contact" disabled={disabled} onClick={()=>pick('')}><UserRound size={18}/>Kontakt hinzufügen</button>}
  <div className="linked-organisations">{links.map(l=>{const other=l.a===entity.id?l.b:l.a;return <button className="linked-entity" key={l.id} onClick={()=>onPick(other)}><Link2 size={15}/><span>{entities.find(e=>e.id===other)?.values[1]||other}<small>{l.note}</small></span></button>;})}</div>
  {!mode&&<button className="text-button" disabled={disabled||hasCalls} onClick={()=>{setSuggestion(null);setSourceMessage(undefined);setError('');setOther('');setNote('');setVersion(entity.version);setMode('link');}}><Link2 size={14}/>Organisation verknüpfen</button>}
  {mode==='link'&&editor}
  {!mode&&error&&<p className="save-error" role="alert">{error}</p>}
 </section>;
}
