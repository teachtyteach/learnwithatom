/* learnwithatom.org main page offline helper.
   Only handles the main page. Atom Reading (/read/) and Atom Math (/math/) have their own. */
const CACHE = "atom-home-e63e44e6";
const FILES = ["/", "/atom.png", "/mascot.png", "/atom-hi.webp", "/manifest.json"];
self.addEventListener("install", e => { e.waitUntil((async () => { const c = await caches.open(CACHE); for (const f of FILES) { try { await c.add(new Request(f, { cache: "reload" })); } catch (x) {} } await self.skipWaiting(); })()); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("atom-home-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin || /^\/(read|math)(\/|$)/.test(u.pathname)) return;
  const page = r.mode === "navigate" || u.pathname === "/" || u.pathname === "/index.html";
  const net = page ? fetch(r, { cache: "no-store" }) : fetch(r);
  e.respondWith(net.then(res => { if (res && res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(page ? "/" : r, copy)); } return res; })
    .catch(() => caches.match(page ? "/" : r, { ignoreSearch: true }).then(h => h || caches.match("/"))));
});
