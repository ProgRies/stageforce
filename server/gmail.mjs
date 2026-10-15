import {randomBytes} from 'node:crypto';
import {hashToken,limited} from './auth.mjs';
import {Problem,stageImport} from './crm.mjs';
import {parseEmail} from './email.mjs';

// Existing keys remain capture-only. Sidebar review requires explicitly issuing a new review key.
export function gmailStatus(db,user){
 const row=db.prepare('SELECT created_at,expires_at,last_used_at,sidebar_review FROM gmail_keys WHERE user_id=?').get(user.id);
 return {email:user.email,connected:!!row&&row.expires_at>Date.now(),...row};
}
export function revokeGmailKey(db,user){db.prepare('DELETE FROM gmail_keys WHERE user_id=?').run(user.id);}
export function createGmailKey(db,user,{sidebarReview=false}={}){
 const token='sf_gmail_'+randomBytes(32).toString('base64url'),created=Date.now(),expires=created+90*86400000;
 db.prepare('INSERT INTO gmail_keys(user_id,token_hash,created_at,expires_at,sidebar_review) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,expires_at=excluded.expires_at,last_used_at=NULL,sidebar_review=excluded.sidebar_review').run(user.id,hashToken(token),created,expires,sidebarReview?1:0);
 return {...gmailStatus(db,user),token};
}
export function authorizeGmail(db,req,rateLimit=true){
 const match=/^Bearer (sf_gmail_[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||'');
 const user=match&&db.prepare('SELECT u.*,k.sidebar_review FROM gmail_keys k JOIN users u ON u.id=k.user_id WHERE k.token_hash=? AND k.expires_at>? AND u.active=1').get(hashToken(match[1]),Date.now());
 if(!user)throw new Problem('Gmail-Verbindung fehlt oder ist abgelaufen. Bitte im CRM neu verbinden.',401,'unauthorized');
 if(rateLimit&&limited(db,'gmail:'+user.id,20,60000))throw new Problem('Bitte eine Minute warten und erneut versuchen.',429);
 return user;
}
function field(input,name,max,optional=false){
 const v=input?.[name];if(optional&&v==null)return '';
 if(typeof v!=='string'||v.length>max)throw new Problem('Ungültiges E-Mail-Feld: '+name);
 return v;
}
export async function selectedGmailMessage(input,user){
 const mailbox=field(input,'mailbox',320).trim().toLowerCase();
 if(mailbox!==user.email.toLowerCase())throw new Problem('Google- und CRM-Konto müssen dieselbe E-Mail-Adresse verwenden.',403);
 const from=field(input,'from',10000),to=field(input,'to',20000),cc=field(input,'cc',20000,true);
 const subject=field(input,'subject',1000),date=field(input,'date',100),messageId=field(input,'messageId',1000,true),gmailId=field(input,'gmailId',100);
 const text=field(input,'text',500000);
 if(!/^[a-f0-9]{1,100}$/i.test(gmailId)||!Number.isFinite(Date.parse(date)))throw new Problem('Ungültige Nachrichten-ID oder Datum.');
 // Validate headers before constructing text-only MIME; clients cannot inject headers/parts.
 if([from,to,cc,subject,messageId].some(s=>/[\r\n\0]/.test(s)))throw new Problem('Ungültige E-Mail-Kopfzeile.');
 const encoded='=?UTF-8?B?'+Buffer.from(subject).toString('base64')+'?=';
 const mime=[`From: ${from}`,`To: ${to}`,`Cc: ${cc}`,`Subject: ${encoded}`,`Date: ${new Date(date).toUTCString()}`,...(messageId?[`Message-ID: ${messageId}`]:[]),'MIME-Version: 1.0','Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: base64','',Buffer.from(text).toString('base64')].join('\r\n');
 const parsed=await parseEmail(Buffer.from(mime),mailbox);
 const query=messageId?'#search/'+encodeURIComponent('rfc822msgid:'+messageId.replace(/^<|>$/g,'')):'#all/'+gmailId;
 const base='https://mail.google.com/mail/u/?authuser='+encodeURIComponent(mailbox);
 parsed.sourceUrl=base+(base.length+query.length<=2000?query:'#all/'+gmailId);
 parsed.warnings.push('Nur Nachrichtentext übernommen. Anhänge verbleiben in Gmail.');
 return parsed;
}
export function stageGmailMessage(db,user,parsed){
 // Retries/double clicks reuse the pending review without overwriting edits or extending expiry.
 const prior=db.prepare('SELECT id,payload_json FROM email_imports WHERE user_id=? AND expires_at>?').all(user.id,Date.now()).find(r=>JSON.parse(r.payload_json).dedupeKey===parsed.dedupeKey);
 const id=prior?.id||stageImport(db,user,parsed).id;
 db.prepare('UPDATE gmail_keys SET last_used_at=? WHERE user_id=?').run(Date.now(),user.id);
 return id;
}
