/* TF Post Card Studio — service worker (offline + fast start) */
const VERSION = 'tfpc-v13';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './mp4-muxer.mjs'];
const RUNTIME = 'tfpc-runtime';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function notifyUpdate(){ const list = await self.clients.matchAll({ type: 'window' }); list.forEach(c => c.postMessage({ type: 'UPDATED' })); }

/* app page: open instantly from cache, refresh the copy in the background */
async function appShell(req){
  const cache = await caches.open(VERSION);
  const cached = await cache.match('./index.html');
  const net = fetch(req, { cache: 'no-cache' }).then(async res => {
    if(res && res.ok && res.type === 'basic'){
      const old = cached && (cached.headers.get('etag') || cached.headers.get('last-modified'));
      const neu = res.headers.get('etag') || res.headers.get('last-modified');
      await cache.put('./index.html', res.clone());
      if(cached && old && neu && old !== neu) notifyUpdate();
    }
    return res;
  }).catch(() => null);
  return cached || (await net) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}
async function cacheFirst(req){
  const cache = await caches.open(RUNTIME); const hit = await cache.match(req); if(hit) return hit;
  const res = await fetch(req); if(res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res;
}
async function staleWhileRevalidate(req){
  const cache = await caches.open(RUNTIME); const hit = await cache.match(req);
  const net = fetch(req).then(res => { if(res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
async function networkFirst(req){
  const cache = await caches.open(RUNTIME);
  try{ const res = await fetch(req); if(res && res.ok) cache.put(req, res.clone()); return res; }
  catch(e){ const hit = await cache.match(req); if(hit) return hit; throw e; }
}

self.addEventListener('fetch', e => {
  const req = e.request; if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin === location.origin){
    if(req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')){ e.respondWith(appShell(req)); return; }
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
    return;
  }
  if(url.hostname === 'fonts.gstatic.com'){ e.respondWith(cacheFirst(req)); return; }
  if(url.hostname === 'fonts.googleapis.com'){ e.respondWith(staleWhileRevalidate(req)); return; }
  if(url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'api.alquran.cloud'){ e.respondWith(networkFirst(req)); return; }
  /* Gemini AI, image proxies etc. go straight to the network */
});
