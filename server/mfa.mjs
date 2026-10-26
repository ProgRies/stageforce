// Second factor for every sign-in: TOTP (RFC 6238, the codes authenticator apps show) plus single-use recovery codes.
// A password alone never yields a session. It yields a short-lived login challenge, and only a valid code turns
// that challenge into a session. A user without a confirmed authenticator must set one up inside that challenge.
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {hashToken} from './auth.mjs';
import {transaction} from './db.mjs';
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',STEP=30000,CHALLENGE_MS=10*60000,MAX_ATTEMPTS=5,RECOVERY_COUNT=10;
export const ISSUER='Stage Force';
export function base32(bytes){let bits=0,value=0,out='';for(const b of bytes){value=value<<8|b;bits+=8;while(bits>=5){out+=ALPHABET[value>>>bits-5&31];bits-=5;}}if(bits)out+=ALPHABET[value<<5-bits&31];return out;}
export function fromBase32(text){let bits=0,value=0;const out=[];for(const ch of text.replace(/[\s=-]/g,'').toUpperCase()){const i=ALPHABET.indexOf(ch);if(i<0)throw Error('Ungültiger Schlüssel.');value=value<<5|i;bits+=5;if(bits>=8){out.push(value>>>bits-8&255);bits-=8;}}return Buffer.from(out);}
export const newSecret=()=>base32(randomBytes(20));
export function totp(secret,step){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',fromBase32(secret)).update(counter).digest(),o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1e6).padStart(6,'0');}
// Accepts the current 30-second code and its neighbours (clock drift). Returns the matched step, or null.
export function matchTotp(secret,code,time=Date.now()){if(!/^\d{6}$/.test(code))return null;const now=Math.floor(time/STEP);for(const step of [now,now-1,now+1])if(timingSafeEqual(Buffer.from(totp(secret,step)),Buffer.from(code)))return step;return null;}
export function otpauthURI(secret,email){const label=encodeURIComponent(ISSUER+':'+email);return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=30`;}
const recoveryCode=()=>{const s=base32(randomBytes(10));return s.slice(0,5)+'-'+s.slice(5,10)+'-'+s.slice(10,16);};
const normalRecovery=code=>String(code||'').replace(/[\s-]/g,'').toUpperCase();
export const mfaEnabled=(db,userId)=>!!db.prepare('SELECT 1 FROM user_mfa WHERE user_id=?').get(userId);
// Stores a confirmed authenticator and fresh recovery codes; returns the codes in plain text exactly once.
export function enableMfa(db,userId,secret,step=0){return transaction(db,()=>{
 db.prepare('INSERT INTO user_mfa(user_id,secret,last_step,enabled_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET secret=excluded.secret,last_step=excluded.last_step,enabled_at=excluded.enabled_at').run(userId,secret,step,Date.now());
 db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id=?').run(userId);
 const codes=Array.from({length:RECOVERY_COUNT},recoveryCode);for(const c of codes)db.prepare('INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES(?,?)').run(userId,hashToken(normalRecovery(c)));return codes;});}
export function resetMfa(db,userId){transaction(db,()=>{for(const table of ['user_mfa','mfa_recovery_codes','login_challenges','sessions','extension_keys'])db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(userId);});}
export const recoveryLeft=(db,userId)=>db.prepare('SELECT count(*) n FROM mfa_recovery_codes WHERE user_id=? AND used_at IS NULL').get(userId).n;
// After a correct password: a challenge whose token only lives in an HttpOnly cookie. New users get a secret to scan.
export function startChallenge(db,user){
 db.prepare('DELETE FROM login_challenges WHERE expires_at<? OR user_id=?').run(Date.now(),user.id);
 const token=randomBytes(32).toString('base64url'),setup=!mfaEnabled(db,user.id),secret=setup?newSecret():null;
 db.prepare('INSERT INTO login_challenges(token_hash,user_id,setup_secret,attempts,expires_at) VALUES(?,?,?,0,?)').run(hashToken(token),user.id,secret,Date.now()+CHALLENGE_MS);
 return{token,setup:setup?{secret,uri:otpauthURI(secret,user.email)}:null};
}
export function challengeUser(db,token){if(typeof token!=='string'||!token||token.length>128)return null;return db.prepare('SELECT c.token_hash,c.setup_secret,c.attempts,u.* FROM login_challenges c JOIN users u ON u.id=c.user_id WHERE c.token_hash=? AND c.expires_at>? AND u.active=1').get(hashToken(token),Date.now())||null;}
// Checks a code against a challenge. Returns {user,recoveryCodes?,usedRecovery?} on success and null on a wrong code.
// Five wrong codes end the challenge, so the password has to be entered again.
export function completeChallenge(db,challenge,code,time=Date.now()){return transaction(db,()=>{
 const c=db.prepare('SELECT * FROM login_challenges WHERE token_hash=?').get(challenge.token_hash);if(!c||c.expires_at<=time||c.attempts>=MAX_ATTEMPTS)return null;
 const input=String(code||'').replace(/\s/g,'');
 const done=extra=>{db.prepare('DELETE FROM login_challenges WHERE user_id=?').run(c.user_id);return{user:challenge,...extra};};
 if(c.setup_secret){const step=matchTotp(c.setup_secret,input,time);if(step!==null)return done({recoveryCodes:enableMfa(db,c.user_id,c.setup_secret,step)});}
 else{
  const m=db.prepare('SELECT * FROM user_mfa WHERE user_id=?').get(c.user_id);
  const step=m&&matchTotp(m.secret,input,time);
  // A code that was already used (seen by a shoulder-surfer or a phishing page) is not accepted a second time.
  if(step!==null&&step!==undefined&&step>m.last_step){db.prepare('UPDATE user_mfa SET last_step=? WHERE user_id=?').run(step,c.user_id);return done({});}
  if(m&&!/^\d{6}$/.test(input)){const r=db.prepare('UPDATE mfa_recovery_codes SET used_at=? WHERE user_id=? AND code_hash=? AND used_at IS NULL').run(time,c.user_id,hashToken(normalRecovery(input)));if(r.changes)return done({usedRecovery:true,recoveryLeft:recoveryLeft(db,c.user_id)});}
 }
 db.prepare('UPDATE login_challenges SET attempts=attempts+1 WHERE token_hash=?').run(c.token_hash);return null;});}
// A fresh authenticator code for a sensitive step inside a session (creating a browser key). Recovery codes do not count,
// and a code already used for the sign-in is refused, so a stolen session cookie alone cannot pass.
export function confirmCode(db,userId,code,time=Date.now()){return transaction(db,()=>{
 const m=db.prepare('SELECT * FROM user_mfa WHERE user_id=?').get(userId);const step=m&&matchTotp(m.secret,String(code||'').replace(/\s/g,''),time);
 if(step===null||step===undefined||step<=m.last_step)return false;
 db.prepare('UPDATE user_mfa SET last_step=? WHERE user_id=?').run(step,userId);return true;});}
