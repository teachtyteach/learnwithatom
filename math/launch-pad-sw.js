/* Atom Math offline helper. Pages always come fresh from the internet when online (so uploads show up right away),
   and fall back to the saved copy when offline. Students never need to reinstall the home-screen app. */
const CACHE="lpm-v3";
const FILES=["./","launch-pad-manifest.json","lpm-icon-192.png","lpm-icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil((async()=>{const c=await caches.open(CACHE);for(const f of FILES){try{await c.add(new Request(f,{cache:"reload"}))}catch(x){}}await self.skipWaiting()})())});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET"||new URL(r.url).origin!==self.location.origin)return;
  const page=r.mode==="navigate"||/\.html?$|\/$/.test(new URL(r.url).pathname);
  const net=page?fetch(r,{cache:"no-store"}):fetch(r);
  e.respondWith(net.then(res=>{if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(page?"./":r,copy))}return res})
    .catch(()=>caches.match(page?"./":r,{ignoreSearch:true}).then(h=>h||caches.match("./"))));
});
