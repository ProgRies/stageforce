import {execFileSync} from 'node:child_process';
import {randomBytes,createHmac} from 'node:crypto';
const image=process.argv[2]||'stageforce:0.1.2',name='stage-crm-check-'+process.pid,volume=name+'-data',password=randomBytes(24).toString('base64url');
const docker=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
try{
 docker(['volume','create',volume]);docker(['run','-d','--name',name,'-p','127.0.0.1::3000','-e','APP_URL=https://crm.example.test','-v',volume+':/app/data',image]);
 const address=()=> 'http://127.0.0.1:'+JSON.parse(docker(['inspect',name]))[0].NetworkSettings.Ports['3000/tcp'][0].HostPort;
 let base=address();
 for(let i=0;i<30;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}if(i===29)throw Error('Container did not become healthy');await new Promise(r=>setTimeout(r,500));}
 docker(['exec','-i',name,'node','server/cli.mjs','user:add','demo@example.test','Demo','--password-stdin'],{input:password+'\n'});
 // Standalone TOTP so the check exercises the image's MFA step without importing server code.
 const code=(secret,offset=0)=>{let bits='';for(const ch of secret)bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)+offset));const h=createHmac('sha1',key).update(counter).digest(),o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1e6).padStart(6,'0');};
 let secret=null,used=0;
 const login=async()=>{const post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{Origin:'https://crm.example.test','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  let r=await post('/api/login',{email:'demo@example.test',password});if(!r.ok)throw Error('Login failed');const step=(await r.json()).data,challenge=r.headers.get('set-cookie').split(';')[0];
  if(step.mfa==='setup')secret=step.secret;else if(step.mfa!=='verify'||!secret)throw Error('MFA step missing');
  // A code is accepted once; the second login in this check uses the next time step.
  r=await post('/api/login/mfa',{code:code(secret,used++)},challenge);if(!r.ok)throw Error('MFA failed');const session=await r.json();return{csrf:session.data.csrf,cookie:r.headers.getSetCookie().find(c=>c.startsWith('stage_session=')).split(';')[0]};};
 const crm=async(auth,body)=>(await fetch(base+'/api/crm',{method:'POST',headers:{Origin:'https://crm.example.test','Content-Type':'application/json','X-CSRF-Token':auth.csrf,Cookie:auth.cookie},body:JSON.stringify(body)})).json();
 await crm(await login(),{action:'create',name:'Persistence check'});
 docker(['restart',name]);
 // Docker may assign a new ephemeral host port when the container restarts.
 base=address();
 let ready=false;for(let i=0;i<30;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('Restart health failed');
 const loaded=await crm(await login(),{action:'load'});if(loaded.data.entities.map(e=>e.values[1]).join()!=='Persistence check')throw Error('Persistence check failed');console.log('Container login and restart persistence passed.');
}catch(error){try{console.error(docker(['logs','--tail','40',name]));}catch{}throw error;}finally{try{docker(['rm','-f',name]);}catch{}try{docker(['volume','rm',volume]);}catch{}}
