// Security events: sign-ins, wrong passwords and codes, MFA and browser-key changes. They answer "was that me?"
// for each user and "what happened?" for the administrator. Kept 90 days; the IP address is only used for that review.
const KEEP_MS=90*86400000;
// Behind Traefik every request arrives from the proxy, so the client is the address the proxy appended last.
// Production always runs behind the proxy (docs/deployment.md); TRUST_PROXY=0 or 1 overrides that default.
export function clientIP(req,trust=process.env.TRUST_PROXY?process.env.TRUST_PROXY==='1':process.env.NODE_ENV==='production'){
 const forwarded=trust&&String(req.headers['x-forwarded-for']||'').split(',').map(s=>s.trim()).filter(Boolean).pop();
 return String(forwarded||req.socket?.remoteAddress||'unknown').replace(/^::ffff:/,'').slice(0,64);
}
export function logEvent(db,{event,user=null,email='',ip='',detail=''}){
 db.prepare('INSERT INTO security_events(at,user_id,email,ip,event,detail) VALUES(?,?,?,?,?,?)').run(Date.now(),user?.id||null,String(email||user?.email||'').toLowerCase().slice(0,254),String(ip).slice(0,64),event,String(detail).slice(0,300));
}
// Wrong passwords and codes for this account since its previous sign-in. A wrong code means someone had the right password.
export function failuresSinceLastLogin(db,userId){
 const last=db.prepare("SELECT at FROM security_events WHERE user_id=? AND event='login' ORDER BY at DESC LIMIT 1").get(userId)?.at||0;
 const count=event=>db.prepare('SELECT count(*) n FROM security_events WHERE user_id=? AND event=? AND at>?').get(userId,event,last).n;
 return{passwords:count('password_failed'),codes:count('code_failed')+count('key_code_failed'),since:last||null};
}
export function recentEvents(db,userId,limit=10){return db.prepare('SELECT at,event,ip,detail FROM security_events WHERE user_id=? ORDER BY at DESC,id DESC LIMIT ?').all(userId,limit);}
export function eventLog(db,email,limit=50){return email?db.prepare('SELECT * FROM security_events WHERE email=? COLLATE NOCASE ORDER BY at DESC,id DESC LIMIT ?').all(email,limit):db.prepare('SELECT * FROM security_events ORDER BY at DESC,id DESC LIMIT ?').all(limit);}
export function pruneEvents(db,time=Date.now()){db.prepare('DELETE FROM security_events WHERE at<?').run(time-KEEP_MS);}
