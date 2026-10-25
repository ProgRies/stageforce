import {useState} from 'react';
import {api} from './api';
import {useConfirm} from './ConfirmDialog';
import OrganisationPicker from './OrganisationPicker';
import {text,type Entity} from './domain';
type Props={entity:Entity;entities:Entity[];disabled:boolean;onRemoved:(removedId:string,nextId:string|null,message:string)=>void};
// Deliberately tucked away under "Änderungen & Quellen": for duplicates and records created by mistake.
export default function OrganisationManage({entity,entities,disabled,onRemoved}:Props){
 const ask=useConfirm(),name=text(entity,1);
 const [into,setInto]=useState(''),[confirmName,setConfirmName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const target=entities.find(e=>e.id===into),locked=disabled||busy;
 async function merge(){if(!target||!await ask(`„${name}“ in „${text(target,1)}“ zusammenführen? E-Mails, Kontakte, Notizen und Verknüpfungen werden übernommen, „${name}“ wird danach entfernt.`,'Zusammenführen'))return;
  setBusy(true);setError('');try{await api({action:'organisationMerge',id:entity.id,version:entity.version,into:target.id});onRemoved(entity.id,target.id,'Organisationen zusammengeführt');}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 async function remove(){if(confirmName.trim()!==name.trim()||!await ask(`„${name}“ endgültig löschen? Alle zugeordneten E-Mails, Notizen und Anrufe sowie Kontakte, die nur hier hinterlegt sind, werden entfernt. Das lässt sich nicht rückgängig machen.`,'Endgültig löschen'))return;
  setBusy(true);setError('');try{await api({action:'organisationDelete',id:entity.id,version:entity.version,confirmName});onRemoved(entity.id,null,'Organisation gelöscht');}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <details className="data-details"><summary>Organisation verwalten</summary>
  <div><p className="muted">Doppelt angelegt? In eine andere Organisation zusammenführen. Alles wird übernommen, nichts muss neu importiert werden.</p>
   <OrganisationPicker entities={entities.filter(e=>e.id!==entity.id)} value={into} onChange={setInto} disabled={locked}/>
   <button type="button" className="button secondary small" style={{marginTop:10}} disabled={locked||!target} onClick={merge}>Zusammenführen</button></div>
  <div><p className="muted">Versehentlich angelegt? Zum Löschen den Namen eingeben.</p>
   <label className="field"><span>Name zur Bestätigung</span><input placeholder={name} value={confirmName} disabled={locked} onChange={e=>setConfirmName(e.target.value)}/></label>
   <button type="button" className="text-button" style={{marginTop:10}} disabled={locked||confirmName.trim()!==name.trim()} onClick={remove}>Organisation löschen</button></div>
  {error&&<p className="save-error" role="alert">{error}</p>}
 </details>;
}
