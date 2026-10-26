import '../integrations/chrome/call-card.js';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {api} from './api';
export type LiveCall={callId:string;organisation:{id:string;name:string;version:string};contact?:{id:string;name:string};phone:string;dial:string;startedAt:string;notes:string};
type Dock={readonly call:LiveCall|null;begin(prepare:()=>Promise<LiveCall>):Promise<LiveCall>;sync():Promise<void>;refresh():void};
const card=(globalThis as unknown as {stageForceCallCard:{create(options:object):Dock}}).stageForceCallCard;
type Start={organisationId:string;contactId:string;number:string};
const CallContext=createContext<{active:LiveCall|null;start:(call:Start)=>Promise<void>}>({active:null,start:async()=>{}});
export const useCall=()=>useContext(CallContext);
// One live call per user, shown by the shared call card (the same one the Gmail extension uses) in a floating window above every tab.
// The organisation view only starts calls; switching organisations or leaving the CRM tab never touches a running call.
export function CallProvider({children,onSaved,onOpen}:{children:ReactNode;onSaved:(organisationId:string)=>void;onOpen:(organisationId:string)=>void}){
 const [active,setActive]=useState<LiveCall|null>(null),handlers=useRef({onSaved,onOpen});handlers.current={onSaved,onOpen};
 const dock=useRef<Dock|null>(null);
 dock.current??=card.create({api,theme:()=>document.documentElement.dataset.theme,onChange:setActive,onSaved:(call:LiveCall)=>handlers.current.onSaved(call.organisation.id),onOpen:(id:string)=>{window.focus();handlers.current.onOpen(id);}});
 useEffect(()=>{const d=dock.current!;d.sync();let timer:ReturnType<typeof setTimeout>|undefined;const live=()=>{clearTimeout(timer);timer=setTimeout(()=>d.sync(),300);};
  // A call started or saved in Gmail or another tab arrives as a live change.
  window.addEventListener('stageforce-live',live);const theme=new MutationObserver(()=>d.refresh());theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  return()=>{clearTimeout(timer);window.removeEventListener('stageforce-live',live);theme.disconnect();};},[]);
 async function start({organisationId,contactId,number}:Start){await dock.current!.begin(()=>api({action:'callPrepare',organisationId,contactId,phone:number,requestId:crypto.randomUUID(),startedAt:new Date().toISOString()}));}
 return <CallContext.Provider value={{active,start}}>{children}</CallContext.Provider>;
}
