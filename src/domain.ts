export type CellValue = string | number;
export type Entity = { id: string; row: number; values: CellValue[]; version: string };
export type EntityLink = { id: string; a: string; b: string; note: string };
export const HEADERS = ["Entität-ID","Name","Entitätstyp","FastBill-Link (manuell)","Ort","Bundesland","Website","Größe","Größenmaß","Beziehungsstatus","Vertriebsphase","Zuständig intern","Hauptkontakt","E-Mail","Telefon","Letzter belegter Kontakt","Nächster Schritt","Wiedervorlage","Kurzüberblick","Prüfbedarf","Kontakte JSON","Historie JSON","Verknüpfte Entitäten JSON","Quellen JSON"];
export const STATUSES = ["Kunde","Lead","Unklar","Ehemaliger Kunde"];
export const PHASES = ["Unbearbeitet","Kontaktaufnahme","Im Gespräch","Termin vereinbart","Angebot","Testphase","Gewonnen","Aktuell kein Bedarf","Verloren","Unklar"];
export const TYPES = ["Stadt/Gemeinde","Landkreis","Landesregierung","Bundesministerium","Landesministerium","Landeseinrichtung","Bundeseinrichtung","Sonstige öffentliche Einrichtung","Schule","Hochschule/Universität","NGO/Verband","Unternehmen","Agentur","Sonstiges","Unklar"];
export function text(e: Entity, col: number) { return String(e.values[col] ?? ""); }
export function jsonList(value: unknown): any[] { try { const x = JSON.parse(String(value || "[]")); return Array.isArray(x) ? x : []; } catch { return []; } }
export function todayBerlin() { return new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
export function dateISO(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return new Date((Math.floor(value)-25569)*86400000).toISOString().slice(0,10);
  const s = String(value || ""); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
export function validDate(s: string) { if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+"T12:00:00Z");return !isNaN(+d)&&d.toISOString().slice(0,10)===s; }
export function serialDate(s: string) { if(!validDate(s)) throw new Error("Ungültiges Datum."); return Date.parse(s+"T00:00:00Z")/86400000+25569; }
export function formatDate(value: unknown) { const s=dateISO(value); return s ? new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(new Date(s+"T12:00:00Z")) : "—"; }
export function fastbillURL(value: unknown): string { try { const u=new URL(String(value)); return u.protocol==="https:" && !u.username && !u.password && (u.hostname==="fastbill.com"||u.hostname.endsWith(".fastbill.com")) ? u.href : ""; } catch { return ""; } }
// A normal browser shortcut, with no mailbox API or extra permission.
export function gmailSearch(e:Entity,mailbox:string) {
 const name=text(e,1).replace(/^(?:Stadtverwaltung|Stadt|Gemeinde)\s+(?:der\s+)?/i,'').trim()||text(e,1);
 const phrase=Array.from(name.replace(/["{}\r\n]/g,' ').replace(/\s+/g,' ').trim()).slice(0,100).join('');
 const addresses=[text(e,13),...jsonList(e.values[20]).flatMap(c=>Array.isArray(c.e_mails)?c.e_mails:[])];
 const emails=[...new Set(addresses.flatMap(a=>String(a).match(/[a-z0-9.!#$%&'*+/=?^_`|~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)||[]).map(a=>a.toLowerCase()))].filter(a=>a!==mailbox.toLowerCase()).slice(0,12);
 const terms=phrase?[`"${phrase}"`]:[];
 const asQuery=(parts:string[])=>parts.length>1?`{${parts.join(' ')}}`:parts[0]||'';
 const base=`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(mailbox)}#search/`;
 for(const email of emails){const next=[...terms,`from:${email}`,`to:${email}`];if((base+encodeURIComponent(asQuery(next))).length<=1900)terms.push(`from:${email}`,`to:${email}`);}
 const query=asQuery(terms);
 return {query,url:base+encodeURIComponent(query)};
}
export function websiteURL(value: unknown) { const s=String(value||"").trim(); if(!s)return "";try{const u=new URL(/^https?:\/\//i.test(s)?s:"https://"+s);return ["http:","https:"].includes(u.protocol)&&!u.username&&!u.password?u.href:"";}catch{return "";} }
export function needsFastbill(e: Entity) { return ["Kunde","Ehemaliger Kunde"].includes(text(e,9)) || text(e,10)==="Angebot"; }
export function phone(e: Entity) { const primary=text(e,14).trim();if(primary.replace(/\D/g,"").length>=6)return primary; for(const c of jsonList(e.values[20]))for(const p of c.telefone||[])if(String(p).replace(/\D/g,"").length>=6)return String(p);return ""; }
export const REVIEW_CATEGORIES = [
  {id:"fastbill",label:"FastBill-Link",source:"field",description:"Fehlender oder ungültiger Link bei Kunden, ehemaligen Kunden oder offenen Angeboten."},
  {id:"phone",label:"Telefonnummer",source:"field",description:"Keine verwendbare Telefonnummer hinterlegt."},
  {id:"status",label:"Kundenstatus prüfen",source:"field",description:"Zahlungspflicht bei gewonnenen Leads oder bisher unklarem/ehemaligem Kundenstatus prüfen."},
  {id:"note-billing",label:"Vertrag & Rechnung",source:"note",description:"Prüfnotizen zu Vertragspartnern, Rechnungsempfängern und Abrechnung."},
  {id:"note-relationship",label:"Organisation & Verknüpfung",source:"note",description:"Prüfnotizen zu Agenturen, Zuordnung und möglichen Dubletten."},
  {id:"note-status",label:"Kundenstatus & Nutzung",source:"note",description:"Prüfnotizen zu Kundenstatus, Angeboten, Tests und Nutzung."},
  {id:"note-contact",label:"Kontakt & Zuständigkeit",source:"note",description:"Prüfnotizen zu Kontaktdaten, Ansprechpartnern und Zuständigkeit."},
  {id:"note-other",label:"Weitere Prüfnotizen",source:"note",description:"Offene Notizen ohne eindeutig erkennbares Thema."},
] as const;
export type ReviewCategoryId = typeof REVIEW_CATEGORIES[number]['id'];
export type ReviewSelection = ReviewCategoryId | 'all';
export type ReviewFinding = {source:'field'|'note';categories:ReviewCategoryId[];text:string};
// Routing by topic only, never an interpretation of whether a note is true or resolved.
// Keep the whole original note even when it mentions multiple topics or confirmed facts.
export function reviewFindings(e:Entity):ReviewFinding[]{
  const out:ReviewFinding[]=[];
  const note=text(e,19).trim();
  if(note){
    const n=normalize(note),categories:ReviewCategoryId[]=[];
    if(/vertrag|rechnung|fastbill|abrechn|zahlung|bezahlt|zahlend|zahler|billing|invoice/.test(n))categories.push('note-billing');
    if(/agentur|verknupf|zuordn|dublett|duplikat|identitat|rechtstrager|tochter|verbund|endkund|ministerium|organisation|agency|duplicate/.test(n))categories.push('note-relationship');
    if(/kundenstatus|beziehungsstatus|vertriebsphase|kundschaft|bestandskund|ehemalig|kund[e ]|nutz|betrieb|betreib|aktiv|kundig|angebot|trial|testphase|lizenz|laufzeit|status|gewonnen|paying|customer/.test(n))categories.push('note-status');
    if(/kontakt|ansprech|zustand|telefon|e[ -]?mail|rufnummer|durchwahl|contact/.test(n))categories.push('note-contact');
    if(!categories.length)categories.push('note-other');
    out.push({source:'note',categories,text:note.replace(/^Manuell prüfen:\s*/i,'')});
  }
  if(needsFastbill(e)&&!fastbillURL(e.values[3]))out.push({source:'field',categories:['fastbill'],text:text(e,3)?'FastBill-Link ist nicht gültig.':'FastBill-Link fehlt.'});
  if(!phone(e))out.push({source:'field',categories:['phone'],text:'Telefonnummer fehlt.'});
  if(!['Kunde','Lead'].includes(text(e,9)))out.push({source:'field',categories:['status'],text:'Zahlenden Kundenstatus prüfen; bisher: '+(text(e,9)||'unbekannt')+'.'});
  if(text(e,9)==='Lead'&&text(e,10)==='Gewonnen')out.push({source:'field',categories:['status'],text:'Als Lead mit Phase Gewonnen geführt: Zahlungspflicht prüfen.'});
  return out;
}
export function findingsFor(findings:ReviewFinding[],category:ReviewSelection){return category==='all'?findings:findings.filter(f=>f.categories.includes(category));}
export function reviewOverview(entities:Entity[]){
  const findings=new Map(entities.map(e=>[e.id,reviewFindings(e)]));
  const counts=Object.fromEntries(REVIEW_CATEGORIES.map(c=>[c.id,0])) as Record<ReviewCategoryId,number>;
  let affected=0;
  for(const list of findings.values()){
    if(list.length)affected++;
    for(const category of new Set(list.flatMap(f=>f.categories)))counts[category]++;
  }
  return {findings,counts,affected};
}
export function issues(e: Entity) {return reviewFindings(e).map(f=>f.text);}
export function normalize(s: string) { return s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu,""); }
export function searchText(e: Entity) { return normalize(e.values.map(v=>String(v)).join(" ")); }
export function contactAge(e: Entity, today=todayBerlin()): number | null { const d=dateISO(e.values[15]);return d?Math.max(0,Math.floor((Date.parse(today)-Date.parse(d))/86400000)):null; }
export function contactLabel(e: Entity) { const days=contactAge(e);return days===null?"Kontakt unbekannt":days===0?"Heute kontaktiert":days===1?"Gestern kontaktiert":`Vor ${days} Tagen`; }
export type QueueItem = {id:string; reason:string; kind:"followup"|"customer"|"warm"|"cold"};
export function buildQueue(entities:Entity[], count=30, staleDays=90, customerShare=.6, today=todayBerlin()):QueueItem[] {
  const max=Math.max(1,Math.min(100,Math.floor(count)));const active=entities.filter(e=>text(e,9)!=="Ehemaliger Kunde"&&!["Verloren","Aktuell kein Bedarf"].includes(text(e,10))),eligible=active.filter(e=>phone(e));
  const customer=(e:Entity)=>text(e,9)==="Kunde";
  const cold=(e:Entity)=>!customer(e)&&["Unbearbeitet","Kontaktaufnahme","Unklar",""].includes(text(e,10));
  const overdue=(e:Entity)=>{const d=dateISO(e.values[17]);return d&&d<=today;};
  const recency=(a:Entity,b:Entity)=>(contactAge(b,today)??-1)-(contactAge(a,today)??-1)||text(a,1).localeCompare(text(b,1),"de");
  const out:QueueItem[]=[],used=new Set<string>();
  const take=(list:Entity[],limit:number,kind:QueueItem['kind'],reason:(e:Entity)=>string)=>{let added=0;for(const e of list){if(out.length>=max||added>=limit)break;if(used.has(e.id))continue;used.add(e.id);out.push({id:e.id,kind,reason:reason(e)});added++;}};
  // Due callbacks always come first and are never capped; without a number they still show so the callback is not lost.
  take(active.filter(overdue).sort((a,b)=>dateISO(a.values[17]).localeCompare(dateISO(b.values[17]))),max,"followup",e=>`Wiedervorlage ${formatDate(e.values[17])}${phone(e)?"":" · keine Nummer"}`);
  const target=Math.round(max*Math.min(.9,Math.max(.1,customerShare))),already=out.filter(q=>customer(active.find(e=>e.id===q.id)!)).length;
  const neglected=eligible.filter(e=>customer(e)&&(contactAge(e,today)===null||(contactAge(e,today)??0)>=staleDays)).sort(recency);
  take(neglected,Math.max(0,target-already),"customer",e=>contactAge(e,today)===null?"Kunde · Kontakt unbekannt":`Kunde · ${contactAge(e,today)} Tage ohne Kontakt`);
  const warm=eligible.filter(e=>!customer(e)&&!cold(e)).sort((a,b)=>{const ranks:Record<string,number>={"Angebot":0,"Testphase":1,"Termin vereinbart":2,"Im Gespräch":3};return (ranks[text(a,10)]??9)-(ranks[text(b,10)]??9)||recency(a,b);});
  const remaining=max-out.length;take(warm,Math.ceil(remaining/2),"warm",e=>`Lead · ${text(e,10)}`);
  take(eligible.filter(cold).sort(recency),max-out.length,"cold",()=>"Neuer Kontakt");
  take(warm,max-out.length,"warm",e=>`Lead · ${text(e,10)}`);take(neglected,max-out.length,"customer",e=>contactLabel(e));return out;
}
