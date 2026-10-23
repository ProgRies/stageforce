import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {UserRoundPlus} from 'lucide-react';
import {extractContact,type ContactSuggestion} from './contactExtraction';
type Props={body:string;messageId:string;disabled:boolean;onExtract:(draft:ContactSuggestion)=>void};
export default function ContactSelection({body,messageId,disabled,onExtract}:Props){
 const content=useRef<HTMLPreElement>(null);
 const [selection,setSelection]=useState<{text:string;x:number;y:number}|null>(null);
 useEffect(()=>{
  function update(){
   const s=window.getSelection();
   if(disabled||!s||s.isCollapsed||!s.rangeCount||!content.current?.contains(s.anchorNode)||!content.current.contains(s.focusNode)){setSelection(null);return;}
   const text=s.toString().trim();if(!text){setSelection(null);return;}
   const box=s.getRangeAt(0).getBoundingClientRect();
   setSelection({text,x:Math.max(12,Math.min(window.innerWidth-240,box.left)),y:Math.max(12,Math.min(window.innerHeight-52,box.bottom+8))});
  }
  const clear=()=>setSelection(null);
  document.addEventListener('selectionchange',update);window.addEventListener('resize',clear);window.addEventListener('scroll',clear,true);update();
  return()=>{document.removeEventListener('selectionchange',update);window.removeEventListener('resize',clear);window.removeEventListener('scroll',clear,true);};
 },[disabled,body]);
 return <><pre ref={content} className="email-body">{body||'(Kein Nachrichtentext)'}</pre>{selection&&createPortal(<button type="button" className="extract-contact-action" style={{left:selection.x,top:selection.y}} disabled={selection.text.length>10000} onMouseDown={e=>e.preventDefault()} onClick={()=>{onExtract({...extractContact(selection.text),messageId});window.getSelection()?.removeAllRanges();setSelection(null);}}><UserRoundPlus size={16}/>{selection.text.length>10000?'Bitte weniger Text markieren':'Kontakt extrahieren'}</button>,document.body)}</>;
}
