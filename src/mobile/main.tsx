import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LockKeyhole} from 'lucide-react';
import {AppearanceProvider} from '../Appearance';
import {MfaChallenge,RecoveryCodes,SecurityWarning,type MfaStep,type MfaResult} from '../MfaLogin';
import {request,setCSRF} from '../api';
import CallLogger from './CallLogger';
import './mobile.css';
// The phone app: its own page at /m/, sharing the server, the sign-in and the call logic with the desktop CRM but none of its layout.
// It signs in once per phone (password and code) and then keeps a 90-day session that renews while it is used.
function App(){
 const[user,setUser]=useState<any>(null),[loading,setLoading]=useState(true),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[mfa,setMfa]=useState<MfaStep|null>(null),[codes,setCodes]=useState<MfaResult|null>(null),[warning,setWarning]=useState<MfaResult|null>(null);
 useEffect(()=>{
  request('/api/session').then(r=>{setCSRF(r.csrf);window.dispatchEvent(new CustomEvent('appearance-session',{detail:{mode:r.appearance}}));setUser(r.user);}).catch(()=>{}).finally(()=>setLoading(false));
  const expire=()=>{setUser(null);setMfa(null);setCodes(null);setWarning(null);setPassword('');setError('');setNotice('Bitte melde dich erneut an.');};
  window.addEventListener('session-expired',expire);return()=>window.removeEventListener('session-expired',expire);
 },[]);
 async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{setMfa(await request('/api/login',{email,password}));setPassword('');}catch(e:any){setError(e.message||'Anmeldung fehlgeschlagen.');}finally{setBusy(false);}}
 function signedIn(r:MfaResult){setCSRF(r.csrf);window.dispatchEvent(new CustomEvent('appearance-session',{detail:{mode:r.appearance}}));setMfa(null);next(r);}
 function next(r:MfaResult){if(r.security){setWarning(r);return;}if(r.recoveryCodes||r.recoveryLeft!==undefined)setCodes(r);else setUser(r.user);}
 function restart(message?:string){setMfa(null);setError(message||'');setNotice('');}
 async function logout(){try{await request('/api/logout',{});}catch{}setUser(null);setNotice('Abgemeldet. Bis zum nächsten Mal.');}
 if(loading)return <main className="m-center"><div className="m-mark m-mark-loading" aria-label="Stage Force wird geladen"><i/><i/><i/></div></main>;
 if(user)return <CallLogger user={user} onLogout={logout}/>;
 const shell=(card:React.ReactNode)=><main className="m-center m-auth">{card}</main>;
 if(warning)return shell(<SecurityWarning result={warning} onContinue={()=>{const r={...warning,security:undefined};setWarning(null);next(r);}}/>);
 if(codes)return shell(<RecoveryCodes result={codes} onContinue={()=>{setUser(codes.user);setCodes(null);}}/>);
 if(mfa)return shell(<MfaChallenge step={mfa} device="mobile" onDone={signedIn} onRestart={restart}/>);
 return shell(<form className="login-card glass" onSubmit={login}>
  <div className="m-brand"><div className="m-mark"><i/><i/><i/></div><span>Stage <b>Force</b></span></div>
  <h1>Einmal anmelden.</h1>
  <p>Danach bleibt dieses Handy angemeldet, solange du die App mindestens alle 90 Tage öffnest.</p>
  <label className="field"><span>E-Mail</span><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
  <label className="field"><span>Passwort</span><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
  {notice&&!error&&<p role="status" className="login-notice"><LockKeyhole size={14} aria-hidden="true"/>{notice}</p>}
  {error&&<p role="alert" className="save-error login-error">{error}</p>}
  <button className="button primary wide" disabled={busy}>{busy?'Anmelden …':'Anmelden'}</button>
 </form>);
}
if('serviceWorker' in navigator)window.addEventListener('load',()=>{navigator.serviceWorker.register('/m/sw.js',{scope:'/m/'}).catch(()=>{});});
createRoot(document.getElementById('root')!).render(<AppearanceProvider backdrop="always"><App/></AppearanceProvider>);
