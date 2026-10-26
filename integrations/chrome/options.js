const $=id=>document.getElementById(id);
async function send(message){const r=await chrome.runtime.sendMessage(message);if(!r.ok)throw Error(r.error);return r.data;}
send({type:'settings'}).then(c=>{if(c.origin)$('origin').value=c.origin;$('status').textContent=c.email?'Connected as '+c.email:'';}).catch(e=>$('status').textContent=e.message);
document.querySelector('form').onsubmit=async e=>{
 e.preventDefault();try{
  const u=new URL($('origin').value.trim());if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))throw Error('Use HTTPS, or HTTP on localhost only.');
  const granted=await chrome.permissions.request({origins:[u.origin+'/*']});if(!granted)throw Error('Access to this CRM address is required.');
  const c=await send({type:'connect',origin:u.origin,token:$('token').value.trim()});$('token').value='';$('status').textContent='Connected as '+c.email+'. Refresh Gmail.';
 }catch(e){$('status').textContent=e.message;}
};
$('disconnect').onclick=async()=>{try{await send({type:'disconnect'});$('token').value='';$('status').textContent='Disconnected. Revoke the key in CRM settings if needed.';}catch(e){$('status').textContent=e.message;}};
