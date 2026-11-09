import {useCallback,useEffect,useRef,useState} from 'react';
// One shared copy-to-clipboard helper: `copied` holds the key of what was just copied for a moment,
// so every copy button can briefly swap its icon to a checkmark and say "Kopiert".
export function useCopy(ms=1600){
 const[copied,setCopied]=useState<string|null>(null),timer=useRef<number|undefined>(undefined);
 useEffect(()=>()=>window.clearTimeout(timer.current),[]);
 const reset=useCallback(()=>{window.clearTimeout(timer.current);setCopied(null);},[]);
 const copy=useCallback(async(text:string,key:string=text)=>{
  try{await navigator.clipboard.writeText(text);}catch{return false;}
  window.clearTimeout(timer.current);setCopied(key);timer.current=window.setTimeout(()=>setCopied(null),ms);return true;
 },[ms]);
 return{copied,copy,reset};
}
