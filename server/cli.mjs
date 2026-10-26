import {emitKeypressEvents} from 'node:readline';
import {openDB,backupDB} from './db.mjs';
import {addUser,hashPassword} from './auth.mjs';
import {createOrg,addContact} from './crm.mjs';
import {resetMfa} from './mfa.mjs';
import {logEvent,eventLog} from './security.mjs';
const cli=(event,id,email)=>logEvent(db,{event,user:{id,email},ip:'CLI'});
process.umask(0o077);
async function password(){if(!process.stdin.isTTY){if(!process.argv.includes('--password-stdin'))throw Error('Use an interactive terminal, or explicitly pass --password-stdin with a secret piped via stdin.');let s='';for await(const c of process.stdin)s+=c;return s.replace(/[\r\n]+$/,'');}
 process.stdout.write('Passwort (mindestens 12 Zeichen): ');emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();return await new Promise((resolve,reject)=>{let value='';const onkey=(s,key={})=>{if(key.ctrl&&key.name==='c'){done();reject(Error('Abgebrochen.'));}else if(key.name==='return'){done();resolve(value);}else if(key.name==='backspace')value=value.slice(0,-1);else if(!key.ctrl&&!key.meta&&s)value+=s;};const done=()=>{process.stdin.off('keypress',onkey);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};process.stdin.on('keypress',onkey);});}
// --temporary: the user picks their own password at the next sign-in, before the CRM opens.
const temporary=process.argv.includes('--temporary'),temporaryNote=' Bei der nächsten Anmeldung wird ein eigenes Passwort festgelegt.';
const db=openDB();try{const [cmd,...args]=process.argv.slice(2).filter(a=>!a.startsWith('--'));
 if(cmd==='user:add'){if(!args[0]||!args[1])throw Error('user:add EMAIL "NAME" [--temporary]');const id=await addUser(db,args[0],args[1],await password());db.prepare('UPDATE users SET must_change_password=? WHERE id=?').run(temporary?1:0,id);cli('user_added',id,args[0]);console.log('Account erstellt.'+(temporary?temporaryNote:''));}
 else if(cmd==='user:password'){const user=db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(args[0]);if(!user)throw Error('Account nicht gefunden.');db.prepare('UPDATE users SET password_hash=?,must_change_password=? WHERE id=?').run(await hashPassword(await password()),temporary?1:0,user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);db.prepare('DELETE FROM extension_keys WHERE user_id=?').run(user.id);cli('password_reset',user.id,args[0]);console.log('Passwort geändert; Sitzungen beendet und Browser-Schlüssel widerrufen.'+(temporary?temporaryNote:''));}
 else if(cmd==='user:disable'){const u=db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(args[0]);if(!u)throw Error('Account nicht gefunden.');db.prepare('UPDATE users SET active=0 WHERE id=?').run(u.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);db.prepare('DELETE FROM extension_keys WHERE user_id=?').run(u.id);cli('user_disabled',u.id,args[0]);console.log('Account deaktiviert.');}
 else if(cmd==='user:mfa-reset'){const u=db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(args[0]);if(!u)throw Error('Account nicht gefunden.');resetMfa(db,u.id);cli('mfa_reset',u.id,args[0]);console.log('Zwei-Faktor-Anmeldung zurückgesetzt; Sitzungen beendet und Browser-Schlüssel widerrufen. Bei der nächsten Anmeldung wird eine neue Authenticator-App eingerichtet.');}
 else if(cmd==='user:list')console.table(db.prepare("SELECT u.name,u.email,u.active,CASE WHEN m.user_id IS NULL THEN 'ausstehend' ELSE 'aktiv' END AS mfa,(SELECT count(*) FROM mfa_recovery_codes r WHERE r.user_id=u.id AND r.used_at IS NULL) AS recovery_codes FROM users u LEFT JOIN user_mfa m ON m.user_id=u.id").all());
 else if(cmd==='security:log')console.table(eventLog(db,args[0],Number(args[1])||50).map(e=>({zeit:new Date(e.at).toLocaleString('de-DE'),konto:e.email,ereignis:e.event,ip:e.ip,info:e.detail})));
 else if(cmd==='backup'){if(!args[0])throw Error('backup /path/to/backup.sqlite');await backupDB(db,args[0]);console.log('Konsistente SQLite-Sicherung erstellt.');}
 else{console.log('Befehle: user:add EMAIL "NAME" [--temporary], user:password EMAIL [--temporary], user:disable EMAIL, user:mfa-reset EMAIL, user:list, security:log [EMAIL] [ANZAHL], backup FILE');}
}catch(e){console.error(e.message);process.exitCode=1;}finally{db.close();}
