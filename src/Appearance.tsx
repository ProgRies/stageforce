import {createContext,useContext,useEffect,useLayoutEffect,useState,type ReactNode} from 'react';
import {Moon,Sun,Monitor,Pause,Play} from 'lucide-react';
import SignalBackdrop from './SignalBackdrop';

type Theme='light'|'dark';
type Mode=Theme|'system';
function preference(key:string,fallback:string){try{return localStorage.getItem(key)||fallback;}catch{return fallback;}}
const modeValue=(value:string|null):Mode=>value==='light'||value==='dark'?value:'system';
const AppearanceContext=createContext({theme:'light' as Theme,mode:'system' as Mode,paused:false,setMode:(_mode:Mode)=>{},toggleMotion:()=>{}});

export function AppearanceProvider({children}:{children:ReactNode}){
 // v0.1.1 saved its default light value too; that key cannot identify an override.
 // Start on system until the user explicitly chooses an appearance here.
 const[mode,setMode]=useState<Mode>(()=>modeValue(preference('stageforce-appearance','system')));
 const[systemDark,setSystemDark]=useState(()=>window.matchMedia('(prefers-color-scheme: dark)').matches);
 const[paused,setPaused]=useState(()=>preference('stageforce-motion','on')==='off');
 const theme:Theme=mode==='system'?(systemDark?'dark':'light'):mode;
 useLayoutEffect(()=>{
  document.documentElement.dataset.theme=theme;
  try{localStorage.setItem('stageforce-appearance',mode);localStorage.setItem('stageforce-motion',paused?'off':'on');}catch{}
 },[theme,mode,paused]);
 useEffect(()=>{
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  const update=()=>setSystemDark(media.matches);update();media.addEventListener('change',update);
  const sync=(event:StorageEvent)=>{
   if(event.key==='stageforce-appearance')setMode(modeValue(event.newValue));
   if(event.key==='stageforce-motion')setPaused(event.newValue==='off');
  };
  window.addEventListener('storage',sync);
  return()=>{media.removeEventListener('change',update);window.removeEventListener('storage',sync);};
 },[]);
 return <AppearanceContext.Provider value={{theme,mode,paused,setMode,toggleMotion:()=>setPaused(p=>!p)}}>
  <SignalBackdrop active={theme==='dark'} paused={paused}/>{children}
 </AppearanceContext.Provider>;
}

export function AppearanceControls(){
 const{theme,mode,paused,setMode,toggleMotion}=useContext(AppearanceContext);
 const motionLabel=paused?'Hintergrundanimation fortsetzen':'Hintergrundanimation pausieren';
 return <div className="appearance-controls">
  {theme==='dark'&&<button className="icon-button motion-toggle" type="button" title={motionLabel} aria-label={motionLabel} aria-pressed={paused} onClick={toggleMotion}>{paused?<Play size={17}/>:<Pause size={17}/>}</button>}
  <label className="theme-picker" title="Darstellung">
   {mode==='system'?<Monitor size={18}/>:mode==='dark'?<Moon size={18}/>:<Sun size={18}/>}
   <select aria-label="Darstellung" value={mode} onChange={e=>setMode(modeValue(e.target.value))}>
    <option value="system">System</option><option value="light">Hell</option><option value="dark">Dunkel</option>
   </select>
  </label>
 </div>;
}
