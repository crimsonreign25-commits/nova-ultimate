const CACHE='nova-v21.5.0-encrypted-router';
const ASSETS=['/','/index.html','/styles.css?v=21.5.0-encrypted-router','/app.js?v=21.5.0-encrypted-router','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  // Never cache private APIs, AI responses, account data, or cross-origin responses.
  if(url.origin!==self.location.origin || url.pathname.startsWith('/api/') || ['/assist','/research','/scan-url','/predict','/health'].includes(url.pathname))return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok&&ASSETS.some(asset=>url.pathname===asset.split('?')[0])){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/'))));
});
