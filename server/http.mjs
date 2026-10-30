import {appearance,saveAppearance} from './appearance.mjs';
import {prepareCall,saveCall,cancelCall,openCall,draftCall,startIncoming} from './calls.mjs';
import {mobileHome,mobileSearch} from './mobile.mjs';
import {reserveQueue} from './leads.mjs';
import {extensionStatus,extensionCreate,extensionRenew,extensionRevoke,authorizeExtension,extensionAction} from './extension.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openDB} from './db.mjs';
import {scheduleSnapshots} from './snapshots.mjs';
import {getSession,verifyPassword,createSession,limited,publicUser,mobileSessions,revokeMobileSession,changePassword} from './auth.mjs';
import {startChallenge,challengeUser,completeChallenge,confirmCode} from './mfa.mjs';
import {clientIP,logEvent,failuresSinceLastLogin,recentEvents,pruneEvents} from './security.mjs';
import {Problem,listData,entity,history,search,save,createOrg,activitySave,contactSave,linkSave,reviewDone,stageImport,importPreview,confirmImport,timelinePosition} from './crm.mjs';
import {inspectCSV,csvRecords,stageFastbill,fastbillBatches,fastbillRows,fastbillPreview,decideFastbill,deleteFastbillBatch,fetchFastbillPage} from './fastbill.mjs';
import {parseEmail} from './email.mjs';
import {deleteOrganisation,mergeOrganisations} from './lifecycle.mjs';
import {liveHub} from './live.mjs';
import {locationSave,mapService} from './map.mjs';
import {calendar} from './calendar.mjs';
// Actions that only read, or only touch the caller's own settings and staging, are not announced to other tabs.
const quiet=new Set(['calendar','appearanceSave','passwordChange','extensionStatus','extensionCreate','extensionRenew','extensionRevoke','load','detail','history','search','imports','importPreview','importPosition','importDelete','message','check','messageStatus','threadStatus','meeting','lookup','callOpen','callDraft','mapSearch','securityEvents','mobileHome','mobileSearch','mobileDevices','mobileDeviceRevoke']);
// The phone app names the device it was signed in on, so the list under Einstellungen says which phone is which.
const deviceLabel=req=>{const ua=String(req.headers['user-agent']||'');return /iPhone/.test(ua)?'iPhone':/iPad/.test(ua)?'iPad':/Android/.test(ua)?'Android-Handy':'Handy';};
const touched=(b,data)=>[b.id,b.other,b.into,b.organisationId,data?.entity?.id,data?.organisation?.id,data?.deleted];
export function makeServer(db,{origin=process.env.APP_URL||'http://localhost:3000',staticDir=resolve('dist'),map}={}){
 const url=new URL(origin);if(url.origin!==origin.replace(/\/$/,''))throw Error('APP_URL must be an origin without a path.');origin=url.origin;const secure=url.protocol==='https:';if(process.env.NODE_ENV==='production'&&!secure)throw Error('Production APP_URL must use HTTPS.');let parsing=0;const live=liveHub(db);map??=mapService({agent:`StageForce CRM (${origin})`});
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const success=(res,data)=>json(res,200,{status:'success',data});
 const body=async(req,max=1024*1024)=>{const buffers=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw new Problem('Datei/Eingabe ist zu groß.',413);buffers.push(chunk);}return Buffer.concat(buffers);};
 const cookie=(token,maxAge=604800)=>`stage_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`;
 // The half-finished login (password correct, code still missing) is only sent back to the code endpoint.
 const challengeCookie=(token,maxAge=600)=>`stage_mfa=${token}; HttpOnly; SameSite=Strict; Path=/api/login; Max-Age=${maxAge}${secure?'; Secure':''}`;
 const readCookie=(req,name)=>{for(const part of (req.headers.cookie||'').split(';')){const p=part.trim().indexOf('=');if(p>0&&part.trim().slice(0,p)===name)return part.trim().slice(p+1);}return null;};
 const server=createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
 try{const path=new URL(req.url,'http://internal').pathname;
 if(req.method==='GET'&&path==='/healthz')return json(res,200,{ok:db.prepare('SELECT 1 AS ok').get().ok===1});
 if(path==='/api/integrations/extension'){
  if(req.method!=='POST')throw new Problem('Method not allowed.',405);
  const user=authorizeExtension(db,req);
  if(!String(req.headers['content-type']).startsWith('application/json'))throw new Problem('JSON required.',415);
  const input=JSON.parse((await body(req,3*1024*1024)).toString());
  const current=authorizeExtension(db,req,false);
  const data=extensionAction(db,current,input,origin);if(!quiet.has(input.action))live.changed(touched(input,data),current.id);
  return success(res,data);
 }
 if(req.method==='POST'){
  if(req.headers.origin!==origin)throw new Problem('Unzulässiger Ursprung.',403,'forbidden');
  if(path==='/api/login'){if(!String(req.headers['content-type']).startsWith('application/json'))throw new Problem('JSON erwartet.',415);const b=JSON.parse((await body(req,8192)).toString());const address=String(b.email||'').trim().toLowerCase().slice(0,254),ip=clientIP(req);
   // Limits per client address and per account, never one shared counter: a stranger can slow down their own guesses, not lock out the team.
   if(limited(db,'login-ip:'+ip,30)||limited(db,'login:'+address+'|'+ip,10)||limited(db,'login-account:'+address,50,3600000))throw new Problem('Zu viele Versuche. Bitte in zehn Minuten erneut versuchen.',429,'rate_limited');
   const user=db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE AND active=1').get(address);const valid=await verifyPassword(b.password,user?.password_hash);if(!valid||!user){logEvent(db,{event:'password_failed',user:user||null,email:address,ip});throw new Problem('Anmeldung fehlgeschlagen.',401,'unauthorized');}const challenge=startChallenge(db,user);res.setHeader('Set-Cookie',challengeCookie(challenge.token));return success(res,challenge.setup?{mfa:'setup',email:user.email,...challenge.setup}:{mfa:'verify'});}
  if(path==='/api/login/mfa'){
   if(!String(req.headers['content-type']).startsWith('application/json'))throw new Problem('JSON erwartet.',415);const b=JSON.parse((await body(req,4096)).toString());
   const challenge=challengeUser(db,readCookie(req,'stage_mfa')),ip=clientIP(req);if(!challenge)throw new Problem('Die Anmeldung ist abgelaufen. Bitte gib dein Passwort erneut ein.',401,'mfa_expired');
   if(limited(db,'mfa:'+challenge.id,10))throw new Problem('Zu viele Versuche. Bitte in zehn Minuten erneut versuchen.',429,'rate_limited');
   const result=completeChallenge(db,challenge,b.code);
   if(!result){logEvent(db,{event:'code_failed',user:challenge,ip});const left=challengeUser(db,readCookie(req,'stage_mfa'));if(!left||left.attempts>=5){res.setHeader('Set-Cookie',challengeCookie('',0));throw new Problem('Zu viele falsche Codes. Bitte gib dein Passwort erneut ein.',401,'mfa_expired');}throw new Problem('Der Code stimmt nicht.',401,'mfa_invalid');}
   // Counted before this sign-in is logged, so the user sees what happened since their previous one.
   const warnings=failuresSinceLastLogin(db,challenge.id);
   if(result.recoveryCodes)logEvent(db,{event:'mfa_enrolled',user:challenge,ip});if(result.usedRecovery)logEvent(db,{event:'recovery_code_used',user:challenge,ip,detail:'noch '+result.recoveryLeft});
   const mobile=b.device==='mobile';
   logEvent(db,{event:'login',user:challenge,ip,detail:(result.recoveryCodes?'Einrichtung':result.usedRecovery?'Wiederherstellungscode':'Authenticator')+(mobile?' · Handy-App ('+deviceLabel(req)+')':'')});
   const session=createSession(db,result.user,mobile?{kind:'mobile',label:deviceLabel(req)}:{});res.setHeader('Set-Cookie',[cookie(session.token,session.maxAge),challengeCookie('',0)]);
   return success(res,{user:session.user,csrf:session.csrf,appearance:appearance(db,result.user),recoveryCodes:result.recoveryCodes,recoveryLeft:result.usedRecovery?result.recoveryLeft:undefined,security:warnings.passwords||warnings.codes?warnings:undefined});
  }
 }
 if(path.startsWith('/api/')){
  const session=getSession(db,req);if(!session)throw new Problem('Bitte anmelden.',401,'unauthorized');
  // The phone app's cookie moves forward with its session, so iOS keeps it as long as the server does.
  if(session.kind==='mobile'&&(session.renewed||path==='/api/session'))res.setHeader('Set-Cookie',cookie(session.token,90*86400));
  if(req.method==='GET'&&path==='/api/live'){if(req.headers.origin&&req.headers.origin!==origin)throw new Problem('Unzulässiger Ursprung.',403,'forbidden');return live.open(req,res,session);}
  if(req.method==='GET'&&path.startsWith('/api/map/tile/')){const m=path.match(/^\/api\/map\/tile\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.png$/);if(!m)throw new Problem('Nicht gefunden.',404,'not_found');const bytes=await map.tile(+m[1],+m[2],+m[3]);res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'private, max-age=86400'});return res.end(bytes);}
  if(req.method==='GET'&&path==='/api/session')return success(res,{user:publicUser(session),csrf:session.csrf,appearance:appearance(db,session)});
  if(req.method!=='POST')throw new Problem('Methode nicht erlaubt.',405);
  if(req.headers['x-csrf-token']!==session.csrf)throw new Problem('Sicherheitsprüfung fehlgeschlagen. Bitte neu anmelden.',403,'forbidden');
  // After a --temporary password from the administrator, nothing but choosing an own password (and signing out) is open.
  if(session.must_change_password&&path!=='/api/crm'&&path!=='/api/logout')throw new Problem('Bitte lege zuerst ein eigenes Passwort fest.',403,'password_change_required');
  if(path==='/api/logout'){logEvent(db,{event:'logout',user:session,ip:clientIP(req)});db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.token_hash);live.endSession(session.token_hash);res.setHeader('Set-Cookie',cookie('',0));return success(res,{});}
  if(path==='/api/import'){if(parsing>=2||limited(db,'upload:'+session.id,20,60000))throw new Problem('Bitte kurz warten und erneut importieren.',429);parsing++;try{const raw=await body(req,10*1024*1024);let p;try{p=await parseEmail(raw,session.email);}catch(e){throw new Problem(e.message||'E-Mail konnte nicht gelesen werden.');}return success(res,stageImport(db,session,p));}finally{parsing--;}}
  if(path==='/api/fastbill'){
   if(!String(req.headers['content-type']).startsWith('application/json'))throw new Problem('JSON erwartet.',415);
   if(parsing>=2||limited(db,'fastbill:'+session.id,300,60000))throw new Problem('Bitte kurz warten.',429);
   parsing++;try{const b=JSON.parse((await body(req,10*1024*1024)).toString());let data;
    if(['inspect','csv','api'].includes(b.action)&&limited(db,'fastbill-source:'+session.id,20,60000))throw new Problem('Bitte kurz warten und erneut laden.',429);
    switch(b.action){
     case 'inspect':data=inspectCSV(b.text);break;
     case 'csv':data=stageFastbill(db,session,{scope:b.scope,label:b.label,records:csvRecords(b.text,b.mapping,b.kind)});break;
     case 'api':{const page=await fetchFastbillPage(b);if(!getSession(db,req))throw new Problem('Bitte erneut anmelden.',401);data={...page,records:undefined,batch:page.records.length?stageFastbill(db,session,{scope:b.email.trim().toLowerCase(),label:'API · '+b.kind,batchId:b.batchId,records:page.records}):null};break;}
     case 'batches':data={items:fastbillBatches(db,session)};break;
     case 'rows':data=fastbillRows(db,session,b);break;
     case 'preview':data=fastbillPreview(db,session,b.rowId);break;
     case 'decide':data=decideFastbill(db,session,b);break;
     case 'delete':data=deleteFastbillBatch(db,session,b.batchId);break;
     default:throw new Problem('Unbekannte Importaktion.');
    }if(b.action==='decide')live.changed([],session.id);return success(res,data);
   }finally{parsing--;}
  }
  if(path!=='/api/crm')throw new Problem('Nicht gefunden.',404);
  if(!String(req.headers['content-type']).startsWith('application/json'))throw new Problem('JSON erwartet.',415);
  const b=JSON.parse((await body(req)).toString());let data;
  if(session.must_change_password&&b.action!=='passwordChange'&&b.action!=='appearanceSave')throw new Problem('Bitte lege zuerst ein eigenes Passwort fest.',403,'password_change_required');
  switch(b.action){
   case 'passwordChange':{
    if(limited(db,'password-change:'+session.id,5))throw new Problem('Zu viele Versuche. Bitte in zehn Minuten erneut versuchen.',429,'rate_limited');
    let ended;try{ended=await changePassword(db,session,b.current,b.next);}catch(e){throw new Problem(e.message);}
    if(!ended){logEvent(db,{event:'password_change_failed',user:session,ip:clientIP(req)});throw new Problem('Das bisherige Passwort stimmt nicht.',403,'password_invalid');}
    for(const hash of ended)live.endSession(hash);
    logEvent(db,{event:'password_changed',user:session,ip:clientIP(req),detail:ended.length?`${ended.length} weitere Sitzung${ended.length===1?'':'en'} beendet`:''});
    data={user:publicUser({...session,must_change_password:0}),signedOut:ended.length};break;}
   case 'appearanceSave':data=saveAppearance(db,session,b);break;
   case 'extensionStatus':data=extensionStatus(db,session);break;
   case 'extensionCreate':case 'extensionRenew':{
    // A browser key skips the sign-in for 90 days, so it needs a fresh code: a stolen session cookie alone cannot mint one.
    if(limited(db,'key-code:'+session.id,5))throw new Problem('Zu viele Versuche. Bitte in zehn Minuten erneut versuchen.',429,'rate_limited');
    if(!confirmCode(db,session.id,b.code)){logEvent(db,{event:'key_code_failed',user:session,ip:clientIP(req)});throw new Problem('Der Code stimmt nicht oder wurde schon benutzt. Bitte den nächsten Code aus der Authenticator-App eingeben.',403,'mfa_invalid');}
    data=b.action==='extensionRenew'?extensionRenew(db,session,b.id):extensionCreate(db,session,b.label);logEvent(db,{event:b.action==='extensionRenew'?'key_renewed':'key_created',user:session,ip:clientIP(req),detail:data.label});break;}
   case 'extensionRevoke':data=extensionRevoke(db,session,b.id);logEvent(db,{event:'key_revoked',user:session,ip:clientIP(req),detail:data.label});break;
   case 'securityEvents':data={items:recentEvents(db,session.id)};break;
   case 'load':data=listData(db);break;
   case 'calendar':data=calendar(db,session,b);break;
   case 'detail':data={entity:entity(db,b.id,true),history:history(db,b.id,0,b.historyKind||'all')};break;
   case 'history':data=history(db,b.id,b.offset,b.kind||'all');break;
   case 'search':data={ids:search(db,b.query)};break;
   case 'save':data=save(db,session,b);break;
   case 'create':data={entity:createOrg(db,session,b.name)};break;
   case 'callPrepare':data=prepareCall(db,session,b);break;
   case 'callCancel':data=cancelCall(db,session,b);break;
   case 'callSave':data=saveCall(db,session,b);break;
   case 'callOpen':data=openCall(db,session);break;
   case 'callDraft':data=draftCall(db,session,b);break;
   case 'callIncoming':data=startIncoming(db,session,b);break;
   case 'mobileHome':data=mobileHome(db,session);break;
   case 'mobileSearch':data=mobileSearch(db,b.query);break;
   case 'mobileDevices':data={items:mobileSessions(db,session.id),current:session.kind==='mobile'};break;
   case 'mobileDeviceRevoke':{const hash=revokeMobileSession(db,session.id,b.id);if(hash){live.endSession(hash);logEvent(db,{event:'device_revoked',user:session,ip:clientIP(req)});}data={items:mobileSessions(db,session.id)};break;}
   case 'queueReserve':data=reserveQueue(db,session,b);break;
   case 'activitySave':data=activitySave(db,session,b);break;
   case 'contact':data=contactSave(db,session,b);break;
   case 'link':data=linkSave(db,session,b);break;
   case 'locationSave':data=locationSave(db,session,b);break;
   case 'mapSearch':if(limited(db,'map-search:'+session.id,30,60000))throw new Problem('Bitte kurz warten.',429);data={items:await map.search(b.query)};break;
   case 'reviewDone':data=reviewDone(db,session,b);break;
   case 'organisationDelete':data=deleteOrganisation(db,session,b);break;
   case 'organisationMerge':data=mergeOrganisations(db,session,b);break;
   case 'imports':data={items:db.prepare('SELECT id,payload_json FROM email_imports WHERE user_id=? AND expires_at>? ORDER BY rowid DESC').all(session.id,Date.now()).map(r=>{const p=JSON.parse(r.payload_json);return{id:r.id,subject:p.subject,sentAt:p.sentAt,direction:p.direction};})};break;
   case 'importPreview':data=importPreview(db,session,b.importId);break;
   case 'importPosition':data=timelinePosition(db,session,b);break;
   case 'importConfirm':data=confirmImport(db,session,b);break;
   case 'importDelete':db.prepare('DELETE FROM email_imports WHERE id=? AND user_id=?').run(b.importId,session.id);data={};break;
   case 'message':{const m=db.prepare('SELECT * FROM messages WHERE id=?').get(b.id);if(!m)throw new Problem('Nachricht nicht gefunden.',404);data={body:m.body,subject:m.subject,direction:m.direction,sentAt:m.sent_at,sender:JSON.parse(m.sender_json),recipients:JSON.parse(m.recipients_json),contacts:db.prepare('SELECT c.id,c.name FROM contacts c JOIN activity_contacts ac ON ac.contact_id=c.id JOIN activities a ON a.id=ac.activity_id WHERE a.message_id=?').all(m.id),sources:db.prepare('SELECT mailbox,source_url FROM message_sources WHERE message_id=?').all(b.id)};break;}
   default:throw new Problem('Unbekannte Aktion.');
  }if(!quiet.has(b.action))live.changed(touched(b,data),session.id);return success(res,data);
 }
 if(req.method!=='GET'&&req.method!=='HEAD')throw new Problem('Methode nicht erlaubt.',405);
 // The phone app lives under /m/ with its own page, manifest, service worker and icons; the desktop page is unchanged.
 const rel=path==='/index.html'||path==='/'?'index.html':path==='/m'||path==='/m/'?'m/index.html':path.slice(1);if(rel!=='index.html'&&!rel.startsWith('assets/')&&!rel.startsWith('m/'))throw new Problem('Nicht gefunden.',404);const file=resolve(staticDir,rel);if(!file.startsWith(staticDir+'/'))throw new Problem('Nicht gefunden.',404);let bytes;try{bytes=await readFile(file);}catch{throw new Problem('Nicht gefunden.',404);}const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json; charset=utf-8'};
 // Hashed assets never change; the pages, the manifest and the service worker are always checked, so an update reaches the phone on the next open.
 const cache=rel.startsWith('assets/')?'public, max-age=31536000, immutable':rel.endsWith('.png')?'public, max-age=86400':'no-cache';
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':rel.endsWith('index.html')?'no-store':cache,...(rel==='m/sw.js'?{'Service-Worker-Allowed':'/m/'}:{})});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(e){if(e instanceof SyntaxError)return json(res,400,{status:'invalid',message:'Ungültige Eingabe.'});if(!(e instanceof Problem))console.error('Request failed:',e.code||e.name);if(!res.headersSent)json(res,e.http||500,{status:e.code||'error',message:e instanceof Problem?e.message:'Die Anfrage konnte nicht verarbeitet werden.'});else res.end();}});
 server.requestTimeout=30000;server.headersTimeout=15000;const cleanup=setInterval(()=>{db.prepare('DELETE FROM email_imports WHERE expires_at<?').run(Date.now());db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());pruneEvents(db);},60000);cleanup.unref();server.on('close',()=>clearInterval(cleanup));
 // Open live streams would otherwise keep close() waiting forever.
 const close=server.close.bind(server);server.close=cb=>{live.close();return close(cb);};server.live=live;return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){process.umask(0o077);const db=openDB();const server=makeServer(db),stopSnapshots=scheduleSnapshots(db);server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log('Stage Force listening on port '+(process.env.PORT||3000)));for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{stopSnapshots();db.close();process.exit(0);}));}
