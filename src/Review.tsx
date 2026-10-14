import {useEffect,useState} from 'react';
import {ChevronRight,Search,X,Check} from 'lucide-react';
import {REVIEW_CATEGORIES,findingsFor,normalize,searchText,text,type Entity,type ReviewSelection,type ReviewCategoryId,type ReviewFinding} from './domain';

type Overview={findings:Map<string,ReviewFinding[]>;counts:Record<ReviewCategoryId,number>;affected:number};
export function ReviewCategories({overview,selected,onSelect,loading}:{overview:Overview;selected:ReviewSelection;onSelect:(id:ReviewSelection)=>void;loading:boolean}){
 return <div className="review-categories">
  <div className="review-categories-heading"><strong>Prüfbedarf</strong><p>Nach Thema bearbeiten</p></div>
  <button className={`review-category ${selected==='all'?'selected':''}`} aria-pressed={selected==='all'} disabled={loading} onClick={()=>onSelect('all')}><span>Alle betroffenen Organisationen</span><b>{overview.affected.toLocaleString('de-DE')}</b></button>
  {(['field','note'] as const).map(source=><section key={source}><h3>{source==='field'?'Automatische Checks':'Themen in Prüfnotizen'}</h3>{REVIEW_CATEGORIES.filter(c=>c.source===source).map(c=><button key={c.id} className={`review-category ${selected===c.id?'selected':''}`} aria-pressed={selected===c.id} disabled={loading} onClick={()=>onSelect(c.id)}><span>{c.label}</span><b>{overview.counts[c.id].toLocaleString('de-DE')}</b><ChevronRight size={14}/></button>)}</section>)}
  <p className="review-count-note">Gezählt werden Organisationen. Eine Organisation kann in mehreren Gruppen stehen.</p>
 </div>;
}
export function ReviewResults({entities,overview,category,onPick,loading,failed}:{entities:Entity[];overview:Overview;category:ReviewSelection;onPick:(id:string)=>void;loading:boolean;failed:boolean}){
 const[query,setQuery]=useState(''),[filter,setFilter]=useState('Alle'),[limit,setLimit]=useState(60);
 useEffect(()=>{setLimit(60);},[category,query,filter]);
 const definition=REVIEW_CATEGORIES.find(c=>c.id===category);
 const members=entities.filter(e=>findingsFor(overview.findings.get(e.id)||[],category).length);
 const terms=normalize(query).trim().split(/\s+/).filter(Boolean);
 const shown=members.filter(e=>(filter==='Alle'||text(e,9)===filter)&&terms.every(t=>searchText(e).includes(t))).sort((a,b)=>text(a,1).localeCompare(text(b,1),'de'));
 return <div className="review-results">
  <header><div><h2>{definition?.label||'Offener Prüfbedarf'}</h2><p>{definition?.description||'Fehlende Angaben und offene Prüfnotizen, thematisch sortiert.'}</p></div><span className="review-total">{members.length.toLocaleString('de-DE')}</span></header>
  {definition?.source==='note'&&<p className="review-topic-note">Nach Stichworten gruppiert. Die vollständige Notiz bleibt erhalten und muss inhaltlich geprüft werden.</p>}
  <div className="review-search searchbox"><Search size={18}/><input aria-label="Organisationen in dieser Prüfgruppe suchen" placeholder="In dieser Gruppe suchen" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="icon-button tiny" aria-label="Suche löschen" onClick={()=>setQuery('')}><X size={14}/></button>}</div>
  <div className="filter-row">{['Alle','Kunde','Lead'].map(f=><button key={f} className={`filter ${filter===f?'active':''}`} onClick={()=>setFilter(f)}>{f==='Kunde'?'Kunden':f==='Lead'?'Leads':f}</button>)}<span>{shown.length.toLocaleString('de-DE')}</span></div>
  {loading&&!entities.length?<p className="muted">CRM wird geladen …</p>:failed&&!entities.length?<p className="muted">Prüfbedarf konnte nicht geladen werden. Bitte erneut laden.</p>:shown.length?<div className="review-result-list">{shown.slice(0,limit).map(e=><button className="review-result" key={e.id} onClick={()=>onPick(e.id)}><div><strong>{text(e,1)}</strong><span className="review-result-meta">{[text(e,9),text(e,4)||text(e,2)].filter(Boolean).join(' · ')}</span><p>{findingsFor(overview.findings.get(e.id)||[],category).map(f=>f.text).join(' · ')}</p></div><ChevronRight size={17}/></button>)}</div>:<div className="review-empty">{members.length?<Search size={30}/>:<Check size={30}/>}<h3>{members.length?'Keine Treffer':'Hier ist nichts offen.'}</h3><p>{members.length?'Suche oder Filter anpassen.':'Wähle eine andere Gruppe, um weiterzumachen.'}</p>{members.length>0&&<button className="text-button" onClick={()=>{setQuery('');setFilter('Alle');}}>Filter zurücksetzen</button>}</div>}
  {shown.length>limit&&<button className="load-more" onClick={()=>setLimit(v=>v+100)}>Weitere anzeigen <ChevronRight size={14}/></button>}
 </div>;
}
