import {createContext,useContext,useEffect,useLayoutEffect,useState,type ReactNode} from 'react';
import {Moon,Sun,Pause,Play} from 'lucide-react';

type Theme='light'|'dark';
function preference(key:string,fallback:string){try{return localStorage.getItem(key)||fallback;}catch{return fallback;}}
const AppearanceContext=createContext({theme:'light' as Theme,paused:false,toggleTheme:()=>{},toggleMotion:()=>{}});

export function AppearanceProvider({children}:{children:ReactNode}){
 const[theme,setTheme]=useState<Theme>(()=>preference('stageforce-theme','light')==='dark'?'dark':'light');
 const[paused,setPaused]=useState(()=>preference('stageforce-motion','on')==='off');
 useLayoutEffect(()=>{
  document.documentElement.dataset.theme=theme;
  document.documentElement.dataset.motion=paused?'paused':'running';
  try{localStorage.setItem('stageforce-theme',theme);localStorage.setItem('stageforce-motion',paused?'off':'on');}catch{}
 },[theme,paused]);
 useEffect(()=>{
  const sync=(event:StorageEvent)=>{
   if(event.key==='stageforce-theme')setTheme(event.newValue==='dark'?'dark':'light');
   if(event.key==='stageforce-motion')setPaused(event.newValue==='off');
  };
  window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
 },[]);
 return <AppearanceContext.Provider value={{theme,paused,toggleTheme:()=>setTheme(t=>t==='light'?'dark':'light'),toggleMotion:()=>setPaused(p=>!p)}}>
  <div className="ambient-backdrop" aria-hidden="true"><div className="ambient-gradient"/>
   {['e^(iπ) + 1 = 0','∇ · E = ρ / ε₀','∫₀∞ e⁻ˣ² dx = √π / 2','x(t) = A cos(ωt + φ)','Σ 1/n² = π²/6'].map((formula,i)=><span className={`ambient-equation equation-${i}`} key={formula}>{formula}</span>)}
  </div>{children}
 </AppearanceContext.Provider>;
}

export function AppearanceControls(){
 const{theme,paused,toggleTheme,toggleMotion}=useContext(AppearanceContext);
 const label=theme==='light'?'Dunklen Modus aktivieren':'Hellen Modus aktivieren';
 const motionLabel=paused?'Hintergrundanimation fortsetzen':'Hintergrundanimation pausieren';
 return <div className="appearance-controls">
  {theme==='dark'&&<button className="icon-button motion-toggle" type="button" title={motionLabel} aria-label={motionLabel} aria-pressed={paused} onClick={toggleMotion}>{paused?<Play size={17}/>:<Pause size={17}/>}</button>}
  <button className="icon-button theme-toggle" type="button" title={label} aria-label={label} aria-pressed={theme==='dark'} onClick={toggleTheme}>{theme==='light'?<Moon size={20}/>:<Sun size={20}/>}</button>
 </div>;
}
