import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {Moon,Sun,Monitor,Pause,Play} from 'lucide-react';
import SignalBackdrop from './SignalBackdrop';
import {api} from './api';
type Theme='light'|'dark';
type Mode=Theme|'system';
function preference(key:string,fallback:string){try{return localStorage.getItem(key)||fallback;}catch{return fallback;}}
const modeValue=(value:unknown):Mode=>value==='light'||value==='dark'?value:'system';
const AppearanceContext=createContext({theme:'light' as Theme,mode:'system' as Mode,paused:false,syncError:'',setMode:(_mode:Mode)=>{},toggleMotion:()=>{}});
// The phone app passes backdrop="always": the same signal animation in light and dark. The desktop keeps it for dark mode only.
export function AppearanceProvider({children,backdrop='dark'}:{children:ReactNode;backdrop?:'dark'|'always'}){
 const [mode,setModeState]=useState<Mode>(()=>modeValue(preference('stageforce-appearance','system')));
 const [systemDark,setSystemDark]=useState(()=>window.matchMedia('(prefers-color-scheme: dark)').matches);
 const [paused,setPaused]=useState(()=>preference('stageforce-motion','on')==='off'),[syncError,setSyncError]=useState('');
 const signedIn=useRef(false),currentMode=useRef(mode),writes=useRef(Promise.resolve());currentMode.current=mode;
 const theme:Theme=mode==='system'?(systemDark?'dark':'light'):mode;
 function persist(value:Mode){writes.current=writes.current.then(async()=>{try{await api({action:'appearanceSave',mode:value});setSyncError('');}catch{setSyncError('Darstellung konnte nicht synchronisiert werden.');}});}
 function setMode(value:Mode){setModeState(value);if(signedIn.current)persist(value);}
 useLayoutEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('stageforce-appearance',mode);localStorage.setItem('stageforce-motion',paused?'off':'on');}catch{}},[theme,mode,paused]);
 useEffect(()=>{
  const media=window.matchMedia('(prefers-color-scheme: dark)');const update=()=>setSystemDark(media.matches);update();media.addEventListener('change',update);
  const sync=(event:StorageEvent)=>{if(event.key==='stageforce-appearance')setModeState(modeValue(event.newValue));if(event.key==='stageforce-motion')setPaused(event.newValue==='off');};
  const session=(event:Event)=>{signedIn.current=true;const value=(event as CustomEvent).detail?.mode;if(value)setModeState(modeValue(value));else persist(currentMode.current);};
  const logout=()=>{signedIn.current=false;setSyncError('');};
  window.addEventListener('storage',sync);window.addEventListener('appearance-session',session);window.addEventListener('appearance-logout',logout);window.addEventListener('session-expired',logout);
  return()=>{media.removeEventListener('change',update);window.removeEventListener('storage',sync);window.removeEventListener('appearance-session',session);window.removeEventListener('appearance-logout',logout);window.removeEventListener('session-expired',logout);};
 },[]);
 return <AppearanceContext.Provider value={{theme,mode,paused,syncError,setMode,toggleMotion:()=>setPaused(p=>!p)}}><SignalBackdrop active={backdrop==='always'||theme==='dark'} paused={paused} tone={theme}/>{children}</AppearanceContext.Provider>;
}
export const useAppearance=()=>useContext(AppearanceContext);
export function AppearanceControls(){
 const {theme,mode,paused,syncError,setMode,toggleMotion}=useContext(AppearanceContext);
 const motionLabel=paused?'Hintergrundanimation fortsetzen':'Hintergrundanimation pausieren';
 return <div className="appearance-controls">{theme==='dark'&&<button className="icon-button motion-toggle" type="button" title={motionLabel} aria-label={motionLabel} aria-pressed={paused} onClick={toggleMotion}>{paused?<Play size={17}/>:<Pause size={17}/>}</button>}<label className="theme-picker" title="Darstellung">{mode==='system'?<Monitor size={18}/>:mode==='dark'?<Moon size={18}/>:<Sun size={18}/>}<select aria-label="Darstellung" value={mode} onChange={e=>setMode(modeValue(e.target.value))}><option value="system">System</option><option value="light">Hell</option><option value="dark">Dunkel</option></select></label>{syncError&&<span className="appearance-sync-error" role="status">{syncError}</span>}</div>;
}
