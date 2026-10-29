const failure=(message,code)=>Object.assign(new Error(message),{code});
const ready=chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
function validOrigin(value){const u=new URL(value);if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))throw Error('Use an HTTPS CRM address, or http://localhost:3000.');return u.origin;}
async function request(config,payload){
 const origin=validOrigin(config?.origin||'');if(!/^sf_ext_[A-Za-z0-9_-]{43}$/.test(config?.token||''))throw failure('Connect Stage Force using the extension settings.','connection_required');
 const response=await fetch(origin+'/api/integrations/extension',{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)}).catch(()=>{throw failure('CRM unavailable. Check that Docker is running and the CRM address is correct.','connection_unavailable');});
 let data;try{data=await response.json();}catch{throw failure('The CRM did not return a valid response. Check its address.','invalid_response');}
 if(!response.ok)throw failure(data?.message||'CRM request failed.',response.status===401?'connection_required':'request_failed');
 if(data?.status!=='success'||!data.data||typeof data.data!=='object')throw failure('The CRM did not confirm the request. Check its address.','invalid_response');return data.data;
}
chrome.action.onClicked.addListener(()=>chrome.runtime.openOptionsPage());
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 (async()=>{
  await ready;if(sender.id!==chrome.runtime.id)throw Error('Invalid sender.');
  const options=sender.url===chrome.runtime.getURL('options.html');
  if(options){
   if(message.type==='settings'){const {connection}=await chrome.storage.local.get('connection');return connection?{origin:connection.origin,email:connection.email}:{};}
   if(message.type==='disconnect'){await chrome.storage.local.remove('connection');return{};}
   if(message.type==='connect'){
    const origin=validOrigin(message.origin),token=message.token;
    const checked=await request({origin,token},{action:'check'});
    await chrome.storage.local.set({connection:{origin,token,email:checked.email}});return{origin,email:checked.email};
   }
   throw Error('Unknown setting.');
  }
  if(!sender.tab||new URL(sender.url).origin!=='https://mail.google.com')throw Error('Gmail only.');
  if(message.type==='options'){await chrome.runtime.openOptionsPage();return{};}
  const {connection}=await chrome.storage.local.get('connection');if(!connection)throw failure('Connect Stage Force first — use the connection button.','connection_required');
  if(message.type==='status'){const checked=await request(connection,{action:'check'});return{origin:connection.origin,email:checked.email,appearance:checked.appearance||'system'};}
  if(message.type==='open'){
   if(typeof message.organisationId!=='string'||message.organisationId.length>100)throw Error('Invalid organisation.');
   await chrome.tabs.create({url:validOrigin(connection.origin)+'/?organisation='+encodeURIComponent(message.organisationId)});return{};
  }
  if(message.type!=='api'||!['lookup','search','save','meeting','messageStatus','threadStatus','callPrepare','callSave','callCancel','callOpen','callDraft','contactSave'].includes(message.payload?.action))throw Error('Unknown request.');
  if(JSON.stringify(message.payload).length>1500000)throw Error('This message is too large.');
  return request(connection,message.payload);
 })().then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message,code:error.code||'request_failed'}));
 return true;
});
