import {useConfirm} from './ConfirmDialog';
import {useEffect,useRef,useState} from 'react';
import {Settings,RefreshCw,Copy,Check,X,ShieldCheck} from 'lucide-react';
import {AppearanceControls} from './Appearance';
import {api} from './api';

export const EVENT_LABELS:Record<string,string>={login:'Angemeldet',logout:'Abgemeldet',password_failed:'Falsches Passwort',code_failed:'Falscher Code bei der Anmeldung',key_code_failed:'Falscher Code beim Schlüssel',recovery_code_used:'Wiederherstellungscode benutzt',mfa_enrolled:'Authenticator eingerichtet',mfa_reset:'Zwei-Faktor zurückgesetzt',password_reset:'Passwort zurückgesetzt',key_created:'Erweiterungs-Schlüssel erstellt',key_revoked:'Erweiterungs-Schlüssel widerrufen',user_added:'Konto angelegt',user_disabled:'Konto deaktiviert'};
type Props={signedIn?:boolean;loadedAt?:string;stale?:boolean;loading?:boolean;disabled?:boolean;onRefresh?:()=>void};
export default function SystemSettings(props:Props){
 const ask=useConfirm();
 const[open,setOpen]=useState(false),[extension,setExtension]=useState<any>(null),[key,setKey]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false),[code,setCode]=useState<string|null>(null),[events,setEvents]=useState<any[]|null>(null);
 const ref=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),visibility=useRef(0);
 const close=()=>{visibility.current++;setOpen(false);setKey('');setCopied(false);setCode(null);setEvents(null);};
 useEffect(()=>{
  if(!open)return;
  const outside=(e:PointerEvent)=>{if((e.target as Element)?.closest?.('.confirm-dialog'))return;if(!ref.current?.contains(e.target as Node))close();};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('.confirm-dialog[open]')){close();trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  let active=true;if(props.signedIn)api({action:'extensionStatus'}).then(v=>{if(active)setExtension(v);}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open,props.signedIn]);
 async function connection(action:string){
  // A new key first asks for a fresh authenticator code; the request goes out once the code is entered.
  if(action==='extensionCreate'&&code===null){if(extension?.connected&&!await ask('Den bisherigen Erweiterungs-Schlüssel ersetzen? Danach die Browser-Erweiterung neu verbinden.','Schlüssel ersetzen'))return;setError('');setKey('');setCode('');return;}
  if(action==='extensionRevoke'&&!await ask('Browser-Verbindung widerrufen?','Widerrufen'))return;
  const opened=visibility.current;setBusy(true);setError('');setKey('');setCopied(false);
  try{const v=await api(action==='extensionCreate'?{action,code}:{action});if(opened===visibility.current){setExtension(v);setKey(v.token||'');setCode(null);setEvents(null);}}catch(e:any){if(opened===visibility.current){setError(e.message);if(action==='extensionCreate')setCode('');}}finally{setBusy(false);}
 }
 return <div className="system-settings" data-tour="settings" ref={ref}>
  <button ref={trigger} type="button" className="icon-button" title="Einstellungen" aria-label="Einstellungen" aria-expanded={open} aria-controls="system-settings-panel" onClick={async()=>{if(open)close();else{setError('');setOpen(true);}}}><Settings size={19}/></button>
  {open&&<section id="system-settings-panel" className="settings-popover glass" aria-label="Einstellungen">
   <header><strong>Einstellungen</strong><button type="button" className="icon-button" aria-label="Einstellungen schließen" onClick={async()=>{close();trigger.current?.focus();}}><X size={16}/></button></header>
   <div className="settings-row"><span>Darstellung</span><AppearanceControls/></div>
   {props.onRefresh&&<div className="settings-row"><span className={`connection ${props.stale?'stale':''}`} title={props.loadedAt?`Geladen ${new Date(props.loadedAt).toLocaleTimeString('de-DE')}`:undefined}><i/>{props.stale?'Veraltet':props.loadedAt?'Live':'Laden …'}</span><button type="button" className="text-button" disabled={props.disabled||props.loading} onClick={props.onRefresh}><RefreshCw size={15} className={props.loading?'spin':''}/>Aktualisieren</button></div>}
   {props.signedIn&&<details className="settings-extension"><summary>Browser-Erweiterung verbinden</summary><p>Schlüssel erstellen und zusammen mit dieser CRM-Adresse in den Einstellungen der Chrome-Erweiterung einfügen.</p><p><strong>{window.location.origin}</strong></p>
    {extension?.connected&&<small>Verbunden · gültig bis {new Date(extension.expires_at).toLocaleDateString('de-DE')}</small>}
    {extension?.last_used_at&&<small>Zuletzt verwendet: {new Date(extension.last_used_at).toLocaleString('de-DE')}</small>}
    {code!==null&&<form className="settings-code" onSubmit={e=>{e.preventDefault();connection('extensionCreate');}}><label className="field"><span>Code aus deiner Authenticator-App</span><input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="123456" value={code} disabled={busy} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>{error&&<p role="alert" className="save-error">{error}</p>}<div className="settings-key-actions"><button className="button primary small" disabled={busy||code.length!==6}>{busy?'Prüfen …':'Schlüssel erstellen'}</button><button type="button" className="text-button" disabled={busy} onClick={()=>{setCode(null);setError('');}}>Abbrechen</button></div><small>Ein Schlüssel meldet die Erweiterung 90 Tage ohne Code an. Deshalb wird hier ein frischer Code verlangt.</small></form>}
    {code===null&&<div className="settings-key-actions"><button type="button" className="button secondary small" disabled={busy||!extension} onClick={()=>connection('extensionCreate')}>{extension?.connected?'Schlüssel erneuern':'Schlüssel erstellen'}</button>{extension?.connected&&<button type="button" className="text-button" disabled={busy} onClick={()=>connection('extensionRevoke')}>Widerrufen</button>}</div>}
    {key&&<div className="settings-key"><label className="field"><span>Einmalig in der Browser-Erweiterung einfügen</span><input aria-label="Erweiterungs-Verbindungsschlüssel" readOnly value={key} onFocus={e=>e.target.select()}/></label><button type="button" className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(key);setCopied(true);}catch{setError('Bitte den Schlüssel im Feld markieren und kopieren.');}}}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Kopiert':'Kopieren'}</button><small>Nur für dein Konto. 90 Tage gültig, jederzeit widerrufbar. Wird nur jetzt angezeigt.</small></div>}
   </details>}
   {props.signedIn&&<details className="settings-extension" onToggle={e=>{if((e.target as HTMLDetailsElement).open&&!events)api({action:'securityEvents'}).then(v=>setEvents(v.items)).catch(e=>setError(e.message));}}><summary><ShieldCheck size={14} aria-hidden="true"/> Anmeldeaktivität</summary><p>Die letzten Anmeldungen und Sicherheitsereignisse deines Kontos. Etwas, das du nicht warst? Bitte sofort den Administrator, dein Passwort und deine Zwei-Faktor-Anmeldung zurückzusetzen.</p>
    {events===null?<small>Wird geladen …</small>:events.length===0?<small>Noch keine Ereignisse.</small>:<ul className="security-events">{events.map((e,i)=><li key={i} className={/failed/.test(e.event)?'warn':''}><span>{EVENT_LABELS[e.event]||e.event}{e.detail?` · ${e.detail}`:''}</span><small>{new Date(e.at).toLocaleString('de-DE')} · {e.ip}</small></li>)}</ul>}
   </details>}
   {error&&code===null&&<p role="alert" className="save-error">{error}</p>}
  </section>}
 </div>;
}
