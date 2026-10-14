import {useState} from 'react';
import {X,Mail,FileSpreadsheet,ArrowRight} from 'lucide-react';
import EmailInbox from './EmailInbox';
import FastbillInbox from './FastbillInbox';
import type {Entity} from './domain';
export default function ImportHub({entities,initialImportId,accountEmail,onClose,onSaved}:{entities:Entity[];initialImportId?:string;accountEmail:string;onClose:()=>void;onSaved:(id:string)=>void}){
 const [source,setSource]=useState(initialImportId?'email':'');
 if(source==='email')return <EmailInbox entities={entities} initialImportId={initialImportId} onClose={onClose} onSaved={onSaved}/>;
 if(source==='fastbill')return <FastbillInbox entities={entities} accountEmail={accountEmail} onBack={()=>setSource('')} onClose={onClose} onSaved={onSaved}/>;
 return <div className="modal-backdrop"><div className="queue-modal glass import-hub" role="dialog" aria-modal="true" aria-labelledby="hub-title"><button className="modal-close icon-button" aria-label="Schließen" onClick={onClose}><X size={18}/></button><h2 id="hub-title">Importe</h2><p>Quelle auswählen, Änderungen prüfen.</p><button className="import-source" onClick={()=>setSource('email')}><Mail/><span><strong>E-Mail</strong><small>Gmail oder .eml-Dateien</small></span><ArrowRight size={18}/></button><button className="import-source" onClick={()=>setSource('fastbill')}><FileSpreadsheet/><span><strong>FastBill</strong><small>CSV-Export oder API</small></span><ArrowRight size={18}/></button></div></div>;
}
