import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(process.argv[2],'utf8')),crm=config.services.crm;
assert.equal(crm.image,'stageforce:0.3.8-local');assert.ok(crm.build);assert.equal(crm.environment.APP_URL,'http://localhost:3000');assert.equal(crm.environment.NODE_ENV,'development');
assert.ok(crm.ports.every(p=>p.host_ip==='127.0.0.1'));assert.ok(crm.volumes.some(v=>v.type==='volume'&&v.target==='/app/data'));
console.log('Local Compose checks passed.');
