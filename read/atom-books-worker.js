// Atom free books helper (Cloudflare Worker).
// It only fetches Project Gutenberg search results and public-domain EPUB files for Atom.
const ALLOW = "*";
const headers = (type, age) => ({ "Access-Control-Allow-Origin": ALLOW, "Content-Type": type, "Cache-Control": `public, max-age=${age}` });

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": ALLOW, "Access-Control-Allow-Methods": "GET" } });
    if (request.method !== "GET") return new Response("Only GET", { status: 405 });

    // search: /search?q=pride
    if (url.pathname === "/search") {
      const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
      if (!q) return new Response('{"results":[]}', { headers: headers("application/json", 3600) });
      const api = "https://gutendex.com/books/?languages=en&copyright=false&mime_type=application%2Fepub&search=" + encodeURIComponent(q);
      const r = await fetch(api, { cf: { cacheTtl: 86400, cacheEverything: true } });
      return new Response(r.body, { status: r.status, headers: headers("application/json", 3600) });
    }

    // book file: /epub/1342
    const m = url.pathname.match(/^\/epub\/(\d{1,6})$/);
    if (m) {
      const id = m[1];
      const r = await fetch(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.epub`, { cf: { cacheTtl: 604800, cacheEverything: true } });
      if (!r.ok) return new Response("Not found", { status: 404, headers: headers("text/plain", 60) });
      return new Response(r.body, { headers: headers("application/epub+zip", 604800) });
    }

    if (url.pathname === "/" || url.pathname === "/ping") return new Response("ok", { headers: headers("text/plain", 60) });
    return new Response("Not found", { status: 404, headers: headers("text/plain", 60) });
  }
};
