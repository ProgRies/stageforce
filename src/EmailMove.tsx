import {useEffect,useRef,useState} from 'react';
import {ArrowRightLeft,Check,X} from 'lucide-react';
import {api} from './api';
import OrganisationPicker from './OrganisationPicker';
import {formatDate,type Entity} from './domain';
type Brief={activityId:string;subject:string;date:string;sentAt?:string;direction:string};
type Preview={email:Brief;siblings:Brief[];contacts:{contactId:string;name:string;email:string;existing?:boolean}[];meeting:{activityId:string;text:string;date:string}|null;calls:number;into?:{id:string;name:string};copyInTarget?:boolean};
export type EmailMoved={entity:Entity;into:{id:string;name:string};moved:string[];createdContacts:number;unusedContacts:string[]};
// Moves an email that was saved to the wrong organisation. The email itself stays as it is; its timeline entry, its contacts (matched or
// copied in the target), a meeting logged from it and, when ticked, the other saved emails of its Gmail conversation go to the target.
export default function EmailMove({entity,entities,activityId,onMoved,onCancel,onBusy}:{entity:Entity;entities:Entity[];activityId:string;onMoved:(r:EmailMoved)=>void;onCancel:()=>void;onBusy:(busy:boolean)=>void}){
 const [into,setInto]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[siblings,setSiblings]=useState<Set<string>>(new Set()),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const first=useRef(true);
 useEffect(()=>{onBusy(busy);},[busy,onBusy]);
 useEffect(()=>{let active=true;setError('');api({action:'emailMovePreview',id:entity.id,activityId,...(into?{into}:{})}).then((p:Preview)=>{if(!active)return;setPreview(p);
  // The conversation's other emails start ticked: a wrong save usually put the whole conversation in the wrong place.
  if(first.current){first.current=false;setSiblings(new Set(p.siblings.map(s=>s.activityId)));}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[entity.id,entity.version,activityId,into]);
 async function move(){if(!into||busy)return;setBusy(true);setError('');try{const r=await api({action:'emailMove',id:entity.id,version:entity.version,activityId,into,siblingIds:[...siblings]});onMoved(r);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 const others=entities.filter(e=>e.id!==entity.id),count=1+siblings.size;
 return <section className="email-move" aria-label="E-Mail einer anderen Organisation zuordnen">
  <header><strong><ArrowRightLeft size={15} aria-hidden="true"/>Andere Organisation zuordnen</strong><button type="button" className="icon-button tiny" aria-label="Abbrechen" disabled={busy} onClick={onCancel}><X size={15}/></button></header>
  <fieldset disabled={busy}>
   <OrganisationPicker entities={others} value={into} onChange={setInto}/>
   {preview&&preview.siblings.length>0&&<div className="email-move-group"><p>Weitere gespeicherte E-Mails dieser Unterhaltung in „{entity.values[1]}“:</p>{preview.siblings.map(s=><label className="checkbox" key={s.activityId}><input type="checkbox" checked={siblings.has(s.activityId)} onChange={e=>setSiblings(v=>{const next=new Set(v);if(e.target.checked)next.add(s.activityId);else next.delete(s.activityId);return next;})}/><span>{formatDate(s.date)} · {s.direction==='outgoing'?'Gesendet':'Erhalten'} · {s.subject}</span></label>)}</div>}
   {preview?.into&&<ul className="email-move-notes">
    {preview.contacts.map(c=><li key={c.contactId}>{c.name}{c.email&&c.email!==c.name?` (${c.email})`:''}: {c.existing?`wird mit dem vorhandenen Kontakt in „${preview.into!.name}“ verknüpft`:`wird in „${preview.into!.name}“ neu angelegt`}. In „{entity.values[1]}“ bleibt der Kontakt bestehen.</li>)}
    {preview.meeting&&<li>Das aus dieser E-Mail eingetragene Meeting am {formatDate(preview.meeting.date)} wird mit verschoben.</li>}
    {preview.calls>0&&<li>{preview.calls===1?'Ein Anruf, der':`${preview.calls} Anrufe, die`} aus dieser E-Mail gestartet {preview.calls===1?'wurde, bleibt':'wurden, bleiben'} in „{entity.values[1]}“.</li>}
    {preview.copyInTarget&&<li className="warning">„{preview.into.name}“ hat bereits eine E-Mail mit gleichem Absender, Betreff und Zeitpunkt. Nach dem Verschieben steht sie dort eventuell doppelt.</li>}
    <li>Wiedervorlage und Prüfaufgaben bleiben bei „{entity.values[1]}“. Der Schritt steht im Änderungsprotokoll beider Organisationen und lässt sich durch erneutes Verschieben zurücknehmen.</li>
   </ul>}
   {error&&<p className="save-error" role="alert">{error}</p>}
   <div className="email-move-actions"><button type="button" className="button secondary" onClick={onCancel}>Abbrechen</button><button type="button" className="button primary" disabled={!into||!preview?.into} onClick={move}><Check size={15}/>{busy?'Verschiebt …':count===1?'E-Mail verschieben':`${count} E-Mails verschieben`}</button></div>
  </fieldset>
 </section>;
}
