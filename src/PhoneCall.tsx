import {useState} from 'react';
import {Phone} from 'lucide-react';
import {useCall} from './CallDock';
type Props={title?:string;organisationId:string;contactId:string;number:string;disabled?:boolean};
// Starts a call; the note and the result are taken in the floating call card, not here.
export default function PhoneCall({title,organisationId,contactId,number,disabled}:Props){
 const {active,start}=useCall(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function call(){if(busy||active)return;setBusy(true);setError('');try{await start({organisationId,contactId,number});}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <div className="sf-phone"><button type="button" className="sf-phone-number" title={active?'Ein Anruf läuft noch · oben rechts speichern oder verwerfen':title} disabled={disabled||busy||!!active} onClick={call}><Phone size={16}/><span>{number}</span><img src="/assets/stageforce-icon.svg" alt="StageForce" width="23" height="23"/></button>{error&&<p className="save-error" role="alert">{error}</p>}</div>;
}
