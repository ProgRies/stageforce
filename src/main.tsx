import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LockKeyhole} from 'lucide-react';
import Desk from './Desk';
import {AppearanceProvider} from './Appearance';
import SystemSettings from './SystemSettings';
import {request,setCSRF} from './api';
import './style.css';
import './appearance.css';
import './workspace.css';
import './dropdowns.css';
function App(){const[user,setUser]=useState<any>(null),[loading,setLoading]=useState(true),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{request('/api/session').then(r=>{setCSRF(r.csrf);window.dispatchEvent(new CustomEvent('appearance-session',{detail:{mode:r.appearance}}));setUser(r.user);}).catch(()=>{}).finally(()=>setLoading(false));const expire=()=>{setUser(null);setPassword('');setError('');setNotice('Bitte melde dich erneut an.');};window.addEventListener('session-expired',expire);return()=>window.removeEventListener('session-expired',expire);},[]);
 async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{const r=await request('/api/login',{email,password});setCSRF(r.csrf);window.dispatchEvent(new CustomEvent('appearance-session',{detail:{mode:r.appearance}}));setUser(r.user);setPassword('');}catch(e:any){setError(e.message||'Anmeldung fehlgeschlagen.');}finally{setBusy(false);}}
 if(loading)return <main className="login-page"><p>Stage wird geladen …</p></main>;
 if(user)return <Desk user={user}/>;
 return <main className="login-page"><div className="login-appearance"><SystemSettings/></div><form className="login-card glass" onSubmit={login}><div className="brand"><div className="stage-mark"><i/><i/><i/></div><span className="brand-name">Stage <span>Force</span></span></div><h1>Guten Tag.</h1><p>Dein gemeinsamer Blick auf Kunden und Kontakte.</p><label className="field"><span>E-Mail</span><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="field"><span>Passwort</span><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{notice&&!error&&<p role="status" className="login-notice"><LockKeyhole size={14} aria-hidden="true"/>{notice}</p>}{error&&<p role="alert" className="save-error login-error">{error}</p>}<button className="button primary wide" disabled={busy}>{busy?'Anmelden …':'Anmelden'}</button><small>Accounts und Passwörter verwaltet euer Administrator.</small></form></main>;
}
createRoot(document.getElementById('root')!).render(<AppearanceProvider><App/></AppearanceProvider>);
