import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Check Docker's resolved configuration, including interpolation and normalization.
const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const crm = config.services.crm;
assert.equal(crm.image, 'ghcr.io/progries/stageforce:latest');
assert.equal(crm.build, undefined, 'Production must pull a published image');
assert.ok(!crm.ports?.length, 'Only Traefik may expose the application');
assert.equal(crm.environment.APP_URL, 'https://stageforce.jaimo.me');
assert.equal(crm.environment.NODE_ENV, 'production');
assert.equal(crm.labels['traefik.http.routers.stage-crm.rule'], 'Host(`stageforce.jaimo.me`)');
assert.equal(crm.labels['traefik.docker.network'], config.networks['reverse-proxy'].name);
assert.equal(config.networks['reverse-proxy'].external, true);
assert.ok(crm.volumes.some(v => v.type === 'volume' && v.source === 'storage' && v.target === '/app/data'));
assert.equal(crm.read_only, true);
assert.ok(crm.healthcheck.test.includes('node'));
assert.equal(crm.logging.options['max-size'], '10m');
console.log('Production Compose checks passed.');
