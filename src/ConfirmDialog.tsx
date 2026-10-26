import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
type Ask=(message:string,accept?:string)=>Promise<boolean>;
const Context=createContext<Ask>(async()=>false);
export const useConfirm=()=>useContext(Context);
export function ConfirmProvider({children}:{children:ReactNode}){
 const [question,setQuestion]=useState<{message:string;accept:string}|null>(null);
 const resolve=useRef<((answer:boolean)=>void)|null>(null),dialog=useRef<HTMLDialogElement>(null);
 const ask=useCallback<Ask>((message,accept='Verwerfen')=>{if(resolve.current)return Promise.resolve(false);return new Promise(answer=>{resolve.current=answer;setQuestion({message,accept});});},[]);
 function finish(answer:boolean){const pending=resolve.current;resolve.current=null;dialog.current?.close();setQuestion(null);pending?.(answer);}
 useEffect(()=>{if(!question)return;const focused=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();if(focused?.isConnected)focused.focus();};},[question]);
 useEffect(()=>()=>{resolve.current?.(false);resolve.current=null;},[]);
 return <Context.Provider value={ask}>{children}{question&&createPortal(<dialog ref={dialog} className="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-message" onCancel={e=>{e.preventDefault();finish(false);}}><header><h2 id="confirm-title">Kurz bestätigen</h2><button className="icon-button" aria-label="Schließen" onClick={()=>finish(false)}><X size={18}/></button></header><p id="confirm-message">{question.message}</p><footer><button autoFocus className="button secondary" onClick={()=>finish(false)}>Abbrechen</button><button className="button primary" onClick={()=>finish(true)}>{question.accept}</button></footer></dialog>,document.body)}</Context.Provider>;
}
