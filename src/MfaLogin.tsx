import {useMemo,useState} from 'react';
import qrcode from 'qrcode-generator';
import {Copy,Download,ShieldCheck,Smartphone} from 'lucide-react';
import {request} from './api';
export type MfaStep={mfa:'setup',secret:string,uri:string,email:string}|{mfa:'verify'};
export type MfaResult={user:any,csrf:string,appearance:any,recoveryCodes?:string[],recoveryLeft?:number};
// The QR code is drawn as plain SVG rectangles, so the secret never leaves the page and the CSP stays strict.
function QrCode({text}:{text:string}){const cells=useMemo(()=>{const qr=qrcode(0,'M');qr.addData(text);qr.make();const n=qr.getModuleCount(),list:string[]=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))list.push(`M${x+4} ${y+4}h1v1h-1z`);return{n:n+8,path:list.join('')};},[text]);
 return <svg className="mfa-qr" viewBox={`0 0 ${cells.n} ${cells.n}`} role="img" aria-label="QR-Code für die Authenticator-App" shapeRendering="crispEdges"><rect width={cells.n} height={cells.n} fill="#fff"/><path d={cells.path} fill="#111"/></svg>;}
const grouped=(secret:string)=>secret.match(/.{1,4}/g)!.join(' ');
export function MfaChallenge({step,onDone,onRestart}:{step:MfaStep,onDone:(r:MfaResult)=>void,onRestart:(message?:string)=>void}){
 const[code,setCode]=useState(''),[recovery,setRecovery]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);const setup=step.mfa==='setup';
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{onDone(await request('/api/login/mfa',{code:code.trim()}));}catch(e:any){if(e.status==='mfa_expired')onRestart(e.message);else{setError(e.message||'Der Code stimmt nicht.');setCode('');}}finally{setBusy(false);}}
 return <form className="login-card glass mfa-card" onSubmit={submit}>
  <div className="mfa-heading">{setup?<Smartphone size={22} aria-hidden="true"/>:<ShieldCheck size={22} aria-hidden="true"/>}<h1>{setup?'Zwei-Faktor einrichten':'Bestätigungscode'}</h1></div>
  {setup?<>
   <p>Für Stage Force ist eine Authenticator-App Pflicht. Scanne den Code mit Google Authenticator, Microsoft Authenticator, 1Password oder einer ähnlichen App.</p>
   <QrCode text={step.uri}/>
   <details className="mfa-manual"><summary>QR-Code lässt sich nicht scannen?</summary><p>Gib diesen Schlüssel in der App von Hand ein (zeitbasiert, 6 Stellen):</p><code>{grouped(step.secret)}</code><small>Konto: {step.email}</small></details>
  </>:<p>{recovery?'Gib einen deiner Wiederherstellungscodes ein. Jeder Code funktioniert nur einmal.':'Gib den sechsstelligen Code aus deiner Authenticator-App ein.'}</p>}
  <label className="field"><span>{recovery?'Wiederherstellungscode':setup?'Code aus der App zur Bestätigung':'Code'}</span>
   {recovery?<input key="recovery" autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={20} placeholder="XXXXX-XXXXX-XXXXXX" value={code} onChange={e=>setCode(e.target.value)} autoFocus/>
   :<input key="totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="123456" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} autoFocus/>}
  </label>
  {error&&<p role="alert" className="save-error login-error">{error}</p>}
  <button className="button primary wide" disabled={busy}>{busy?'Prüfen …':setup?'Einrichten und anmelden':'Anmelden'}</button>
  <div className="mfa-links">{!setup&&<button type="button" className="link-button" onClick={()=>{setRecovery(!recovery);setCode('');setError('');}}>{recovery?'Code aus der App verwenden':'Kein Zugriff auf die App?'}</button>}<button type="button" className="link-button" onClick={()=>onRestart()}>Zurück</button></div>
  {recovery&&<small>Keine Codes mehr? Euer Administrator kann die Zwei-Faktor-Anmeldung zurücksetzen.</small>}
 </form>;
}
// Shown exactly once, right after setup, and again as a reminder when a recovery code was used.
export function RecoveryCodes({result,onContinue}:{result:MfaResult,onContinue:()=>void}){
 const[saved,setSaved]=useState(false),[copied,setCopied]=useState(false);const codes=result.recoveryCodes;
 if(!codes)return <div className="login-card glass mfa-card"><div className="mfa-heading"><ShieldCheck size={22} aria-hidden="true"/><h1>Wiederherstellungscode benutzt</h1></div><p>Du hast dich mit einem Wiederherstellungscode angemeldet. Es {result.recoveryLeft===1?'bleibt noch 1 Code':`bleiben noch ${result.recoveryLeft} Codes`}.</p><p>Ist dein Handy weg oder neu, bitte den Administrator, deine Zwei-Faktor-Anmeldung zurückzusetzen. Bei der nächsten Anmeldung richtest du die App dann neu ein und bekommst frische Codes.</p><button className="button primary wide" onClick={onContinue}>Weiter</button></div>;
 const text=`Stage Force Wiederherstellungscodes (${result.user.email})\nJeder Code funktioniert genau einmal.\n\n${codes.join('\n')}\n`;
 const copy=async()=>{try{await navigator.clipboard.writeText(text);setCopied(true);}catch{}};
 const download=()=>{const url=URL.createObjectURL(new Blob([text],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='stageforce-wiederherstellungscodes.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <div className="login-card glass mfa-card">
  <div className="mfa-heading"><ShieldCheck size={22} aria-hidden="true"/><h1>Codes sichern</h1></div>
  <p>Die App ist eingerichtet. Falls du dein Handy verlierst, kommst du mit einem dieser Codes trotzdem hinein. Sie werden nur jetzt angezeigt.</p>
  <ol className="mfa-codes">{codes.map(c=><li key={c}><code>{c}</code></li>)}</ol>
  <div className="mfa-actions"><button type="button" className="button secondary" onClick={copy}><Copy size={15} aria-hidden="true"/>{copied?'Kopiert':'Kopieren'}</button><button type="button" className="button secondary" onClick={download}><Download size={15} aria-hidden="true"/>Als Datei</button></div>
  <label className="mfa-confirm"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>Ich habe die Codes sicher abgelegt, z. B. im Passwort-Manager.</label>
  <button className="button primary wide" disabled={!saved} onClick={onContinue}>Weiter zu Stage Force</button>
 </div>;
}
