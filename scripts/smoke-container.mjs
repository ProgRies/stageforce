import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const image=process.argv[2]||'stageforce:0.1.2',name='stage-crm-check-'+process.pid,volume=name+'-data',password=randomBytes(24).toString('base64url');
const docker=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
try{
 docker(['volume','create',volume]);docker(['run','-d','--name',name,'-p','127.0.0.1::3000','-e','APP_URL=https://crm.example.test','-v',volume+':/app/data',image]);
 const address=()=> 'http://127.0.0.1:'+JSON.parse(docker(['inspect',name]))[0].NetworkSettings.Ports['3000/tcp'][0].HostPort;
 let base=address();
 for(let i=0;i<30;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}if(i===29)throw Error('Container did not become healthy');await new Promise(r=>setTimeout(r,500));}
 docker(['exec','-i',name,'node','server/cli.mjs','user:add','demo@example.test','Demo','--password-stdin'],{input:password+'\n'});
 const login=async()=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'https://crm.example.test','Content-Type':'application/json'},body:JSON.stringify({email:'demo@example.test',password})});if(!r.ok)throw Error('Login failed');const session=await r.json();return{csrf:session.data.csrf,cookie:r.headers.get('set-cookie').split(';')[0]};};
 const crm=async(auth,body)=>(await fetch(base+'/api/crm',{method:'POST',headers:{Origin:'https://crm.example.test','Content-Type':'application/json','X-CSRF-Token':auth.csrf,Cookie:auth.cookie},body:JSON.stringify(body)})).json();
 await crm(await login(),{action:'create',name:'Persistence check'});
 docker(['restart',name]);
 // Docker may assign a new ephemeral host port when the container restarts.
 base=address();
 let ready=false;for(let i=0;i<30;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('Restart health failed');
 const loaded=await crm(await login(),{action:'load'});if(loaded.data.entities.map(e=>e.values[1]).join()!=='Persistence check')throw Error('Persistence check failed');console.log('Container login and restart persistence passed.');
}catch(error){try{console.error(docker(['logs','--tail','40',name]));}catch{}throw error;}finally{try{docker(['rm','-f',name]);}catch{}try{docker(['volume','rm',volume]);}catch{}}
