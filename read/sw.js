const CACHE = "atom-v124-k9a3d36", STATIC = "atom-static-2";
const DATA = ["manifest.json", "classlib.json", "storylib.json"];
const ASSETS = ["icon-192.png", "icon-512.png", "apple-touch-icon.png", "Lexend-Regular.woff2", "Lexend-Bold.woff2", "OpenDyslexic-Regular.woff2", "OpenDyslexic-Bold.woff2", "pdf.min.js", "pdf.worker.min.js", "dictionary.json", "mascot.png",
  "ico-cream.png", "ico-coral.png", "ico-robot.png", "ico-gold.png", "ico-diamond.png", "ico-a-blue.png", "ico-a-green.png", "ico-a-orange.png", "ico-a-purple.png", "ico-a-pink.png", "ico-a-teal.png", "ico-fern.png", "ico-hat.png", "ico-moth.png", "ico-stag.png", "ico-flame.png", "ico-owl.png", "ico-ghost.png"];
const SHELL = "index.html";

// A school filter can send back its own "blocked" page. Only keep responses that are really Atom.
const plain = res => res && res.ok && res.status === 200 && !res.redirected && res.type === "basic";
async function realPage(res) {
  if (!plain(res)) return false;
  try { return (await res.clone().text()).includes('name="atom-app"'); } catch (e) { return false; }
}
async function realJson(res) {
  if (!plain(res)) return false;
  try { JSON.parse(await res.clone().text()); return true; } catch (e) { return false; }
}
// give up on a slow connection instead of hanging
function fetchSoon(req, ms) {
  return new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error("slow")), ms);
    fetch(req, { cache: "no-store" }).then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); bad(e); });
  });
}

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const pc = await caches.open(CACHE);
    // if the page we get isn't Atom (blocked or offline), stop here and keep the old version
    const page = await fetch(SHELL, { cache: "reload" });
    if (!(await realPage(page))) throw new Error("not Atom");
    await pc.put(SHELL, page);
    for (const f of DATA) { try { const r = await fetch(f, { cache: "reload" }); if (await realJson(r)) await pc.put(f, r); } catch (err) {} }
    // big files are kept between updates, so only new ones download
    const s = await caches.open(STATIC);
    for (const f of ASSETS) { if (!(await s.match(f))) { try { const r = await fetch(f); if (plain(r)) await s.put(f, r); } catch (err) {} } }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keep = await caches.open(CACHE), old = (await caches.keys()).filter(k => k !== CACHE && k !== STATIC);
    // carry over anything the new cache is missing, then drop old caches
    for (const k of old) {
      const c = await caches.open(k);
      for (const r of await c.keys()) { const name = new URL(r.url).pathname.split("/").pop(); if ([SHELL, ...DATA].includes(name) && !(await keep.match(name))) { const hit = await c.match(r); if (hit) await keep.put(name, hit); } }
      await caches.delete(k);
    }
    try { const s = await caches.open(STATIC); for (const f of ["classlib.json", "storylib.json"]) await s.delete(f, { ignoreSearch: true }); } catch (err) {}
    await self.clients.claim();
  })());
});

// the app asks for the newest page right before it reloads to update
self.addEventListener("message", e => {
  if (!e.data || e.data.type !== "atom-refresh") return;
  e.waitUntil((async () => {
    try { const res = await fetchSoon(SHELL, 15000); if (await realPage(res)) await (await caches.open(CACHE)).put(SHELL, res); } catch (err) {}
    if (e.ports && e.ports[0]) e.ports[0].postMessage("ok");
  })());
});

async function tell(msg) { for (const c of await self.clients.matchAll({ type: "window" })) c.postMessage(msg); }

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const name = url.pathname.split("/").pop();
  // the app checking for an update: always ask the server
  if (url.searchParams.has("fresh")) return;
  // other pages (like privacy.html) load as themselves, not as the app
  const isShell = name === SHELL || url.pathname.endsWith("/") || (req.mode === "navigate" && !/\.html$/.test(name));

  if (isShell) {
    // open the saved copy right away; check for a newer one in the background
    e.respondWith((async () => {
      const c = await caches.open(CACHE), hit = await c.match(SHELL), oldText = hit ? hit.clone().text() : Promise.resolve("");
      const check = (async () => {
        try {
          const res = await fetchSoon(SHELL, 15000);
          if (!(await realPage(res))) return null;
          const fresh = await res.clone().text(), old = await oldText;
          await c.put(SHELL, res.clone());
          if (hit && fresh !== old) tell({ type: "atom-update" });
          return res;
        } catch (err) { return null; }
      })();
      if (hit) { e.waitUntil(check); return hit; }
      const got = await check;
      if (got) return got;
      try { return await fetch(req); } catch (err) { return new Response("<!doctype html><meta name=viewport content='width=device-width'><body style='font:18px system-ui;padding:40px;text-align:center'>Atom needs internet the first time. Open learnwithatom.org once on home WiFi, then it works offline.</body>", { headers: { "Content-Type": "text/html" } }); }
    })());
    return;
  }

  if (/\.html$/.test(name)) {
    // other pages: get the newest copy, fall back to the saved one offline
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try { const res = await fetchSoon(req, 8000); if (plain(res)) { await c.put(name, res.clone()); return res; } } catch (err) {}
      return (await c.match(name)) || fetch(req);
    })());
    return;
  }

  if (DATA.includes(name)) {
    // saved copy first, refreshed in the background
    e.respondWith((async () => {
      const c = await caches.open(CACHE), hit = await c.match(name);
      const check = (async () => {
        try { const res = await fetchSoon(req, 20000); if (await realJson(res)) { await c.put(name, res.clone()); return res; } } catch (err) {}
        return null;
      })();
      if (hit) { e.waitUntil(check); return hit; }
      return (await check) || fetch(req);
    })());
    return;
  }

  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (plain(res)) { const copy = res.clone(); caches.open(STATIC).then(c => c.put(req, copy)).catch(() => {}); }
    return res;
  })));
});
