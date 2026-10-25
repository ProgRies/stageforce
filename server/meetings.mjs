import {addActivity} from './crm.mjs';
// Video-call invitations in saved emails become Meeting entries in the organisation timeline.
const PROVIDERS=[
 {name:'Zoom',link:/https?:\/\/(?:[\w-]+\.)?zoom(?:gov)?\.us\/(?:j|w|s|my)\/[\w.-]+(?:\?pwd=[\w.-]+)?/i,text:/\bjoin zoom meeting\b|\bzoom[- ]meeting\b|\bzoom-besprechung\b|\bzoom video communications\b/i,key:l=>/\/(?:j|w|s|my)\/([\w.-]+)/i.exec(l)?.[1]},
 {name:'Microsoft Teams',link:/https?:\/\/teams\.(?:microsoft|live)\.com\/(?:l\/meetup-join|meet)\/[^\s<>"')\]]+/i,text:/\bmicrosoft teams[- ](?:meeting|besprechung)\b|\bmicrosoft teams need help\b|\bjoin the meeting now\b|\bjetzt an der besprechung teilnehmen\b/i,key:l=>{try{return decodeURIComponent(l).match(/meeting_[\w-]+|\/meet\/(\d+)/i)?.[0];}catch{return null;}}},
 {name:'Google Meet',link:/https?:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i,text:/\bjoin with google meet\b|\bmit google meet teilnehmen\b|\bgoogle meet\b/i,key:l=>/[a-z]{3}-[a-z]{4}-[a-z]{3}/i.exec(l)?.[0].toLowerCase()},
 {name:'Webex',link:/https?:\/\/[\w-]+\.webex\.com\/(?:meet\/[\w.-]+|[\w.-]+\/j\.php\?MTID=[\w-]+|join\/[\w.-]+|wbxmjs\/joinservice\/[^\s<>"')\]]+)/i,text:/\bwebex[- ](?:meeting|besprechung)\b|\bjoin (?:the )?webex\b|\bcisco webex\b/i,key:l=>/MTID=([\w-]+)|\/(?:meet|join)\/([\w.-]+)/i.exec(l)?.slice(1).find(Boolean)},
 {name:'GoTo Meeting',link:/https?:\/\/(?:global\.gotomeeting\.com\/join|meet\.goto\.com)\/\d+/i,text:/\bgoto ?meeting\b/i,key:l=>/\d{6,}/.exec(l)?.[0]},
 {name:'Whereby',link:/https?:\/\/(?:[\w-]+\.)?whereby\.com\/[\w-]+/i,text:/\bwhereby\b/i,key:l=>/whereby\.com\/([\w-]+)/i.exec(l)?.[1]},
 {name:'Jitsi',link:/https?:\/\/meet\.jit\.si\/[\w-]+/i,text:/\bjitsi\b/i,key:l=>/jit\.si\/([\w-]+)/i.exec(l)?.[1]},
 {name:'Skype',link:/https?:\/\/join\.skype\.com\/[\w-]+/i,text:/\bskype[- ](?:meeting|besprechung)\b/i,key:l=>/skype\.com\/([\w-]+)/i.exec(l)?.[1]},
];
const INVITE=/^(?:(?:aktualisierte |updated |neue )?(?:einladung|invitation|meeting invitation|besprechungsanfrage)|termin|meeting|besprechung)\s*(?:mit[^:]{0,80})?:\s*/i;
const CANCELLED=/^(?:abgesagt|abgesagter termin|abgesagtes ereignis|canceled|cancelled|canceled event|cancelled event|absage)\s*(?:with[^:]{0,80})?:\s*/i;
const RESPONSE=/^(?:akzeptiert|zugesagt|abgelehnt|mit vorbehalt|vorläufig|accepted|declined|tentative|tentatively accepted|updated invitation with note|neue zeit vorgeschlagen|new time proposed)\s*:/i;
const MONTHS={jan:1,januar:1,january:1,jän:1,feb:2,februar:2,february:2,mär:3,mrz:3,märz:3,mar:3,march:3,apr:4,april:4,mai:5,may:5,jun:6,juni:6,june:6,jul:7,juli:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,okt:10,oct:10,oktober:10,october:10,nov:11,november:11,dez:12,dec:12,dezember:12,december:12};
const MONTH='(jan(?:uar|uary)?|jän(?:ner)?|feb(?:ruar|ruary)?|mär(?:z)?|mrz|mar(?:ch)?|apr(?:il)?|mai|may|jun[ei]?|jul[iy]?|aug(?:ust)?|sept?(?:ember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dez(?:ember)?|dec(?:ember)?)\\.?';
const pad=n=>String(n).padStart(2,'0');
const month=s=>MONTHS[s.toLowerCase().replace(/\.$/,'')]??MONTHS[s.toLowerCase().slice(0,3)];
const validDay=(y,m,d)=>{const t=new Date(Date.UTC(y,m-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d;};
function time(s){
 const m=/(?:^|[^\d:.])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|uhr|h\b)?/i.exec(s);if(!m||(!m[2]&&!m[3]))return '';
 let h=+m[1];const min=+(m[2]||0),suffix=(m[3]||'').toLowerCase().replace(/\./g,'');
 if(suffix==='pm'&&h<12)h+=12;if(suffix==='am'&&h===12)h=0;return h<24&&min<60?pad(h)+':'+pad(min):'';
}
// The first calendar date in a line, with the time that follows it.
export function meetingDate(line,fallbackYear){
 const s=String(line||'');let y,m,d,rest;
 let r=new RegExp('(\\d{1,2})\\.?\\s+'+MONTH+'\\s+(\\d{4})','i').exec(s);
 if(r){d=+r[1];m=month(r[2]);y=+r[3];}
 if(!r&&(r=new RegExp(MONTH+'\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})','i').exec(s))){m=month(r[1]);d=+r[2];y=+r[3];}
 if(!r&&(r=/(\d{4})-(\d{2})-(\d{2})/.exec(s))){y=+r[1];m=+r[2];d=+r[3];}
 if(!r&&(r=/(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\b/.exec(s))){d=+r[1];m=+r[2];y=+r[3]<100?2000+ +r[3]:+r[3];}
 if(!r&&(r=/(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))){m=+r[1];d=+r[2];y=+r[3];}
 if(!r&&fallbackYear&&(r=new RegExp('(\\d{1,2})\\.?\\s+'+MONTH+'(?![\\w])','i').exec(s))){d=+r[1];m=month(r[2]);y=fallbackYear;}
 if(!r||!m||!validDay(y,m,d))return null;rest=s.slice(r.index+r[0].length);
 return{date:y+'-'+pad(m)+'-'+pad(d),time:time(rest.slice(0,40))};
}
const WHEN=/^\s*(?:when|wann|time|zeit|uhrzeit|date|datum|termin|start|beginn)\s*:?\s*(.*)$/i;
function scheduled(subject,body,year){
 const at=/\s@\s(.+)$/.exec(subject);if(at){const found=meetingDate(at[1],year);if(found)return found;}
 const lines=body.split('\n').map(l=>l.trim()).slice(0,400);
 for(let i=0;i<lines.length;i++){const m=WHEN.exec(lines[i]);if(!m)continue;const found=meetingDate(m[1]||lines[i+1]||'',year)||(!m[1]?null:meetingDate(lines[i+1]||'',year));if(found)return found;}
 return meetingDate(subject,year);
}
const cleanTitle=s=>s.replace(CANCELLED,'').replace(INVITE,'').replace(/\s@\s.+$/,'').replace(/\s*\((?:[^()]*@[^()]*)\)\s*$/,'').trim().slice(0,300);
// Finds a video-call invitation in an email. `links` are href values the client read from the message.
export function detectMeeting({subject='',body='',links=[],sentAt=''}={}){
 subject=String(subject).trim();body=String(body).slice(0,200000);
 if(RESPONSE.test(subject))return null;
 const hay=[...links.map(String),body].join('\n');let provider=null,link='';
 for(const p of PROVIDERS){const m=p.link.exec(hay);if(m){provider=p;link=m[0];break;}}
 if(!provider)provider=PROVIDERS.find(p=>p.text.test(subject+'\n'+body));
 if(!provider)return null;
 const year=Number((sentAt||'').slice(0,4))||new Date().getFullYear(),when=scheduled(subject,body,year);
 const id=link&&provider.key(link);
 const title=cleanTitle(subject)||provider.name;
 return{provider:provider.name,title,link,likely:!!(link||when||INVITE.test(subject)||CANCELLED.test(subject)),date:when?.date||'',time:when?.time||'',cancelled:CANCELLED.test(subject),key:(provider.name+':'+(id||title.toLowerCase())).slice(0,500)};
}
export const meetingText=(m,cancelled=false)=>(cancelled?'Abgesagt · ':'')+m.provider+(m.time?' · '+m.time+' Uhr':'')+(m.title&&m.title!==m.provider?' · '+m.title:'');
// One meeting per invitation: updated invitations move the existing entry, cancellations mark it.
export function logMeeting(db,user,{organisationId,meeting,date,time,messageId,contactIds=[]}){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date());
 const m={...meeting,time:time??meeting.time};let activityId=db.prepare('SELECT r.activity_id AS id FROM meeting_refs r JOIN activities a ON a.id=r.activity_id WHERE a.organisation_id=? AND r.meeting_key=? ORDER BY a.created_at LIMIT 1').get(organisationId,meeting.key)?.id;
 if(activityId){const held=!meeting.cancelled&&date<=today;db.prepare('UPDATE activities SET occurred_on=?,body=?,is_contact=? WHERE id=?').run(date,meetingText(m,meeting.cancelled),held?1:0,activityId);if(held)db.prepare('UPDATE organisations SET last_contact=CASE WHEN last_contact IS NULL OR last_contact<? THEN ? ELSE last_contact END WHERE id=?').run(date,date,organisationId);}
 else{
  if(meeting.cancelled)return null;
  activityId=addActivity(db,organisationId,user,{type:'Meeting',text:meetingText(m),date,contacted:date<=today});
  db.prepare('INSERT INTO meeting_refs VALUES(?,?,?,?)').run(activityId,meeting.key,messageId||null,meeting.link||'');
 }
 for(const cid of contactIds)db.prepare('INSERT OR IGNORE INTO activity_contacts VALUES(?,?)').run(activityId,cid);
 return activityId;
}
