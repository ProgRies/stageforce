import {useEffect,useState} from 'react';
import {Check,Plus,Trash2,X} from 'lucide-react';
import {api} from '../api';
// Changing a contact on the phone: name, role and phone numbers, with the same "contact" save as the desktop.
// E-mail addresses are not edited here; they are sent back unchanged from the organisation's current state, because the save
// replaces all of a contact's addresses. Right before saving, the organisation is loaded again: if someone changed this contact
// in the meantime, the sheet shows their version instead of overwriting it.
// Deleting (only offered from the organisation, not during a call) asks once more; emails and calls stay in the timeline.
export type SheetContact={id:string;name:string;role:string;phones:string[];emails?:string[];primary:boolean};
export type SheetOrg={id:string;version:string;contacts:SheetContact[]};
const same=(a:SheetContact,b:SheetContact)=>a.name===b.name&&a.role===b.role&&a.phones.join('\n')===b.phones.join('\n');
export default function ContactSheet({orgId,contact,onClose,onSaved,allowDelete=false}:{orgId:string;contact:SheetContact|null;onClose:()=>void;onSaved:(org:SheetOrg,contactId:string)=>void;allowDelete?:boolean}){
 const[base,setBase]=useState<SheetContact>(contact||{id:'',name:'',role:'',phones:[],emails:[],primary:false});
 const[name,setName]=useState(base.name),[role,setRole]=useState(base.role),[phones,setPhones]=useState(base.phones.length?base.phones:['']);
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[asking,setAsking]=useState(false);
 useEffect(()=>{const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose();};document.addEventListener('keydown',esc);return()=>document.removeEventListener('keydown',esc);},[onClose,busy]);
 const typed=phones.map(p=>p.trim()).filter(Boolean),emails=base.emails||[];
 const ready=!!(name.trim()||typed.length||emails.length);
 function show(c:SheetContact){setBase(c);setName(c.name);setRole(c.role);setPhones(c.phones.length?c.phones:['']);}
 async function save(){
  if(busy||!ready)return;setBusy(true);setError('');
  try{
   const fresh:SheetOrg=await api({action:'mobileOrg',id:orgId});
   const current=base.id?fresh.contacts.find(c=>c.id===base.id):null;
   if(base.id&&!current){setError('Diesen Kontakt gibt es nicht mehr bei der Organisation.');onSaved(fresh,'');return;}
   if(current&&!same(current,base)){show(current);setError('Jemand hat den Kontakt inzwischen geändert. Das ist der aktuelle Stand. Bitte prüfen und erneut speichern.');onSaved(fresh,current.id);return;}
   const r=await api({action:'contact',id:orgId,version:fresh.version,contactId:base.id||null,name:name.trim(),role:role.trim(),phones:typed.join('\n'),emails:(current?.emails||[]).join('\n')});
   onSaved(await api({action:'mobileOrg',id:orgId}),r.contactId);onClose();
  }catch(e:any){setError(e.status==='conflict'?'Die Organisation wurde gerade geändert. Bitte noch einmal speichern.':e.message||'Speichern fehlgeschlagen.');}
  finally{setBusy(false);}
 }
 async function remove(){
  if(busy||!base.id)return;setBusy(true);setError('');
  try{
   const fresh:SheetOrg=await api({action:'mobileOrg',id:orgId});
   if(!fresh.contacts.some(c=>c.id===base.id)){onSaved(fresh,'');onClose();return;}
   await api({action:'contactDelete',id:orgId,version:fresh.version,contactId:base.id});
   onSaved(await api({action:'mobileOrg',id:orgId}),'');onClose();
  }catch(e:any){setAsking(false);setError(e.status==='conflict'?'Die Organisation wurde gerade geändert. Bitte noch einmal löschen.':e.message||'Löschen fehlgeschlagen.');}
  finally{setBusy(false);}
 }
 return <div className="m-sheet-backdrop" onClick={()=>{if(!busy)onClose();}}><section className="m-sheet m-contact-sheet glass" role="dialog" aria-modal="true" aria-label={base.id?'Kontakt bearbeiten':'Neuer Kontakt'} onClick={e=>e.stopPropagation()}>
  <div className="m-grabber" aria-hidden="true"/>
  <header><div><strong>{base.id?'Kontakt bearbeiten':'Neuer Kontakt'}</strong><small>Gilt sofort für alle im CRM</small></div><button type="button" className="m-icon-button" aria-label="Schließen" disabled={busy} onClick={onClose}><X size={20}/></button></header>
  <label className="m-field"><span>Name</span><input autoComplete="off" maxLength={300} value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="Vor- und Nachname"/></label>
  <label className="m-field"><span>Rolle · optional</span><input autoComplete="off" maxLength={500} value={role} disabled={busy} onChange={e=>setRole(e.target.value)} placeholder="z. B. Kulturamt"/></label>
  {phones.map((p,i)=><div key={i} className="m-phone-field"><label className="m-field"><span>{i?'Weitere Nummer':'Telefon'}</span><input type="tel" inputMode="tel" autoComplete="off" value={p} disabled={busy} onChange={e=>setPhones(phones.map((x,j)=>j===i?e.target.value:x))} placeholder="+49 …"/></label>{phones.length>1&&<button type="button" className="m-icon-button" aria-label="Nummer entfernen" disabled={busy} onClick={()=>setPhones(phones.filter((_,j)=>j!==i))}><X size={18}/></button>}</div>)}
  <button type="button" className="m-text-button" disabled={busy} onClick={()=>setPhones([...phones,''])}><Plus size={15} aria-hidden="true"/>Weitere Nummer</button>
  <p className="m-hint">{emails.length?`E-Mail bleibt unverändert: ${emails.join(', ')}. `:''}Die erste Nummer wird beim Anrufen gewählt.</p>
  {error&&<p role="alert" className="m-error glass">{error}</p>}
  {asking?<div className="m-confirm" role="group" aria-label="Löschen bestätigen" ref={el=>{el?.scrollIntoView({block:'nearest',behavior:'smooth'});}}>
   <h3>Kontakt löschen?</h3>
   <p>{base.name||emails[0]||'Der Kontakt'} verschwindet für alle aus der Organisation. E-Mails und Anrufe bleiben im Verlauf.</p>
   <div className="m-pair"><button type="button" className="m-secondary glass" disabled={busy} onClick={()=>setAsking(false)}>Abbrechen</button><button type="button" className="m-danger" disabled={busy} onClick={remove}><Trash2 size={17} aria-hidden="true"/>{busy?'Löscht …':'Löschen'}</button></div>
  </div>:<>
  <div className="m-pair"><button type="button" className="m-secondary glass" disabled={busy} onClick={onClose}>Abbrechen</button><button type="button" className="m-primary" disabled={busy||!ready} onClick={save}><Check size={18} aria-hidden="true"/>{busy?'Speichert …':'Speichern'}</button></div>
  {allowDelete&&base.id&&<button type="button" className="m-text-button m-contact-delete" disabled={busy} onClick={()=>{setError('');setAsking(true);}}><Trash2 size={15} aria-hidden="true"/>Kontakt löschen</button>}
  </>}
 </section></div>;
}
