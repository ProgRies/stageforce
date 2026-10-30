import {useConfirm} from './ConfirmDialog';
import {useEffect,useRef,useState} from 'react';
import {Settings,RefreshCw,Copy,Check,X,ShieldCheck,Smartphone,KeyRound} from 'lucide-react';
import {PasswordForm} from './PasswordChange';
import {AppearanceControls} from './Appearance';
import {api} from './api';

export const EVENT_LABELS:Record<string,string>={login:'Angemeldet',logout:'Abgemeldet',password_failed:'Falsches Passwort',code_failed:'Falscher Code bei der Anmeldung',key_code_failed:'Falscher Code beim Schlüssel',recovery_code_used:'Wiederherstellungscode benutzt',mfa_enrolled:'Authenticator eingerichtet',mfa_reset:'Zwei-Faktor zurückgesetzt',password_reset:'Passwort zurückgesetzt',password_changed:'Passwort geändert',password_change_failed:'Falsches Passwort beim Ändern',key_created:'Erweiterungs-Schlüssel erstellt',key_renewed:'Erweiterungs-Schlüssel erneuert',device_revoked:'Handy-App abgemeldet',key_revoked:'Erweiterungs-Schlüssel widerrufen',user_added:'Konto angelegt',user_disabled:'Konto deaktiviert'};
type Props={signedIn?:boolean;loadedAt?:string;stale?:boolean;loading?:boolean;disabled?:boolean;onRefresh?:()=>void};
export default function SystemSettings(props:Props){
 const ask=useConfirm();
 const[open,setOpen]=useState(false),[extension,setExtension]=useState<any>(null),[key,setKey]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false),[code,setCode]=useState<string|null>(null),[pending,setPending]=useState<{action:string;id?:string;label?:string}|null>(null),[name,setName]=useState(''),[keyLabel,setKeyLabel]=useState(''),[events,setEvents]=useState<any[]|null>(null),[phones,setPhones]=useState<any[]|null>(null);
 const[pwDone,setPwDone]=useState('');
 const ref=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),visibility=useRef(0);
 const close=()=>{visibility.current++;setOpen(false);setPwDone('');setKey('');setCopied(false);setCode(null);setPending(null);setEvents(null);setPhones(null);};
 useEffect(()=>{
  if(!open)return;
  const outside=(e:PointerEvent)=>{if((e.target as Element)?.closest?.('.confirm-dialog'))return;if(!ref.current?.contains(e.target as Node))close();};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('.confirm-dialog[open]')){close();trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  let active=true;if(props.signedIn)api({action:'extensionStatus'}).then(v=>{if(active)setExtension(v);}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open,props.signedIn]);
 // Each computer has its own key. Creating or renewing one asks for a fresh authenticator code first; the request goes out once it is entered.
 async function connection(action:string,device?:{id:string;label:string}){
  if(action!=='extensionRevoke'&&code===null){setError('');setKey('');setCopied(false);setName('');setPending({action,id:device?.id,label:device?.label});setCode('');return;}
  if(action==='extensionRevoke'&&!await ask(`Schlüssel „${device?.label}“ widerrufen? Die Erweiterung auf diesem Computer muss danach neu verbunden werden; andere Computer bleiben verbunden.`,'Widerrufen'))return;
  const opened=visibility.current,body=action==='extensionRevoke'?{action,id:device?.id}:pending?.action==='extensionRenew'?{action:'extensionRenew',id:pending.id,code}:{action:'extensionCreate',label:name,code};
  setBusy(true);setError('');setKey('');setCopied(false);
  try{const v=await api(body);if(opened===visibility.current){setExtension(v);setKey(v.token||'');setKeyLabel(v.token?v.label:'');setCode(null);setPending(null);setEvents(null);}}
  catch(e:any){if(opened!==visibility.current)return;setError(e.message);
   // The key was revoked meanwhile in another tab or on another computer: show the current list instead of a stale row.
   if(e.status==='key_missing'){setCode(null);setPending(null);api({action:'extensionStatus'}).then(v=>{if(opened===visibility.current)setExtension(v);}).catch(()=>{});}
   else if(code!==null)setCode('');}
  finally{setBusy(false);}
 }
 const day=(t:number)=>new Date(t).toLocaleDateString('de-DE');
 return <div className="system-settings" data-tour="settings" ref={ref}>
  <button ref={trigger} type="button" className="icon-button" title="Einstellungen" aria-label="Einstellungen" aria-expanded={open} aria-controls="system-settings-panel" onClick={async()=>{if(open)close();else{setError('');setOpen(true);}}}><Settings size={19}/></button>
  {open&&<section id="system-settings-panel" className="settings-popover glass" aria-label="Einstellungen">
   <header><strong>Einstellungen</strong><button type="button" className="icon-button" aria-label="Einstellungen schließen" onClick={async()=>{close();trigger.current?.focus();}}><X size={16}/></button></header>
   <div className="settings-row"><span>Darstellung</span><AppearanceControls/></div>
   {props.onRefresh&&<div className="settings-row"><span className={`connection ${props.stale?'stale':''}`} title={props.loadedAt?`Geladen ${new Date(props.loadedAt).toLocaleTimeString('de-DE')}`:undefined}><i/>{props.stale?'Veraltet':props.loadedAt?'Live':'Laden …'}</span><button type="button" className="text-button" disabled={props.disabled||props.loading} onClick={props.onRefresh}><RefreshCw size={15} className={props.loading?'spin':''}/>Aktualisieren</button></div>}
   {props.signedIn&&<details className="settings-extension"><summary>Browser-Erweiterung verbinden</summary><p>Pro Computer einen eigenen Schlüssel erstellen und zusammen mit dieser CRM-Adresse in den Einstellungen der Chrome-Erweiterung einfügen.</p><p><strong>{window.location.origin}</strong></p>
    {extension?.devices?.length>0&&<ul className="security-events extension-devices">{extension.devices.map((d:any)=><li key={d.id} className={d.expired?'warn':''}><span>{d.label} · {d.expired?'abgelaufen':`gültig bis ${day(d.expires_at)}`}</span><small>{d.last_used_at?`Zuletzt verwendet ${new Date(d.last_used_at).toLocaleString('de-DE')}`:'Noch nicht verwendet'}</small>{code===null&&<span className="settings-key-actions"><button type="button" className="text-button" disabled={busy} onClick={()=>connection('extensionRenew',d)}>Erneuern</button><button type="button" className="text-button" disabled={busy} onClick={()=>connection('extensionRevoke',d)}>Widerrufen</button></span>}</li>)}</ul>}
    {code!==null&&<form className="settings-code" onSubmit={e=>{e.preventDefault();connection(pending?.action||'extensionCreate');}}>{pending?.action==='extensionRenew'?<p>Neuer Schlüssel für <strong>{pending.label}</strong>. Der bisherige funktioniert danach nur auf diesem Computer nicht mehr.</p>:<label className="field"><span>Name des Computers</span><input maxLength={60} placeholder={`z. B. Büro-PC oder Laptop`} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>}<label className="field"><span>Code aus deiner Authenticator-App</span><input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="123456" value={code} disabled={busy} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>{error&&<p role="alert" className="save-error">{error}</p>}<div className="settings-key-actions"><button className="button primary small" disabled={busy||code.length!==6}>{busy?'Prüfen …':pending?.action==='extensionRenew'?'Schlüssel erneuern':'Schlüssel erstellen'}</button><button type="button" className="text-button" disabled={busy} onClick={()=>{setCode(null);setPending(null);setError('');}}>Abbrechen</button></div><small>Ein Schlüssel meldet die Erweiterung 90 Tage ohne Code an. Deshalb wird hier ein frischer Code verlangt.</small></form>}
    {code===null&&<div className="settings-key-actions"><button type="button" className="button secondary small" disabled={busy||!extension||extension.devices?.filter((d:any)=>!d.expired).length>=extension.limit} onClick={()=>connection('extensionCreate')}>{extension?.devices?.length?'Neuen Schlüssel erstellen':'Schlüssel erstellen'}</button></div>}
    {key&&<div className="settings-key"><label className="field"><span>Einmalig in der Browser-Erweiterung auf „{keyLabel}“ einfügen</span><input aria-label="Erweiterungs-Verbindungsschlüssel" readOnly value={key} onFocus={e=>e.target.select()}/></label><button type="button" className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(key);setCopied(true);}catch{setError('Bitte den Schlüssel im Feld markieren und kopieren.');}}}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Kopiert':'Kopieren'}</button><small>Nur für diesen Computer. 90 Tage gültig, jederzeit einzeln widerrufbar. Wird nur jetzt angezeigt.</small></div>}
   </details>}
   {props.signedIn&&<details className="settings-extension"><summary><KeyRound size={14} aria-hidden="true"/> Passwort ändern</summary><p>Ohne E-Mail-Bestätigung: dein bisheriges Passwort genügt. Andere Browser und die Handy-App werden danach abgemeldet; hier bleibst du angemeldet.</p>
    {pwDone?<p role="status" className="login-notice"><Check size={14} aria-hidden="true"/>{pwDone}</p>:<PasswordForm onDone={r=>{setPwDone(r.signedOut?`Passwort geändert. ${r.signedOut} weitere Sitzung${r.signedOut===1?'':'en'} abgemeldet.`:'Passwort geändert.');setEvents(null);setPhones(null);}}/>}
   </details>}
   {props.signedIn&&<details className="settings-extension" onToggle={e=>{if((e.target as HTMLDetailsElement).open&&!events)api({action:'securityEvents'}).then(v=>setEvents(v.items)).catch(e=>setError(e.message));}}><summary><ShieldCheck size={14} aria-hidden="true"/> Anmeldeaktivität</summary><p>Die letzten Anmeldungen und Sicherheitsereignisse deines Kontos. Etwas, das du nicht warst? Bitte sofort den Administrator, dein Passwort und deine Zwei-Faktor-Anmeldung zurückzusetzen.</p>
    {events===null?<small>Wird geladen …</small>:events.length===0?<small>Noch keine Ereignisse.</small>:<ul className="security-events">{events.map((e,i)=><li key={i} className={/failed/.test(e.event)?'warn':''}><span>{EVENT_LABELS[e.event]||e.event}{e.detail?` · ${e.detail}`:''}</span><small>{new Date(e.at).toLocaleString('de-DE')} · {e.ip}</small></li>)}</ul>}
   </details>}
   {props.signedIn&&<details className="settings-extension" onToggle={e=>{if((e.target as HTMLDetailsElement).open&&!phones)api({action:'mobileDevices'}).then(v=>setPhones(v.items)).catch(e=>setError(e.message));}}><summary><Smartphone size={14} aria-hidden="true"/> Handy-App</summary><p>Zum Anrufe-Eintragen unterwegs: auf dem iPhone in Safari öffnen, Teilen, „Zum Home-Bildschirm“. Einmal mit Code anmelden; das Handy bleibt dann angemeldet, solange die App mindestens alle 90 Tage geöffnet wird.</p><p><strong>{window.location.origin}/m/</strong></p>
    {phones===null?<small>Wird geladen …</small>:phones.length===0?<small>Noch kein Handy angemeldet.</small>:<ul className="security-events">{phones.map(p=><li key={p.id}><span>{p.label||'Handy'} · zuletzt {new Date(p.last_used_at).toLocaleDateString('de-DE')}</span><button type="button" className="text-button" disabled={busy} onClick={async()=>{if(!await ask(`${p.label||'Handy'} abmelden? Dort ist danach eine neue Anmeldung mit Code nötig.`,'Abmelden'))return;try{setPhones((await api({action:'mobileDeviceRevoke',id:p.id})).items);setEvents(null);}catch(e:any){setError(e.message);}}}>Abmelden</button></li>)}</ul>}
   </details>}
   {error&&code===null&&<p role="alert" className="save-error">{error}</p>}
  </section>}
 </div>;
}
