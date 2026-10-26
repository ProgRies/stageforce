import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Check Docker's resolved configuration, including interpolation and normalization.
// Usage: node scripts/check-compose.mjs production.json local.json
const [prod,local]=process.argv.slice(2).map(f=>JSON.parse(readFileSync(f,'utf8')));
// Production must pin an exact release: a moving tag would ship whatever reaches main.
let crm=prod.services.crm;
assert.match(crm.image,/^ghcr\.io\/progries\/stageforce:\d+\.\d+\.\d+$/,'CRM_IMAGE must name an exact release version');
assert.equal(crm.image.split(':')[1],JSON.parse(readFileSync('package.json','utf8')).version,'.env.example must name the version being released');
assert.equal(crm.build,undefined,'Production must pull a published image');
assert.ok(!crm.ports?.length,'Only Traefik may expose the application');
assert.equal(crm.environment.APP_URL,'https://stageforce.jaimo.me');
assert.equal(crm.environment.NODE_ENV,'production');
assert.equal(crm.environment.TRUST_PROXY,'1');
assert.equal(crm.environment.SNAPSHOT_INTERVAL_HOURS,'6');
assert.equal(crm.environment.SNAPSHOT_KEEP,'28');
assert.equal(crm.labels['traefik.http.routers.stage-crm.rule'],'Host(`stageforce.jaimo.me`)');
assert.equal(crm.labels['traefik.docker.network'],prod.networks['reverse-proxy'].name);
assert.equal(prod.networks['reverse-proxy'].external,true);
assert.ok(crm.volumes.some(v=>v.type==='volume'&&v.source==='storage'&&v.target==='/app/data'));
assert.equal(crm.read_only,true);
assert.ok(crm.healthcheck.test.includes('node'));
assert.equal(crm.logging.options['max-size'],'10m');
crm=local.services.crm;
assert.ok(crm.build);assert.equal(crm.environment.APP_URL,'http://localhost:3000');assert.equal(crm.environment.NODE_ENV,'development');
assert.ok(crm.ports.every(p=>p.host_ip==='127.0.0.1'));assert.ok(crm.volumes.some(v=>v.type==='volume'&&v.source==='demo-storage'&&v.target==='/app/data'));
console.log('Production and local Compose checks passed.');
