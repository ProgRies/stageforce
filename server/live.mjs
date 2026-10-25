// Live updates over Server-Sent Events. The stream only says which organisations changed and who changed them;
// open tabs then fetch the contents through the normal, permission-checked API.
export function liveHub(db,{perUser=6,total=200,coalesceMs=250,heartbeatMs=25000,recheckMs=30000,watchMs=2000}={}){
 const clients=new Set();let ids=new Set(),by=new Set(),all=false,timer=null;
 let seen=db.prepare('PRAGMA data_version').get().data_version;
 const write=(c,text)=>{try{c.res.write(text);}catch{drop(c);}};
 const send=(c,event,data)=>write(c,`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
 function drop(c,event){if(!clients.delete(c))return;if(event)try{c.res.write(`event: ${event}\ndata: {}\n\n`);}catch{}c.res.end();}
 function flush(){timer=null;const data={ids:all?[]:[...ids],all,by:[...by]};ids=new Set();by=new Set();all=false;for(const c of clients)send(c,'change',data);}
 // Bursts (a FastBill batch, a merge) become one message per tab.
 function changed(orgIds=[],userId=null){const list=orgIds.filter(id=>typeof id==='string'&&id);if(!list.length)all=true;for(const id of list)ids.add(id);if(userId)by.add(userId);if(!timer&&clients.size)timer=setTimeout(flush,coalesceMs);}
 const valid=c=>!!db.prepare('SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 AND EXISTS(SELECT 1 FROM user_mfa m WHERE m.user_id=u.id)').get(c.tokenHash,Date.now());
 const ticks=[
  setInterval(()=>{for(const c of clients)write(c,': ping\n\n');},heartbeatMs),
  // A logout in another tab, an expired session or a deactivated user ends the stream.
  setInterval(()=>{for(const c of clients)if(!valid(c))drop(c,'expired');},recheckMs),
  // Writes from another process (the CLI) do not pass through this server; SQLite's data_version reveals them.
  setInterval(()=>{const v=db.prepare('PRAGMA data_version').get().data_version;if(v!==seen){seen=v;changed();}},watchMs),
 ];for(const t of ticks)t.unref();
 function open(req,res,session){
  const mine=[...clients].filter(c=>c.userId===session.id);
  if(mine.length>=perUser)drop(mine[0]);
  if(clients.size>=total){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Retry-After':'30'});res.end(JSON.stringify({status:'busy',message:'Zu viele Live-Verbindungen.'}));return;}
  req.socket.setTimeout(0);
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no','Connection':'keep-alive'});
  const c={res,userId:session.id,tokenHash:session.token_hash};clients.add(c);
  write(c,'retry: 3000\n\n');send(c,'ready',{});
  res.on('close',()=>clients.delete(c));
 }
 function endSession(tokenHash){for(const c of clients)if(c.tokenHash===tokenHash)drop(c,'expired');}
 function close(){for(const t of ticks)clearInterval(t);clearTimeout(timer);for(const c of [...clients])drop(c);}
 return{open,changed,endSession,close,get size(){return clients.size;}};
}
