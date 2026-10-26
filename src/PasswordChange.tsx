import {useState} from 'react';
import {KeyRound} from 'lucide-react';
import {api} from './api';
// Changing the own password: the current one, then the new one twice. No e-mail; the signed-in session is the proof.
// Used under Einstellungen and, after a temporary password from the administrator, as a step before the CRM opens.
export function PasswordForm({onDone,submitLabel='Passwort ändern'}:{onDone:(r:{user:any,signedOut:number})=>void,submitLabel?:string}){
 const[current,setCurrent]=useState(''),[next,setNext]=useState(''),[repeat,setRepeat]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');
  if(next.length<12)return setError('Das neue Passwort braucht mindestens 12 Zeichen.');
  if(next!==repeat)return setError('Die beiden neuen Passwörter stimmen nicht überein.');
  setBusy(true);try{const r=await api({action:'passwordChange',current,next});setCurrent('');setNext('');setRepeat('');onDone(r);}catch(e:any){setError(e.message||'Passwort konnte nicht geändert werden.');}finally{setBusy(false);}
 }
 return <form className="password-form" onSubmit={submit}>
  <label className="field"><span>Bisheriges Passwort</span><input type="password" autoComplete="current-password" required value={current} onChange={e=>setCurrent(e.target.value)}/></label>
  <label className="field"><span>Neues Passwort (mindestens 12 Zeichen)</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={1024} value={next} onChange={e=>setNext(e.target.value)}/></label>
  <label className="field"><span>Neues Passwort wiederholen</span><input type="password" autoComplete="new-password" required value={repeat} onChange={e=>setRepeat(e.target.value)}/></label>
  {error&&<p role="alert" className="save-error">{error}</p>}
  <button className="button primary wide" disabled={busy}>{busy?'Speichern …':submitLabel}</button>
 </form>;
}
// The step after signing in with a temporary password; the CRM (or the phone app) opens once an own password is set.
export function RequiredPasswordChange({user,onDone,onLogout}:{user:any,onDone:(user:any)=>void,onLogout:()=>void}){
 return <div className="login-card glass mfa-card">
  <div className="mfa-heading"><KeyRound size={22} aria-hidden="true"/><h1>Eigenes Passwort festlegen</h1></div>
  <p>Dein Administrator hat ein vorläufiges Passwort für {user.email} vergeben. Lege jetzt dein eigenes fest; danach geht es direkt weiter.</p>
  <PasswordForm submitLabel="Speichern und weiter" onDone={r=>onDone(r.user)}/>
  <div className="mfa-links"><button type="button" className="link-button" onClick={onLogout}>Abmelden</button></div>
 </div>;
}
