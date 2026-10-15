import {useEffect,useRef,useState} from 'react';
import {Check,ArrowUpRight} from 'lucide-react';
import {api} from './api';
import {PHASES,TYPES,text,dateISO,fastbillURL,needsFastbill,type Entity} from './domain';

export const organisationDraft=(entity:Entity):Record<string,string>=>Object.fromEntries(
 Array.from({length:19},(_,i)=>i+1).filter(i=>i!==15).map(i=>[i,i===17?dateISO(entity.values[i]):text(entity,i)])
);
type Props={entity:Entity;disabled:boolean;onSaved:()=>void;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void};
export default function OrganisationFields({entity,disabled,onSaved,onDirtyChange,onBusyChange}:Props){
 const [base,setBase]=useState(entity),[draft,setDraft]=useState(()=>organisationDraft(entity)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{onBusyChange(busy);},[busy,onBusyChange]);
 const requestId=useRef<string|null>(null);
 const original=organisationDraft(base),changed=Object.fromEntries(Object.entries(draft).filter(([key,value])=>value!==original[key])),dirty=Object.keys(changed).length>0;
 const conflict=dirty&&base.version!==entity.version;
 useEffect(()=>{onDirtyChange(dirty||busy);},[dirty,busy,onDirtyChange]);
 useEffect(()=>{if(!dirty&&!busy){setBase(entity);setDraft(organisationDraft(entity));}},[entity]);
 function change(key:number,value:string){setDraft(d=>({...d,[key]:value}));requestId.current=null;setSaved(false);setError('');}
 function reset(){setBase(entity);setDraft(organisationDraft(entity));setError('');setSaved(false);requestId.current=null;}
 async function save(){
  if(busy||conflict||!dirty)return;setBusy(true);setError('');requestId.current??=crypto.randomUUID();
  try{const r=await api({action:'save',id:entity.id,version:base.version,requestId:requestId.current,fields:changed});setBase(r.entity);setDraft(organisationDraft(r.entity));setSaved(true);onSaved();}
  catch(e:any){setError(e.message);if(e.status==='conflict')onSaved();}finally{setBusy(false);}
 }
 const input=(col:number,label:string,type='text')=><label className="field"><span>{label}</span><input type={type} value={draft[col]||''} onChange={e=>change(col,e.target.value)}/></label>;
 const area=(col:number,label:string)=><label className="field span2"><span>{label}</span><textarea rows={2} value={draft[col]||''} onChange={e=>change(col,e.target.value)}/></label>;
 const select=(col:number,label:string,options:string[])=><label className="field"><span>{label}</span><select value={draft[col]||''} onChange={e=>change(col,e.target.value)}>{!options.includes(draft[col])&&<option value={draft[col]}>{draft[col]||'—'}</option>}{options.map(v=><option key={v}>{v}</option>)}</select></label>;
 const fb=fastbillURL(entity.values[3]);
 return <form noValidate className="inline-organisation" onSubmit={e=>{e.preventDefault();save();}}>
  <fieldset disabled={disabled||busy}>
   <div className="inline-field-grid" data-tour="fields">{select(9,'Status',['Lead','Kunde'])}{select(10,'Phase',PHASES)}{input(11,'Zuständig')}{input(17,'Wiedervorlage','date')}{area(16,'Nächster Schritt')}{area(18,'Kurzüberblick')}</div>
   <label className={`field fastbill-field ${needsFastbill(entity)&&!fb?'missing':''}`}><span>FastBill {needsFastbill(entity)&&!fb&&<small>Link fehlt</small>}{fb&&<a href={fb} target="_blank" rel="noopener noreferrer">Öffnen <ArrowUpRight size={13}/></a>}</span><input type="url" placeholder="Kundenlink einfügen …" value={draft[3]||''} onChange={e=>change(3,e.target.value)}/></label>
   {area(19,'Prüfnotizen')}
   <details className="data-details"><summary>Weitere Stammdaten</summary><div className="inline-field-grid">{input(1,'Name')}{select(2,'Typ',TYPES)}{input(4,'Ort')}{input(5,'Bundesland')}{input(6,'Website')}{input(12,'Hauptkontakt')}{input(13,'E-Mail','email')}{input(14,'Telefon','tel')}{input(7,'Größe','number')}{input(8,'Größenmaß')}</div></details>
  </fieldset>
  {conflict&&<p className="save-error" role="alert">Dieser Eintrag wurde inzwischen geändert. Deine Eingaben bleiben erhalten. Bitte den aktuellen Stand laden und die Änderungen erneut eintragen.</p>}
  {error&&<p className="save-error" role="alert">{error}</p>}
  {(dirty||busy)&&<div className="inline-savebar"><span>Ungespeichert</span><button type="button" className="text-button" disabled={busy} onClick={()=>{if(window.confirm('Eingaben verwerfen und aktuellen Stand laden?'))reset();}}>{conflict?'Neu laden':'Verwerfen'}</button><button className="button primary" disabled={disabled||busy||conflict}>{busy?'Speichert …':'Speichern'}</button></div>}
  {saved&&!dirty&&<p className="inline-saved" role="status"><Check size={14}/>Gespeichert</p>}
 </form>;
}
