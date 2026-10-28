import {Problem} from './crm.mjs';
import {ownerResolver} from './leads.mjs';
import {addDays,validDate,todayBerlin} from '../src/domain.ts';
// The Follow-ups week: planned calls of the organisations this user is responsible for, and everyone's meetings.
// It only shows what the CRM holds; an overdue call stays on today until a logged call or an edit moves its date.
const pad=n=>String(n).padStart(2,'0');
// Meetings keep their time inside the text ("Zoom · 14:30 Uhr · Titel"); a note typed by hand may hold one too.
export function meetingTime(text){const m=/(?<![\d.:])([01]?\d|2[0-3])(?::([0-5]\d)(?!\d)|\.([0-5]\d)\s*Uhr)/.exec(String(text||''));return m?pad(+m[1])+':'+(m[2]||m[3]):'';}
const meetingTitle=text=>String(text||'').replace(/(?:^|\s*·\s*)(?:[01]?\d|2[0-3])[:.][0-5]\d\s*Uhr(?=\s*·|\s*$)/,'').replace(/^\s*·\s*/,'').trim().slice(0,180)||'Meeting';
export function calendar(db,user,b){
 const from=String(b.from||'');if(!validDate(from)||new Date(from+'T12:00:00Z').getUTCDay()!==1)throw new Problem('Ungültige Woche.');
 const to=addDays(from,6),today=todayBerlin(),overdue=from<=today&&today<=to,owner=ownerResolver(db);
 const followUps=db.prepare(`SELECT f.organisation_id AS id,o.name,o.owner,f.due_date AS date,f.text,t.time FROM followups f JOIN organisations o ON o.id=f.organisation_id LEFT JOIN followup_times t ON t.followup_id=f.id AND t.due_date=f.due_date WHERE f.completed_at IS NULL AND f.due_date IS NOT NULL AND f.due_date<=? AND (f.due_date>=?${overdue?' OR f.due_date<?':''}) ORDER BY f.due_date,o.name COLLATE NOCASE`).all(to,from,...(overdue?[today]:[]))
  .filter(f=>owner(f.owner)===user.id).map(f=>({id:f.id,name:f.name,date:f.date,time:f.time||'',text:f.text,overdue:f.date<today}));
 const meetings=db.prepare(`SELECT a.id,a.organisation_id,o.name,a.occurred_on AS date,a.body,a.author_id,u.name AS author FROM activities a JOIN organisations o ON o.id=a.organisation_id LEFT JOIN users u ON u.id=a.author_id WHERE a.kind='Meeting' AND a.occurred_on BETWEEN ? AND ? AND a.id NOT IN (SELECT activity_id FROM meeting_status) ORDER BY a.occurred_on,a.created_at`).all(from,to)
  .map(m=>({id:m.id,organisationId:m.organisation_id,name:m.name,date:m.date,time:meetingTime(m.body),text:meetingTitle(m.body),by:m.author_id===user.id?'':m.author||'',mine:m.author_id===user.id}));
 return{from,to,today,followUps,meetings};
}
