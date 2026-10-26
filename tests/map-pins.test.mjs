import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDB} from '../server/db.mjs';
import {addUser,createSession} from '../server/auth.mjs';
import {enableMfa,newSecret} from '../server/mfa.mjs';
import {createOrg,getOrg,entity,listData} from '../server/crm.mjs';
import {deleteOrganisation,mergeOrganisations} from '../server/lifecycle.mjs';
import {locationSave,mapService} from '../server/map.mjs';
import {makeServer} from '../server/http.mjs';
async function setup(){const db=openDB(':memory:');const id=await addUser(db,'alex@team.test','Alex','long-password-1234');return{db,user:db.prepare('SELECT * FROM users WHERE id=?').get(id)};}
const pin=(db,user,id,location)=>locationSave(db,user,{id,version:getOrg(db,id).version,location});
const PNG=Buffer.from('89504e470d0a1a0a','hex');

test('a pin is optional, versioned, audited and shown in the list for everyone',async()=>{const{db,user}=await setup();const a=createOrg(db,user,'Stadt A'),b=createOrg(db,user,'Stadt B');
 assert.equal(entity(db,a.id).location,null);
 const saved=pin(db,user,a.id,{lat:49.01951234567,lng:'12.0974'});assert.deepEqual(saved.entity.location,{lat:49.019512,lng:12.0974});
 assert.deepEqual(listData(db).entities.map(e=>e.location),[{lat:49.019512,lng:12.0974},null]);
 assert.throws(()=>locationSave(db,user,{id:a.id,version:'1',location:{lat:50,lng:10}}),/inzwischen geändert/);
 assert.throws(()=>pin(db,user,a.id,{lat:49.019512,lng:12.0974}),/Keine Änderung/);
 for(const bad of [{lat:91,lng:0},{lat:0,lng:-181},{lat:'',lng:1},{lat:'x',lng:1},{lat:0}])assert.throws(()=>pin(db,user,b.id,bad),/Ungültiger Standort/);
 pin(db,user,a.id,{lat:49.1,lng:12.1});assert.equal(pin(db,user,a.id,null).entity.location,null);
 assert.deepEqual(db.prepare("SELECT body FROM activities WHERE organisation_id=? AND kind='CRM-Änderung' ORDER BY created_at,rowid").all(a.id).map(r=>r.body),['Kartenpin gesetzt','Kartenpin verschoben','Kartenpin entfernt']);
 assert.equal(db.prepare("SELECT count(*) n FROM audit_log WHERE organisation_id=? AND action='location'").get(a.id).n,3);
});

test('merging keeps the target pin or takes the source pin, deleting removes it',async()=>{const{db,user}=await setup();const a=createOrg(db,user,'A'),b=createOrg(db,user,'B'),c=createOrg(db,user,'C');
 pin(db,user,a.id,{lat:1,lng:1});pin(db,user,b.id,{lat:2,lng:2});
 mergeOrganisations(db,user,{id:a.id,into:b.id,version:getOrg(db,a.id).version});assert.deepEqual(entity(db,b.id).location,{lat:2,lng:2});
 mergeOrganisations(db,user,{id:b.id,into:c.id,version:getOrg(db,b.id).version});assert.deepEqual(entity(db,c.id).location,{lat:2,lng:2});
 deleteOrganisation(db,user,{id:c.id,version:getOrg(db,c.id).version,confirmName:'C'});assert.equal(db.prepare('SELECT count(*) n FROM organisation_locations').get().n,0);
});

test('tiles are fetched by the server, cached, validated and only for signed-in users',async()=>{const dir=mkdtempSync(join(tmpdir(),'sf-tiles-'));let calls=[];const fetcher=async(url,init)=>{calls.push([String(url),init.headers['User-Agent']]);return new Response(PNG,{headers:{'Content-Type':'image/png'}});};
 const map=mapService({dir,tileURL:'https://tiles.test/{z}/{x}/{y}.png',searchURL:'https://search.test/search',agent:'StageForce CRM (http://localhost:3000)',fetcher});
 const{db,user}=await setup();const server=makeServer(db,{origin:'http://localhost:3000',map});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{enableMfa(db,user.id,newSecret());const{token}=createSession(db,user),cookie='stage_session='+token;
  assert.equal((await fetch(base+'/api/map/tile/3/4/5.png')).status,401);
  let r=await fetch(base+'/api/map/tile/3/4/5.png',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await r.arrayBuffer()),PNG);
  r=await fetch(base+'/api/map/tile/3/4/5.png',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.equal(calls.length,1,'second request comes from the disk cache');
  assert.deepEqual(calls[0],['https://tiles.test/3/4/5.png','StageForce CRM (http://localhost:3000)']);assert.ok(existsSync(join(dir,'3','4','5.png')));
  for(const bad of ['/api/map/tile/3/8/1.png','/api/map/tile/20/1/1.png','/api/map/tile/3/../1.png','/api/map/tile/3/1/1.jpg'])assert.equal((await fetch(base+bad,{headers:{Cookie:cookie}})).status,404,bad);
  assert.equal(calls.length,1);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});

test('place search sends only the typed text and returns clean results',async()=>{let seen;const fetcher=async url=>{seen=new URL(url);return Response.json([{display_name:'Regensburg, Bayern, Deutschland',lat:'49.0195',lon:'12.0974'},{display_name:'',lat:'1',lon:'1'},{display_name:'Broken',lat:'999',lon:'1'}]);};
 const map=mapService({searchURL:'https://search.test/search',fetcher});
 assert.deepEqual(await map.search('  Regensburg  '),[{label:'Regensburg, Bayern, Deutschland',lat:49.0195,lng:12.0974}]);assert.equal(seen.searchParams.get('q'),'Regensburg');assert.equal(seen.origin,'https://search.test');
 assert.deepEqual(await map.search(''),[]);
 await assert.rejects(mapService({searchURL:'https://search.test',fetcher:async()=>{throw Error('offline');}}).search('x'),/nicht erreichbar/);
 await assert.rejects(mapService({tileURL:'',fetcher}).tile(1,1,1),/deaktiviert/);
});
