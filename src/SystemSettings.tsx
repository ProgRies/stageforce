import {useEffect,useRef,useState} from 'react';
import {Settings,RefreshCw,Copy,Check,X} from 'lucide-react';
import {AppearanceControls} from './Appearance';
import {api} from './api';

type Props={signedIn?:boolean;loadedAt?:string;stale?:boolean;loading?:boolean;disabled?:boolean;onRefresh?:()=>void};
export default function SystemSettings(props:Props){
 const[open,setOpen]=useState(false),[gmail,setGmail]=useState<any>(null),[key,setKey]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);
 const ref=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),visibility=useRef(0);
 const close=()=>{visibility.current++;setOpen(false);setKey('');setCopied(false);};
 useEffect(()=>{
  if(!open)return;
  const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))close();};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){close();trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  let active=true;if(props.signedIn)api({action:'gmailStatus'}).then(v=>{if(active)setGmail(v);}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open,props.signedIn]);
 async function connection(action:string){
  if(action==='gmailCreate'&&gmail?.connected&&!window.confirm('Den bisherigen Gmail-Schlüssel ersetzen? Danach das Add-on neu verbinden.'))return;
  if(action==='gmailRevoke'&&!window.confirm('Gmail-Verbindung widerrufen? Bereits vorgemerkte Importe bleiben zum Prüfen verfügbar.'))return;
  const opened=visibility.current;setBusy(true);setError('');setKey('');setCopied(false);
  try{const v=await api({action});if(opened===visibility.current){setGmail(v);setKey(v.token||'');}}catch(e:any){if(opened===visibility.current)setError(e.message);}finally{setBusy(false);}
 }
 return <div className="system-settings" data-tour="settings" ref={ref}>
  <button ref={trigger} type="button" className="icon-button" title="Einstellungen" aria-label="Einstellungen" aria-expanded={open} aria-controls="system-settings-panel" onClick={()=>{if(open)close();else{setError('');setOpen(true);}}}><Settings size={19}/></button>
  {open&&<section id="system-settings-panel" className="settings-popover glass" aria-label="Einstellungen">
   <header><strong>Einstellungen</strong><button type="button" className="icon-button" aria-label="Einstellungen schließen" onClick={()=>{close();trigger.current?.focus();}}><X size={16}/></button></header>
   <div className="settings-row"><span>Darstellung</span><AppearanceControls/></div>
   {props.onRefresh&&<div className="settings-row"><span className={`connection ${props.stale?'stale':''}`} title={props.loadedAt?`Geladen ${new Date(props.loadedAt).toLocaleTimeString('de-DE')}`:undefined}><i/>{props.stale?'Veraltet':props.loadedAt?'Live':'Laden …'}</span><button type="button" className="text-button" disabled={props.disabled||props.loading} onClick={props.onRefresh}><RefreshCw size={15} className={props.loading?'spin':''}/>Aktualisieren</button></div>}
   {props.signedIn&&<details className="settings-gmail"><summary>Gmail verbinden</summary><p>Eine ausgewählte Nachricht übernehmen und im CRM prüfen.</p>
    {gmail&&!gmail.publicHttps&&<p>Für Gmail muss dieses CRM über öffentlich erreichbares HTTPS laufen. Lokal funktioniert der .eml-Import.</p>}
    {gmail?.connected&&<small>Verbunden · gültig bis {new Date(gmail.expires_at).toLocaleDateString('de-DE')}</small>}
    {gmail?.last_used_at&&<small>Zuletzt verwendet: {new Date(gmail.last_used_at).toLocaleString('de-DE')}</small>}
    <div className="settings-key-actions"><button type="button" className="button secondary small" disabled={busy||!gmail} onClick={()=>connection('gmailCreate')}>{gmail?.connected?'Schlüssel erneuern':'Schlüssel erstellen'}</button>{gmail?.connected&&<button type="button" className="text-button" disabled={busy} onClick={()=>connection('gmailRevoke')}>Widerrufen</button>}</div>
    {key&&<div className="settings-key"><label className="field"><span>Einmalig im Gmail-Add-on einfügen</span><input aria-label="Gmail-Verbindungsschlüssel" readOnly value={key} onFocus={e=>e.target.select()}/></label><button type="button" className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(key);setCopied(true);}catch{setError('Bitte den Schlüssel im Feld markieren und kopieren.');}}}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Kopiert':'Kopieren'}</button><small>Nur für dein Konto. Wird nach dem Schließen nicht erneut angezeigt.</small></div>}
    <a href="https://github.com/ProgRies/stageforce/blob/main/docs/gmail-setup.md" target="_blank" rel="noopener noreferrer">Einrichtung öffnen ↗</a>
   </details>}
   {error&&<p role="alert" className="save-error">{error}</p>}
  </section>}
 </div>;
}
