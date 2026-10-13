/* Atom Locker — shared rewards for every learnwithatom.org app.
   Made by Mr. Lovrien 2026.

   The rule
   - Math rewards can only be UNLOCKED in Atom Math.
   - Reading rewards can only be UNLOCKED in Atom Reading.
   - Anything unlocked can be USED (equipped) in both apps.

   How it works
   - The locker lives in ONE small cookie scoped to learnwithatom.org, so
     read., math., and the main page all see the same rewards on the same
     device/browser. No accounts. No database. Nothing leaves the device.
   - Each app also keeps a local copy. Unlocks are never lost: the two copies
     are merged, so if the cookie is cleared, the locker rebuilds itself.
   - On learnwithatom.org, each app can only unlock its own rewards
     (math.learnwithatom.org can only unlock 'math' items, and so on).
   - On github.io test addresses it still works, but only inside that one site.

   Use in an app (copy this file into the app's repo):
     <script src="atom-locker.js"></script>
     AtomLocker.unlock('math', 'gold-crown')     // only works on the math site
     AtomLocker.has('read', 'parchment')         // true/false
     AtomLocker.owned('read')                    // ['parchment', ...]
     AtomLocker.equip('hat', 'math', 'gold-crown') // wear it in any app
     AtomLocker.equipped('hat')                  // {app:'math', id:'gold-crown'}
     AtomLocker.setSummary('math', 'Gold III')   // shown on the main page
     AtomLocker.onChange(locker => redrawLocker(locker))
     AtomLocker.exportData() / AtomLocker.importData(obj) // for backup files

   Item ids: short, lowercase, dashes only (e.g. 'rainbow-cape'). Keep them
   short — the whole locker has to fit in one cookie (about 3,800 characters,
   roughly 250 items total).
*/
(function () {
  var NAME = 'atom_locker';
  var LOCAL = 'atom_locker_copy';
  var MAX_AGE = 60 * 60 * 24 * 400; // 400 days (browser max); refreshed on every save
  var LIMIT = 3800;                 // safe cookie size
  var APPS = ['read', 'math'];
  var ID_OK = /^[a-z0-9-]{1,24}$/;

  var host = location.hostname;
  var shared = /(^|\.)learnwithatom\.org$/.test(host);
  var hereApp = shared ? (host.split('.')[0] === 'read' ? 'read' : host.split('.')[0] === 'math' ? 'math' : '') : '';

  function blank() {
    var w = { v: 1, rev: 0, items: {}, equip: {}, summary: {}, last: '' };
    APPS.forEach(function (a) { w.items[a] = []; w.summary[a] = ''; });
    return w;
  }

  function clean(w) {
    var b = blank();
    if (!w || typeof w !== 'object') return b;
    b.rev = +w.rev || 0;
    APPS.forEach(function (a) {
      var list = (w.items || {})[a];
      if (Array.isArray(list)) {
        list.forEach(function (id) { id = String(id); if (ID_OK.test(id) && b.items[a].indexOf(id) < 0) b.items[a].push(id); });
      }
      b.summary[a] = String((w.summary || {})[a] || '').slice(0, 40);
    });
    var eq = w.equip || {};
    Object.keys(eq).forEach(function (slot) {
      var parts = String(eq[slot]).split(':');
      if (ID_OK.test(slot) && APPS.indexOf(parts[0]) > -1 && b.items[parts[0]].indexOf(parts[1]) > -1) b.equip[slot] = parts[0] + ':' + parts[1];
    });
    b.last = APPS.indexOf(w.last) > -1 ? w.last : '';
    return b;
  }

  // Unlocks only ever add up: combine two copies without losing anything.
  function merge(a, b) {
    var m = clean(a.rev >= b.rev ? a : b);  // newest wins for equip/summary/last
    var other = a.rev >= b.rev ? b : a;
    APPS.forEach(function (app) {
      other.items[app].forEach(function (id) { if (m.items[app].indexOf(id) < 0) m.items[app].push(id); });
    });
    m.rev = Math.max(a.rev, b.rev);
    return m;
  }

  function same(a, b) {
    return APPS.every(function (app) { return a.items[app].length === b.items[app].length; });
  }

  function readCookie() {
    var parts = document.cookie ? document.cookie.split('; ') : [];
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (parts[i].slice(0, eq) === NAME) {
        try { return JSON.parse(decodeURIComponent(parts[i].slice(eq + 1))); } catch (e) { return null; }
      }
    }
    return null;
  }

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL)); } catch (e) { return null; }
  }

  function write(w) {
    w.rev = (w.rev || 0) + 1;
    var val = encodeURIComponent(JSON.stringify(w));
    if (val.length > LIMIT && window.console) console.warn('Atom Locker is almost full (' + val.length + ' chars). Use shorter item ids.');
    var c = NAME + '=' + val + '; Path=/; Max-Age=' + MAX_AGE + '; SameSite=Lax';
    if (shared) c += '; Domain=learnwithatom.org';
    if (location.protocol === 'https:') c += '; Secure';
    document.cookie = c;
    try { localStorage.setItem(LOCAL, JSON.stringify(w)); } catch (e) {}
    lastSeen = w.rev;
    fire(w);
    return w;
  }

  function get() {
    var c = readCookie(), l = readLocal();
    if (!c && !l) return blank();
    if (c && !l) { try { localStorage.setItem(LOCAL, JSON.stringify(c)); } catch (e) {} return clean(c); }
    if (!c && l) return write(clean(l)); // cookie was cleared: rebuild it
    var cc = clean(c), m = merge(cc, clean(l));
    if (!same(m, cc)) return write(m);   // this app had unlocks the cookie lost
    try { localStorage.setItem(LOCAL, JSON.stringify(cc)); } catch (e) {}
    return cc;
  }

  var listeners = [];
  var lastSeen = -1;
  function fire(w) { listeners.forEach(function (fn) { try { fn(w); } catch (e) {} }); }
  function check() {
    var w = get();
    if (w.rev !== lastSeen) { lastSeen = w.rev; fire(w); }
  }
  // The other app may have unlocked something — recheck when we come back.
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
  setInterval(check, 4000);

  function canUnlock(app) {
    if (APPS.indexOf(app) < 0) return false;
    if (shared && hereApp !== app) return false; // math rewards only in math, reading only in reading
    return true;
  }

  window.AtomLocker = {
    isShared: shared,
    app: hereApp,
    get: get,

    unlock: function (app, id) {
      id = String(id || '');
      if (!canUnlock(app) || !ID_OK.test(id)) return false;
      var w = get();
      if (w.items[app].indexOf(id) > -1) return false; // already owned
      w.items[app].push(id);
      w.last = app;
      write(w);
      return true;
    },

    has: function (app, id) { var w = get(); return APPS.indexOf(app) > -1 && w.items[app].indexOf(String(id)) > -1; },
    owned: function (app) { var w = get(); return APPS.indexOf(app) > -1 ? w.items[app].slice() : []; },
    count: function (app) {
      var w = get();
      return app ? (w.items[app] || []).length : APPS.reduce(function (n, a) { return n + w.items[a].length; }, 0);
    },

    // Wear/use any owned item from EITHER app. Pass id '' to take it off.
    equip: function (slot, app, id) {
      if (!ID_OK.test(String(slot))) return false;
      var w = get();
      if (!id) { delete w.equip[slot]; write(w); return true; }
      if (APPS.indexOf(app) < 0 || w.items[app].indexOf(String(id)) < 0) return false;
      w.equip[slot] = app + ':' + id;
      write(w);
      return true;
    },
    equipped: function (slot) {
      var v = get().equip[slot];
      if (!v) return null;
      var p = v.split(':');
      return { app: p[0], id: p[1] };
    },

    setSummary: function (app, text) {
      if (APPS.indexOf(app) < 0) return;
      var w = get();
      w.summary[app] = String(text || '').slice(0, 40);
      w.last = app;
      write(w);
    },

    // One-time move of an app's existing unlocks into the shared locker.
    migrate: function (app, oldIds, flagKey) {
      try { if (localStorage.getItem(flagKey)) return 0; } catch (e) {}
      if (APPS.indexOf(app) < 0) return 0;
      var w = get(), n = 0;
      (oldIds || []).forEach(function (id) {
        id = String(id);
        if (ID_OK.test(id) && w.items[app].indexOf(id) < 0) { w.items[app].push(id); n++; }
      });
      if (n) write(w);
      try { localStorage.setItem(flagKey, '1'); } catch (e) {}
      return n;
    },

    exportData: function () { return get(); },
    // Restoring a backup only ADDS unlocks; it never removes any.
    importData: function (obj) { var cur = get(); var m = merge(cur, clean(obj)); m.rev = cur.rev; return write(m); },

    onChange: function (fn) { listeners.push(fn); fn(get()); }
  };

  lastSeen = get().rev;
})();
