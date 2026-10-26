// The phone app's service worker. It only makes the app open fast: hashed assets come from the cache, the page from the network
// with the last copy as a fallback. CRM data (/api/) is never cached and always comes from the server.
const CACHE='stageforce-m-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const key of await caches.keys())if(key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
 if(url.pathname.startsWith('/assets/'))e.respondWith(caches.open(CACHE).then(async c=>{const hit=await c.match(e.request);if(hit)return hit;const res=await fetch(e.request);if(res.ok)c.put(e.request,res.clone());return res;}));
 else if(e.request.mode==='navigate'&&url.pathname.startsWith('/m'))e.respondWith(fetch(e.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put('/m/',copy));}return res;}).catch(async()=>(await caches.match('/m/'))||Response.error()));
});
