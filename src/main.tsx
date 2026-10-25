import {ConfirmProvider} from './ConfirmDialog';
import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LockKeyhole} from 'lucide-react';
import Desk from './Desk';
import {AppearanceProvider} from './Appearance';
import SystemSettings from './SystemSettings';
import {MfaChallenge,RecoveryCodes,type MfaStep,type MfaResult} from './MfaLogin';
import {request,setCSRF} from './api';
import './style.css';
import './appearance.css';
import './workspace.css';
import './dropdowns.css';
function App(){const[user,setUser]=useState<any>(null),[loading,setLoading]=useState(true),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[mfa,setMfa]=useState<MfaStep|null>(null),[codes,setCodes]=useState<MfaResult|null>(null);
 useEffect(()=>{request('/api/session').then(r=>{setCSRF(r.csrf);window.dispatchEvent(new CustomEvent('appearance-session',{detail:{mode:r.appearance}}));setUser(r.user);}).catch(()=>{}).finally(()=>setLoading(false));const expire=()=>{setUser(null);setMfa(null);setCodes(null);setPassword('');setError('');setNotice('Bitte melde dich erneut an.');};window.addEventListener('session-expired',expire);return()=>window.removeEventListener('session-expired',expire);},[]);
 async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{setMfa(await request('/api/login',{email,password}));setPassword('');}catch(e:any){setError(e.message||'Anmeldung fehlgeschlagen.');}finally{setBusy(false);}}
 // Only a confirmed code yields a session; the recovery codes are shown before the workspace opens.
 function signedIn(r:MfaResult){setCSRF(r.csrf);window.dispatchEvent(new CustomEvent('appearance-session',{detail:{mode:r.appearance}}));setMfa(null);if(r.recoveryCodes||r.recoveryLeft!==undefined)setCodes(r);else setUser(r.user);}
 function restart(message?:string){setMfa(null);setError(message||'');setNotice('');}
 if(loading)return <main className="login-page"><p>Stage wird geladen …</p></main>;
 if(user)return <Desk user={user}/>;
 if(codes)return <main className="login-page"><RecoveryCodes result={codes} onContinue={()=>{setUser(codes.user);setCodes(null);}}/></main>;
 if(mfa)return <main className="login-page"><div className="login-appearance"><SystemSettings/></div><MfaChallenge step={mfa} onDone={signedIn} onRestart={restart}/></main>;
 return <main className="login-page"><div className="login-appearance"><SystemSettings/></div><form className="login-card glass" onSubmit={login}><div className="brand"><div className="stage-mark"><i/><i/><i/></div><span className="brand-name">Stage <span>Force</span></span></div><h1>Guten Tag.</h1><p>Dein gemeinsamer Blick auf Kunden und Kontakte.</p><label className="field"><span>E-Mail</span><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="field"><span>Passwort</span><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{notice&&!error&&<p role="status" className="login-notice"><LockKeyhole size={14} aria-hidden="true"/>{notice}</p>}{error&&<p role="alert" className="save-error login-error">{error}</p>}<button className="button primary wide" disabled={busy}>{busy?'Anmelden …':'Anmelden'}</button><small>Accounts und Passwörter verwaltet euer Administrator.</small></form></main>;
}
createRoot(document.getElementById('root')!).render(<AppearanceProvider><ConfirmProvider><App/></ConfirmProvider></AppearanceProvider>);
