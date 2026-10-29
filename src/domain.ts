export type CellValue = string | number;
export type UpcomingMeeting = { date: string; text: string };
export type MapPin = { lat: number; lng: number };
export type Entity = { id: string; row: number; values: CellValue[]; version: string; ownerId?: string; reservedBy?: string; upcoming?: UpcomingMeeting|null; location?: MapPin|null; followUpTime?: string; followUpSource?: FollowUpSource|null };
export type FollowUpSource = { at: string; by: string; outcome: string|null };
export type TeamUser = { id: string; name: string; email: string };
export type EntityLink = { id: string; a: string; b: string; note: string };
export const HEADERS = ["Entität-ID","Name","Entitätstyp","FastBill-Link (manuell)","Ort","Bundesland","Website","Größe","Größenmaß","Beziehungsstatus","Vertriebsphase","Zuständig intern","Hauptkontakt","E-Mail","Telefon","Letzter belegter Kontakt","Nächster Schritt","Wiedervorlage","Kurzüberblick","Prüfbedarf","Kontakte JSON","Historie JSON","Verknüpfte Entitäten JSON","Quellen JSON"];
export const STATUSES = ["Kunde","Lead","Partner / Agentur","Unklar","Ehemaliger Kunde"];
export const PHASES = ["Unbearbeitet","Kontaktaufnahme","Im Gespräch","Termin vereinbart","Angebot","Testphase","Gewonnen","Aktuell kein Bedarf","Verloren","Unklar"];
export const TYPES = ["Stadt/Gemeinde","Landkreis","Landesregierung","Bundesministerium","Landesministerium","Landeseinrichtung","Bundeseinrichtung","Sonstige öffentliche Einrichtung","Schule","Hochschule/Universität","NGO/Verband","Unternehmen","Agentur","Sonstiges","Unklar"];
export function text(e: Entity, col: number) { return String(e.values[col] ?? ""); }
// German national numbers (0…) and 00 prefixes become international; other numbers keep their spelling.
export function formatPhone(value:unknown):string {
 let s=String(value??'').trim().replace(/^\((0\d+)\)\s*/,'$1 ').replace(/\s*\(0\)\s*/g,' ').replace(/\s*\/\s*/g,' ').replace(/\s+/g,' ').trim();
 if(/^00[1-9]/.test(s))s='+'+s.slice(2);else if(/^0[1-9]/.test(s))s='+49 '+s.slice(1);
 return s;
}
export function contactName(name:unknown,address:unknown):string {
 const local=String(address||'').trim().split('@')[0].split('+')[0];
 // Gmail repeats the address's local part as the name when there is no display name ("margaretha.mohr").
 const supplied=String(name||'').trim();if(supplied&&!supplied.includes('@')&&supplied.toLowerCase()!==local.toLowerCase())return supplied;
 if(!/\p{L}/u.test(local))return '';
 return local.split(/[._-]+/).filter(Boolean).map(part=>part.charAt(0).toLocaleUpperCase()+part.slice(1).toLocaleLowerCase()).join(' ').slice(0,300);
}
export function organisationSubtitle(e:Entity){const city=text(e,4).trim(),type=text(e,2).trim();return city&&city!=='Unklar'?city:type&&type!=='Unklar'?type:'';}
export function jsonList(value: unknown): any[] { try { const x = JSON.parse(String(value || "[]")); return Array.isArray(x) ? x : []; } catch { return []; } }
export function todayBerlin() { return new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
export function dateISO(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return new Date((Math.floor(value)-25569)*86400000).toISOString().slice(0,10);
  const s = String(value || ""); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
export function validDate(s: string) { if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+"T12:00:00Z");return !isNaN(+d)&&d.toISOString().slice(0,10)===s; }
// "heute", "morgen" or "Di., 03.11." for a planned meeting.
export function meetingWhen(date:string,today=todayBerlin()){const days=Math.round((Date.parse(date+"T12:00:00Z")-Date.parse(today+"T12:00:00Z"))/86400000);if(days===0)return "heute";if(days===1)return "morgen";return new Intl.DateTimeFormat("de-DE",{weekday:"short",day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(date+"T12:00:00Z"));}
export function latestMeetingDate(today=todayBerlin()){const d=new Date(today+"T12:00:00Z");d.setUTCFullYear(d.getUTCFullYear()+2);return d.toISOString().slice(0,10);}
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
export function phone(e: Entity) { const primary=text(e,14).trim();if(primary.replace(/\D/g,"").length>=6)return primary; for(const c of jsonList(e.values[20]))for(const p of c.telefone||[])if(String(p).replace(/\D/g,"").length>=6)return String(p);return ""; }
// One tap after a call decides when the organisation comes back ("Speichern" in server/calls.mjs leaves it as it is).
// "Kein Interesse" is no longer on the card; it stays here so older extensions and records keep working. Nobody drops out for good unless
// the phase is set to "Verloren" by hand.
export const CALL_OUTCOMES = {
  not_reached:{label:"Nicht erreicht",days:2,next:"Erneut anrufen",contacted:false},
  callback:{label:"Später anrufen",days:1,next:"Rückruf vereinbart",contacted:true},
  meeting:{label:"Termin",days:14,next:"Nach dem Termin nachfassen",contacted:true,phase:"Termin vereinbart"},
  email:{label:"E-Mail nötig",days:7,next:"Nach der E-Mail nachfassen",contacted:true,review:"E-Mail senden"},
  no_interest:{label:"Kein Interesse",days:365,next:"In einem Jahr wieder anrufen",contacted:true,phase:"Aktuell kein Bedarf"},
} as const;
export type CallOutcome = keyof typeof CALL_OUTCOMES;
export const BOOKING_URL = "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2Ihic54_5fuPXHGTSxvpiy_8_KR4baKXWw4HJlO5-0nlCL5JI7wwinxG4mSJzzk4cRpPZbPD4F";
export function addDays(date:string,days:number){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function addMonths(date:string,months:number){const d=new Date(date+"T12:00:00Z"),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));return d.toISOString().slice(0,10);}
// The one planned call of an organisation ("Wiedervorlage"): quick picks, a short label for list chips and how far away it is.
export const FOLLOW_UP_PICKS:[string,(today:string)=>string][]=[["1 Woche",t=>addDays(t,7)],["2 Wochen",t=>addDays(t,14)],["1 Monat",t=>addMonths(t,1)],["3 Monate",t=>addMonths(t,3)],["6 Monate",t=>addMonths(t,6)],["1 Jahr",t=>addMonths(t,12)]];
// After a call (call card, Anruf tab, phone app) the result and the next call are picked separately, then saved with one button.
// A result preselects its next call: a planned call still ahead stays ("Unverändert"), otherwise `days` from today, if it has any.
export const CALL_RESULTS=[{key:"talked",label:"Gespräch geführt",days:null},{key:"not_reached",label:"Nicht erreicht",days:2},{key:"meeting",label:"Termin vereinbart",days:14},{key:"email",label:"E-Mail nötig",days:7}] as const;
export type CallResult=typeof CALL_RESULTS[number]["key"];
export const CALL_NEXT_PICKS:[string,(today:string)=>string][]=[["2 Tage",t=>addDays(t,2)],...FOLLOW_UP_PICKS];
export type NextCall={kind:'keep'}|{kind:'none'}|{kind:'date';date:string;time?:string}|null;
export function defaultNextCall(result:string,planned:string,today=todayBerlin()):NextCall{
 if(planned&&planned>today)return{kind:'keep'};
 const days=CALL_RESULTS.find(r=>r.key===result)?.days;return days?{kind:'date',date:addDays(today,days)}:null;
}
export function followUpLabel(date:string,today=todayBerlin()){if(date<today)return "Anruf fällig seit "+meetingWhen(date,today).replace(/^\S+ /,"");if(date===today)return "Anruf heute";const when=meetingWhen(date,today);return "Anruf "+when+(date.slice(0,4)!==today.slice(0,4)&&!/^(heute|morgen)$/.test(when)?date.slice(2,4):"");}
export function followUpDistance(date:string,today=todayBerlin()){const days=Math.round((Date.parse(date+"T12:00:00Z")-Date.parse(today+"T12:00:00Z"))/86400000);if(days<0)return days===-1?"seit gestern":`seit ${-days} Tagen`;if(days===0)return "heute";if(days===1)return "morgen";if(days<14)return `in ${days} Tagen`;if(days<60)return `in ${Math.round(days/7)} Wochen`;const months=Math.round(days/30.4);return months<12?`in ${months} Monaten`:months<18?"in einem Jahr":`in ${Math.round(months/12)} Jahren`;}
// Timeline label for an activity kind; call results are stored as "Anruf · <Ergebnis>".
export function activityLabel(kind:string){return kind.startsWith("Anruf · ")?kind.slice(8):kind==="Anrufversuch"?"Nicht erreicht":kind==="Anruf gestartet"?"Anruf gestartet":kind;}
export type ReviewItem = {id:string;text:string;last:{kind:string;text:string;subject:string;date:string;author:string}|null};
export function normalize(s: string) { return s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu,""); }
export function searchText(e: Entity) { return normalize(e.values.map(v=>String(v)).join(" ")); }
export function contactAge(e: Entity, today=todayBerlin()): number | null { const d=dateISO(e.values[15]);return d?Math.max(0,Math.floor((Date.parse(today)-Date.parse(d))/86400000)):null; }
export function contactLabel(e: Entity) { const days=contactAge(e);return days===null?"Kontakt unbekannt":days===0?"Heute kontaktiert":days===1?"Gestern kontaktiert":`Vor ${days} Tagen`; }
// A scheduled follow-up wins: a future date keeps the organisation out, a due date brings it back
// even after "Kein Interesse". Only "Verloren" stays out for good.
export function callable(e:Entity,today=todayBerlin()){
  // A booked meeting replaces the call until it has taken place.
  if(e.upcoming)return false;
  if(!phone(e)||text(e,10)==="Verloren"||["Ehemaliger Kunde","Partner / Agentur"].includes(text(e,9)))return false;
  const due=dateISO(e.values[17]);if(due)return due<=today;
  return text(e,10)!=="Aktuell kein Bedarf";
}
// A user's call list only draws from organisations they own or that nobody owns and no colleague holds today.
export const callableBy=(e:Entity,userId:string)=>(!e.ownerId||e.ownerId===userId)&&(!e.reservedBy||e.reservedBy===userId);
export const eligibleFor=(entities:Entity[],userId:string)=>entities.filter(e=>callableBy(e,userId));
export type QueueItem = {id:string; reason:string; kind:"followup"|"customer"|"warm"|"cold"};
export function buildQueue(entities:Entity[], count=30, staleDays=90, customerShare=.6, today=todayBerlin()):QueueItem[] {
  const max=Math.max(1,Math.min(100,Math.floor(count)));const eligible=entities.filter(e=>callable(e,today));
  const customer=(e:Entity)=>text(e,9)==="Kunde";
  const cold=(e:Entity)=>!customer(e)&&["Unbearbeitet","Kontaktaufnahme","Unklar",""].includes(text(e,10));
  const overdue=(e:Entity)=>{const d=dateISO(e.values[17]);return d&&d<=today;};
  const recency=(a:Entity,b:Entity)=>(contactAge(b,today)??-1)-(contactAge(a,today)??-1)||text(a,1).localeCompare(text(b,1),"de");
  const out:QueueItem[]=[],used=new Set<string>();
  const take=(list:Entity[],limit:number,kind:QueueItem['kind'],reason:(e:Entity)=>string)=>{let added=0;for(const e of list){if(out.length>=max||added>=limit)break;if(used.has(e.id))continue;used.add(e.id);out.push({id:e.id,kind,reason:reason(e)});added++;}};
  // Due callbacks always come first and are never capped.
  take(eligible.filter(overdue).sort((a,b)=>dateISO(a.values[17]).localeCompare(dateISO(b.values[17]))),max,"followup",e=>`Wiedervorlage ${formatDate(e.values[17])}`);
  const target=Math.round(max*Math.min(.9,Math.max(.1,customerShare))),already=out.filter(q=>customer(eligible.find(e=>e.id===q.id)!)).length;
  const neglected=eligible.filter(e=>customer(e)&&(contactAge(e,today)===null||(contactAge(e,today)??0)>=staleDays)).sort(recency);
  take(neglected,Math.max(0,target-already),"customer",e=>contactAge(e,today)===null?"Kunde · Kontakt unbekannt":`Kunde · ${contactAge(e,today)} Tage ohne Kontakt`);
  const warm=eligible.filter(e=>!customer(e)&&!cold(e)).sort((a,b)=>{const ranks:Record<string,number>={"Angebot":0,"Testphase":1,"Termin vereinbart":2,"Im Gespräch":3};return (ranks[text(a,10)]??9)-(ranks[text(b,10)]??9)||recency(a,b);});
  const remaining=max-out.length;take(warm,Math.ceil(remaining/2),"warm",e=>`Lead · ${text(e,10)}`);
  take(eligible.filter(cold).sort(recency),max-out.length,"cold",()=>"Neuer Kontakt");
  take(warm,max-out.length,"warm",e=>`Lead · ${text(e,10)}`);take(neglected,max-out.length,"customer",e=>contactLabel(e));return out;
}
// The Follow-ups week (see server/calendar.mjs): Monday to Sunday, my planned calls and everyone's meetings.
export type CalendarCall={id:string;name:string;date:string;time:string;text:string;overdue:boolean};
export type CalendarMeeting={id:string;organisationId:string;name:string;date:string;time:string;text:string;by:string;mine:boolean};
export type CalendarWeek={from:string;to:string;today:string;followUps:CalendarCall[];meetings:CalendarMeeting[]};
export type CalendarItem={key:string;organisationId:string;kind:"call"|"meeting";name:string;time:string;detail:string;overdue?:string;other?:boolean};
export function mondayOf(d:string){return addDays(d,-((new Date(d+"T12:00:00Z").getUTCDay()+6)%7));}
export function isoWeek(d:string){const t=new Date(d+"T12:00:00Z");t.setUTCDate(t.getUTCDate()+3-(t.getUTCDay()+6)%7);const first=new Date(Date.UTC(t.getUTCFullYear(),0,4,12));return 1+Math.round(((t.getTime()-first.getTime())/86400000-3+(first.getUTCDay()+6)%7)/7);}
// One day's entries: overdue calls (only on today) first, then calls and meetings without a time, then the rest by time.
export function dayItems(week:CalendarWeek,day:string):CalendarItem[]{
 const calls=week.followUps.filter(c=>c.overdue?day===week.today:c.date===day).map((c):CalendarItem=>({key:"c"+c.id,organisationId:c.id,kind:"call",name:c.name,time:c.overdue?"":c.time,detail:c.text||"Anruf",overdue:c.overdue?c.date:undefined}));
 const meetings=week.meetings.filter(m=>m.date===day).map((m):CalendarItem=>({key:"m"+m.id,organisationId:m.organisationId,kind:"meeting",name:m.name,time:m.time,detail:[m.text,m.by].filter(Boolean).join(" · "),other:!m.mine}));
 const rank=(i:CalendarItem)=>i.overdue?0:i.time?2:1;
 return [...calls,...meetings].sort((a,b)=>rank(a)-rank(b)||(a.overdue||"").localeCompare(b.overdue||"")||a.time.localeCompare(b.time)||(a.kind===b.kind?0:a.kind==="meeting"?-1:1)||a.name.localeCompare(b.name,"de"));
}
