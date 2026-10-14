import {simpleParser} from 'mailparser';
import {convert} from 'html-to-text';
import {createHash} from 'node:crypto';
import {email} from './auth.mjs';
export function cleanText(text){
 const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n');const kept=[],removed=[];let tail=false;
 for(let i=0;i<lines.length;i++){const line=lines[i];
  // Only explicit structural markers; ambiguous inline answers remain in the preview.
  if(/^-- $/.test(line)||/^\s*-{3,}\s*(Original Message|Ursprüngliche Nachricht|Weitergeleitete Nachricht)\s*-{3,}\s*$/i.test(line))tail=true;
  if(/^\s*(On .+wrote:|Am .+schrieb .+:)\s*$/i.test(line)&&lines.slice(i+1).filter(l=>l.trim()).every(l=>/^\s*>/.test(l)))tail=true;
  if(tail||/^\s*>/.test(line))removed.push(line);else kept.push(line);
 }
 const cleaned=kept.join('\n').replace(/\n{4,}/g,'\n\n\n').trim();return {cleaned:cleaned||String(text||'').trim(),removed:removed.join('\n'),warnings:removed.length?['Zitate/Signatur erkannt. Bitte die vollständige Nachricht gegenprüfen.']:[]};
}
export async function parseEmail(raw,mailbox){
 if(!Buffer.isBuffer(raw)||raw.length>10*1024*1024)throw Error('Maximal 10 MB pro E-Mail.');
 const parsed=await simpleParser(raw,{skipImageLinks:true,skipTextToHtml:true,maxHtmlLengthToParse:2*1024*1024});
 const addresses=v=>(Array.isArray(v)?v:[v]).flatMap(x=>x?.value||[]).filter(a=>email(a.address)).map(a=>({name:String(a.name||'').slice(0,300),email:a.address.toLowerCase()}));
 const sender=addresses(parsed.from),recipients=addresses(parsed.to),cc=addresses(parsed.cc);if(!sender.length)throw Error('Kein gültiger Absender. Bitte eine originale .eml-Datei verwenden.');
 if(parsed.html&&parsed.html.length>2*1024*1024)throw Error('HTML-Inhalt über 2 MB. Bitte einen relevanten Abschnitt manuell erfassen.');
 const original=String(parsed.text|| (parsed.html?convert(parsed.html,{wordwrap:false,selectors:[{selector:'img',format:'skip'},{selector:'script',format:'skip'},{selector:'style',format:'skip'}]}):'')).trim();if(original.length>500000)throw Error('Nachrichtentext über 500.000 Zeichen. Bitte den relevanten Abschnitt manuell erfassen.');
 const sentAt=parsed.date&&!isNaN(+parsed.date)?parsed.date.toISOString():null;const messageId=String(parsed.messageId||'').trim();
 const subject=String(parsed.subject||'').slice(0,1000),direction=sender.some(s=>s.email===mailbox.toLowerCase())?'outgoing':'incoming';
 const dedupeKey=createHash('sha256').update(messageId?'id:'+messageId:JSON.stringify([sender,recipients,sentAt,subject,original])).digest('hex');
 const cleaned=cleanText(original);if(!sentAt)cleaned.warnings.push('Datum fehlt. Bitte das tatsächliche Versanddatum angeben.');
 return {sender,recipients,cc,subject,sentAt,messageId,direction,dedupeKey,original,...cleaned,mailbox,attachments:(parsed.attachments||[]).map(a=>({name:a.filename||'Anhang',size:a.size,type:a.contentType})),sourceUrl:''};
}
