import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,ArrowRight,X} from 'lucide-react';

const steps=[
 {target:'organisations',title:'Dein gemeinsames CRM',body:'Hier findest du Kunden, Leads und Partner. Jeder im Team sieht denselben gespeicherten Stand.'},
 {target:'list',title:'Organisation finden',body:'Suche nach Name, Ort oder Kontakt und filtere nach Kunden, Leads oder Partnern. Fehlt eine Organisation, erstelle sie direkt aus den Suchergebnissen. Unter Anrufe und Prüfen zeigt diese Spalte deine Tagesliste und die offenen Übergaben.'},
 {target:'owner',title:'Status und Zuständigkeit',body:'Status und Zuständig speichern sofort. Nur die zuständige Person bekommt die Organisation in ihre Anrufliste; ist niemand zuständig, übernimmt das der Erste, der dort anruft. Daneben öffnest du die FastBill-Kundenseite.'},
 {target:'timeline',title:'Der letzte Kontakt steht oben',body:'Die Karten zeigen E-Mails, Anrufe, Meetings und Notizen. Öffne eine Karte für den vollständigen Eintrag; mit dem Stift korrigierst du Notizen und Anrufnotizen. „Notiz hinzufügen“ hält eine Notiz oder ein Meeting fest. Der weiße Telefon-Button ruft den zuletzt kontaktierten Menschen mit Telefonnummer an.'},
 {target:'contacts',title:'Menschen und Beziehungen',body:'Tippe auf eine Nummer, um anzurufen. Notiz und Ergebnis trägst du in die Anrufkarte ein, die in Chrome über allen Fenstern schwebt. Mit dem Stift bearbeitest du Kontakte direkt. Markierst du Kontaktdaten in einer geöffneten E-Mail, übernimmt „Kontakt extrahieren“ sie hierher. Verknüpfte Organisationen zeigen zum Beispiel eine betreuende Agentur.'},
 {target:'fields',title:'Notizen zur Organisation',body:'Hier hältst du fest, was für diese Organisation wichtig ist. Speichern übernimmt es ins gemeinsame CRM; ungespeicherte Entwürfe bleiben in diesem Tab.'},
 {target:'map',title:'Auf der Karte',body:'Setze einen Pin für den Standort der Organisation. Die Vorschau öffnet die große Karte mit allen anderen Organisationen, die einen Pin haben.'},
 {target:'gmail',title:'Im eigenen Postfach nachsehen',body:'Öffnet Gmail mit einer Suche nach dieser Organisation und ihren Kontaktadressen. Das CRM liest dadurch keine E-Mails. Relevante Nachrichten speicherst du danach mit der Browser-Erweiterung.'},
 {target:'calls',title:'Deine Anrufliste',body:'Erstelle eine Tagesliste aus Wiedervorlagen, Kunden mit längerer Kontaktpause und neuen Leads. Sie enthält nur Organisationen, für die du oder niemand zuständig ist; was ein Kollege heute schon auf seiner Liste hat, bleibt draußen. Tippe nach jedem Anruf ein Ergebnis an: Die Organisation kommt dann zum passenden Zeitpunkt von selbst wieder.'},
 {target:'review',title:'Übergaben erledigen',body:'Nach „E-Mail nötig“ landet die Organisation hier. Unter dem Namen steht, was zu tun ist, und der letzte Eintrag im Verlauf. Sobald die gesendete E-Mail im CRM gespeichert ist, verschwindet der Punkt von selbst; sonst auf Erledigt klicken.'},
 {target:'imports',title:'Informationen übernehmen',body:'Mit der Browser-Erweiterung speicherst du ausgewählte Gmail-Nachrichten direkt bei der passenden Organisation, Einladungen zu Videocalls auch als Meeting. Hier findest du den .eml- und den FastBill-Import.'},
 {target:'settings',title:'Dein Arbeitsplatz',body:'Im Zahnrad findest du Darstellung, Aktualisierung, den Schlüssel für die Browser-Erweiterung, Passwort ändern, die Handy-App und deine Anmeldeaktivität. Diese Einführung kannst du jederzeit über das Fragezeichen wieder starten.'},
];
type Rect={top:number;left:number;width:number;height:number};
export default function GuidedTour({onClose}:{onClose:()=>void}){
 const [available]=useState(()=>steps.filter(s=>{const el=document.querySelector(`[data-tour="${s.target}"]`);return el&&el.getClientRects().length&&!el.closest('[hidden]');}));
 const [index,setIndex]=useState(0),[rect,setRect]=useState<Rect|null>(null),[viewport,setViewport]=useState({w:window.innerWidth,h:window.innerHeight}),[cardHeight,setCardHeight]=useState(240);
 const dialog=useRef<HTMLDivElement>(null),next=useRef<HTMLButtonElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
 const step=available[index];
 useEffect(()=>{
  const focused=document.activeElement as HTMLElement|null,root=document.querySelector<HTMLElement>('.app-shell');
  const previouslyInert=root?.inert;if(root)root.inert=true;
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();closeRef.current();}
   if(e.key==='ArrowRight'){e.preventDefault();setIndex(i=>Math.min(i+1,available.length-1));}
   if(e.key==='ArrowLeft'){e.preventDefault();setIndex(i=>Math.max(0,i-1));}
   if(e.key==='Tab'){
    const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')||[]),first=controls[0],last=controls[controls.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',key);next.current?.focus();
  return()=>{document.removeEventListener('keydown',key);if(root)root.inert=!!previouslyInert;focused?.focus({preventScroll:true});};
 },[available.length]);
 useLayoutEffect(()=>{
  if(!step){closeRef.current();return;}
  const el=document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
  el?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  const measure=()=>{
   setViewport({w:window.innerWidth,h:window.innerHeight});
   if(!el||!el.getClientRects().length){setRect(null);return;}
   const r=el.getBoundingClientRect(),clip=el.closest('.detail-pane')?.getBoundingClientRect();
   const left=Math.max(8,r.left-7),top=Math.max(8,r.top-7,clip?clip.top+4:0);
   const right=Math.min(window.innerWidth-8,r.right+7),bottom=Math.min(window.innerHeight-8,r.bottom+7,clip?clip.bottom-4:window.innerHeight);
   setRect({top,left,width:Math.max(0,right-left),height:Math.max(0,bottom-top)});
   if(dialog.current)setCardHeight(dialog.current.getBoundingClientRect().height);
  };
  measure();const observer=new ResizeObserver(measure);if(el)observer.observe(el);if(dialog.current)observer.observe(dialog.current);
  window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true);
  return()=>{observer.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);};
 },[step]);
 if(!step)return null;
 const width=Math.min(360,viewport.w-32),r=rect||{top:16,left:16,width:0,height:0};
 let left=r.left,top=r.top+r.height+18;
 if(top+cardHeight>viewport.h-16){
  if(r.top-cardHeight-18>=16)top=r.top-cardHeight-18;
  else if(r.left+ r.width+width+34<viewport.w){left=r.left+r.width+18;top=r.top;}
  else if(r.left-width-18>=16){left=r.left-width-18;top=r.top;}
  else{top=viewport.h-cardHeight-16;left=viewport.w-width-16;}
 }
 left=Math.max(16,Math.min(left,viewport.w-width-16));top=Math.max(16,Math.min(top,viewport.h-cardHeight-16));
 return createPortal(<div className="guided-tour">
  <div className="tour-blocker"/>
  {rect?<><div className="tour-shade" style={{top:0,left:0,right:0,height:r.top}}/><div className="tour-shade" style={{top:r.top+r.height,left:0,right:0,bottom:0}}/><div className="tour-shade" style={{top:r.top,left:0,width:r.left,height:r.height}}/><div className="tour-shade" style={{top:r.top,left:r.left+r.width,right:0,height:r.height}}/><div className="tour-spotlight" style={r}/></>:<div className="tour-shade" style={{inset:0}}/>}
  <div className="tour-card" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" style={{top,left,width}}>
   <header><small>{index+1} / {available.length}</small><button className="icon-button" aria-label="Einführung schließen" onClick={onClose}><X size={18}/></button></header>
   <div aria-live="polite"><h2 id="tour-title">{step.title}</h2><p id="tour-body">{step.body}</p></div>
   <footer><button className="text-button" disabled={!index} onClick={()=>setIndex(i=>i-1)}><ArrowLeft size={16}/>Zurück</button><button ref={next} className="button primary" onClick={()=>index===available.length-1?onClose():setIndex(i=>i+1)}>{index===available.length-1?'Fertig':'Weiter'}<ArrowRight size={16}/></button></footer>
  </div>
 </div>,document.body);
}
