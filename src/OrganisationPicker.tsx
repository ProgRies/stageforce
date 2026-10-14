import {useEffect,useId,useRef,useState} from 'react';
import {ChevronDown,Check,X} from 'lucide-react';
import {normalize,text,type Entity} from './domain';

// Mount with the message ID as key: each review starts with its own selection,
// never the search text left behind by the preceding message.
export default function OrganisationPicker({entities,value,onChange,disabled=false}:{entities:Entity[];value:string;onChange:(id:string)=>void;disabled?:boolean}){
 const [query,setQuery]=useState<string|null>(null),[open,setOpen]=useState(false),[active,setActive]=useState(0);
 const input=useRef<HTMLInputElement>(null),list=useRef<HTMLDivElement>(null),uid=useId();
 const chosen=entities.find(e=>e.id===value);
 const terms=normalize(query||'').trim().split(/\s+/).filter(Boolean);
 const matches=entities.filter(e=>terms.every(term=>normalize([text(e,1),text(e,4),text(e,13)].join(' ')).includes(term)))
  .sort((a,b)=>Number(b.id===value)-Number(a.id===value)||text(a,1).localeCompare(text(b,1),'de'));
 const options=matches.slice(0,60),shown=open&&!disabled,index=Math.min(active,Math.max(0,options.length-1));
 const display=query??(chosen?text(chosen,1):value?'Organisation wird geladen …':'');
 useEffect(()=>{if(shown)list.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({block:'nearest'});},[index,shown,query]);
 function select(entity:Entity){input.current?.focus();onChange(entity.id);setQuery(null);setOpen(false);setActive(0);}
 return <div className="field span2 organisation-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
  <label htmlFor={uid}>Organisation</label>
  <div className="organisation-input">
   <input ref={input} id={uid} role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={uid+'-options'} aria-activedescendant={shown&&options.length?uid+'-option-'+index:undefined} autoComplete="off" placeholder="Organisation suchen …" disabled={disabled} value={display}
    onFocus={e=>{setOpen(true);e.currentTarget.select();}} onClick={()=>setOpen(true)}
    onChange={e=>{setQuery(e.target.value);onChange('');setOpen(true);setActive(0);}}
    onKeyDown={e=>{
     if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(shown?Math.max(0,Math.min(options.length-1,index+(e.key==='ArrowDown'?1:-1))):0);}
     if(e.key==='Enter'&&shown){e.preventDefault();if(options[index])select(options[index]);}
     if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);}
    }}/>
   {(value||query)&&<button type="button" className="icon-button tiny" aria-label="Organisation leeren" disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange('');setQuery('');setActive(0);setOpen(true);input.current?.focus();}}><X size={15}/></button>}
   <button type="button" className="icon-button tiny" aria-label={shown?'Treffer schließen':'Organisationen anzeigen'} disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>{input.current?.focus();setOpen(!shown);}}><ChevronDown size={16}/></button>
  </div>
  {shown&&<div className="organisation-suggestions">
   <div id={uid+'-options'} role="listbox" aria-label="Passende Organisationen" className="organisation-options" ref={list}>
    {options.map((entity,i)=><button type="button" role="option" id={uid+'-option-'+i} data-index={i} tabIndex={-1} aria-selected={entity.id===value} className={i===index?'active':''} key={entity.id} onMouseDown={e=>e.preventDefault()} onClick={()=>select(entity)}>
     <span><strong>{text(entity,1)}</strong><small>{[text(entity,4)||text(entity,2),text(entity,13)].filter(Boolean).join(' · ')}</small></span>{entity.id===value&&<Check size={16}/>}
    </button>)}
   </div>
   {!options.length&&<p role="status">Keine passende Organisation.</p>}
   {matches.length>60&&<p role="status">60 von {matches.length.toLocaleString('de-DE')} · Suche eingrenzen</p>}
  </div>}
 </div>;
}
