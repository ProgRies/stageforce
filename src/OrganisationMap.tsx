import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {MapPin,X,Search,Check,Trash2,Plus,Minus} from 'lucide-react';
import {api} from './api';
import {useConfirm} from './ConfirmDialog';
import {text,organisationSubtitle,type Entity,type MapPin as Pin} from './domain';
type Props={entity:Entity;entities:Entity[];disabled:boolean;onSaved:(entity?:Entity)=>void;onPick:(id:string)=>Promise<boolean>|void;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void};
// Tiles come from our own server (see server/map.mjs), so the browser never talks to the map provider.
const TILES='/api/map/tile/{z}/{x}/{y}.png',ATTRIBUTION='© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
const GERMANY:[number,number]=[51.16,10.45];
const icon=(current:boolean)=>L.divIcon({className:current?'map-pin-icon current':'map-pin-icon',html:'<span class="map-pin"></span>',iconSize:current?[28,28]:[20,20],iconAnchor:current?[14,28]:[10,20]});
const same=(a?:Pin|null,b?:Pin|null)=>a?.lat===b?.lat&&a?.lng===b?.lng;
// Names go in as text, never as HTML.
function label(e:Entity,onOpen?:()=>void){const box=document.createElement('div');box.className='map-label';const name=document.createElement('strong');name.textContent=text(e,1);box.append(name);const sub=organisationSubtitle(e);if(sub){const small=document.createElement('small');small.textContent=sub;box.append(small);}if(onOpen){const b=document.createElement('button');b.type='button';b.className='button secondary small';b.textContent='Öffnen';b.addEventListener('click',onOpen);box.append(b);}return box;}
function baseMap(node:HTMLElement,options:L.MapOptions={}){const map=L.map(node,{zoomSnap:.5,...options});map.attributionControl?.setPrefix(false);L.tileLayer(TILES,{maxZoom:19,attribution:ATTRIBUTION}).addTo(map);return map;}

export default function OrganisationMap({entity,entities,disabled,onSaved,onPick,onDirtyChange,onBusyChange}:Props){
 const [open,setOpen]=useState<null|'view'|'edit'>(null);
 const preview=useRef<HTMLDivElement>(null),previewMap=useRef<L.Map|null>(null),others=entities.filter(e=>e.location&&e.id!==entity.id);
 useEffect(()=>{if(!entity.location||!preview.current)return;const map=baseMap(preview.current,{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,touchZoom:false}).setView(entity.location,12);previewMap.current=map;
  for(const e of others)L.marker(e.location!,{icon:icon(false),interactive:false,keyboard:false}).addTo(map);L.marker(entity.location,{icon:icon(true),interactive:false,keyboard:false}).addTo(map);return()=>{map.remove();previewMap.current=null;};},[entity.location?.lat,entity.location?.lng,others.map(e=>e.id+e.location!.lat+e.location!.lng).join()]);
 return <section className="organisation-map" aria-label="Standort">
  {entity.location&&<><div className="map-preview"><button type="button" className="map-preview-open" aria-label="Karte öffnen" disabled={disabled} onClick={()=>setOpen('view')}><div ref={preview}/></button><div className="map-zoom"><button type="button" aria-label="Vergrößern" onClick={()=>previewMap.current?.zoomIn()}><Plus size={14}/></button><button type="button" aria-label="Verkleinern" onClick={()=>previewMap.current?.zoomOut()}><Minus size={14}/></button></div></div><small className="map-credit">© OpenStreetMap</small></>}
  <div className="map-actions">{entity.location?<><button type="button" className="text-button" disabled={disabled} onClick={()=>setOpen('view')}><MapPin size={14}/>Karte</button><button type="button" className="text-button" disabled={disabled} onClick={()=>setOpen('edit')}>Pin ändern</button></>:<button type="button" className="text-button" disabled={disabled} onClick={()=>setOpen('edit')}><MapPin size={14}/>Pin auf Karte setzen</button>}</div>
  {open&&<MapDialog entity={entity} others={others} startEditing={open==='edit'} onClose={()=>setOpen(null)} onSaved={onSaved} onPick={onPick} onDirtyChange={onDirtyChange} onBusyChange={onBusyChange}/>}
 </section>;
}

function MapDialog({entity,others,startEditing,onClose,onSaved,onPick,onDirtyChange,onBusyChange}:{entity:Entity;others:Entity[];startEditing:boolean;onClose:()=>void}&Pick<Props,'onSaved'|'onPick'|'onDirtyChange'|'onBusyChange'>){
 const ask=useConfirm();
 const dialog=useRef<HTMLDialogElement>(null),node=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),pin=useRef<L.Marker|null>(null);
 const [editing,setEditing]=useState(startEditing),[draft,setDraft]=useState<Pin|null>(entity.location||null),[query,setQuery]=useState(text(entity,4).replace(/^Unklar$/,'')),[results,setResults]=useState<{label:string;lat:number;lng:number}[]|null>(null),[searching,setSearching]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dirty=editing&&!same(draft,entity.location);
 const editingRef=useRef(editing);editingRef.current=editing;
 useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false);},[dirty,onDirtyChange]);
 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
 useEffect(()=>{const focused=document.activeElement as HTMLElement|null;dialog.current?.showModal();
  const m=baseMap(node.current!);map.current=m;
  for(const e of others)L.marker(e.location!,{icon:icon(false),title:text(e,1)}).on('popupopen',ev=>ev.target.closeTooltip()).bindTooltip(label(e),{direction:'top',offset:[0,-18]}).bindPopup(label(e,async()=>{if(await onPick(e.id)!==false)onClose();}),{offset:[0,-14]}).addTo(m);
  const city=text(entity,4).trim().toLowerCase(),neighbours=others.filter(e=>city&&text(e,4).trim().toLowerCase()===city);
  if(entity.location)m.setView(entity.location,startEditing?15:11);
  else if(neighbours.length)m.setView([neighbours.reduce((s,e)=>s+e.location!.lat,0)/neighbours.length,neighbours.reduce((s,e)=>s+e.location!.lng,0)/neighbours.length],12);
  else if(others.length)m.fitBounds(L.latLngBounds(others.map(e=>e.location!)),{padding:[40,40],maxZoom:11});
  else m.setView(GERMANY,6);
  m.on('click',e=>{if(editingRef.current)setDraft({lat:e.latlng.lat,lng:e.latlng.lng});});
  requestAnimationFrame(()=>m.invalidateSize());
  return()=>{m.remove();map.current=null;pin.current=null;dialog.current?.close();if(focused?.isConnected)focused.focus();};},[]);
 // The organisation's own pin; draggable while editing.
 useEffect(()=>{const m=map.current;if(!m)return;pin.current?.remove();pin.current=null;const at=editing?draft:entity.location;if(!at)return;
  const marker=L.marker(at,{icon:icon(true),draggable:editing,title:text(entity,1),zIndexOffset:1000,autoPan:true}).addTo(m);if(!editing)marker.bindTooltip(label(entity),{direction:'top',offset:[0,-26]});marker.on('dragend',()=>{const p=marker.getLatLng();setDraft({lat:p.lat,lng:p.lng});});pin.current=marker;},[editing,draft?.lat,draft?.lng,entity.location?.lat,entity.location?.lng]);
 async function close(){if(busy)return;if(dirty&&!await ask('Pin-Änderung verwerfen?'))return;onClose();}
 async function search(){if(searching||!query.trim())return;setSearching(true);setError('');try{const r=await api({action:'mapSearch',query});setResults(r.items);if(r.items.length===1)choose(r.items[0]);}catch(e:any){setError(e.message);}finally{setSearching(false);}}
 function choose(p:{lat:number;lng:number}){map.current?.setView(p,16);setDraft({lat:p.lat,lng:p.lng});}
 async function save(location:Pin|null){if(busy)return;setBusy(true);setError('');try{const r=await api({action:'locationSave',id:entity.id,version:entity.version,location});onSaved(r.entity);if(!location)onClose();else{setEditing(false);map.current?.setView(location,Math.min(map.current.getZoom(),11));}}catch(e:any){setError(e.message);if(e.status==='conflict')onSaved();}finally{setBusy(false);}}
 return createPortal(<dialog ref={dialog} className="map-dialog" aria-labelledby="map-title" onCancel={e=>{e.preventDefault();close();}}>
  <header><div><h2 id="map-title">{editing?(entity.location?'Pin verschieben':'Pin setzen'):'Karte'}</h2><small>{text(entity,1)}</small></div><button className="icon-button" aria-label="Karte schließen" disabled={busy} onClick={close}><X size={18}/></button></header>
  {editing&&<form className="map-search" onSubmit={e=>{e.preventDefault();search();}}><label className="searchbox"><Search size={16}/><input aria-label="Ort oder Adresse suchen" placeholder="Ort oder Adresse suchen" value={query} maxLength={120} onChange={e=>{setQuery(e.target.value);setResults(null);}}/></label><button className="button secondary" disabled={searching||!query.trim()}>{searching?'Sucht …':'Suchen'}</button>
   {results&&results.length!==1&&<ul className="map-results">{results.length?results.map((r,i)=><li key={i}><button type="button" onClick={()=>{choose(r);setResults(null);}}>{r.label}</button></li>):<li className="muted">Nichts gefunden. Du kannst den Pin auch direkt auf die Karte klicken.</li>}</ul>}</form>}
  <div className="map-canvas" ref={node}/>
  {error&&<p className="save-error" role="alert">{error}</p>}
  <footer>{editing?<><p className="muted">{draft?'Pin ziehen oder auf die Karte klicken, um ihn zu verschieben.':'Auf die Karte klicken, um den Pin zu setzen.'}</p>{entity.location&&<button className="button secondary" disabled={busy} onClick={async()=>{if(await ask('Pin dieser Organisation entfernen?','Entfernen'))save(null);}}><Trash2 size={15}/>Entfernen</button>}<button className="button secondary" disabled={busy} onClick={()=>{if(!entity.location)return close();setDraft(entity.location);setEditing(false);}}>Abbrechen</button><button className="button primary" disabled={busy||!draft||!dirty} onClick={()=>save(draft)}><Check size={15}/>{busy?'Speichert …':'Speichern'}</button></>
   :<><p className="muted">{others.length===1?'1 weitere Organisation':`${others.length} weitere Organisationen`} auf der Karte</p><button className="button secondary" onClick={()=>{setDraft(entity.location||null);setEditing(true);}}><MapPin size={15}/>{entity.location?'Pin verschieben':'Pin setzen'}</button></>}</footer>
 </dialog>,document.body);
}
