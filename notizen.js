/* SchulPlaner – Notizbücher im GoodNotes-Stil
   Handschrift mit dem Apple Pencil (Finger blättert und zoomt), Füller, Kugelschreiber, Pinsel,
   Textmarker, Radierer, Durchkritzeln zum Löschen, Lasso, Textfelder, Bilder, PDF-Import und -Export.
   Alles wird lokal im Browser gespeichert (IndexedDB). */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ============================================================
     Konstanten
     ============================================================ */
  const SEITE_B = 595, SEITE_H = 842;          // A4 in Punkt – passt 1:1 zum PDF
  const LUECKE = 22, NEU_H = 96;                // Abstand zwischen Seiten, Kachel „Neue Seite“
  const LINIE = 22.7, KARO = 14.17;             // 8 mm Lineatur, 5 mm Karo
  const SCHRIFT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif';
  const COVER = [
    ['#4C8DFF', '#1E55D9'], ['#8E6BFF', '#5B33D6'], ['#FF6FAE', '#D6336F'], ['#FF6B5E', '#D33A2E'],
    ['#FFB347', '#E8840C'], ['#F4D35E', '#D4A20A'], ['#4CD07D', '#1E9A55'], ['#3CC8C8', '#138C9A'],
    ['#8A94A3', '#4A5361'], ['#3A4150', '#151820']
  ];
  const VORLAGEN = [['blanko', 'Blanko'], ['liniert', 'Liniert'], ['kariert', 'Kariert'], ['punktiert', 'Punktiert'], ['cornell', 'Cornell']];
  const PAPIER = { weiss: '#FFFFFF', creme: '#FBF6E8' };
  const FARBEN = ['#1D1D1F', '#55555E', '#9A9AA3', '#FFFFFF', '#0A5BD6', '#2F9BFF', '#12968E', '#2FB956',
    '#8BC34A', '#F4C20D', '#FF9500', '#FF5A1F', '#D12B2B', '#E8336F', '#C2408A', '#AF52DE',
    '#6B4EFF', '#3A2E8C', '#8B5A2B', '#000000'];
  const MARKER_FARBEN = ['#FFE14D', '#C6F36B', '#7CF0B0', '#8FD3FF', '#C9A7FF', '#FF9ADF', '#FFB35C', '#FF8A80'];
  const STIFTE = ['fueller', 'kuli', 'pinsel'];
  const NAMEN = { fueller: 'Füller', kuli: 'Kugelschreiber', pinsel: 'Pinsel', marker: 'Textmarker',
    radierer: 'Radierer', lasso: 'Lasso', text: 'Textfeld' };

  const W_STANDARD = {
    wz: 'fueller',
    stiftFarben: ['#1D1D1F', '#0A5BD6', '#D12B2B'], stiftFarbe: 0,
    markerFarben: ['#FFE14D', '#7CF0B0', '#FF9ADF'], markerFarbe: 0,
    breiten: { fueller: [1.0, 1.6, 2.6], kuli: [0.9, 1.4, 2.2], pinsel: [1.8, 3.4, 6], marker: [8, 13, 20], radierer: [7, 14, 26] },
    breite: { fueller: 1, kuli: 1, pinsel: 1, marker: 1, radierer: 1 },
    radierModus: 'praezise', markerGerade: false,
    textGroesse: 14, textFett: false,
    finger: false, kritzeln: true
  };
  const W_SCHLUESSEL = 'schulplaner.notizen.werkzeug';

  /* ============================================================
     Kleine Hilfen
     ============================================================ */
  function uid() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function grenze(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function kopie(o) { return JSON.parse(JSON.stringify(o)); }
  function jetzt() { return Date.now(); }
  function $$(wurzel, sel) { return Array.prototype.slice.call(wurzel.querySelectorAll(sel)); }

  function werkzeugLaden() {
    const w = kopie(W_STANDARD);
    try {
      const g = JSON.parse(localStorage.getItem(W_SCHLUESSEL) || 'null');
      if (g && typeof g === 'object') {
        Object.keys(w).forEach(function (k) {
          if (g[k] === undefined) return;
          if (k === 'breiten' || k === 'breite') {
            Object.keys(w[k]).forEach(function (z) { if (g[k] && g[k][z] !== undefined) w[k][z] = g[k][z]; });
          } else w[k] = g[k];
        });
      }
    } catch (e) { /* Standard behalten */ }
    if (!NAMEN[w.wz]) w.wz = 'fueller';
    return w;
  }
  let W = werkzeugLaden();
  function werkzeugSpeichern() { try { localStorage.setItem(W_SCHLUESSEL, JSON.stringify(W)); } catch (e) { } }
  function aktuelleBreite(wz) { return W.breiten[wz][W.breite[wz]]; }

  /* ============================================================
     Speicher (IndexedDB)
     ============================================================ */
  let dbVersprechen = null;
  function db() {
    if (!dbVersprechen) {
      dbVersprechen = new Promise(function (ok, fehler) {
        let r;
        try { r = indexedDB.open('schulplaner-notizen', 2); } catch (e) { fehler(e); return; }
        r.onupgradeneeded = function () {
          const d = r.result;
          if (!d.objectStoreNames.contains('buecher')) d.createObjectStore('buecher', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('seiten')) d.createObjectStore('seiten', { keyPath: 'id' }).createIndex('buch', 'buch');
          if (!d.objectStoreNames.contains('dateien')) d.createObjectStore('dateien', { keyPath: 'id' }).createIndex('buch', 'buch');
          if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
        };
        r.onsuccess = function () {
          const d = r.result;
          d.onversionchange = function () { d.close(); dbVersprechen = null; };
          ok(d);
        };
        r.onerror = function () { fehler(r.error || new Error('Datenbank nicht verfügbar')); };
        r.onblocked = function () { fehler(new Error('Bitte andere offene Fenster der App schließen.')); };
      });
      dbVersprechen.catch(function () { dbVersprechen = null; });
    }
    return dbVersprechen;
  }
  async function transaktion(namen, modus, arbeit) {
    const d = await db();
    return new Promise(function (ok, fehler) {
      let t;
      try { t = d.transaction(namen, modus); } catch (e) { fehler(e); return; }
      const st = {};
      namen.forEach(function (n) { st[n] = t.objectStore(n); });
      let erg;
      try { erg = arbeit(st); } catch (e) { try { t.abort(); } catch (x) { } fehler(e); return; }
      t.oncomplete = function () { ok(erg && typeof IDBRequest !== 'undefined' && erg instanceof IDBRequest ? erg.result : erg); };
      t.onerror = function () { fehler(t.error); };
      t.onabort = function () { fehler(t.error || new Error('Speichern abgebrochen')); };
    });
  }
  function alle(store) { return transaktion([store], 'readonly', function (s) { return s[store].getAll(); }); }
  function holen(store, id) { return transaktion([store], 'readonly', function (s) { return s[store].get(id); }); }
  function perIndex(store, wert) { return transaktion([store], 'readonly', function (s) { return s[store].index('buch').getAll(wert); }); }

  async function dateiSpeichern(blob, buchId) {
    const id = uid();
    await transaktion(['dateien'], 'readwrite', function (s) { s.dateien.put({ id: id, buch: buchId, blob: blob }); });
    return id;
  }

  /* ============================================================
     Bibliothek: Zwischenspeicher der Notizbücher
     ============================================================ */
  let K = null;                 // Kontext der App (Module, Neuzeichnen …)
  let buecher = [];
  let geladen = false, ladeFehler = null;
  let filterModul = 'alle';

  async function buecherLaden() {
    try {
      buecher = await alle('buecher');
      geladen = true; ladeFehler = null;
    } catch (e) {
      geladen = true; ladeFehler = e;
    }
    if (K) K.neuZeichnen();
  }
  function buchSpeichern(b) {
    return transaktion(['buecher'], 'readwrite', function (s) { s.buecher.put(b); }).then(function () {
      const i = buecher.findIndex(function (x) { return x.id === b.id; });
      if (i >= 0) buecher[i] = b; else buecher.push(b);
    });
  }
  function neueSeite(buch, o) {
    o = o || {};
    return {
      id: uid(), buch: buch.id, b: o.b || SEITE_B, h: o.h || SEITE_H,
      v: o.v || buch.vorlage || 'liniert', papier: o.papier || buch.papier || 'weiss',
      hg: o.hg || null, striche: [], texte: [], bilder: [], erstellt: jetzt(), g: jetzt()
    };
  }
  async function buchAnlegen(daten) {
    const b = {
      id: uid(), titel: daten.titel || 'Notizbuch', modul_id: daten.modul_id || null,
      cover: daten.cover || 0, vorlage: daten.vorlage || 'liniert', papier: daten.papier || 'weiss',
      seiten: [], anzahl: 0, erstellt: jetzt(), geaendert: jetzt(), metaG: jetzt(), weg: {}, zuletzt: null
    };
    const seiten = daten.seiten && daten.seiten.length ? daten.seiten.map(function (s) {
      return neueSeite(b, s);
    }) : [neueSeite(b)];
    b.seiten = seiten.map(function (s) { return s.id; });
    b.anzahl = seiten.length;
    await transaktion(['buecher', 'seiten'], 'readwrite', function (s) {
      s.buecher.put(b);
      seiten.forEach(function (x) { s.seiten.put(x); });
    });
    buecher.push(b);
    return b;
  }
  async function seitenLaden(buch) {
    const liste = await perIndex('seiten', buch.id);
    const nachId = new Map(liste.map(function (s) { return [s.id, s]; }));
    const reihe = [];
    (buch.seiten || []).forEach(function (id) {
      if (nachId.has(id)) { reihe.push(nachId.get(id)); nachId.delete(id); }
    });
    Array.from(nachId.values()).sort(function (a, b) { return (a.erstellt || 0) - (b.erstellt || 0); })
      .forEach(function (s) { reihe.push(s); });
    reihe.forEach(function (s) {           // ältere oder beschädigte Seiten absichern
      s.striche = Array.isArray(s.striche) ? s.striche : [];
      s.texte = Array.isArray(s.texte) ? s.texte : [];
      s.bilder = Array.isArray(s.bilder) ? s.bilder : [];
      s.b = s.b || SEITE_B; s.h = s.h || SEITE_H; s.v = s.v || 'blanko'; s.papier = s.papier || 'weiss';
    });
    return reihe;
  }
  async function buchLoeschen(id, ohneMarke) {
    if (!ohneMarke) {
      const m = jsonLesen(LOESCH_KEY, {});
      m[id] = jetzt();
      jsonSchreiben(LOESCH_KEY, m);
    }
    const seiten = await perIndex('seiten', id);
    const dateien = await perIndex('dateien', id);
    await transaktion(['buecher', 'seiten', 'dateien'], 'readwrite', function (s) {
      s.buecher.delete(id);
      seiten.forEach(function (x) { s.seiten.delete(x.id); });
      dateien.forEach(function (x) { s.dateien.delete(x.id); });
    });
    buecher = buecher.filter(function (b) { return b.id !== id; });
  }
  async function dateienAufraeumen(buch, seiten) {
    try {
      const benutzt = new Set();
      seiten.forEach(function (s) {
        if (s.hg) benutzt.add(s.hg);
        s.bilder.forEach(function (b) { benutzt.add(b.d); });
      });
      const dateien = await perIndex('dateien', buch.id);
      const weg = dateien.filter(function (d) { return !benutzt.has(d.id); });
      if (weg.length) await transaktion(['dateien'], 'readwrite', function (s) { weg.forEach(function (d) { s.dateien.delete(d.id); }); });
    } catch (e) { /* nicht kritisch */ }
  }

  /* ============================================================
     Bilder (Zwischenspeicher für Fotos und PDF-Seiten)
     ============================================================ */
  const BILDER = new Map();      // dateiId -> { img, url, laden }
  function bild(id) {
    const e = BILDER.get(id);
    if (e) return e.img;
    bildLaden(id).then(function () { if (E) plane('haupt'); });
    return null;
  }
  function bildLaden(id) {
    let e = BILDER.get(id);
    if (e) return e.laden;
    e = { img: null, url: null, laden: null };
    BILDER.set(id, e);
    e.laden = holen('dateien', id).then(function (d) {
      if (!d || !d.blob) return null;
      return new Promise(function (ok) {
        const img = new Image();
        e.url = URL.createObjectURL(d.blob);
        img.onload = function () { e.img = img; ok(img); };
        img.onerror = function () { ok(null); };
        img.src = e.url;
      });
    }).catch(function () { return null; });
    return e.laden;
  }
  function bilderFreigeben() {
    BILDER.forEach(function (e) { if (e.url) URL.revokeObjectURL(e.url); });
    BILDER.clear();
  }
  async function bilderVorbereiten(seite) {
    const ids = [];
    if (seite.hg) ids.push(seite.hg);
    seite.bilder.forEach(function (b) { ids.push(b.d); });
    await Promise.all(ids.map(bildLaden));
  }

  /* ============================================================
     Strichgeometrie
     ============================================================ */
  const PFADE = new WeakMap(), RAHMEN = new WeakMap();

  function breitenFuer(p, wz, b) {
    const n = p.length / 3, W2 = new Array(n);
    for (let i = 0; i < n; i++) {
      const d = p[i * 3 + 2];
      let w;
      if (wz === 'kuli') w = b * (0.82 + 0.36 * d);
      else if (wz === 'pinsel') w = b * (0.12 + 1.75 * Math.pow(d, 1.15));
      else {
        let v = 0;
        if (i > 0) v = Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2]);
        const tempo = 1 - Math.min(0.3, v / (b * 10));
        w = b * (0.38 + 1.15 * d) * tempo;
      }
      W2[i] = w;
    }
    for (let i = 1; i < n; i++) W2[i] = W2[i - 1] * 0.55 + W2[i] * 0.45;
    if (wz !== 'kuli' && n > 6) {
      const k = Math.min(5, Math.floor(n / 3));
      for (let j = 0; j < k; j++) {
        const f = 0.55 + 0.45 * (j + 1) / (k + 1);
        W2[n - 1 - j] *= f;
        if (wz === 'pinsel') W2[j] *= f;
      }
    }
    for (let i = 0; i < n; i++) W2[i] = Math.max(W2[i], 0.25);
    return W2;
  }
  function laenge(p) {
    let l = 0;
    for (let i = 3; i < p.length; i += 3) l += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]);
    return l;
  }
  function tintenPfad(p, wz, b) {
    const n = p.length / 3, pfad = new Path2D();
    if (!n) return pfad;
    const W2 = breitenFuer(p, wz, b);
    if (n === 1 || laenge(p) < 0.6) {
      let r = 0;
      for (let i = 0; i < n; i++) r = Math.max(r, W2[i]);
      pfad.arc(p[0], p[1], r / 2, 0, Math.PI * 2);
      return pfad;
    }
    const L = new Array(n * 2), R = new Array(n * 2);
    let nx = 0, ny = 1;
    for (let i = 0; i < n; i++) {
      const a = i > 0 ? i - 1 : i, c = i < n - 1 ? i + 1 : i;
      const dx = p[c * 3] - p[a * 3], dy = p[c * 3 + 1] - p[a * 3 + 1];
      const l = Math.hypot(dx, dy);
      if (l > 1e-6) { nx = -dy / l; ny = dx / l; }
      const hw = W2[i] / 2, x = p[i * 3], y = p[i * 3 + 1];
      L[i * 2] = x + nx * hw; L[i * 2 + 1] = y + ny * hw;
      R[i * 2] = x - nx * hw; R[i * 2 + 1] = y - ny * hw;
    }
    pfad.moveTo(L[0], L[1]);
    for (let i = 1; i < n - 1; i++) {
      pfad.quadraticCurveTo(L[i * 2], L[i * 2 + 1], (L[i * 2] + L[i * 2 + 2]) / 2, (L[i * 2 + 1] + L[i * 2 + 3]) / 2);
    }
    const e = n - 1;
    pfad.lineTo(L[e * 2], L[e * 2 + 1]);
    const ex = p[e * 3], ey = p[e * 3 + 1];
    const aL = Math.atan2(L[e * 2 + 1] - ey, L[e * 2] - ex);
    pfad.arc(ex, ey, W2[e] / 2, aL, aL - Math.PI, true);
    for (let i = n - 2; i > 0; i--) {
      pfad.quadraticCurveTo(R[i * 2], R[i * 2 + 1], (R[i * 2] + R[i * 2 - 2]) / 2, (R[i * 2 + 1] + R[i * 2 - 1]) / 2);
    }
    pfad.lineTo(R[0], R[1]);
    const aR = Math.atan2(R[1] - p[1], R[0] - p[0]);
    pfad.arc(p[0], p[1], W2[0] / 2, aR, aR - Math.PI, true);
    pfad.closePath();
    return pfad;
  }
  function linienPfad(p) {
    const n = p.length / 3, pfad = new Path2D();
    if (!n) return pfad;
    pfad.moveTo(p[0], p[1]);
    if (n === 1) { pfad.lineTo(p[0] + 0.01, p[1]); return pfad; }
    for (let i = 1; i < n - 1; i++) {
      pfad.quadraticCurveTo(p[i * 3], p[i * 3 + 1], (p[i * 3] + p[i * 3 + 3]) / 2, (p[i * 3 + 1] + p[i * 3 + 4]) / 2);
    }
    pfad.lineTo(p[(n - 1) * 3], p[(n - 1) * 3 + 1]);
    return pfad;
  }
  function pfad(st) {
    let x = PFADE.get(st);
    if (!x) { x = st.w === 'marker' ? linienPfad(st.p) : tintenPfad(st.p, st.w, st.b); PFADE.set(st, x); }
    return x;
  }
  function rahmen(st) {
    let r = RAHMEN.get(st);
    if (!r) {
      const p = st.p;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < p.length; i += 3) {
        if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
        if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1];
      }
      const h = st.b * (st.w === 'pinsel' ? 1 : 0.8);
      r = { x0: x0 - h, y0: y0 - h, x1: x1 + h, y1: y1 + h };
      RAHMEN.set(st, r);
    }
    return r;
  }
  function neuAbtasten(p, abstand) {
    const n = p.length / 3;
    if (!n) return [];
    const aus = [r2(p[0]), r2(p[1]), r2(p[2])];
    let lx = p[0], ly = p[1], ld = p[2];
    for (let i = 1; i < n; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], d = p[i * 3 + 2];
      const dist = Math.hypot(x - lx, y - ly);
      if (dist > abstand) {
        const schritte = Math.ceil(dist / abstand);
        for (let k = 1; k < schritte; k++) {
          const t = k / schritte;
          aus.push(r2(lx + (x - lx) * t), r2(ly + (y - ly) * t), r2(ld + (d - ld) * t));
        }
      }
      if (dist >= 0.2 || i === n - 1) { aus.push(r2(x), r2(y), r2(d)); lx = x; ly = y; ld = d; }
    }
    return aus;
  }
  function imPolygon(x, y, poly) {             // Strahlverfahren, poly = [x,y,x,y,…]
    let drin = false;
    for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
      const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi) drin = !drin;
    }
    return drin;
  }
  function inHuelle(x, y, poly, tol) {        // im Polygon oder höchstens tol vom Rand entfernt
    if (imPolygon(x, y, poly)) return true;
    const t2 = tol * tol;
    for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
      const ax = poly[j], ay = poly[j + 1], bx = poly[i], by = poly[i + 1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
      const t = grenze(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
      const ex = ax + dx * t - x, ey = ay + dy * t - y;
      if (ex * ex + ey * ey <= t2) return true;
    }
    return false;
  }
  function huelle(p) {                          // konvexe Hülle (monotone Kette)
    const pts = [];
    for (let i = 0; i < p.length; i += 3) pts.push([p[i], p[i + 1]]);
    pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (pts.length < 3) return [];
    const kreuz = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    const unten = [], oben = [];
    pts.forEach(function (q) {
      while (unten.length >= 2 && kreuz(unten[unten.length - 2], unten[unten.length - 1], q) <= 0) unten.pop();
      unten.push(q);
    });
    for (let i = pts.length - 1; i >= 0; i--) {
      const q = pts[i];
      while (oben.length >= 2 && kreuz(oben[oben.length - 2], oben[oben.length - 1], q) <= 0) oben.pop();
      oben.push(q);
    }
    oben.pop(); unten.pop();
    const h = unten.concat(oben), flach = [];
    h.forEach(function (q) { flach.push(q[0], q[1]); });
    return flach;
  }

  /* Durchkritzeln: Zickzack über vorhandener Schrift löscht diese */
  function kritzelOpfer(seite, st, roh) {
    if (!W.kritzeln || st.w === 'marker' || !seite.striche.length) return null;
    const p = roh && roh.length >= 9 ? neuAbtasten(roh, 2) : st.p, n = p.length / 3;
    if (n < 16) return null;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      bx0 = Math.min(bx0, p[i]); bx1 = Math.max(bx1, p[i]); by0 = Math.min(by0, p[i + 1]); by1 = Math.max(by1, p[i + 1]);
    }
    const bb = { x0: bx0, y0: by0, x1: bx1, y1: by1 }, w = bx1 - bx0, h = by1 - by0, diag = Math.hypot(w, h);
    if (diag < 8) return null;
    if (laenge(p) / diag < 2.5) return null;
    function wechsel(achse, ausdehnung) {
      const schwelle = Math.max(2, ausdehnung * 0.15);
      let anzahl = 0, richtung = 0, extrem = p[achse];
      for (let i = 1; i < n; i++) {
        const v = p[i * 3 + achse];
        if (richtung >= 0) {
          if (v > extrem) extrem = v;
          else if (extrem - v > schwelle) { if (richtung > 0) anzahl++; richtung = -1; extrem = v; }
          if (richtung === 0 && v - p[achse] > schwelle) { richtung = 1; extrem = v; }
        } else {
          if (v < extrem) extrem = v;
          else if (v - extrem > schwelle) { anzahl++; richtung = 1; extrem = v; }
        }
      }
      return anzahl;
    }
    if (Math.max(wechsel(0, w), wechsel(1, h)) < 4) return null;
    const hu = huelle(p);
    if (hu.length < 6) return null;
    const opfer = [], toleranz = Math.max(3, st.b * 1.6);
    let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
    seite.striche.forEach(function (a) {
      const r = rahmen(a);
      if (r.x1 < bb.x0 || r.x0 > bb.x1 || r.y1 < bb.y0 || r.y0 > bb.y1) return;
      const q = a.p, m = q.length / 3, schritt = Math.max(1, Math.floor(m / 60));
      let drin = 0, gesamt = 0;
      for (let i = 0; i < m; i += schritt) { gesamt++; if (inHuelle(q[i * 3], q[i * 3 + 1], hu, toleranz)) drin++; }
      if (gesamt && drin / gesamt >= 0.5) {
        opfer.push(a);
        ux0 = Math.min(ux0, r.x0); uy0 = Math.min(uy0, r.y0); ux1 = Math.max(ux1, r.x1); uy1 = Math.max(uy1, r.y1);
      }
    });
    if (!opfer.length) return null;
    const ix = Math.max(0, Math.min(bb.x1, ux1) - Math.max(bb.x0, ux0));
    const iy = Math.max(0, Math.min(bb.y1, uy1) - Math.max(bb.y0, uy0));
    if ((ix * iy) / Math.max(1, w * h) < 0.3) return null;   // Kritzel liegt größtenteils über der Schrift
    return opfer;
  }

  /* Radierer */
  function radieren(seite, x, y, r) {
    const modus = W.radierModus;
    let geaendert = false;
    const neu = [];
    seite.striche.forEach(function (st) {
      if (modus === 'marker' && st.w !== 'marker') { neu.push(st); return; }
      const rr = r + st.b / 2, bb = rahmen(st);
      if (x < bb.x0 - rr || x > bb.x1 + rr || y < bb.y0 - rr || y > bb.y1 + rr) { neu.push(st); return; }
      const p = st.p, n = p.length / 3, rr2 = rr * rr;
      if (modus !== 'praezise') {
        for (let i = 0; i < n; i++) {
          const dx = p[i * 3] - x, dy = p[i * 3 + 1] - y;
          if (dx * dx + dy * dy <= rr2) { geaendert = true; return; }
        }
        neu.push(st);
        return;
      }
      let treffer = false, aktuell = [];
      const teile = [];
      for (let i = 0; i < n; i++) {
        const dx = p[i * 3] - x, dy = p[i * 3 + 1] - y;
        if (dx * dx + dy * dy <= rr2) {
          treffer = true;
          if (aktuell.length) { teile.push(aktuell); aktuell = []; }
        } else aktuell.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      }
      if (!treffer) { neu.push(st); return; }
      if (aktuell.length) teile.push(aktuell);
      geaendert = true;
      teile.forEach(function (t) {
        if (t.length >= 6) neu.push({ id: uid(), w: st.w, f: st.f, b: st.b, p: t });
      });
    });
    if (geaendert) seite.striche = neu;
    return geaendert;
  }

  /* ============================================================
     Zeichnen einer Seite (Bildschirm, Vorschau, PDF)
     ============================================================ */
  function papierFarbe(seite) { return PAPIER[seite.papier] || PAPIER.weiss; }
  function zeichneVorlage(ctx, seite, ppu) {
    const b = seite.b, h = seite.h, lw = Math.max(0.25, 0.9 / ppu);
    ctx.lineWidth = lw;
    if (seite.v === 'liniert') {
      ctx.strokeStyle = '#C4D3EC'; ctx.beginPath();
      for (let y = 86; y < h - 34; y += LINIE) { ctx.moveTo(0, y); ctx.lineTo(b, y); }
      ctx.stroke();
      ctx.strokeStyle = '#F2A9A9'; ctx.beginPath(); ctx.moveTo(70, 0); ctx.lineTo(70, h); ctx.stroke();
    } else if (seite.v === 'kariert') {
      ctx.strokeStyle = '#D3DBE7'; ctx.beginPath();
      const ox = (b % KARO) / 2, oy = (h % KARO) / 2;
      for (let x = ox; x <= b; x += KARO) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = oy; y <= h; y += KARO) { ctx.moveTo(0, y); ctx.lineTo(b, y); }
      ctx.stroke();
    } else if (seite.v === 'punktiert') {
      ctx.fillStyle = '#AEB8C6';
      const r = Math.max(0.55, 1.1 / ppu), ox = (b % KARO) / 2, oy = (h % KARO) / 2;
      ctx.beginPath();
      for (let x = ox; x <= b; x += KARO) {
        for (let y = oy; y <= h; y += KARO) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      }
      ctx.fill();
    } else if (seite.v === 'cornell') {
      const kopf = 95, fuss = h - 160, rand = 170;
      ctx.strokeStyle = '#C4D3EC'; ctx.beginPath();
      for (let y = kopf + LINIE; y < fuss - 4; y += LINIE) { ctx.moveTo(rand, y); ctx.lineTo(b - 20, y); }
      ctx.stroke();
      ctx.strokeStyle = '#9DB3D8'; ctx.lineWidth = lw * 1.8; ctx.beginPath();
      ctx.moveTo(20, kopf); ctx.lineTo(b - 20, kopf);
      ctx.moveTo(rand, kopf); ctx.lineTo(rand, fuss);
      ctx.moveTo(20, fuss); ctx.lineTo(b - 20, fuss);
      ctx.stroke();
    }
  }
  function zeilenUmbrechen(ctx, text, breite) {
    const zeilen = [];
    String(text).split('\n').forEach(function (absatz) {
      if (absatz === '') { zeilen.push(''); return; }
      const woerter = absatz.split(/(\s+)/);
      let zeile = '';
      woerter.forEach(function (wort) {
        const probe = zeile + wort;
        if (ctx.measureText(probe).width <= breite || zeile === '') {
          if (ctx.measureText(probe).width > breite && zeile === '') {
            let teil = '';                                   // sehr langes Wort: zeichenweise umbrechen
            for (const z of wort) {
              if (ctx.measureText(teil + z).width > breite && teil) { zeilen.push(teil); teil = ''; }
              teil += z;
            }
            zeile = teil;
          } else zeile = probe;
        } else {
          zeilen.push(zeile.replace(/\s+$/, ''));
          zeile = wort.replace(/^\s+/, '');
        }
      });
      zeilen.push(zeile.replace(/\s+$/, ''));
    });
    return zeilen;
  }
  function zeichneTextFeld(ctx, t) {
    if (!t.text) return;
    ctx.save();
    ctx.font = (t.fett ? '700 ' : '400 ') + t.g + 'px ' + SCHRIFT;
    ctx.fillStyle = t.f;
    ctx.textBaseline = 'alphabetic';
    const zh = t.g * 1.3, links = t.x + 5, innen = Math.max(10, t.w - 10);
    const zeilen = zeilenUmbrechen(ctx, t.text, innen);
    zeilen.forEach(function (z, i) { ctx.fillText(z, links, t.y + 3 + zh * i + (zh + t.g * 0.72) / 2); });
    ctx.restore();
  }
  function zeichneSeite(ctx, seite, ppu, o) {
    o = o || {};
    const verst = o.versteckt;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, seite.b, seite.h); ctx.clip();
    if (o.papier) { ctx.fillStyle = papierFarbe(seite); ctx.fillRect(0, 0, seite.b, seite.h); }
    if (seite.hg) {
      const im = o.bildHolen ? o.bildHolen(seite.hg) : bild(seite.hg);
      if (im) ctx.drawImage(im, 0, 0, seite.b, seite.h);
    } else zeichneVorlage(ctx, seite, ppu);
    const sicht = o.sicht;
    seite.bilder.forEach(function (bi) {
      if (verst && verst.has(bi.id)) return;
      const im = o.bildHolen ? o.bildHolen(bi.d) : bild(bi.d);
      if (im) ctx.drawImage(im, bi.x, bi.y, bi.w, bi.h);
      else { ctx.fillStyle = 'rgba(120,130,150,.15)'; ctx.fillRect(bi.x, bi.y, bi.w, bi.h); }
    });
    const sichtbar = function (st) {
      if (verst && verst.has(st.id)) return false;
      if (!sicht) return true;
      const r = rahmen(st);
      return !(r.x1 < sicht.x0 || r.x0 > sicht.x1 || r.y1 < sicht.y0 || r.y0 > sicht.y1);
    };
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    seite.striche.forEach(function (st) {
      if (st.w !== 'marker' || !sichtbar(st)) return;
      ctx.strokeStyle = st.f; ctx.lineWidth = st.b; ctx.stroke(pfad(st));
    });
    ctx.globalCompositeOperation = 'source-over';
    seite.striche.forEach(function (st) {
      if (st.w === 'marker' || !sichtbar(st)) return;
      ctx.fillStyle = st.f; ctx.fill(pfad(st));
    });
    if (o.mitText) seite.texte.forEach(function (t) { zeichneTextFeld(ctx, t); });
    ctx.restore();
  }
  async function seiteRendern(seite, pxBreite) {
    await bilderVorbereiten(seite);
    const k = pxBreite / seite.b;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(seite.b * k)); c.height = Math.max(1, Math.round(seite.h * k));
    const ctx = c.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    zeichneSeite(ctx, seite, k, { papier: true, mitText: true, bildHolen: function (id) { const e = BILDER.get(id); return e && e.img; } });
    return c;
  }

  /* ============================================================
     Editor
     ============================================================ */
  let E = null;
  let rafId = 0;

  function plane() {
    if (!E) return;
    for (let i = 0; i < arguments.length; i++) E.planen[arguments[i]] = true;
    if (!rafId) rafId = requestAnimationFrame(rahmenTakt);
  }
  function planeAlles() { plane('haupt', 'live', 'text'); }
  function rahmenTakt(t) {
    rafId = 0;
    if (!E) return;
    if (E.traegheit) traegheitSchritt(t);
    const p = E.planen;
    E.planen = {};
    if (p.haupt) zeichneHaupt();
    if (p.live) zeichneLive();
    if (p.text || p.haupt) textSync();
    if (p.haupt) seitenzahlAktualisieren();
    if (E.traegheit) plane('haupt', 'live', 'text');
  }

  /* ---------- Layout und Kamera ---------- */
  function layout() {
    let y = 0, refB = SEITE_B;
    E.seiten.forEach(function (s) { refB = Math.max(refB, s.b); });
    E.refB = refB;
    E.pos = E.seiten.map(function (s) {
      const r = { x: (refB - s.b) / 2, y: y, b: s.b, h: s.h };
      y += s.h + LUECKE;
      return r;
    });
    E.gesamtH = y;
  }
  function rand() { return E.vw < 600 ? 10 : 28; }
  function passung() { return Math.max(0.05, (E.vw - 2 * rand()) / E.refB); }
  function skala() { return passung() * E.zoom; }
  function welt(sx, sy) { const s = skala(); return { x: sx / s + E.cam.x, y: sy / s + E.cam.y }; }
  function kameraBegrenzen() {
    const s = skala(), pad = rand(), cw = E.refB * s;
    if (cw + 2 * pad <= E.vw) E.cam.x = -(E.vw - cw) / 2 / s;
    else E.cam.x = grenze(E.cam.x, -pad / s, E.refB - (E.vw - pad) / s);
    const minY = -16 / s;
    const maxY = Math.max(minY, E.gesamtH + NEU_H - (E.vh - 16) / s);
    E.cam.y = grenze(E.cam.y, minY, maxY);
  }
  function seiteBei(wx, wy) {
    for (let i = 0; i < E.pos.length; i++) {
      const r = E.pos[i];
      if (wy >= r.y && wy <= r.y + r.h && wx >= r.x && wx <= r.x + r.b) return i;
    }
    return -1;
  }
  function kachelRahmen() {
    const b = Math.min(E.refB, SEITE_B);
    return { x: (E.refB - b) / 2, y: E.gesamtH, b: b, h: NEU_H - 18 };
  }
  function inKachel(w) {
    const k = kachelRahmen();
    return w.x >= k.x && w.x <= k.x + k.b && w.y >= k.y && w.y <= k.y + k.h;
  }
  function aktuelleSeite() {
    const mitte = E.cam.y + E.vh / 2 / skala();
    let beste = 0, abst = Infinity;
    E.pos.forEach(function (r, i) {
      const d = mitte < r.y ? r.y - mitte : (mitte > r.y + r.h ? mitte - r.y - r.h : 0);
      if (d < abst) { abst = d; beste = i; }
    });
    return beste;
  }
  function zuSeite(i) {
    i = grenze(i, 0, E.seiten.length - 1);
    E.cam.y = E.pos[i].y - 16 / skala();
    kameraBegrenzen();
    planeAlles();
  }
  function seiteSichtbarMachen(i) {
    const r = E.pos[i], s = skala();
    if (!r) return;
    const oben = (r.y - E.cam.y) * s, unten = (r.y + r.h - E.cam.y) * s;
    if (unten < 0 || oben > E.vh) zuSeite(i);
  }
  function verschieben(dx, dy) {
    const s = skala();
    E.cam.x -= dx / s; E.cam.y -= dy / s;
    kameraBegrenzen();
    planeAlles();
  }
  function zoomen(faktor, sx, sy) {
    const z = grenze(E.zoom * faktor, 0.5, 6);
    if (Math.abs(z - E.zoom) < 1e-6) return;
    const w = welt(sx, sy);
    E.zoom = z;
    const s = skala();
    E.cam.x = w.x - sx / s; E.cam.y = w.y - sy / s;
    kameraBegrenzen();
    planeAlles();
  }
  function groesseAnpassen() {
    if (!E) return;
    const r = E.el.flaeche.getBoundingClientRect();
    const altS = E.vw ? skala() : 0;
    const mitte = E.vw ? welt(E.vw / 2, E.vh / 2) : null;
    E.vw = Math.max(1, r.width); E.vh = Math.max(1, r.height);
    E.dpr = Math.min(3, window.devicePixelRatio || 1);
    [E.el.haupt, E.el.live].forEach(function (c) {
      c.width = Math.round(E.vw * E.dpr); c.height = Math.round(E.vh * E.dpr);
    });
    if (mitte && altS) {
      const s = skala();
      E.cam.x = mitte.x - E.vw / 2 / s; E.cam.y = mitte.y - E.vh / 2 / s;
    }
    kameraBegrenzen();
    planeAlles();
  }

  /* ---------- Hauptbild ---------- */
  function hgFarbe() { return document.documentElement.getAttribute('data-thema') === 'dunkel' ? '#15161E' : '#E4E6EE'; }
  function zeichneHaupt() {
    const c = E.el.haupt, ctx = c.getContext('2d'), d = E.dpr, s = skala();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = hgFarbe();
    ctx.fillRect(0, 0, c.width, c.height);
    const y0 = E.cam.y, y1 = E.cam.y + E.vh / s;
    const dunkel = document.documentElement.getAttribute('data-thema') === 'dunkel';
    for (let i = 0; i < E.seiten.length; i++) {
      const r = E.pos[i];
      if (r.y > y1 || r.y + r.h < y0) continue;
      const seite = E.seiten[i];
      const ox = (r.x - E.cam.x) * s, oy = (r.y - E.cam.y) * s;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.save();
      ctx.shadowColor = dunkel ? 'rgba(0,0,0,.55)' : 'rgba(30,40,80,.18)';
      ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
      ctx.fillStyle = papierFarbe(seite);
      ctx.fillRect(ox, oy, r.b * s, r.h * s);
      ctx.restore();
      ctx.setTransform(d * s, 0, 0, d * s, d * ox, d * oy);
      const sicht = { x0: E.cam.x - r.x - 20, y0: E.cam.y - r.y - 20, x1: E.cam.x - r.x + E.vw / s + 20, y1: E.cam.y - r.y + E.vh / s + 20 };
      zeichneSeite(ctx, seite, d * s, { versteckt: E.versteckt, sicht: sicht });
    }
    const k = kachelRahmen();
    if (k.y <= y1 && k.y + k.h >= y0) {
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const kx = (k.x - E.cam.x) * s, ky = (k.y - E.cam.y) * s, kb = k.b * s, kh = k.h * s;
      ctx.save();
      ctx.setLineDash([7, 6]); ctx.lineWidth = 1.6;
      ctx.strokeStyle = dunkel ? 'rgba(255,255,255,.28)' : 'rgba(40,50,90,.28)';
      kreisRechteck(ctx, kx + 1, ky + 1, kb - 2, kh - 2, 14); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = dunkel ? 'rgba(255,255,255,.6)' : 'rgba(40,50,90,.55)';
      ctx.font = '600 ' + Math.max(11, Math.min(16, 14 * E.zoom)) + 'px ' + SCHRIFT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+  Neue Seite', kx + kb / 2, ky + kh / 2);
      ctx.restore();
    }
  }
  function kreisRechteck(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* ---------- Live-Ebene (aktueller Strich, Radierer, Lasso, Auswahl) ---------- */
  function seitenTransform(ctx, i) {
    const r = E.pos[i], s = skala(), d = E.dpr;
    ctx.setTransform(d * s, 0, 0, d * s, d * (r.x - E.cam.x) * s, d * (r.y - E.cam.y) * s);
  }
  function zeichneLive() {
    const c = E.el.live, ctx = c.getContext('2d'), s = skala(), d = E.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    E.el.live.classList.toggle('nb-multiply', !!(E.strich && E.strich.wz === 'marker'));
    if (E.strich) {
      const st = E.strich, seite = E.seiten[st.i];
      seitenTransform(ctx, st.i);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, seite.b, seite.h); ctx.clip();
      let p;
      const r = st.roh, n = r.length;
      if (st.gerade) p = [r[0], r[1], r[2], r[n - 3], r[n - 2], r[n - 1]];
      else p = st.glatt.concat([r[n - 3], r[n - 2], r[n - 1]]);
      if (st.wz === 'marker') {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = st.f; ctx.lineWidth = st.b;
        ctx.stroke(linienPfad(p));
      } else { ctx.fillStyle = st.f; ctx.fill(tintenPfad(p, st.wz, st.b)); }
      ctx.restore();
    }
    if (E.radierer && E.radierer.pos) {
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.beginPath(); ctx.arc(E.radierer.pos.x, E.radierer.pos.y, aktuelleBreite('radierer'), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(60,70,100,.8)'; ctx.stroke();
    }
    if (E.lasso && E.lasso.pts.length >= 4) {
      seitenTransform(ctx, E.lasso.i);
      const q = E.lasso.pts;
      ctx.beginPath(); ctx.moveTo(q[0], q[1]);
      for (let i = 2; i < q.length; i += 2) ctx.lineTo(q[i], q[i + 1]);
      ctx.lineWidth = 1.4 / s; ctx.setLineDash([6 / s, 5 / s]);
      ctx.strokeStyle = '#0A7AFF'; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(10,122,255,.06)'; ctx.fill();
    }
    if (E.auswahl) {
      const a = E.auswahl, seite = E.seiten[a.i];
      const z = E.ziehen || { dx: 0, dy: 0, k: 1 };
      seitenTransform(ctx, a.i);
      if (E.ziehen) {                       // verschobene Elemente als Vorschau
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, seite.b, seite.h); ctx.clip();
        ctx.translate(a.bb.x0 + z.dx, a.bb.y0 + z.dy); ctx.scale(z.k, z.k); ctx.translate(-a.bb.x0, -a.bb.y0);
        seite.bilder.forEach(function (bi) {
          if (!a.b.has(bi.id)) return;
          const im = bild(bi.d); if (im) ctx.drawImage(im, bi.x, bi.y, bi.w, bi.h);
        });
        ctx.globalCompositeOperation = 'multiply';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        seite.striche.forEach(function (st) {
          if (!a.s.has(st.id) || st.w !== 'marker') return;
          ctx.strokeStyle = st.f; ctx.lineWidth = st.b; ctx.stroke(pfad(st));
        });
        ctx.globalCompositeOperation = 'source-over';
        seite.striche.forEach(function (st) {
          if (!a.s.has(st.id) || st.w === 'marker') return;
          ctx.fillStyle = st.f; ctx.fill(pfad(st));
        });
        ctx.restore();
      }
      const x0 = a.bb.x0 + z.dx, y0 = a.bb.y0 + z.dy;
      const x1 = a.bb.x0 + (a.bb.x1 - a.bb.x0) * z.k + z.dx, y1 = a.bb.y0 + (a.bb.y1 - a.bb.y0) * z.k + z.dy;
      ctx.lineWidth = 1.4 / s; ctx.setLineDash([6 / s, 4 / s]); ctx.strokeStyle = '#0A7AFF';
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x1, y1, 7 / s, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = 2 / s; ctx.stroke();
    }
    auswahlMenueSync();
  }

  /* ---------- Rückgängig ---------- */
  function aktionMerken(a) {
    E.undo.push(a);
    if (E.undo.length > 200) E.undo.shift();
    E.redo = [];
    knoepfeAktualisieren();
  }
  function aendern(seite, fn) {
    const v = { striche: seite.striche, texte: seite.texte, bilder: seite.bilder };
    fn();
    const vorher = {}, nachher = {};
    let geaendert = false;
    ['striche', 'texte', 'bilder'].forEach(function (k) {
      if (v[k] !== seite[k]) { vorher[k] = v[k]; nachher[k] = seite[k]; geaendert = true; }
    });
    if (geaendert) { aktionMerken({ typ: 'inhalt', id: seite.id, vorher: vorher, nachher: nachher }); schmutzig(seite); }
    return geaendert;
  }
  function seiteNachId(id) { return E.seiten.find(function (s) { return s.id === id; }); }
  function anwenden(a, rueck) {
    if (a.typ === 'inhalt') {
      const seite = seiteNachId(a.id);
      if (!seite) return;
      const ziel = rueck ? a.vorher : a.nachher;
      Object.keys(ziel).forEach(function (k) { seite[k] = ziel[k]; });
      schmutzig(seite);
      seiteSichtbarMachen(E.seiten.indexOf(seite));
    } else if (a.typ === 'seite-neu' || a.typ === 'seite-weg') {
      const einfuegen = (a.typ === 'seite-neu') !== rueck;
      if (einfuegen) {
        E.seiten.splice(Math.min(a.index, E.seiten.length), 0, a.seite);
        E.weg.delete(a.seite.id); schmutzig(a.seite);
      } else {
        const i = E.seiten.indexOf(a.seite);
        if (i >= 0) E.seiten.splice(i, 1);
        E.weg.add(a.seite.id); E.dirty.delete(a.seite.id); seiteWegMarke(a.seite.id);
      }
      layout(); kameraBegrenzen(); buchSchmutzig();
    } else if (a.typ === 'seite-meta') {
      const seite = seiteNachId(a.id);
      if (!seite) return;
      Object.assign(seite, rueck ? a.vorher : a.nachher);
      schmutzig(seite);
    }
  }
  function rueckgaengig() {
    if (!E) return;
    textBeenden();
    const a = E.undo.pop();
    if (!a) { toast('Nichts zum Rückgängigmachen'); return; }
    const alt = E.el.root.querySelector(':scope > .nb-toast.sichtbar');
    if (alt) alt.classList.remove('sichtbar');
    anwenden(a, true);
    E.redo.push(a);
    auswahlAufheben(true);
    knoepfeAktualisieren(); planeAlles();
  }
  function wiederholen() {
    if (!E) return;
    textBeenden();
    const a = E.redo.pop();
    if (!a) return;
    anwenden(a, false);
    E.undo.push(a);
    auswahlAufheben(true);
    knoepfeAktualisieren(); planeAlles();
  }

  /* ---------- Speichern ---------- */
  function schmutzig(seite) { seite.g = jetzt(); E.dirty.add(seite.id); buchSchmutzig(); }
  function seiteWegMarke(id) { E.buch.weg = Object.assign({}, E.buch.weg || {}); E.buch.weg[id] = jetzt(); }
  function buchSchmutzig() {
    clearTimeout(E.speicherTimer);
    E.speicherTimer = setTimeout(function () { speichern(); }, 700);
  }
  async function speichern() {
    if (!E) return;
    const ed = E;
    clearTimeout(ed.speicherTimer);
    const liste = Array.from(ed.dirty).map(seiteNachId).filter(Boolean);
    const weg = Array.from(ed.weg);
    ed.dirty.clear(); ed.weg.clear();
    ed.buch.seiten = ed.seiten.map(function (s) { return s.id; });
    ed.buch.anzahl = ed.seiten.length;
    if (liste.length || weg.length) ed.buch.geaendert = jetzt();
    ed.buch.zuletzt = { seite: aktuelleSeite(), zoom: ed.zoom };
    try {
      await transaktion(['buecher', 'seiten'], 'readwrite', function (s) {
        s.buecher.put(ed.buch);
        liste.forEach(function (x) { s.seiten.put(x); });
        weg.forEach(function (id) { s.seiten.delete(id); });
      });
      ed.gespeichert = jetzt();
    } catch (e) {
      liste.forEach(function (x) { ed.dirty.add(x.id); });
      weg.forEach(function (id) { ed.weg.add(id); });
      toast('Speichern fehlgeschlagen: ' + (e && e.message ? e.message : e));
    }
  }
  function seiteNachIdIn(ed, id) { return ed.seiten.find(function (s) { return s.id === id; }); }

  /* ---------- Eingabe ---------- */
  function punktAus(e) { return { x: e.clientX - E.rx, y: e.clientY - E.ry }; }
  function druck(e) {
    if (e.pointerType === 'pen') return e.pressure > 0 ? Math.min(1, e.pressure) : 0.35;
    return 0.5;
  }
  function teilEvents(e) {
    if (e.getCoalescedEvents) {
      try { const l = e.getCoalescedEvents(); if (l && l.length) return l; } catch (x) { }
    }
    return [e];
  }
  function zeichnetWerkzeug() { return W.wz !== 'text'; }
  function rechteckAktualisieren() { const r = E.el.eingabe.getBoundingClientRect(); E.rx = r.left; E.ry = r.top; }

  function aufDown(e) {
    if (!E) return;
    rechteckAktualisieren();
    popoverSchliessen();
    const pt = punktAus(e);
    if (e.pointerType === 'touch') {
      if (E.zeiger !== null && E.zeigerTyp === 'pen') return;                // Handballen ignorieren
      if (E.zeiger !== null && E.zeigerTyp === 'touch') {                    // zweiter Finger beim Fingerschreiben
        const ersterAlt = E.strich && (E.strich.roh.length < 24 || performance.now() - E.strich.t0 < 250);
        if (ersterAlt || E.lasso) {
          E.strich = null; E.lasso = null;
          const erster = E.zeigerStart;
          E.zeiger = null; E.zeigerTyp = '';
          E.touches.set(erster.id, { x: erster.x, y: erster.y, x0: erster.x, y0: erster.y, px: erster.x, py: erster.y });
          E.tap = { t0: performance.now(), max: 1, bewegt: true, pt: erster };
          plane('live');
        } else return;
      }
      const einzeln = E.touches.size === 0;
      if (einzeln && E.auswahl && auswahlTreffer(pt)) {                       // Auswahl mit dem Finger verschieben
        zeigerStart(e, pt); return;
      }
      if (einzeln && W.finger && zeichnetWerkzeug()) { zeigerStart(e, pt); return; }
      E.traegheit = null;
      E.touches.set(e.pointerId, { x: pt.x, y: pt.y, x0: pt.x, y0: pt.y, px: pt.x, py: pt.y });
      if (einzeln) E.tap = { t0: performance.now(), max: 0, bewegt: false, pt: pt };
      if (E.tap) E.tap.max = Math.max(E.tap.max, E.touches.size);
      E.verlauf = [];
      try { E.el.eingabe.setPointerCapture(e.pointerId); } catch (x) { }
      return;
    }
    if (e.pointerType === 'mouse' && e.button === 1) {
      E.mausPan = { x: pt.x, y: pt.y }; e.preventDefault();
      try { E.el.eingabe.setPointerCapture(e.pointerId); } catch (x) { }
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (E.zeiger !== null) return;
    if (e.pointerType === 'pen') {                                             // Stift hat Vorrang
      E.stiftGesehen = true;
      E.touches.clear(); E.tap = null; E.traegheit = null;
    }
    zeigerStart(e, pt);
  }
  function zeigerStart(e, pt) {
    E.zeiger = e.pointerId; E.zeigerTyp = e.pointerType;
    E.zeigerStart = { id: e.pointerId, x: pt.x, y: pt.y, t: performance.now() };
    try { E.el.eingabe.setPointerCapture(e.pointerId); } catch (x) { }
    const w = welt(pt.x, pt.y);
    E.kachelTipp = inKachel(w);
    if (E.kachelTipp) return;
    if (E.auswahl) {
      const h = auswahlTreffer(pt);
      if (h) { E.ziehen = { art: h, start: pt, dx: 0, dy: 0, k: 1 }; auswahlVerstecken(); plane('haupt', 'live', 'text'); return; }
      auswahlAufheben();
    }
    if (W.wz === 'text') { E.textTipp = { pt: pt }; return; }
    if (W.wz === 'lasso') { lassoStart(w); return; }
    if (W.wz === 'radierer') { radiererStart(pt, w); return; }
    strichStart(w, e);
  }
  function aufMove(e) {
    if (!E) return;
    if (E.mausPan) { const pt = punktAus(e); verschieben(pt.x - E.mausPan.x, pt.y - E.mausPan.y); E.mausPan = pt; return; }
    if (e.pointerId === E.zeiger) {
      const evs = teilEvents(e);
      if (E.ziehen) { ziehenMove(punktAus(e)); return; }
      if (E.kachelTipp || E.textTipp) return;
      if (E.strich) { evs.forEach(function (x) { strichPunkt(x); }); plane('live'); return; }
      if (E.radierer) { evs.forEach(function (x) { radiererMove(x); }); return; }
      if (E.lasso) { evs.forEach(function (x) { lassoPunkt(punktAus(x)); }); plane('live'); }
      return;
    }
    const t = E.touches.get(e.pointerId);
    if (!t) return;
    const pt = punktAus(e);
    t.x = pt.x; t.y = pt.y;
    if (E.tap && Math.hypot(t.x - t.x0, t.y - t.y0) > 10) E.tap.bewegt = true;
    gesteAnwenden();
  }
  function aufUp(e) {
    if (!E) return;
    if (E.mausPan && e.pointerType === 'mouse') { E.mausPan = null; return; }
    if (e.pointerId === E.zeiger) {
      const pt = punktAus(e);
      const start = E.zeigerStart;
      E.zeiger = null; E.zeigerTyp = '';
      const tipp = Math.hypot(pt.x - start.x, pt.y - start.y) < 8;
      if (E.kachelTipp) { E.kachelTipp = false; if (tipp && inKachel(welt(pt.x, pt.y))) seiteHinzufuegen(E.seiten.length - 1); return; }
      if (E.ziehen) { ziehenEnde(); return; }
      if (E.textTipp) { E.textTipp = null; if (tipp) textTipp(pt); return; }
      if (E.strich) { if (e.type !== 'pointercancel' || E.strich.roh.length > 6) strichEnde(); else { E.strich = null; plane('live'); } return; }
      if (E.radierer) { radiererEnde(); return; }
      if (E.lasso) { lassoEnde(); return; }
      return;
    }
    if (!E.touches.has(e.pointerId)) return;
    E.touches.delete(e.pointerId);
    if (E.touches.size > 0) {
      E.touches.forEach(function (t) { t.px = t.x; t.py = t.y; });
      E.verlauf = [];
      return;
    }
    const tap = E.tap; E.tap = null;
    if (tap && !tap.bewegt && performance.now() - tap.t0 < 380) {
      if (tap.max === 2) { rueckgaengig(); toast('Rückgängig (Zwei-Finger-Tipp)'); }
      else if (tap.max === 3) { wiederholen(); toast('Wiederholt (Drei-Finger-Tipp)'); }
      else if (tap.max === 1) fingerTipp(tap.pt);
      return;
    }
    traegheitStarten();
    if (!E.stiftGesehen && !W.finger && !E.fingerHinweis && zeichnetWerkzeug() && tap && tap.max === 1) {
      E.fingerHinweis = true;
      toast('Mit dem Finger blätterst du. Schreiben geht mit dem Apple Pencil – oder im Menü ⋯ „Mit Finger schreiben“ einschalten.', false, 5200);
    }
  }
  function gesteAnwenden() {
    const ts = Array.from(E.touches.values());
    if (ts.length === 1) {
      const t = ts[0], dx = t.x - t.px, dy = t.y - t.py;
      t.px = t.x; t.py = t.y;
      verschieben(dx, dy);
      const z = performance.now();
      E.verlauf.push({ dx: dx, dy: dy, t: z });
      while (E.verlauf.length && z - E.verlauf[0].t > 100) E.verlauf.shift();
    } else if (ts.length >= 2) {
      const a = ts[0], b = ts[1];
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, pcx = (a.px + b.px) / 2, pcy = (a.py + b.py) / 2;
      const dd = Math.hypot(a.x - b.x, a.y - b.y), pd = Math.hypot(a.px - b.px, a.py - b.py) || dd;
      if (pd > 0) zoomen(dd / pd, pcx, pcy);
      verschieben(cx - pcx, cy - pcy);
      ts.forEach(function (t) { t.px = t.x; t.py = t.y; });
      E.verlauf = [];
    }
  }
  function traegheitStarten() {
    const v = E.verlauf || [];
    if (v.length < 2) return;
    const dt = v[v.length - 1].t - v[0].t || 16;
    let sx = 0, sy = 0;
    v.forEach(function (x) { sx += x.dx; sy += x.dy; });
    const vx = sx / dt, vy = sy / dt;
    if (Math.hypot(vx, vy) < 0.25) return;
    E.traegheit = { vx: vx, vy: vy, t: performance.now() };
    plane('haupt');
  }
  function traegheitSchritt(t) {
    const tr = E.traegheit, dt = Math.min(40, t - tr.t);
    tr.t = t;
    const s = skala();
    E.cam.x -= tr.vx * dt / s; E.cam.y -= tr.vy * dt / s;
    const vorher = { x: E.cam.x, y: E.cam.y };
    kameraBegrenzen();
    const f = Math.pow(0.95, dt / 16);
    tr.vx *= f; tr.vy *= f;
    if (vorher.x !== E.cam.x) tr.vx = 0;
    if (vorher.y !== E.cam.y) tr.vy = 0;
    if (Math.hypot(tr.vx, tr.vy) < 0.02) E.traegheit = null;
  }
  function fingerTipp(pt) {
    const w = welt(pt.x, pt.y);
    if (inKachel(w)) { seiteHinzufuegen(E.seiten.length - 1); return; }
    if (W.wz === 'text') { textTipp(pt); return; }
    if (E.auswahl && !auswahlTreffer(pt)) auswahlAufheben();
    if (E.textAktiv) textBeenden();
  }
  function aufRad(e) {
    if (!E) return;
    e.preventDefault();
    rechteckAktualisieren();
    const pt = punktAus(e);
    const f = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? E.vh : 1);
    if (e.ctrlKey || e.metaKey) zoomen(Math.exp(-e.deltaY * f * 0.01), pt.x, pt.y);
    else verschieben(-e.deltaX * f, -e.deltaY * f);
  }

  /* ---------- Stifte und Textmarker ---------- */
  function strichStart(w, e) {
    const i = seiteBei(w.x, w.y);
    if (i < 0) return;
    const r = E.pos[i], x = w.x - r.x, y = w.y - r.y, d = druck(e);
    const wz = W.wz;
    E.strich = {
      i: i, wz: wz, f: wz === 'marker' ? W.markerFarben[W.markerFarbe] : W.stiftFarben[W.stiftFarbe],
      b: aktuelleBreite(wz), roh: [x, y, d], glatt: [x, y, d], t0: performance.now(),
      gerade: wz === 'marker' && W.markerGerade
    };
    plane('live');
  }
  function strichPunkt(ev) {
    const st = E.strich, pt = punktAus(ev), w = welt(pt.x, pt.y), r = E.pos[st.i];
    const x = w.x - r.x, y = w.y - r.y, d = druck(ev);
    const n = st.roh.length;
    if (Math.hypot(x - st.roh[n - 3], y - st.roh[n - 2]) < 0.5 / skala()) { st.roh[n - 1] = d; return; }
    st.roh.push(x, y, d);
    const g = st.glatt, m = g.length, a = E.zeigerTyp === 'pen' ? 0.62 : 0.45;
    g.push(g[m - 3] + (x - g[m - 3]) * a, g[m - 2] + (y - g[m - 2]) * a, g[m - 1] + (d - g[m - 1]) * 0.4);
  }
  function strichEnde() {
    const st = E.strich;
    E.strich = null;
    if (!st) return;
    const seite = E.seiten[st.i], r = st.roh, n = r.length;
    let p = st.gerade ? [r[0], r[1], r[2], r[n - 3], r[n - 2], r[n - 1]] : st.glatt.concat([r[n - 3], r[n - 2], r[n - 1]]);
    p = neuAbtasten(p, 2);
    const strich = { id: uid(), w: st.wz, f: st.f, b: st.b, p: p };
    const opfer = st.gerade ? null : kritzelOpfer(seite, strich, st.roh);
    aendern(seite, function () {
      if (opfer) {
        const weg = new Set(opfer);
        seite.striche = seite.striche.filter(function (x) { return !weg.has(x); });
      } else seite.striche = seite.striche.concat([strich]);
    });
    if (opfer) toast(opfer.length === 1 ? 'Durchgekritzelt – gelöscht' : 'Durchgekritzelt – ' + opfer.length + ' Striche gelöscht', true);
    planeAlles();
  }

  /* ---------- Radierer ---------- */
  function radiererStart(pt, w) {
    const i = seiteBei(w.x, w.y);
    E.radierer = { i: i, vorher: i >= 0 ? E.seiten[i].striche : null, letzt: null, pos: pt };
    if (i >= 0) radiererBei(w);
    plane('live');
  }
  function radiererBei(w) {
    const rad = E.radierer, seite = E.seiten[rad.i], r = E.pos[rad.i];
    const x = w.x - r.x, y = w.y - r.y, rr = aktuelleBreite('radierer') / skala();
    let geaendert = false;
    if (rad.letzt) {
      const dist = Math.hypot(x - rad.letzt.x, y - rad.letzt.y), schritte = Math.ceil(dist / (rr * 0.5));
      for (let k = 1; k <= schritte; k++) {
        const t = k / schritte;
        if (radieren(seite, rad.letzt.x + (x - rad.letzt.x) * t, rad.letzt.y + (y - rad.letzt.y) * t, rr)) geaendert = true;
      }
    } else if (radieren(seite, x, y, rr)) geaendert = true;
    rad.letzt = { x: x, y: y };
    if (geaendert) plane('haupt');
  }
  function radiererMove(ev) {
    const pt = punktAus(ev);
    E.radierer.pos = pt;
    if (E.radierer.i >= 0) radiererBei(welt(pt.x, pt.y));
    plane('live');
  }
  function radiererEnde() {
    const rad = E.radierer;
    E.radierer = null;
    if (rad && rad.i >= 0) {
      const seite = E.seiten[rad.i];
      if (seite.striche !== rad.vorher) {
        aktionMerken({ typ: 'inhalt', id: seite.id, vorher: { striche: rad.vorher }, nachher: { striche: seite.striche } });
        schmutzig(seite);
      }
    }
    planeAlles();
  }

  /* ---------- Lasso ---------- */
  function lassoStart(w) {
    const i = seiteBei(w.x, w.y);
    if (i < 0) return;
    const r = E.pos[i];
    E.lasso = { i: i, pts: [w.x - r.x, w.y - r.y] };
  }
  function lassoPunkt(pt) {
    const l = E.lasso, w = welt(pt.x, pt.y), r = E.pos[l.i];
    const x = w.x - r.x, y = w.y - r.y, n = l.pts.length;
    if (Math.hypot(x - l.pts[n - 2], y - l.pts[n - 1]) * skala() < 3) return;
    l.pts.push(x, y);
  }
  function lassoEnde() {
    const l = E.lasso;
    E.lasso = null;
    if (!l || l.pts.length < 8) { plane('live'); return; }
    const seite = E.seiten[l.i], poly = l.pts;
    const sel = { i: l.i, s: new Set(), t: new Set(), b: new Set(), bb: null };
    seite.striche.forEach(function (st) {
      const q = st.p, m = q.length / 3, schritt = Math.max(1, Math.floor(m / 40));
      let drin = 0, ges = 0;
      for (let k = 0; k < m; k += schritt) { ges++; if (imPolygon(q[k * 3], q[k * 3 + 1], poly)) drin++; }
      if (ges && drin / ges >= 0.6) sel.s.add(st.id);
    });
    seite.texte.forEach(function (t) {
      const h = textHoehe(t);
      if (imPolygon(t.x + t.w / 2, t.y + h / 2, poly)) sel.t.add(t.id);
    });
    seite.bilder.forEach(function (bi) { if (imPolygon(bi.x + bi.w / 2, bi.y + bi.h / 2, poly)) sel.b.add(bi.id); });
    if (!sel.s.size && !sel.t.size && !sel.b.size) { plane('live'); return; }
    sel.bb = auswahlRahmen(seite, sel);
    E.auswahl = sel;
    plane('live');
  }
  function textHoehe(t) {
    const el = E && E.textElemente.get(t.id);
    if (el && el.offsetHeight) return el.offsetHeight;
    return Math.max(1, (String(t.text).split('\n').length) * t.g * 1.3 + 6);
  }
  function auswahlRahmen(seite, sel) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const mit = function (a, b, c, d) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
    seite.striche.forEach(function (st) { if (sel.s.has(st.id)) { const r = rahmen(st); mit(r.x0, r.y0, r.x1, r.y1); } });
    seite.texte.forEach(function (t) { if (sel.t.has(t.id)) mit(t.x, t.y, t.x + t.w, t.y + textHoehe(t)); });
    seite.bilder.forEach(function (bi) { if (sel.b.has(bi.id)) mit(bi.x, bi.y, bi.x + bi.w, bi.y + bi.h); });
    return { x0: x0 - 4, y0: y0 - 4, x1: x1 + 4, y1: y1 + 4 };
  }
  function auswahlBildschirm() {
    const a = E.auswahl, r = E.pos[a.i], s = skala();
    return {
      x0: (r.x + a.bb.x0 - E.cam.x) * s, y0: (r.y + a.bb.y0 - E.cam.y) * s,
      x1: (r.x + a.bb.x1 - E.cam.x) * s, y1: (r.y + a.bb.y1 - E.cam.y) * s
    };
  }
  function auswahlTreffer(pt) {
    if (!E.auswahl) return null;
    const q = auswahlBildschirm();
    if (Math.hypot(pt.x - q.x1, pt.y - q.y1) <= 20) return 'skalieren';
    if (pt.x >= q.x0 - 8 && pt.x <= q.x1 + 8 && pt.y >= q.y0 - 8 && pt.y <= q.y1 + 8) return 'verschieben';
    return null;
  }
  function auswahlVerstecken() {
    const a = E.auswahl;
    E.versteckt = new Set(Array.from(a.s).concat(Array.from(a.b)));
  }
  function ziehenMove(pt) {
    const z = E.ziehen, s = skala();
    if (z.art === 'verschieben') { z.dx = (pt.x - z.start.x) / s; z.dy = (pt.y - z.start.y) / s; }
    else {
      const q = auswahlBildschirm();
      const basis = (q.x1 - q.x0) + (q.y1 - q.y0);
      z.k = grenze(((pt.x - q.x0) + (pt.y - q.y0)) / Math.max(10, basis), 0.15, 8);
    }
    plane('live', 'text');
  }
  function ziehenEnde() {
    const z = E.ziehen;
    E.ziehen = null; E.versteckt = null;
    if (Math.abs(z.dx) > 0.3 || Math.abs(z.dy) > 0.3 || Math.abs(z.k - 1) > 0.005) auswahlTransformieren(z.dx, z.dy, z.k);
    planeAlles();
  }
  function auswahlTransformieren(dx, dy, k) {
    const a = E.auswahl, seite = E.seiten[a.i], ax = a.bb.x0, ay = a.bb.y0;
    const tx = function (x) { return r2(ax + (x - ax) * k + dx); }, ty = function (y) { return r2(ay + (y - ay) * k + dy); };
    aendern(seite, function () {
      if (a.s.size) seite.striche = seite.striche.map(function (st) {
        if (!a.s.has(st.id)) return st;
        const q = st.p.slice();
        for (let i = 0; i < q.length; i += 3) { q[i] = tx(q[i]); q[i + 1] = ty(q[i + 1]); }
        return { id: st.id, w: st.w, f: st.f, b: r2(st.b * k), p: q };
      });
      if (a.t.size) seite.texte = seite.texte.map(function (t) {
        if (!a.t.has(t.id)) return t;
        return Object.assign({}, t, { x: tx(t.x), y: ty(t.y), w: r2(t.w * k), g: r2(grenze(t.g * k, 6, 120)) });
      });
      if (a.b.size) seite.bilder = seite.bilder.map(function (bi) {
        if (!a.b.has(bi.id)) return bi;
        return Object.assign({}, bi, { x: tx(bi.x), y: ty(bi.y), w: r2(bi.w * k), h: r2(bi.h * k) });
      });
    });
    a.bb = { x0: ax + dx, y0: ay + dy, x1: ax + (a.bb.x1 - ax) * k + dx, y1: ay + (a.bb.y1 - ay) * k + dy };
  }
  function auswahlAufheben(still) {
    if (!E || !E.auswahl) return;
    E.auswahl = null; E.ziehen = null; E.versteckt = null;
    if (!still) plane('live', 'haupt');
  }
  function auswahlLoeschen() {
    const a = E.auswahl;
    if (!a) return;
    const seite = E.seiten[a.i];
    aendern(seite, function () {
      if (a.s.size) seite.striche = seite.striche.filter(function (x) { return !a.s.has(x.id); });
      if (a.t.size) seite.texte = seite.texte.filter(function (x) { return !a.t.has(x.id); });
      if (a.b.size) seite.bilder = seite.bilder.filter(function (x) { return !a.b.has(x.id); });
    });
    auswahlAufheben(); planeAlles();
  }
  function auswahlDuplizieren() {
    const a = E.auswahl;
    if (!a) return;
    const seite = E.seiten[a.i], neu = { i: a.i, s: new Set(), t: new Set(), b: new Set(), bb: null }, v = 16;
    aendern(seite, function () {
      const ns = [], nt = [], nb = [];
      seite.striche.forEach(function (st) {
        if (!a.s.has(st.id)) return;
        const q = st.p.slice();
        for (let i = 0; i < q.length; i += 3) { q[i] = r2(q[i] + v); q[i + 1] = r2(q[i + 1] + v); }
        const k2 = { id: uid(), w: st.w, f: st.f, b: st.b, p: q }; ns.push(k2); neu.s.add(k2.id);
      });
      seite.texte.forEach(function (t) {
        if (!a.t.has(t.id)) return;
        const k2 = Object.assign({}, t, { id: uid(), x: t.x + v, y: t.y + v }); nt.push(k2); neu.t.add(k2.id);
      });
      seite.bilder.forEach(function (bi) {
        if (!a.b.has(bi.id)) return;
        const k2 = Object.assign({}, bi, { id: uid(), x: bi.x + v, y: bi.y + v }); nb.push(k2); neu.b.add(k2.id);
      });
      if (ns.length) seite.striche = seite.striche.concat(ns);
      if (nt.length) seite.texte = seite.texte.concat(nt);
      if (nb.length) seite.bilder = seite.bilder.concat(nb);
    });
    neu.bb = { x0: a.bb.x0 + v, y0: a.bb.y0 + v, x1: a.bb.x1 + v, y1: a.bb.y1 + v };
    E.auswahl = neu;
    planeAlles();
  }
  function auswahlFaerben(farbe) {
    const a = E.auswahl;
    if (!a) return;
    const seite = E.seiten[a.i];
    aendern(seite, function () {
      if (a.s.size) seite.striche = seite.striche.map(function (st) { return a.s.has(st.id) ? Object.assign({}, st, { f: farbe }) : st; });
      if (a.t.size) seite.texte = seite.texte.map(function (t) { return a.t.has(t.id) ? Object.assign({}, t, { f: farbe }) : t; });
    });
    planeAlles();
  }
  function auswahlMenueSync() {
    const m = E.el.auswahlMenue;
    if (!E.auswahl || E.ziehen) { m.hidden = true; return; }
    const q = auswahlBildschirm();
    m.hidden = false;
    const b = m.offsetWidth || 220, h = m.offsetHeight || 44;
    let x = (q.x0 + q.x1) / 2 - b / 2, y = q.y0 - h - 12;
    if (y < 8) y = q.y1 + 16;
    x = grenze(x, 8, E.vw - b - 8); y = grenze(y, 8, E.vh - h - 8);
    m.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }

  /* ---------- Textfelder ---------- */
  const PLAINTEXT = (function () {
    try { const d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only'; } catch (e) { return false; }
  })();
  function textElementBauen(t) {
    const el = document.createElement('div');
    el.className = 'nb-text';
    el.setAttribute('data-id', t.id);
    const inhalt = document.createElement('div');
    inhalt.className = 'nb-text-inhalt';
    inhalt.setAttribute('spellcheck', 'false');
    inhalt.textContent = t.text;
    el.appendChild(inhalt);
    el._text = t.text;
    el.addEventListener('pointerdown', function (ev) {
      if (!E || W.wz !== 'text') return;
      ev.stopPropagation();
      popoverSchliessen();
      if (E.textAktiv !== t.id) { if (E.textAktiv) textBeenden(); textAktivieren(t.id, false); }
    });
    inhalt.addEventListener('input', function () { plane('text'); });
    inhalt.addEventListener('paste', function (ev) {
      if (PLAINTEXT) return;
      ev.preventDefault();
      const txt = (ev.clipboardData || window.clipboardData).getData('text');
      document.execCommand('insertText', false, txt);
    });
    inhalt.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); textBeenden(); }
      ev.stopPropagation();
    });
    return el;
  }
  function textFinden(id) {
    for (let i = 0; i < E.seiten.length; i++) {
      const t = E.seiten[i].texte.find(function (x) { return x.id === id; });
      if (t) return { seite: E.seiten[i], i: i, t: t };
    }
    return null;
  }
  function textInhalt(id) {
    const el = E.textElemente.get(id);
    if (!el) return '';
    return el.firstChild.innerText.replace(/ /g, ' ').replace(/\n$/, '');
  }
  function textAktivieren(id, neu) {
    const el = E.textElemente.get(id);
    if (!el) return;
    E.textAktiv = id;
    if (neu) E.textNeu = id;
    const inhalt = el.firstChild;
    inhalt.contentEditable = PLAINTEXT ? 'plaintext-only' : 'true';
    el.classList.add('aktiv');
    try {
      inhalt.focus({ preventScroll: true });
      const sel = window.getSelection(), r = document.createRange();
      r.selectNodeContents(inhalt); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
    } catch (e) { }
    zeile2Zeichnen();
    plane('text');
  }
  function textBeenden() {
    if (!E || !E.textAktiv) return;
    const id = E.textAktiv;
    E.textAktiv = null;
    const el = E.textElemente.get(id);
    const text = textInhalt(id);
    if (el) { el.firstChild.contentEditable = 'false'; el.classList.remove('aktiv'); try { el.firstChild.blur(); } catch (e) { } }
    const f = textFinden(id);
    if (f) {
      if (!text.trim()) {
        const oben = E.undo[E.undo.length - 1];
        if (E.textNeu === id && oben && oben.typ === 'inhalt' && oben.id === f.seite.id && oben.nachher.texte === f.seite.texte) {
          E.undo.pop();
          f.seite.texte = oben.vorher.texte;
          schmutzig(f.seite);
          knoepfeAktualisieren();
        } else aendern(f.seite, function () { f.seite.texte = f.seite.texte.filter(function (x) { return x.id !== id; }); });
      } else if (text !== f.t.text) {
        aendern(f.seite, function () {
          f.seite.texte = f.seite.texte.map(function (x) { return x.id === id ? Object.assign({}, x, { text: text }) : x; });
        });
      }
    }
    E.textNeu = null;
    zeile2Zeichnen();
    plane('text');
  }
  function textTipp(pt) {
    if (E.textAktiv) { textBeenden(); return; }
    const w = welt(pt.x, pt.y), i = seiteBei(w.x, w.y);
    if (i < 0) return;
    const seite = E.seiten[i], r = E.pos[i];
    const x = grenze(w.x - r.x - 5, 0, seite.b - 40), y = grenze(w.y - r.y - W.textGroesse * 0.8, 0, seite.h - 20);
    const t = { id: uid(), x: r2(x), y: r2(y), w: r2(Math.max(80, Math.min(260, seite.b - x - 14))), text: '',
      g: W.textGroesse, f: W.stiftFarben[W.stiftFarbe], fett: W.textFett };
    aendern(seite, function () { seite.texte = seite.texte.concat([t]); });
    textSync();
    textAktivieren(t.id, true);
  }
  function textFormat(aenderung) {
    if (!E || !E.textAktiv) return false;
    const f = textFinden(E.textAktiv);
    if (!f) return false;
    const text = textInhalt(f.t.id);
    aendern(f.seite, function () {
      f.seite.texte = f.seite.texte.map(function (x) { return x.id === f.t.id ? Object.assign({}, x, aenderung, { text: text }) : x; });
    });
    const el = E.textElemente.get(f.t.id);
    if (el) el._text = text;
    if (E.textNeu === f.t.id) E.textNeu = null;          // jetzt nicht mehr „frisch“
    plane('text');
    return true;
  }
  function textSync() {
    const s = skala(), da = new Set();
    E.seiten.forEach(function (seite, i) {
      const r = E.pos[i];
      seite.texte.forEach(function (t) {
        da.add(t.id);
        let el = E.textElemente.get(t.id);
        if (!el) { el = textElementBauen(t); E.textElemente.set(t.id, el); E.el.textebene.appendChild(el); }
        let x = t.x, y = t.y, w = t.w, g = t.g;
        const a = E.auswahl, z = E.ziehen;
        if (z && a && a.i === i && a.t.has(t.id)) {
          x = a.bb.x0 + (x - a.bb.x0) * z.k + z.dx; y = a.bb.y0 + (y - a.bb.y0) * z.k + z.dy; w *= z.k; g *= z.k;
        }
        const tz = E.textZiehen;
        if (tz && tz.id === t.id) { x += tz.dx; y += tz.dy; w = tz.w; }
        const sx = (r.x + x - E.cam.x) * s, sy = (r.y + y - E.cam.y) * s;
        el.style.transform = 'translate(' + sx.toFixed(2) + 'px,' + sy.toFixed(2) + 'px) scale(' + s.toFixed(4) + ')';
        el.style.width = w + 'px';
        const inhalt = el.firstChild;
        inhalt.style.fontSize = g + 'px';
        inhalt.style.color = t.f;
        inhalt.style.fontWeight = t.fett ? '700' : '400';
        if (E.textAktiv !== t.id && el._text !== t.text) { inhalt.textContent = t.text; el._text = t.text; }
        const unsichtbar = sy > E.vh + 50 || sy + 2000 * s < -50;
        el.style.visibility = unsichtbar ? 'hidden' : '';
      });
    });
    E.textElemente.forEach(function (el, id) {
      if (!da.has(id)) { if (E.textAktiv === id) E.textAktiv = null; el.remove(); E.textElemente.delete(id); }
    });
    textRahmenSync();
  }
  function textRahmenSync() {
    const rah = E.el.textRahmen;
    const id = E.textAktiv;
    if (!id || W.wz !== 'text') { rah.hidden = true; return; }
    const f = textFinden(id), el = E.textElemente.get(id);
    if (!f || !el) { rah.hidden = true; return; }
    const s = skala(), r = E.pos[f.i], tz = E.textZiehen && E.textZiehen.id === id ? E.textZiehen : null;
    const x = f.t.x + (tz ? tz.dx : 0), y = f.t.y + (tz ? tz.dy : 0), w = tz ? tz.w : f.t.w;
    rah.hidden = false;
    rah.style.transform = 'translate(' + ((r.x + x - E.cam.x) * s).toFixed(1) + 'px,' + ((r.y + y - E.cam.y) * s).toFixed(1) + 'px)';
    rah.style.width = (w * s) + 'px';
    rah.style.height = (el.offsetHeight * s) + 'px';
  }
  function textRahmenZiehen(art, ev) {
    if (!E || !E.textAktiv) return;
    ev.preventDefault(); ev.stopPropagation();
    const f = textFinden(E.textAktiv);
    if (!f) return;
    const ziel = ev.currentTarget;
    try { ziel.setPointerCapture(ev.pointerId); } catch (x) { }
    const start = { x: ev.clientX, y: ev.clientY };
    E.textZiehen = { id: f.t.id, art: art, dx: 0, dy: 0, w: f.t.w };
    const s = skala();
    function bewegen(e) {
      const tz = E && E.textZiehen;
      if (!tz) return;
      if (art === 'verschieben') { tz.dx = (e.clientX - start.x) / s; tz.dy = (e.clientY - start.y) / s; }
      else tz.w = Math.max(40, f.t.w + (e.clientX - start.x) / s);
      plane('text');
    }
    function ende() {
      ziel.removeEventListener('pointermove', bewegen);
      ziel.removeEventListener('pointerup', ende);
      ziel.removeEventListener('pointercancel', ende);
      const tz = E && E.textZiehen;
      if (!tz) return;
      E.textZiehen = null;
      const g = textFinden(tz.id);
      if (g && (Math.abs(tz.dx) > 0.3 || Math.abs(tz.dy) > 0.3 || Math.abs(tz.w - g.t.w) > 0.3)) {
        const seite = g.seite;
        const text = textInhalt(tz.id);
        aendern(seite, function () {
          seite.texte = seite.texte.map(function (x) {
            if (x.id !== tz.id) return x;
            return Object.assign({}, x, {
              x: r2(grenze(x.x + tz.dx, -x.w + 20, seite.b - 20)), y: r2(grenze(x.y + tz.dy, -10, seite.h - 10)), w: r2(tz.w), text: text
            });
          });
        });
        const el = E.textElemente.get(tz.id);
        if (el) el._text = text;
        if (E.textNeu === tz.id) E.textNeu = null;
      }
      plane('text');
      const el2 = E.textElemente.get(tz.id);
      if (el2) try { el2.firstChild.focus({ preventScroll: true }); } catch (x) { }
    }
    ziel.addEventListener('pointermove', bewegen);
    ziel.addEventListener('pointerup', ende);
    ziel.addEventListener('pointercancel', ende);
  }
  function textLoeschenAktiv() {
    if (!E || !E.textAktiv) return;
    const id = E.textAktiv, f = textFinden(id);
    E.textAktiv = null; E.textNeu = null;
    if (f) aendern(f.seite, function () { f.seite.texte = f.seite.texte.filter(function (x) { return x.id !== id; }); });
    zeile2Zeichnen(); plane('text');
  }

  /* ---------- Seiten ---------- */
  function seiteHinzufuegen(nach, vorlage) {
    textBeenden();
    const vorbild = E.seiten[nach] || E.seiten[E.seiten.length - 1];
    const s = neueSeite(E.buch, {
      v: vorlage || (vorbild && !vorbild.hg ? vorbild.v : E.buch.vorlage),
      papier: vorbild ? vorbild.papier : E.buch.papier
    });
    const index = Math.min(nach + 1, E.seiten.length);
    E.seiten.splice(index, 0, s);
    aktionMerken({ typ: 'seite-neu', index: index, seite: s });
    schmutzig(s); layout(); kameraBegrenzen();
    zuSeite(index);
    toast('Seite ' + (index + 1) + ' hinzugefügt');
  }
  function seiteLoeschen(i) {
    if (E.seiten.length <= 1) { toast('Ein Notizbuch braucht mindestens eine Seite.'); return; }
    textBeenden(); auswahlAufheben(true);
    const s = E.seiten[i];
    E.seiten.splice(i, 1);
    E.weg.add(s.id); E.dirty.delete(s.id); seiteWegMarke(s.id);
    aktionMerken({ typ: 'seite-weg', index: i, seite: s });
    layout(); kameraBegrenzen(); buchSchmutzig(); planeAlles();
    toast('Seite ' + (i + 1) + ' gelöscht', true);
  }
  function vorlageSetzen(i, v) {
    const s = E.seiten[i];
    if (!s || s.v === v) return;
    aktionMerken({ typ: 'seite-meta', id: s.id, vorher: { v: s.v }, nachher: { v: v } });
    s.v = v; schmutzig(s); planeAlles();
  }
  function seitenzahlAktualisieren() {
    const n = E.seiten.length, i = aktuelleSeite();
    const txt = (i + 1) + ' / ' + n;
    if (E.el.seitenzahl.textContent !== txt) E.el.seitenzahl.textContent = txt;
  }

  /* ---------- Bilder einfügen ---------- */
  async function bildVerkleinern(datei) {
    const url = URL.createObjectURL(datei);
    try {
      const img = await new Promise(function (ok, f) { const i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { f(new Error('Bild konnte nicht gelesen werden')); }; i.src = url; });
      const max = 2200, gross = Math.max(img.naturalWidth, img.naturalHeight);
      if (gross <= max && datei.size <= 2.5 * 1024 * 1024) return { blob: datei, b: img.naturalWidth, h: img.naturalHeight };
      const k = Math.min(1, max / gross), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.88); });
      return { blob: blob, b: c.width, h: c.height };
    } finally { URL.revokeObjectURL(url); }
  }
  async function bildEinfuegen(datei) {
    if (!E || !datei) return;
    const ed = E;
    try {
      const v = await bildVerkleinern(datei);
      const id = await dateiSpeichern(v.blob, ed.buch.id);
      if (E !== ed) return;
      await bildLaden(id);
      const i = aktuelleSeite(), seite = E.seiten[i], r = E.pos[i];
      const b = Math.min(seite.b * 0.7, v.b * 0.75), h = b * v.h / v.b;
      const mitte = welt(E.vw / 2, E.vh / 2);
      const x = grenze(mitte.x - r.x - b / 2, 0, seite.b - b), y = grenze(mitte.y - r.y - h / 2, 0, Math.max(0, seite.h - h));
      const neu = { id: uid(), d: id, x: r2(x), y: r2(y), w: r2(b), h: r2(h) };
      aendern(seite, function () { seite.bilder = seite.bilder.concat([neu]); });
      werkzeugWaehlen('lasso');
      E.auswahl = { i: i, s: new Set(), t: new Set(), b: new Set([neu.id]), bb: { x0: neu.x - 4, y0: neu.y - 4, x1: neu.x + neu.w + 4, y1: neu.y + neu.h + 4 } };
      planeAlles();
      toast('Bild eingefügt – verschieben oder an der Ecke vergrößern');
    } catch (e) { toast('Bild konnte nicht eingefügt werden: ' + e.message); }
  }

  /* ---------- Werkzeugleiste ---------- */
  const ICON = {
    zurueck: '<path d="M15 5l-7 7 7 7"/>',
    fueller: '<path d="M12 21.5L7 11.2 12 2.5l5 8.7z"/><path d="M12 11v5.2"/><circle cx="12" cy="10" r="1.3"/>',
    kuli: '<path d="M16.6 3.4a2 2 0 012.8 0l1.2 1.2a2 2 0 010 2.8L9.2 18.8 4 20l1.2-5.2z"/><path d="M14.5 5.5l4 4"/>',
    pinsel: '<path d="M20.5 3.5c-3 1.6-7.2 5.6-9.2 8.3l2.9 2.9c2.7-2 6.7-6.2 8.3-9.2z"/><path d="M10.6 12.6c-2.4.1-4 1.7-4.1 4.1-.1 1.6-1 2.6-2.7 3.1 3.5 1 7.4.3 8.6-2.3.5-1.1.4-2.2-.2-3.3"/>',
    marker: '<path d="M14.5 3.5l6 6-8.3 8.3H6.2v-6z"/><path d="M6.2 17.8L3.5 20.5h6.2"/><path d="M10 7.9l6 6"/>',
    radierer: '<path d="M8.4 20L3.6 15.2a1.8 1.8 0 010-2.5L12.7 3.6a1.8 1.8 0 012.5 0l5.2 5.2a1.8 1.8 0 010 2.5L11.2 20z"/><path d="M8.2 8.2l7.6 7.6"/><path d="M11.2 20H20.5"/>',
    lasso: '<path d="M12 4c4.8 0 8.6 2.4 8.6 5.6s-3.8 5.6-8.6 5.6-8.6-2.4-8.6-5.6S7.2 4 12 4z" stroke-dasharray="3 2.4"/><path d="M6.4 14c-.9 1.4-.6 3 .7 3.8 1.2.7 1.4 2 .6 3.2"/>',
    text: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 8.2h8M12 8.2v8.2"/>',
    bild: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="9.8" r="1.6"/><path d="M4 17.5l5-5 3.5 3.5 2.5-2.5 5 5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
    mehr: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
    seiten: '<rect x="4" y="3.5" width="7" height="9" rx="1.5"/><rect x="13" y="3.5" width="7" height="9" rx="1.5"/><rect x="4" y="14.5" width="7" height="6" rx="1.5"/><rect x="13" y="14.5" width="7" height="6" rx="1.5"/>',
    kopieren: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
    loeschen: '<path d="M4 7h16"/><path d="M9 7V4.8h6V7"/><path d="M6.5 7l1 13h9l1-13"/>',
    schliessen: '<path d="M6 6l12 12M18 6L6 18"/>',
    griff: '<circle cx="9" cy="7" r="1.3" fill="currentColor"/><circle cx="15" cy="7" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="17" r="1.3" fill="currentColor"/><circle cx="15" cy="17" r="1.3" fill="currentColor"/>'
  };
  function icon(n) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + '</svg>';
  }
  function knoepfeAktualisieren() {
    if (!E) return;
    E.el.undo.disabled = !E.undo.length;
    E.el.redo.disabled = !E.redo.length;
  }
  function werkzeugWaehlen(wz) {
    if (!E) return;
    if (W.wz !== wz) { textBeenden(); auswahlAufheben(); }
    W.wz = wz;
    werkzeugSpeichern();
    E.el.root.classList.toggle('wz-text', wz === 'text');
    $$(E.el.root, '[data-nb-wz]').forEach(function (b) { b.classList.toggle('aktiv', b.getAttribute('data-nb-wz') === wz); });
    werkzeugFarbstriche();
    zeile2Zeichnen();
    plane('live', 'text');
  }
  function werkzeugFarbstriche() {
    $$(E.el.root, '[data-nb-wz]').forEach(function (b) {
      const wz = b.getAttribute('data-nb-wz'), s = b.querySelector('.nb-farbstrich');
      if (!s) return;
      s.style.background = wz === 'marker' ? W.markerFarben[W.markerFarbe] : W.stiftFarben[W.stiftFarbe];
    });
  }
  function punktGroesse(wz, b) {
    if (wz === 'marker') return Math.min(20, 5 + b * 0.55);
    if (wz === 'radierer') return Math.min(22, 6 + b * 0.5);
    return Math.min(16, 3 + b * 2.3);
  }
  function zeile2Zeichnen() {
    if (!E) return;
    const z = E.el.zeile2, wz = W.wz;
    let h = '';
    const farbKnoepfe = function (liste, aktiv, art) {
      return '<div class="nb-gruppe">' + liste.map(function (f, i) {
        return '<button class="nb-farbe' + (i === aktiv ? ' aktiv' : '') + '" data-nb-farbe="' + art + ':' + i + '" style="--f:' + f + '" aria-label="Farbe ' + (i + 1) + '"></button>';
      }).join('') + '</div>';
    };
    const breitenKnoepfe = function (w) {
      return '<div class="nb-gruppe">' + W.breiten[w].map(function (b, i) {
        const g = punktGroesse(w, b);
        return '<button class="nb-breite' + (i === W.breite[w] ? ' aktiv' : '') + '" data-nb-breite="' + i + '" aria-label="Stärke ' + (i + 1) + '">' +
          '<span style="width:' + g + 'px;height:' + g + 'px;' + (w === 'radierer' ? 'background:transparent;border:1.6px solid currentColor' : '') + '"></span></button>';
      }).join('') + '</div>';
    };
    if (STIFTE.indexOf(wz) >= 0) {
      h = '<span class="nb-name">' + NAMEN[wz] + '</span>' + farbKnoepfe(W.stiftFarben, W.stiftFarbe, 'stift') + '<span class="nb-trenner"></span>' + breitenKnoepfe(wz);
    } else if (wz === 'marker') {
      h = '<span class="nb-name">Textmarker</span>' + farbKnoepfe(W.markerFarben, W.markerFarbe, 'marker') + '<span class="nb-trenner"></span>' + breitenKnoepfe('marker') +
        '<span class="nb-trenner"></span><button class="nb-schalter' + (W.markerGerade ? ' aktiv' : '') + '" data-nb-gerade="1">Gerade Linie</button>';
    } else if (wz === 'radierer') {
      h = '<span class="nb-name">Radierer</span>' + breitenKnoepfe('radierer') + '<span class="nb-trenner"></span><div class="nb-segment">' +
        [['praezise', 'Präzise'], ['strich', 'Ganzer Strich'], ['marker', 'Nur Textmarker']].map(function (m) {
          return '<button class="' + (W.radierModus === m[0] ? 'aktiv' : '') + '" data-nb-radmodus="' + m[0] + '">' + m[1] + '</button>';
        }).join('') + '</div>';
    } else if (wz === 'lasso') {
      h = '<span class="nb-name">Lasso</span><span class="nb-tipp">Einkreisen, dann ziehen zum Verschieben · Ecke ziehen zum Vergrößern</span>';
    } else if (wz === 'text') {
      let g = W.textGroesse, fett = W.textFett, farbe = -1;
      if (E.textAktiv) {
        const f = textFinden(E.textAktiv);
        if (f) { g = f.t.g; fett = f.t.fett; farbe = W.stiftFarben.indexOf(f.t.f); }
      } else farbe = W.stiftFarbe;
      h = '<span class="nb-name">Text</span><div class="nb-gruppe"><button class="nb-mini" data-nb-textgroesse="-1" aria-label="Kleiner">A−</button>' +
        '<span class="nb-wert">' + Math.round(g) + ' pt</span><button class="nb-mini" data-nb-textgroesse="1" aria-label="Größer">A+</button></div>' +
        '<button class="nb-schalter nb-fett' + (fett ? ' aktiv' : '') + '" data-nb-fett="1">B</button><span class="nb-trenner"></span>' +
        farbKnoepfe(W.stiftFarben, farbe, 'text') +
        (E.textAktiv ? '<span class="nb-trenner"></span><button class="nb-mini nb-rot" data-nb-textweg="1">Löschen</button>' : '<span class="nb-tipp">Auf die Seite tippen, um ein Textfeld anzulegen</span>');
    }
    z.innerHTML = h;
    $$(z, 'button').forEach(function (b) { b.addEventListener('pointerdown', function (e) { if (E && E.textAktiv) e.preventDefault(); }); });
  }
  function zeile2Klick(e) {
    const b = e.target.closest('button');
    if (!b || !E) return;
    if (b.hasAttribute('data-nb-farbe')) {
      const teile = b.getAttribute('data-nb-farbe').split(':'), art = teile[0], i = Number(teile[1]);
      if (art === 'marker') {
        if (W.markerFarbe === i) farbPopover(b, 'marker', i); else W.markerFarbe = i;
      } else if (art === 'text') {
        if (E.textAktiv) { W.stiftFarbe = i; textFormat({ f: W.stiftFarben[i] }); }
        else if (W.stiftFarbe === i) farbPopover(b, 'stift', i); else W.stiftFarbe = i;
      } else {
        if (W.stiftFarbe === i) farbPopover(b, 'stift', i); else W.stiftFarbe = i;
      }
      werkzeugSpeichern(); werkzeugFarbstriche(); zeile2Zeichnen(); return;
    }
    if (b.hasAttribute('data-nb-breite')) {
      const i = Number(b.getAttribute('data-nb-breite')), wz = W.wz;
      if (W.breite[wz] === i) breitePopover(b, wz, i); else W.breite[wz] = i;
      werkzeugSpeichern(); zeile2Zeichnen(); plane('live'); return;
    }
    if (b.hasAttribute('data-nb-gerade')) { W.markerGerade = !W.markerGerade; werkzeugSpeichern(); zeile2Zeichnen(); return; }
    if (b.hasAttribute('data-nb-radmodus')) { W.radierModus = b.getAttribute('data-nb-radmodus'); werkzeugSpeichern(); zeile2Zeichnen(); return; }
    if (b.hasAttribute('data-nb-textgroesse')) {
      const stufen = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];
      let g = W.textGroesse;
      if (E.textAktiv) { const f = textFinden(E.textAktiv); if (f) g = f.t.g; }
      const r = Number(b.getAttribute('data-nb-textgroesse'));
      let neu = g;
      if (r > 0) neu = stufen.find(function (x) { return x > g + 0.01; }) || 64;
      else neu = stufen.slice().reverse().find(function (x) { return x < g - 0.01; }) || 8;
      W.textGroesse = neu; werkzeugSpeichern();
      textFormat({ g: neu });
      zeile2Zeichnen(); return;
    }
    if (b.hasAttribute('data-nb-fett')) {
      let fett = W.textFett;
      if (E.textAktiv) { const f = textFinden(E.textAktiv); if (f) fett = f.t.fett; }
      W.textFett = !fett; werkzeugSpeichern();
      textFormat({ fett: W.textFett });
      zeile2Zeichnen(); return;
    }
    if (b.hasAttribute('data-nb-textweg')) { textLoeschenAktiv(); }
  }

  /* ---------- Popover ---------- */
  function popoverSchliessen() {
    if (E && E.popover) { E.popover.remove(); E.popover = null; }
  }
  function popoverZeigen(anker, html, binden) {
    popoverSchliessen();
    const p = document.createElement('div');
    p.className = 'nb-popover';
    p.innerHTML = html;
    E.el.root.appendChild(p);
    const a = anker.getBoundingClientRect(), wr = E.el.root.getBoundingClientRect();
    const pb = p.offsetWidth, ph = p.offsetHeight;
    let x = a.left + a.width / 2 - pb / 2 - wr.left, y = a.bottom + 8 - wr.top;
    x = grenze(x, 8, wr.width - pb - 8);
    if (y + ph > wr.height - 8) y = Math.max(8, a.top - ph - 8 - wr.top);
    p.style.left = x + 'px'; p.style.top = y + 'px';
    p.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    E.popover = p;
    if (binden) binden(p);
    return p;
  }
  function farbPopover(anker, art, index) {
    const liste = art === 'marker' ? MARKER_FARBEN : FARBEN;
    const aktuell = art === 'marker' ? W.markerFarben[index] : W.stiftFarben[index];
    popoverZeigen(anker, '<div class="nb-pop-titel">Farbe wählen</div><div class="nb-farbgitter">' +
      liste.map(function (f) { return '<button style="--f:' + f + '" data-f="' + f + '" class="' + (f.toLowerCase() === String(aktuell).toLowerCase() ? 'aktiv' : '') + '" aria-label="' + f + '"></button>'; }).join('') +
      '</div><label class="nb-eigene">Eigene Farbe <input type="color" value="' + aktuell + '"></label>',
      function (p) {
        const setzen = function (f) {
          if (art === 'marker') { W.markerFarben[index] = f; W.markerFarbe = index; }
          else { W.stiftFarben[index] = f; W.stiftFarbe = index; }
          werkzeugSpeichern(); werkzeugFarbstriche(); zeile2Zeichnen();
        };
        $$(p, '[data-f]').forEach(function (b) { b.addEventListener('click', function () { setzen(b.getAttribute('data-f')); popoverSchliessen(); }); });
        p.querySelector('input').addEventListener('input', function (e) { setzen(e.target.value); });
      });
  }
  function breitePopover(anker, wz, index) {
    const bereich = wz === 'marker' ? [4, 32, 0.5] : (wz === 'radierer' ? [4, 40, 1] : [0.3, 8, 0.1]);
    const wert = W.breiten[wz][index];
    const anzeige = function (v) { return wz === 'radierer' ? Math.round(v) + ' px' : (v * 0.3528).toFixed(2).replace('.', ',') + ' mm'; };
    popoverZeigen(anker, '<div class="nb-pop-titel">Stärke <span class="nb-pop-wert">' + anzeige(wert) + '</span></div>' +
      '<input class="nb-regler" type="range" min="' + bereich[0] + '" max="' + bereich[1] + '" step="' + bereich[2] + '" value="' + wert + '">' +
      '<canvas class="nb-vorschau" width="440" height="80"></canvas>',
      function (p) {
        const regler = p.querySelector('input'), c = p.querySelector('canvas');
        const vorschau = function () {
          const v = Number(regler.value), ctx = c.getContext('2d');
          ctx.clearRect(0, 0, c.width, c.height);
          const pts = [];
          for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(30 + t * 380, 40 + Math.sin(t * Math.PI * 2) * 18, 0.25 + 0.5 * Math.sin(t * Math.PI)); }
          ctx.save(); ctx.scale(1, 1);
          if (wz === 'radierer') { ctx.beginPath(); ctx.arc(220, 40, v, 0, Math.PI * 2); ctx.strokeStyle = '#6E6E78'; ctx.lineWidth = 2; ctx.stroke(); }
          else if (wz === 'marker') { ctx.globalAlpha = 0.85; ctx.strokeStyle = W.markerFarben[W.markerFarbe]; ctx.lineWidth = v * 2; ctx.lineCap = 'round'; ctx.stroke(linienPfad(pts)); }
          else { ctx.fillStyle = W.stiftFarben[W.stiftFarbe]; ctx.fill(tintenPfad(pts, wz, v * 2)); }
          ctx.restore();
        };
        regler.addEventListener('input', function () {
          W.breiten[wz][index] = Number(regler.value);
          p.querySelector('.nb-pop-wert').textContent = anzeige(Number(regler.value));
          werkzeugSpeichern(); vorschau();
        });
        regler.addEventListener('change', function () { zeile2Zeichnen(); });
        vorschau();
      });
  }
  function menuePopover(anker) {
    const i = aktuelleSeite(), s = E.seiten[i];
    popoverZeigen(anker, '<div class="nb-pop-titel">Seite ' + (i + 1) + ' von ' + E.seiten.length + '</div>' +
      '<button class="nb-menue" data-m="neu">Neue Seite danach</button>' +
      (s.hg ? '' : '<div class="nb-pop-unter">Vorlage dieser Seite</div><div class="nb-vorlagen-mini">' +
        VORLAGEN.map(function (v) { return '<button data-v="' + v[0] + '" class="' + (s.v === v[0] ? 'aktiv' : '') + '"><span class="nb-vl nb-vl-' + v[0] + '"></span>' + v[1] + '</button>'; }).join('') + '</div>') +
      '<button class="nb-menue" data-m="uebersicht">Alle Seiten anzeigen</button>' +
      '<button class="nb-menue" data-m="bild">Bild einfügen …</button>' +
      '<button class="nb-menue" data-m="pdf-rein">PDF-Seiten einfügen …</button>' +
      '<button class="nb-menue" data-m="pdf-raus">Als PDF exportieren</button>' +
      '<button class="nb-menue nb-rot" data-m="weg">Diese Seite löschen</button>' +
      '<div class="nb-pop-linie"></div>' +
      '<label class="nb-umschalter"><span>Mit Finger schreiben</span><input type="checkbox" data-m="finger"' + (W.finger ? ' checked' : '') + '><i></i></label>' +
      '<label class="nb-umschalter"><span>Durchkritzeln löscht</span><input type="checkbox" data-m="kritzeln"' + (W.kritzeln ? ' checked' : '') + '><i></i></label>',
      function (p) {
        p.addEventListener('click', function (e) {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.hasAttribute('data-v')) { vorlageSetzen(i, b.getAttribute('data-v')); popoverSchliessen(); return; }
          const m = b.getAttribute('data-m');
          popoverSchliessen();
          if (m === 'neu') seiteHinzufuegen(i);
          else if (m === 'uebersicht') uebersichtZeigen();
          else if (m === 'bild') E.el.bildDatei.click();
          else if (m === 'pdf-rein') E.el.pdfDatei.click();
          else if (m === 'pdf-raus') pdfExportieren(E.buch, E.seiten);
          else if (m === 'weg') { if (confirm('Seite ' + (i + 1) + ' wirklich löschen?')) seiteLoeschen(i); }
        });
        $$(p, 'input[type=checkbox]').forEach(function (c) {
          c.addEventListener('change', function () {
            if (c.getAttribute('data-m') === 'finger') { W.finger = c.checked; toast(c.checked ? 'Finger schreibt – zwei Finger blättern und zoomen' : 'Nur Apple Pencil schreibt – Finger blättert'); }
            else W.kritzeln = c.checked;
            werkzeugSpeichern();
          });
        });
      });
  }

  /* ---------- Seitenübersicht ---------- */
  function uebersichtZeigen() {
    textBeenden();
    const ov = document.createElement('div');
    ov.className = 'nb-uebersicht';
    ov.innerHTML = '<div class="nb-ueb-kopf"><b>Seiten</b><span class="nb-ueb-zahl">' + E.seiten.length + '</span>' +
      '<button class="btn btn-klein" data-u="neu">+ Seite</button><button class="nb-knopf" data-u="zu" aria-label="Schließen">' + icon('schliessen') + '</button></div>' +
      '<div class="nb-ueb-gitter">' + E.seiten.map(function (s, i) {
        return '<div class="nb-ueb-seite" data-i="' + i + '"><div class="nb-ueb-bild" style="aspect-ratio:' + s.b + '/' + s.h + '"><canvas></canvas></div>' +
          '<div class="nb-ueb-fuss"><span>' + (i + 1) + '</span><button data-weg="' + i + '" aria-label="Seite löschen">' + icon('loeschen') + '</button></div></div>';
      }).join('') + '</div>';
    E.el.root.appendChild(ov);
    E.uebersicht = ov;
    ov.addEventListener('click', function (e) {
      const weg = e.target.closest('[data-weg]');
      if (weg) {
        const i = Number(weg.getAttribute('data-weg'));
        if (confirm('Seite ' + (i + 1) + ' wirklich löschen?')) { schliessen(); seiteLoeschen(i); }
        return;
      }
      const u = e.target.closest('[data-u]');
      if (u) { const a = u.getAttribute('data-u'); schliessen(); if (a === 'neu') seiteHinzufuegen(E.seiten.length - 1); return; }
      const s = e.target.closest('[data-i]');
      if (s) { schliessen(); zuSeite(Number(s.getAttribute('data-i'))); }
    });
    function schliessen() { ov.remove(); if (E) E.uebersicht = null; }
    (async function () {
      const kacheln = $$(ov, '.nb-ueb-seite');
      for (let i = 0; i < kacheln.length; i++) {
        if (!ov.isConnected || !E) return;
        const s = E.seiten[i];
        try {
          const c = await seiteRendern(s, 220);
          const ziel = kacheln[i].querySelector('canvas');
          ziel.width = c.width; ziel.height = c.height;
          ziel.getContext('2d').drawImage(c, 0, 0);
        } catch (e) { }
      }
    })();
  }

  /* ---------- Hinweise ---------- */
  function toast(text, mitRueck, dauer) {
    const ziel = E ? E.el.root : document.body;
    let t = ziel.querySelector(':scope > .nb-toast');
    if (!t) { t = document.createElement('div'); t.className = 'nb-toast'; ziel.appendChild(t); }
    t.innerHTML = '<span>' + esc(text) + '</span>' + (mitRueck && E ? '<button>Rückgängig</button>' : '');
    t.classList.add('sichtbar');
    const knopf = t.querySelector('button');
    if (knopf) knopf.addEventListener('click', function () { rueckgaengig(); t.classList.remove('sichtbar'); });
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('sichtbar'); }, dauer || (mitRueck ? 4200 : 2400));
  }
  function fortschritt(text) {
    const ziel = E ? E.el.root : document.body;
    let f = ziel.querySelector(':scope > .nb-fortschritt');
    if (text === null) { if (f) f.remove(); return; }
    if (!f) { f = document.createElement('div'); f.className = 'nb-fortschritt'; f.innerHTML = '<div><span class="nb-kreisel"></span><b></b></div>'; ziel.appendChild(f); }
    f.querySelector('b').textContent = text;
  }

  /* ---------- Editor öffnen und schließen ---------- */
  function editorBauen() {
    const root = document.createElement('div');
    root.className = 'nb-editor';
    root.setAttribute('role', 'application');
    root.innerHTML =
      '<div class="nb-leiste">' +
        '<div class="nb-zeile">' +
          '<button class="nb-knopf nb-zurueck" data-nb-aktion="zurueck" aria-label="Zurück zu den Notizbüchern">' + icon('zurueck') + '</button>' +
          '<div class="nb-buchtitel"></div>' +
          '<div class="nb-werkzeuge">' +
            ['fueller', 'kuli', 'pinsel', 'marker', 'radierer', 'lasso', 'text'].map(function (w) {
              return '<button class="nb-knopf" data-nb-wz="' + w + '" title="' + NAMEN[w] + '" aria-label="' + NAMEN[w] + '">' + icon(w) +
                (STIFTE.indexOf(w) >= 0 || w === 'marker' ? '<span class="nb-farbstrich"></span>' : '') + '</button>';
            }).join('') +
            '<button class="nb-knopf" data-nb-aktion="bild" title="Bild einfügen" aria-label="Bild einfügen">' + icon('bild') + '</button>' +
          '</div>' +
          '<button class="nb-knopf" data-nb-aktion="undo" title="Rückgängig" aria-label="Rückgängig">' + icon('undo') + '</button>' +
          '<button class="nb-knopf" data-nb-aktion="redo" title="Wiederholen" aria-label="Wiederholen">' + icon('redo') + '</button>' +
          '<button class="nb-knopf" data-nb-aktion="mehr" title="Mehr" aria-label="Mehr">' + icon('mehr') + '</button>' +
        '</div>' +
        '<div class="nb-zeile nb-zeile2"></div>' +
      '</div>' +
      '<div class="nb-flaeche">' +
        '<canvas class="nb-haupt"></canvas><canvas class="nb-live"></canvas>' +
        '<div class="nb-eingabe"></div>' +
        '<div class="nb-textebene"></div>' +
        '<div class="nb-textrahmen" hidden>' +
          '<button class="nb-tr-griff" aria-label="Textfeld verschieben">' + icon('griff') + '</button>' +
          '<button class="nb-tr-breite" aria-label="Breite ändern"></button>' +
        '</div>' +
        '<div class="nb-auswahlmenue" hidden>' +
          '<button data-nb-sel="farbe"><span class="nb-sel-punkt"></span>Farbe</button>' +
          '<button data-nb-sel="kopie">' + icon('kopieren') + 'Duplizieren</button>' +
          '<button data-nb-sel="weg" class="nb-rot">' + icon('loeschen') + 'Löschen</button>' +
        '</div>' +
        '<button class="nb-seitenzahl" data-nb-aktion="uebersicht" aria-label="Seitenübersicht"></button>' +
      '</div>' +
      '<input type="file" accept="image/*" class="nb-unsichtbar" data-nb-datei="bild">' +
      '<input type="file" accept="application/pdf,.pdf" class="nb-unsichtbar" data-nb-datei="pdf">';
    document.body.appendChild(root);
    const q = function (s) { return root.querySelector(s); };
    E.el = {
      root: root, flaeche: q('.nb-flaeche'), haupt: q('.nb-haupt'), live: q('.nb-live'), eingabe: q('.nb-eingabe'),
      textebene: q('.nb-textebene'), textRahmen: q('.nb-textrahmen'), auswahlMenue: q('.nb-auswahlmenue'),
      seitenzahl: q('.nb-seitenzahl'), zeile2: q('.nb-zeile2'), undo: q('[data-nb-aktion=undo]'), redo: q('[data-nb-aktion=redo]'),
      titel: q('.nb-buchtitel'), bildDatei: q('[data-nb-datei=bild]'), pdfDatei: q('[data-nb-datei=pdf]')
    };
    E.el.titel.textContent = E.buch.titel;
    const ein = E.el.eingabe;
    ein.addEventListener('pointerdown', aufDown);
    ein.addEventListener('pointermove', aufMove);
    ein.addEventListener('pointerup', aufUp);
    ein.addEventListener('pointercancel', aufUp);
    ein.addEventListener('wheel', aufRad, { passive: false });
    ein.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    ein.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    ein.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    root.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    root.addEventListener('gesturechange', function (e) { e.preventDefault(); });
    root.querySelector('.nb-leiste').addEventListener('click', function (e) {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-nb-wz')) { werkzeugWaehlen(b.getAttribute('data-nb-wz')); return; }
      const a = b.getAttribute('data-nb-aktion');
      if (a === 'zurueck') editorSchliessen();
      else if (a === 'undo') rueckgaengig();
      else if (a === 'redo') wiederholen();
      else if (a === 'mehr') menuePopover(b);
      else if (a === 'bild') E.el.bildDatei.click();
    });
    E.el.zeile2.addEventListener('click', zeile2Klick);
    E.el.seitenzahl.addEventListener('click', uebersichtZeigen);
    E.el.auswahlMenue.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    E.el.auswahlMenue.addEventListener('click', function (e) {
      const b = e.target.closest('[data-nb-sel]');
      if (!b) return;
      const a = b.getAttribute('data-nb-sel');
      if (a === 'weg') auswahlLoeschen();
      else if (a === 'kopie') auswahlDuplizieren();
      else if (a === 'farbe') {
        popoverZeigen(b, '<div class="nb-pop-titel">Farbe der Auswahl</div><div class="nb-farbgitter">' +
          FARBEN.concat(MARKER_FARBEN).map(function (f) { return '<button style="--f:' + f + '" data-f="' + f + '" aria-label="' + f + '"></button>'; }).join('') + '</div>',
          function (p) { $$(p, '[data-f]').forEach(function (x) { x.addEventListener('click', function () { auswahlFaerben(x.getAttribute('data-f')); popoverSchliessen(); }); }); });
      }
    });
    E.el.textRahmen.querySelector('.nb-tr-griff').addEventListener('pointerdown', function (e) { textRahmenZiehen('verschieben', e); });
    E.el.textRahmen.querySelector('.nb-tr-breite').addEventListener('pointerdown', function (e) { textRahmenZiehen('breite', e); });
    E.el.bildDatei.addEventListener('change', function () { const d = this.files && this.files[0]; this.value = ''; if (d) bildEinfuegen(d); });
    E.el.pdfDatei.addEventListener('change', function () { const d = this.files && this.files[0]; this.value = ''; if (d) pdfInsBuch(d); });
    root.addEventListener('pointerdown', function (e) {
      if (E && E.popover && !E.popover.contains(e.target)) popoverSchliessen();
    }, true);
    E.ro = new ResizeObserver(function () { groesseAnpassen(); });
    E.ro.observe(E.el.flaeche);
  }
  function tastatur(e) {
    if (!E) return;
    const t = e.target;
    const tippt = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const strg = e.ctrlKey || e.metaKey;
    if (tippt && !(e.key === 'Escape')) return;
    let erledigt = true;
    if (strg && e.key.toLowerCase() === 'z' && !e.shiftKey) rueckgaengig();
    else if (strg && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) wiederholen();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && E.auswahl) auswahlLoeschen();
    else if (strg && (e.key === '+' || e.key === '=')) zoomen(1.2, E.vw / 2, E.vh / 2);
    else if (strg && e.key === '-') zoomen(1 / 1.2, E.vw / 2, E.vh / 2);
    else if (strg && e.key === '0') { E.zoom = 1; kameraBegrenzen(); planeAlles(); }
    else if (e.key === 'Escape') { if (E.textAktiv) textBeenden(); else if (E.popover) popoverSchliessen(); else if (E.auswahl) auswahlAufheben(); else erledigt = false; }
    else if (strg && e.key.toLowerCase() === 'n') { /* App-Kürzel im Editor abfangen */ }
    else erledigt = false;
    if (erledigt) { e.preventDefault(); e.stopPropagation(); }
  }
  function sofortSpeichern() {
    if (!E) return;
    textBeenden();
    speichern();
  }
  async function oeffnen(id) {
    if (E || abgleichLaeuft) return;
    let buch = buecher.find(function (b) { return b.id === id; });
    if (!buch) buch = await holen('buecher', id).catch(function () { return null; });
    if (!buch) { alert('Dieses Notizbuch wurde nicht gefunden.'); return; }
    let seiten;
    try { seiten = await seitenLaden(buch); } catch (e) { alert('Notizbuch konnte nicht geladen werden: ' + e.message); return; }
    if (!seiten.length) seiten = [neueSeite(buch)];
    E = {
      buch: buch, seiten: seiten, pos: [], refB: SEITE_B, gesamtH: 0,
      zoom: buch.zuletzt && buch.zuletzt.zoom ? grenze(buch.zuletzt.zoom, 0.5, 6) : 1,
      cam: { x: 0, y: 0 }, vw: 0, vh: 0, dpr: 1, rx: 0, ry: 0,
      undo: [], redo: [], dirty: new Set(), weg: new Set(), speicherTimer: 0,
      zeiger: null, zeigerTyp: '', zeigerStart: null, stiftGesehen: false, fingerHinweis: false,
      touches: new Map(), tap: null, verlauf: [], traegheit: null, mausPan: null,
      strich: null, radierer: null, lasso: null, auswahl: null, ziehen: null, versteckt: null,
      textAktiv: null, textNeu: null, textElemente: new Map(), textZiehen: null, textTipp: null, kachelTipp: false,
      popover: null, uebersicht: null, planen: {}, el: null, ro: null
    };
    if (!buch.seiten || buch.seiten.length !== seiten.length) seiten.forEach(function (s) { E.dirty.add(s.id); });
    document.documentElement.classList.add('nb-offen');
    editorBauen();
    layout();
    werkzeugWaehlen(W.wz);
    knoepfeAktualisieren();
    groesseAnpassen();
    const start = buch.zuletzt ? grenze(buch.zuletzt.seite || 0, 0, seiten.length - 1) : 0;
    zuSeite(start);
    document.addEventListener('keydown', tastatur, true);
    window.addEventListener('pagehide', sofortSpeichern);
    document.addEventListener('visibilitychange', sichtbarkeit);
    if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) { } }
  }
  function sichtbarkeit() { if (document.hidden) sofortSpeichern(); }
  async function editorSchliessen() {
    if (!E) return;
    textBeenden();
    const ed = E;
    await speichern();
    await dateienAufraeumen(ed.buch, ed.seiten);
    if (E !== ed) return;
    document.removeEventListener('keydown', tastatur, true);
    window.removeEventListener('pagehide', sofortSpeichern);
    document.removeEventListener('visibilitychange', sichtbarkeit);
    if (ed.ro) ed.ro.disconnect();
    ed.el.root.remove();
    document.documentElement.classList.remove('nb-offen');
    E = null;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    bilderFreigeben();
    const i = buecher.findIndex(function (b) { return b.id === ed.buch.id; });
    if (i >= 0) buecher[i] = ed.buch;
    if (K) K.neuZeichnen();
  }

  /* ============================================================
     PDF-Export (eigener, kleiner PDF-Schreiber)
     ============================================================ */
  async function pdfBauen(seiten, melden) {
    const enc = new TextEncoder(), teile = [], offsets = [];
    let laenge = 0;
    const dazu = function (x) { const b = typeof x === 'string' ? enc.encode(x) : x; teile.push(b); laenge += b.length; };
    const objekt = function (nr, inhalt, strom) {
      offsets[nr] = laenge;
      dazu(nr + ' 0 obj\n' + inhalt);
      if (strom) { dazu('\nstream\n'); dazu(strom); dazu('\nendstream'); }
      dazu('\nendobj\n');
    };
    dazu(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));  // %PDF-1.4
    const kinder = [];
    for (let i = 0; i < seiten.length; i++) {
      if (melden) melden(i + 1, seiten.length);
      const s = seiten[i];
      const c = await seiteRendern(s, Math.min(2000, Math.round(s.b * 2.2)));
      const blob = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.9); });
      const jpg = new Uint8Array(await blob.arrayBuffer());
      const nSeite = 3 + i * 3, nInhalt = nSeite + 1, nBild = nSeite + 2;
      const b = r2(s.b), h = r2(s.h);
      objekt(nBild, '<< /Type /XObject /Subtype /Image /Width ' + c.width + ' /Height ' + c.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>', jpg);
      const inhalt = enc.encode('q ' + b + ' 0 0 ' + h + ' 0 0 cm /Im0 Do Q');
      objekt(nInhalt, '<< /Length ' + inhalt.length + ' >>', inhalt);
      objekt(nSeite, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + b + ' ' + h + '] /Resources << /XObject << /Im0 ' + nBild + ' 0 R >> >> /Contents ' + nInhalt + ' 0 R >>');
      kinder.push(nSeite + ' 0 R');
    }
    objekt(2, '<< /Type /Pages /Kids [' + kinder.join(' ') + '] /Count ' + seiten.length + ' >>');
    objekt(1, '<< /Type /Catalog /Pages 2 0 R >>');
    const anzahl = 3 + seiten.length * 3;
    const xref = laenge;
    let x = 'xref\n0 ' + anzahl + '\n0000000000 65535 f \n';
    for (let n = 1; n < anzahl; n++) x += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
    dazu(x + 'trailer\n<< /Size ' + anzahl + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(teile, { type: 'application/pdf' });
  }
  function dateiname(titel, endung) {
    return (String(titel || 'Notizbuch').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Notizbuch') + endung;
  }
  function herunterladen(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
  }
  async function pdfExportieren(buch, seiten) {
    if (E) textBeenden();
    try {
      if (!seiten) seiten = await seitenLaden(buch);
      const blob = await pdfBauen(seiten, function (i, n) { fortschritt('PDF wird erstellt … Seite ' + i + ' von ' + n); });
      fortschritt(null);
      ergebnisZeigen(blob, dateiname(buch.titel, '.pdf'));
    } catch (e) {
      fortschritt(null);
      alert('PDF konnte nicht erstellt werden: ' + (e && e.message ? e.message : e));
    }
    if (!E) bilderFreigeben();
  }
  function ergebnisZeigen(blob, name, hinweis) {
    const datei = typeof File === 'function' ? new File([blob], name, { type: blob.type }) : blob;
    const teilen = !!(navigator.canShare && navigator.share && (function () { try { return navigator.canShare({ files: [datei] }); } catch (e) { return false; } })());
    const ziel = E ? E.el.root : document.body;
    const ov = document.createElement('div');
    ov.className = 'nb-fortschritt';
    ov.innerHTML = '<div class="nb-fertig"><b>' + esc(name) + '</b><span>' + Math.max(1, Math.round(blob.size / 1024)) + ' KB</span>' +
      (hinweis ? '<p class="nb-fertig-hinweis">' + esc(hinweis) + '</p>' : '') +
      '<div class="nb-fertig-knoepfe">' + (teilen ? '<button class="btn btn-primary" data-t="teilen">Teilen …</button>' : '') +
      '<button class="btn' + (teilen ? '' : ' btn-primary') + '" data-t="laden">Herunterladen</button>' +
      '<button class="btn" data-t="zu">Schließen</button></div></div>';
    ziel.appendChild(ov);
    ov.addEventListener('click', function (e) {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      const t = b.getAttribute('data-t');
      if (t === 'teilen') navigator.share({ files: [datei], title: name }).catch(function () { });
      else if (t === 'laden') herunterladen(blob, name);
      ov.remove();
    });
  }

  /* ============================================================
     PDF-Import (pdf.js, wird erst bei Bedarf geladen)
     ============================================================ */
  let pdfjsVersprechen = null;
  function pdfjsLaden() {
    if (!pdfjsVersprechen) {
      const basis = new URL('.', document.baseURI || location.href);
      pdfjsVersprechen = import(new URL('pdfjs-lib.js', basis).href).then(function (m) {
        m.GlobalWorkerOptions.workerSrc = new URL('pdfjs-worker.js', basis).href;
        return m;
      });
      pdfjsVersprechen.catch(function () { pdfjsVersprechen = null; });
    }
    return pdfjsVersprechen;
  }
  async function pdfSeitenLesen(datei, buchId, melden) {
    const pdfjs = await pdfjsLaden();
    const daten = new Uint8Array(await datei.arrayBuffer());
    const doc = await pdfjs.getDocument({ data: daten, isEvalSupported: false }).promise;
    const ergebnis = [];
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        if (melden) melden(n, doc.numPages);
        const seite = await doc.getPage(n);
        const basis = seite.getViewport({ scale: 1 });
        const k = Math.min(2.4, 1500 / Math.max(basis.width, basis.height) * 1.4);
        const vp = seite.getViewport({ scale: k });
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
        await seite.render({ canvasContext: ctx, viewport: vp }).promise;
        const blob = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.9); });
        const id = await dateiSpeichern(blob, buchId);
        ergebnis.push({ b: r2(basis.width), h: r2(basis.height), hg: id, v: 'blanko' });
        seite.cleanup();
        c.width = c.height = 0;
      }
    } finally { try { await doc.destroy(); } catch (e) { } }
    return ergebnis;
  }
  async function pdfInsBuch(datei) {
    if (!E) return;
    const ed = E;
    textBeenden();
    try {
      const liste = await pdfSeitenLesen(datei, ed.buch.id, function (i, n) { fortschritt('PDF wird eingelesen … Seite ' + i + ' von ' + n); });
      fortschritt(null);
      if (E !== ed || !liste.length) return;
      let index = aktuelleSeite() + 1;
      const erste = index;
      liste.forEach(function (o) {
        const s = neueSeite(E.buch, o);
        E.seiten.splice(index, 0, s);
        aktionMerken({ typ: 'seite-neu', index: index, seite: s });
        schmutzig(s);
        index++;
      });
      layout(); kameraBegrenzen(); zuSeite(erste);
      toast(liste.length === 1 ? '1 PDF-Seite eingefügt' : liste.length + ' PDF-Seiten eingefügt');
    } catch (e) {
      fortschritt(null);
      alert('Die PDF-Datei konnte nicht gelesen werden: ' + (e && e.message ? e.message : e));
    }
  }
  async function buchAusPdf(daten, datei) {
    const vorab = { id: uid() };
    fortschritt('PDF wird eingelesen …');
    try {
      const seiten = await pdfSeitenLesen(datei, vorab.id, function (i, n) { fortschritt('PDF wird eingelesen … Seite ' + i + ' von ' + n); });
      if (!seiten.length) throw new Error('Die PDF-Datei enthält keine Seiten.');
      const b = await buchAnlegen(Object.assign({}, daten, { seiten: seiten }));
      // Dateien dem endgültigen Buch zuordnen
      const dateien = await perIndex('dateien', vorab.id);
      await transaktion(['dateien'], 'readwrite', function (s) { dateien.forEach(function (d) { d.buch = b.id; s.dateien.put(d); }); });
      fortschritt(null);
      return b;
    } catch (e) {
      fortschritt(null);
      try {
        const reste = await perIndex('dateien', vorab.id);
        if (reste.length) await transaktion(['dateien'], 'readwrite', function (s) { reste.forEach(function (d) { s.dateien.delete(d.id); }); });
      } catch (x) { }
      throw e;
    }
  }

  /* ============================================================
     Sicherung
     ============================================================ */
  function alsDataUrl(blob) {
    return new Promise(function (ok, f) { const r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = function () { f(r.error); }; r.readAsDataURL(blob); });
  }
  function dataUrlZuBlob(url) {
    const teile = String(url).split(','), kopf = teile[0], typ = (kopf.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(teile[1] || ''), b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return new Blob([b], { type: typ });
  }
  async function sicherungErstellen() {
    const listen = await Promise.all([alle('buecher'), alle('seiten'), alle('dateien')]);
    const teile = ['{"format":"schulplaner-notizbuecher","version":1,"erstellt":' + JSON.stringify(new Date().toISOString()) +
      ',"geloescht":' + JSON.stringify(loeschmarken()) +
      ',"buecher":' + JSON.stringify(listen[0]) + ',"seiten":' + JSON.stringify(listen[1]) + ',"dateien":['];
    for (let i = 0; i < listen[2].length; i++) {
      const d = listen[2][i];
      teile.push((i ? ',' : '') + JSON.stringify({ id: d.id, buch: d.buch, daten: await alsDataUrl(d.blob) }));
    }
    teile.push(']}');
    return new Blob(teile, { type: 'application/json' });
  }
  async function sicherungEinlesen(datei) {
    return datenZusammenfuehren(JSON.parse(await datei.text()));
  }

  /* ============================================================
     Abgleich zwischen Geräten (Google Drive oder Abgleich-Datei)
     ============================================================ */
  const LOESCH_KEY = 'schulplaner.notizen.geloescht', DRIVE_KEY = 'schulplaner.notizen.drive';
  const DRIVE_API = 'https://www.googleapis.com/drive/v3', DRIVE_UP = 'https://www.googleapis.com/upload/drive/v3';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  let abgleichLaeuft = false;

  function jsonLesen(k, standard) {
    try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : standard; } catch (e) { return standard; }
  }
  function jsonSchreiben(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function loeschmarken() { return jsonLesen(LOESCH_KEY, {}); }
  function markenVereinen(a, b) {
    const m = Object.assign({}, a || {});
    Object.keys(b || {}).forEach(function (k) { if (typeof b[k] === 'number') m[k] = Math.max(m[k] || 0, b[k]); });
    return m;
  }
  function markenText(m) { return JSON.stringify(Object.keys(m).sort().map(function (k) { return [k, m[k]]; })); }
  function driveCfg() { return jsonLesen(DRIVE_KEY, {}); }
  function driveCfgSetzen(c) { jsonSchreiben(DRIVE_KEY, c); }

  function seitenZeit(s) { return s.g || s.erstellt || 0; }
  function fingerabdruck(x) {
    if (!x) return '';
    const b = x.buch, weg = b.weg || {};
    return JSON.stringify([b.titel, b.modul_id || null, b.cover, b.vorlage, b.papier, b.metaG || 0, x.seiten.map(function (s) { return s.id + ':' + seitenZeit(s); }),
      Object.keys(weg).sort().map(function (k) { return k + ':' + weg[k]; })]);
  }
  /* Zwei Fassungen eines Notizbuchs vereinen: pro Seite gewinnt die zuletzt bearbeitete */
  function zusammenfuehren(L, R) {
    if (!L) return { buch: Object.assign({}, R.buch, { seiten: R.seiten.map(function (s) { return s.id; }), anzahl: R.seiten.length }), seiten: R.seiten };
    if (!R) return L;
    const lb = L.buch, rb = R.buch;
    const weg = markenVereinen(rb.weg, lb.weg);
    const seiten = new Map();
    R.seiten.forEach(function (s) { seiten.set(s.id, s); });
    L.seiten.forEach(function (s) { const r = seiten.get(s.id); if (!r || seitenZeit(s) >= seitenZeit(r)) seiten.set(s.id, s); });
    Array.from(seiten.keys()).forEach(function (id) { if (weg[id] && weg[id] >= seitenZeit(seiten.get(id))) seiten.delete(id); });
    const lokalNeuer = (lb.geaendert || 0) >= (rb.geaendert || 0);
    const erste = lokalNeuer ? L.seiten.map(function (s) { return s.id; }) : (rb.seiten || R.seiten.map(function (s) { return s.id; }));
    const zweite = lokalNeuer ? (rb.seiten || R.seiten.map(function (s) { return s.id; })) : L.seiten.map(function (s) { return s.id; });
    const reihe = [];
    erste.forEach(function (id) { if (seiten.has(id) && reihe.indexOf(id) < 0) reihe.push(id); });
    zweite.forEach(function (id, i) {
      if (!seiten.has(id) || reihe.indexOf(id) >= 0) return;
      let pos = 0;
      for (let k = i - 1; k >= 0; k--) { const p = reihe.indexOf(zweite[k]); if (p >= 0) { pos = p + 1; break; } }
      reihe.splice(pos, 0, id);
    });
    Array.from(seiten.values()).filter(function (s) { return reihe.indexOf(s.id) < 0; })
      .sort(function (a, b) { return (a.erstellt || 0) - (b.erstellt || 0); }).forEach(function (s) { reihe.push(s.id); });
    const meta = (lb.metaG || lb.erstellt || 0) >= (rb.metaG || rb.erstellt || 0) ? lb : rb;
    const buch = Object.assign({}, lb, {
      titel: meta.titel, modul_id: meta.modul_id || null, cover: meta.cover, vorlage: meta.vorlage, papier: meta.papier, metaG: meta.metaG || 0,
      weg: weg, geaendert: Math.max(lb.geaendert || 0, rb.geaendert || 0), erstellt: Math.min(lb.erstellt || jetzt(), rb.erstellt || jetzt())
    });
    let liste = reihe.map(function (id) { return seiten.get(id); });
    if (!liste.length) liste = [neueSeite(buch)];
    buch.seiten = liste.map(function (s) { return s.id; });
    buch.anzahl = liste.length;
    return { buch: buch, seiten: liste };
  }
  async function buchLokalLaden(id) {
    const b = buecher.find(function (x) { return x.id === id; }) || await holen('buecher', id);
    if (!b) return null;
    return { buch: b, seiten: await seitenLaden(b) };
  }
  async function buchLokalSchreiben(erg, alteIds) {
    const neu = new Set(erg.seiten.map(function (s) { return s.id; }));
    erg.seiten.forEach(function (s) { s.buch = erg.buch.id; });
    await transaktion(['buecher', 'seiten'], 'readwrite', function (st) {
      st.buecher.put(erg.buch);
      erg.seiten.forEach(function (s) { st.seiten.put(s); });
      (alteIds || []).forEach(function (id) { if (!neu.has(id)) st.seiten.delete(id); });
    });
    const i = buecher.findIndex(function (x) { return x.id === erg.buch.id; });
    if (i >= 0) buecher[i] = erg.buch; else buecher.push(erg.buch);
  }
  function referenzierteDateien(erg) {
    const ids = [];
    erg.seiten.forEach(function (s) {
      if (s.hg) ids.push(s.hg);
      (s.bilder || []).forEach(function (b) { ids.push(b.d); });
    });
    return ids;
  }
  function dateiSchluessel() { return transaktion(['dateien'], 'readonly', function (s) { return s.dateien.getAllKeys(); }); }

  /* gemeinsame Zusammenführung für Abgleich-Datei und Sicherung */
  async function datenZusammenfuehren(o) {
    if (!o || o.format !== 'schulplaner-notizbuecher' || !Array.isArray(o.buecher)) throw new Error('Das ist keine Notizbuch-Datei aus dem SchulPlaner.');
    const marken = markenVereinen(loeschmarken(), o.geloescht);
    jsonSchreiben(LOESCH_KEY, marken);
    for (const id of Object.keys(marken)) if (buecher.some(function (b) { return b.id === id; })) await buchLoeschen(id, true);
    const nachBuch = new Map();
    (o.seiten || []).forEach(function (s) { if (!nachBuch.has(s.buch)) nachBuch.set(s.buch, []); nachBuch.get(s.buch).push(s); });
    let neu = 0, aktualisiert = 0;
    for (const rb of o.buecher) {
      if (!rb || !rb.id || marken[rb.id]) continue;
      const roh = nachBuch.get(rb.id) || [];
      const reihe = (rb.seiten || []).map(function (id) { return roh.find(function (s) { return s.id === id; }); }).filter(Boolean);
      roh.forEach(function (s) { if (reihe.indexOf(s) < 0) reihe.push(s); });
      const R = { buch: rb, seiten: reihe };
      const L = await buchLokalLaden(rb.id);
      const erg = zusammenfuehren(L, R);
      if (!L) { await buchLokalSchreiben(erg, []); neu++; }
      else if (fingerabdruck(erg) !== fingerabdruck(L)) { await buchLokalSchreiben(erg, L.seiten.map(function (s) { return s.id; })); aktualisiert++; }
    }
    const vorhanden = new Set(await dateiSchluessel());
    const fehlend = (o.dateien || []).filter(function (d) { return d && d.id && !vorhanden.has(d.id) && !marken[d.buch]; });
    if (fehlend.length) {
      const saetze = fehlend.map(function (d) { return { id: d.id, buch: d.buch, blob: dataUrlZuBlob(d.daten) }; });
      await transaktion(['dateien'], 'readwrite', function (s) { saetze.forEach(function (d) { s.dateien.put(d); }); });
    }
    await buecherLaden();
    return { neu: neu, aktualisiert: aktualisiert };
  }
  function ergebnisText(r) {
    const teile = [];
    if (r.neu) teile.push(r.neu + (r.neu === 1 ? ' Notizbuch neu' : ' Notizbücher neu'));
    if (r.aktualisiert) teile.push(r.aktualisiert + ' aktualisiert');
    if (r.hoch) teile.push(r.hoch + ' hochgeladen');
    return teile.length ? teile.join(', ') : 'alles war schon aktuell';
  }

  /* ---------- Google Drive ---------- */
  let gisVersprechen = null, driveToken = null;
  function gisLaden() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    if (!gisVersprechen) {
      gisVersprechen = new Promise(function (ok, fehler) {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = function () { ok(); };
        s.onerror = function () { gisVersprechen = null; fehler(new Error('Google-Anmeldung konnte nicht geladen werden. Bist du online?')); };
        document.head.appendChild(s);
      });
    }
    return gisVersprechen;
  }
  function tokenGueltig() { return driveToken && driveToken.ablauf > Date.now() + 60000; }
  /* muss direkt aus einem Tipp heraus aufgerufen werden, sonst blockt der Browser das Anmeldefenster */
  function tokenAnfordern() {
    const cfg = driveCfg();
    return new Promise(function (ok, fehler) {
      if (!(window.google && window.google.accounts && window.google.accounts.oauth2)) {
        gisLaden().then(function () { fehler(new Error('Google-Anmeldung ist jetzt geladen – bitte nochmal auf „Abgleichen“ tippen.')); }, fehler);
        return;
      }
      let fertig = false;
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: cfg.clientId,
        scope: DRIVE_SCOPE,
        callback: function (antwort) {
          fertig = true;
          if (!antwort || antwort.error || !antwort.access_token) { fehler(new Error('Anmeldung bei Google nicht erfolgt' + (antwort && antwort.error ? ' (' + antwort.error + ')' : '') + '.')); return; }
          if (window.google.accounts.oauth2.hasGrantedAllScopes && !window.google.accounts.oauth2.hasGrantedAllScopes(antwort, DRIVE_SCOPE)) {
            fehler(new Error('Bitte beim Anmelden den Zugriff auf Google Drive erlauben (Häkchen setzen).')); return;
          }
          driveToken = { wert: antwort.access_token, ablauf: Date.now() + (Number(antwort.expires_in) || 3600) * 1000 };
          ok();
        },
        error_callback: function (f) {
          if (fertig) return;
          const typ = f && f.type;
          if (typ === 'popup_failed_to_open') fehler(new Error('Das Anmeldefenster wurde blockiert. Bitte nochmal tippen – oder „Mit Datei abgleichen“ nutzen.'));
          else if (typ === 'popup_closed') fehler(new Error('Anmeldung abgebrochen.'));
          else fehler(new Error('Anmeldung bei Google fehlgeschlagen' + (typ ? ' (' + typ + ')' : '') + '.'));
        }
      });
      const opt = { prompt: cfg.verbunden ? '' : 'consent' };
      if (cfg.konto) opt.login_hint = cfg.konto;
      client.requestAccessToken(opt);
    });
  }
  function DriveFehler(text, status) { const e = new Error(text); e.status = status; return e; }
  async function gfetch(url, opt) {
    opt = opt || {};
    const kopf = Object.assign({ Authorization: 'Bearer ' + driveToken.wert }, opt.headers || {});
    let r;
    try { r = await fetch(url, Object.assign({}, opt, { headers: kopf })); }
    catch (e) { throw DriveFehler('Keine Verbindung zu Google Drive. Bist du online?', 0); }
    if (r.status === 401) { driveToken = null; throw DriveFehler('Die Google-Anmeldung ist abgelaufen – bitte nochmal auf „Abgleichen“ tippen.', 401); }
    if (!r.ok) {
      let t = '';
      try { const j = await r.json(); t = j && j.error && j.error.message ? j.error.message : ''; } catch (e) { }
      if (r.status === 403 && /storage|quota/i.test(t)) throw DriveFehler('Dein Google-Drive-Speicher ist voll.', 403);
      throw DriveFehler('Google Drive meldet einen Fehler (' + r.status + ')' + (t ? ': ' + t : ''), r.status);
    }
    return r;
  }
  function q(s) { return encodeURIComponent(s); }
  async function driveListe(abfrage) {
    let erg = [], seite = '';
    do {
      const r = await gfetch(DRIVE_API + '/files?q=' + q(abfrage) + '&spaces=drive&pageSize=1000&fields=' +
        q('nextPageToken,files(id,name,modifiedTime,appProperties,size)') + (seite ? '&pageToken=' + q(seite) : ''));
      const j = await r.json();
      erg = erg.concat(j.files || []);
      seite = j.nextPageToken || '';
    } while (seite);
    return erg;
  }
  async function driveHochladen(meta, blob, id) {
    const art = blob.type || 'application/octet-stream';
    if (blob.size > 4 * 1024 * 1024) {                               // große Dateien: fortsetzbares Hochladen
      const r = await gfetch(DRIVE_UP + '/files' + (id ? '/' + id : '') + '?uploadType=resumable&fields=id,modifiedTime', {
        method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': art }, body: JSON.stringify(meta)
      });
      const ort = r.headers.get('Location');
      if (ort) {
        const r2 = await gfetch(ort, { method: 'PUT', headers: { 'Content-Type': art }, body: blob });
        return r2.json();
      }
    }
    const grenze = 'schulplaner' + uid();
    const koerper = new Blob(['--' + grenze + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
      '\r\n--' + grenze + '\r\nContent-Type: ' + art + '\r\n\r\n', blob, '\r\n--' + grenze + '--\r\n']);
    const r = await gfetch(DRIVE_UP + '/files' + (id ? '/' + id : '') + '?uploadType=multipart&fields=id,modifiedTime', {
      method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + grenze }, body: koerper
    });
    return r.json();
  }
  async function driveLaden(id) { return (await gfetch(DRIVE_API + '/files/' + id + '?alt=media')).blob(); }
  async function driveWeg(id) {
    try { await gfetch(DRIVE_API + '/files/' + id + '?fields=id', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); }
    catch (e) { if (e.status !== 404) throw e; }
  }
  async function packen(obj) {
    const text = JSON.stringify(obj);
    if (typeof CompressionStream === 'function') {
      const strom = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
      return new Blob([await new Response(strom).arrayBuffer()], { type: 'application/octet-stream' });
    }
    return new Blob([text], { type: 'application/octet-stream' });
  }
  async function entpacken(blob) {
    const kopf = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    if (kopf[0] === 0x1f && kopf[1] === 0x8b) {
      if (typeof DecompressionStream !== 'function') throw new Error('Dieser Browser ist zu alt zum Entpacken – bitte iPadOS/Browser aktualisieren.');
      return JSON.parse(await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    return JSON.parse(await blob.text());
  }
  function dateinameBuch(b) { return String(b.titel || 'Notizbuch').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 80) + '.schulplaner'; }
  async function driveOrdner(cfg) {
    if (cfg.ordner) {
      try {
        const r = await gfetch(DRIVE_API + '/files/' + cfg.ordner + '?fields=id,trashed');
        const j = await r.json();
        if (j && !j.trashed) return cfg.ordner;
      } catch (e) { if (e.status !== 404) throw e; }
    }
    const gefunden = await driveListe("mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='sp' and value='ordner' }");
    if (gefunden.length) return gefunden[0].id;
    const r = await gfetch(DRIVE_API + '/files?fields=id', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'SchulPlaner Notizbücher', mimeType: 'application/vnd.google-apps.folder', appProperties: { sp: 'ordner' } })
    });
    return (await r.json()).id;
  }

  async function driveAbgleichen() {
    if (abgleichLaeuft) return;
    if (E) { toast('Bitte zuerst das Notizbuch schließen.'); return; }
    const cfg = driveCfg();
    if (!cfg.clientId) { abgleichWahl(); return; }
    abgleichLaeuft = true;
    try {
      if (!tokenGueltig()) await tokenAnfordern();
      cfg.verbunden = true; driveCfgSetzen(cfg);
      fortschritt('Verbinde mit Google Drive …');
      const ordner = await driveOrdner(cfg);
      cfg.ordner = ordner;
      const dateien = await driveListe("'" + ordner + "' in parents and trashed=false");
      const bRemote = new Map(), dRemote = new Map();
      let markenDatei = null;
      dateien.forEach(function (f) {
        const a = f.appProperties || {};
        if (a.sp === 'buch' && a.id) bRemote.set(a.id, f);
        else if (a.sp === 'datei' && a.id) dRemote.set(a.id, f);
        else if (a.sp === 'geloescht') markenDatei = f;
      });
      // Löschmarken abgleichen
      let fern = {};
      if (markenDatei) { try { fern = JSON.parse(await (await driveLaden(markenDatei.id)).text()) || {}; } catch (e) { fern = {}; } }
      const marken = markenVereinen(loeschmarken(), fern);
      jsonSchreiben(LOESCH_KEY, marken);
      if (markenText(marken) !== markenText(fern)) {
        await driveHochladen(markenDatei ? { name: 'geloeschte-notizbuecher.json' } : { name: 'geloeschte-notizbuecher.json', parents: [ordner], appProperties: { sp: 'geloescht' } },
          new Blob([JSON.stringify(marken)], { type: 'application/json' }), markenDatei && markenDatei.id);
      }
      for (const id of Object.keys(marken)) {
        if (buecher.some(function (b) { return b.id === id; })) await buchLoeschen(id, true);
        if (bRemote.has(id)) { await driveWeg(bRemote.get(id).id); bRemote.delete(id); }
        for (const [did, f] of Array.from(dRemote.entries())) if ((f.appProperties || {}).buch === id) { await driveWeg(f.id); dRemote.delete(did); }
      }
      // Notizbücher
      await buecherLaden();
      const ids = Array.from(new Set(buecher.map(function (b) { return b.id; }).concat(Array.from(bRemote.keys())))).filter(function (id) { return !marken[id]; });
      const stand = cfg.stand || {};
      const benoetigt = new Map();
      const ergebnis = { neu: 0, aktualisiert: 0, hoch: 0 };
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        fortschritt('Gleiche ab … Notizbuch ' + (i + 1) + ' von ' + ids.length);
        const lokal = buecher.find(function (b) { return b.id === id; });
        const rf = bRemote.get(id), st = stand[id];
        const fernGleich = !!(rf && st && st.mod === rf.modifiedTime);
        const lokalGleich = !!(lokal && st && st.lokal === lokal.geaendert);
        if (rf && lokal && fernGleich && lokalGleich) continue;
        const L = lokal ? await buchLokalLaden(id) : null;
        let R = null;
        if (rf && !fernGleich) {
          const o = await entpacken(await driveLaden(rf.id));
          if (o && o.buch && Array.isArray(o.seiten)) R = { buch: o.buch, seiten: o.seiten };
        }
        const erg = R ? zusammenfuehren(L, R) : L;
        if (!erg) continue;
        if (!L) { await buchLokalSchreiben(erg, []); ergebnis.neu++; }
        else if (R && fingerabdruck(erg) !== fingerabdruck(L)) { await buchLokalSchreiben(erg, L.seiten.map(function (s) { return s.id; })); ergebnis.aktualisiert++; }
        let mod = rf ? rf.modifiedTime : null;
        const fernVeraltet = !rf || (R ? fingerabdruck(erg) !== fingerabdruck(R) : !lokalGleich);
        if (fernVeraltet) {
          const blob = await packen({ format: 'schulplaner-notizbuch', version: 1, buch: erg.buch, seiten: erg.seiten });
          const meta = { name: dateinameBuch(erg.buch), appProperties: { sp: 'buch', id: id } };
          if (!rf) meta.parents = [ordner];
          const res = await driveHochladen(meta, blob, rf && rf.id);
          mod = res.modifiedTime; ergebnis.hoch++;
        }
        const gespeichert = buecher.find(function (b) { return b.id === id; });
        stand[id] = { mod: mod, lokal: gespeichert ? gespeichert.geaendert : erg.buch.geaendert };
        referenzierteDateien(erg).forEach(function (d) { benoetigt.set(d, id); });
        cfg.stand = stand; driveCfgSetzen(cfg);                     // Fortschritt sichern, falls etwas abbricht
      }
      // PDF-Seiten und Bilder
      if (benoetigt.size) {
        const lokaleDateien = new Set(await dateiSchluessel());
        let n = 0;
        for (const [did, buchId] of benoetigt) {
          n++;
          if (!lokaleDateien.has(did) && dRemote.has(did)) {
            fortschritt('Lade Seiten und Bilder … ' + n + ' von ' + benoetigt.size);
            const blob = await driveLaden(dRemote.get(did).id);
            await transaktion(['dateien'], 'readwrite', function (s) { s.dateien.put({ id: did, buch: buchId, blob: blob }); });
          } else if (lokaleDateien.has(did) && !dRemote.has(did)) {
            fortschritt('Lade Seiten und Bilder hoch … ' + n + ' von ' + benoetigt.size);
            const d = await holen('dateien', did);
            if (d && d.blob) {
              await driveHochladen({ name: 'datei-' + did + (/png/.test(d.blob.type) ? '.png' : '.jpg'), parents: [ordner], appProperties: { sp: 'datei', id: did, buch: buchId } }, d.blob);
            }
          }
        }
      }
      cfg.stand = stand; cfg.zuletzt = jetzt(); driveCfgSetzen(cfg);
      await buecherLaden();
      fortschritt(null);
      toast('Mit Google Drive abgeglichen – ' + ergebnisText(ergebnis), false, 3800);
    } catch (e) {
      fortschritt(null);
      alert(e && e.message ? e.message : String(e));
    } finally {
      abgleichLaeuft = false;
      if (K) K.neuZeichnen();
    }
  }

  /* ---------- Abgleich über eine Datei (Google Drive, OneDrive, iCloud …) ---------- */
  function metaHolen(k) { return transaktion(['meta'], 'readonly', function (s) { return s.meta.get(k); }).then(function (r) { return r ? r.wert : null; }).catch(function () { return null; }); }
  function metaSetzen(k, wert) { return transaktion(['meta'], 'readwrite', function (s) { if (wert == null) s.meta.delete(k); else s.meta.put({ id: k, wert: wert }); }); }
  const DATEI_NAME = 'SchulPlaner-Notizbuecher.json';
  const DATEI_TYPEN = [{ description: 'SchulPlaner-Abgleich', accept: { 'application/json': ['.json'] } }];
  function kannDateiMerken() { return typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function'; }

  function auswahlDialog(titel, text, knoepfe) {
    return new Promise(function (ok) {
      const d = document.createElement('dialog');
      d.className = 'nb-wahl';
      d.innerHTML = '<div class="dlg-koerper"><h3 class="nb-dlg-titel">' + esc(titel) + '</h3><p class="nb-wahl-text">' + text + '</p><div class="nb-wahl-knoepfe">' +
        knoepfe.map(function (k, i) { return '<button type="button" class="btn' + (k.primaer ? ' btn-primary' : '') + '" data-i="' + i + '">' + esc(k.text) + '</button>'; }).join('') +
        '</div></div>';
      document.body.appendChild(d);
      let wert = null;
      d.addEventListener('click', function (e) {
        const b = e.target.closest('[data-i]');
        if (b) { wert = knoepfe[Number(b.getAttribute('data-i'))].wert; d.close(); }
      });
      d.addEventListener('close', function () { d.remove(); ok(wert); });
      d.showModal();
    });
  }
  async function abgleichWahl() {
    const w = await auswahlDialog('Notizbücher abgleichen',
      'Google Drive ist auf diesem Gerät noch nicht eingerichtet. Du kannst es in den Einstellungen einrichten oder stattdessen über eine Abgleich-Datei abgleichen (funktioniert mit Google Drive, OneDrive und iCloud über die Dateien-App).',
      [{ text: 'Google Drive einrichten', wert: 'einrichten', primaer: true }, { text: 'Mit Datei abgleichen', wert: 'datei' }, { text: 'Abbrechen', wert: null }]);
    if (w === 'einrichten' && K && K.zeige) { K.zeige('einstellungen'); setTimeout(function () { const f = document.getElementById('nbClientId'); if (f) { f.scrollIntoView({ block: 'center' }); f.focus(); } }, 80); }
    else if (w === 'datei') dateiAbgleichen();
  }
  async function dateiAbgleichen(neuWaehlen) {
    if (abgleichLaeuft) return;
    if (E) { toast('Bitte zuerst das Notizbuch schließen.'); return; }
    if (kannDateiMerken()) return dateiAbgleichenGemerkt(neuWaehlen);
    const w = await auswahlDialog('Mit Datei abgleichen',
      'Wähle deine Abgleich-Datei <b>' + DATEI_NAME + '</b> – zum Beispiel in der Dateien-App unter Google Drive oder OneDrive. Danach speicherst du den neuen Stand wieder an dieselbe Stelle.<br><br>Gibt es noch keine Datei, tippe auf „Erste Datei anlegen“.',
      [{ text: 'Abgleich-Datei öffnen', wert: 'oeffnen', primaer: true }, { text: 'Erste Datei anlegen', wert: 'neu' }, { text: 'Abbrechen', wert: null }]);
    if (w === 'oeffnen') {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json'; inp.className = 'nb-unsichtbar';
      document.body.appendChild(inp);
      inp.addEventListener('change', async function () {
        const datei = inp.files && inp.files[0];
        inp.remove();
        if (!datei) return;
        abgleichLaeuft = true;
        try {
          fortschritt('Gleiche ab …');
          const r = await datenZusammenfuehren(await entpacken(datei));
          fortschritt('Neuer Stand wird vorbereitet …');
          const blob = await sicherungErstellen();
          fortschritt(null);
          toast('Eingelesen – ' + ergebnisText(r), false, 3500);
          ergebnisZeigen(blob, DATEI_NAME, 'Jetzt den neuen Stand wieder an dieselbe Stelle speichern und die alte Datei ersetzen (Teilen → „In Dateien sichern“).');
        } catch (e) { fortschritt(null); alert('Abgleich fehlgeschlagen: ' + (e && e.message ? e.message : e)); }
        finally { abgleichLaeuft = false; if (K) K.neuZeichnen(); }
      });
      inp.click();
    } else if (w === 'neu') {
      fortschritt('Datei wird vorbereitet …');
      try {
        const blob = await sicherungErstellen();
        fortschritt(null);
        ergebnisZeigen(blob, DATEI_NAME, 'Speichere die Datei in deinem Cloud-Ordner (Teilen → „In Dateien sichern“ → Google Drive oder OneDrive). Auf den anderen Geräten wählst du dann genau diese Datei.');
      } catch (e) { fortschritt(null); alert(e.message); }
    }
  }
  async function dateiAbgleichenGemerkt(neuWaehlen) {
    let h = neuWaehlen ? null : await metaHolen('abgleichDatei');
    try {
      if (h) {
        let p = await h.queryPermission({ mode: 'readwrite' });
        if (p !== 'granted') p = await h.requestPermission({ mode: 'readwrite' });
        if (p !== 'granted') h = null;
      }
      if (!h) {
        const w = await auswahlDialog('Mit Datei abgleichen',
          'Wähle einmalig deine Abgleich-Datei <b>' + DATEI_NAME + '</b> in deinem Google-Drive- oder OneDrive-Ordner. Danach reicht ein Klick auf „Abgleichen“.',
          [{ text: 'Vorhandene Datei wählen', wert: 'oeffnen', primaer: true }, { text: 'Neue Datei anlegen', wert: 'neu' }, { text: 'Abbrechen', wert: null }]);
        if (w === 'oeffnen') h = (await window.showOpenFilePicker({ types: DATEI_TYPEN, multiple: false }))[0];
        else if (w === 'neu') h = await window.showSaveFilePicker({ suggestedName: DATEI_NAME, types: DATEI_TYPEN });
        else return;
        try { await metaSetzen('abgleichDatei', h); } catch (e) { /* Merken nicht möglich – dann beim nächsten Mal neu wählen */ }
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      alert('Datei konnte nicht geöffnet werden: ' + (e && e.message ? e.message : e)); return;
    }
    abgleichLaeuft = true;
    try {
      fortschritt('Gleiche ab …');
      const datei = await h.getFile();
      let r = { neu: 0, aktualisiert: 0 };
      if (datei.size > 0) r = await datenZusammenfuehren(await entpacken(datei));
      fortschritt('Speichere neuen Stand …');
      const blob = await sicherungErstellen();
      const w = await h.createWritable();
      await w.write(blob); await w.close();
      const cfg = driveCfg(); cfg.dateiZuletzt = jetzt(); cfg.dateiName = h.name; driveCfgSetzen(cfg);
      fortschritt(null);
      toast('Mit „' + h.name + '“ abgeglichen – ' + ergebnisText(r), false, 3800);
    } catch (e) { fortschritt(null); alert('Abgleich fehlgeschlagen: ' + (e && e.message ? e.message : e)); }
    finally { abgleichLaeuft = false; if (K) K.neuZeichnen(); }
  }

  /* ============================================================
     Bibliothek (Ansicht in der App)
     ============================================================ */
  function modulInfo(id) {
    const m = id && K ? K.modulVon(id) : null;
    return m ? { name: m.name, farbe: m.farbe } : { name: 'Ohne Modul', farbe: '#9A9AA2' };
  }
  function datumText(ms) {
    if (!ms) return '';
    const d = new Date(ms), h = new Date();
    const tage = Math.round((new Date(h.getFullYear(), h.getMonth(), h.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (tage === 0) return 'heute ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (tage === 1) return 'gestern';
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  }
  function coverHTML(b, klein) {
    const c = COVER[b.cover] || COVER[0], m = modulInfo(b.modul_id);
    return '<div class="nb-buch' + (klein ? ' nb-klein' : '') + '" data-nb-oeffnen="' + b.id + '">' +
      '<div class="nb-cover" style="--c1:' + c[0] + ';--c2:' + c[1] + '"><div class="nb-ruecken"></div><div class="nb-glanz"></div>' +
      '<div class="nb-etikett">' + esc(b.titel) + '</div>' +
      '<button class="nb-mehr" data-nb-mehr="' + b.id + '" aria-label="Optionen für ' + esc(b.titel) + '">' + icon('mehr') + '</button></div>' +
      '<div class="nb-info"><div class="nb-titel">' + esc(b.titel) + '</div>' +
      '<div class="nb-meta"><span class="mod-punkt" style="background:' + m.farbe + '"></span>' + esc(m.name) + '</div>' +
      '<div class="nb-meta nb-meta2">' + (b.anzahl || 1) + ((b.anzahl || 1) === 1 ? ' Seite' : ' Seiten') + ' · ' + datumText(b.geaendert) + '</div></div></div>';
  }
  function sortiert(liste) { return liste.slice().sort(function (a, b) { return (b.geaendert || 0) - (a.geaendert || 0); }); }
  function bibliothekZeichnen(el) {
    if (!geladen) { el.innerHTML = '<div class="leer">Notizbücher werden geladen …</div>'; return; }
    if (ladeFehler) {
      el.innerHTML = '<div class="hinweis fehler">Notizbücher können in diesem Browser nicht gespeichert werden (' + esc(ladeFehler.message || ladeFehler) +
        '). Im privaten Modus ist das oft gesperrt.</div>';
      return;
    }
    if (!buecher.length) {
      el.innerHTML = '<div class="nb-leer"><div class="nb-leer-bild">' + coverMuster() + '</div><b>Noch keine Notizbücher</b>' +
        '<span>Lege für jedes Fach ein Notizbuch an und schreib mit dem Apple Pencil mit – wie auf Papier.</span>' +
        '<button class="btn btn-primary" data-nb-neu="">Erstes Notizbuch anlegen</button></div>';
      return;
    }
    const module = K ? K.module() : [];
    const vorhanden = new Set(buecher.map(function (b) { return b.modul_id && K && K.modulVon(b.modul_id) ? b.modul_id : '__ohne__'; }));
    if (filterModul !== 'alle' && !vorhanden.has(filterModul)) filterModul = 'alle';
    let chips = '<button class="nb-chip' + (filterModul === 'alle' ? ' aktiv' : '') + '" data-nb-filter="alle">Alle <span>' + buecher.length + '</span></button>';
    module.forEach(function (m) {
      if (!vorhanden.has(m.id)) return;
      const n = buecher.filter(function (b) { return b.modul_id === m.id; }).length;
      chips += '<button class="nb-chip' + (filterModul === m.id ? ' aktiv' : '') + '" data-nb-filter="' + m.id + '"><span class="mod-punkt" style="background:' + m.farbe + '"></span>' + esc(m.name) + ' <span>' + n + '</span></button>';
    });
    if (vorhanden.has('__ohne__')) chips += '<button class="nb-chip' + (filterModul === '__ohne__' ? ' aktiv' : '') + '" data-nb-filter="__ohne__">Ohne Modul</button>';
    const liste = sortiert(buecher.filter(function (b) {
      if (filterModul === 'alle') return true;
      if (filterModul === '__ohne__') return !(b.modul_id && K && K.modulVon(b.modul_id));
      return b.modul_id === filterModul;
    }));
    const cfgA = driveCfg();
    el.innerHTML = '<div class="nb-filter">' + chips + '</div>' +
      (cfgA.clientId ? '<div class="nb-stand">Zuletzt mit Google Drive abgeglichen: ' + zeitText(cfgA.zuletzt) + '</div>' : '') + '<div class="nb-gitter">' +
      '<div class="nb-buch nb-neu-karte" data-nb-neu="' + (filterModul !== 'alle' && filterModul !== '__ohne__' ? filterModul : '') + '"><div class="nb-cover"><span>+</span></div>' +
      '<div class="nb-info"><div class="nb-titel">Neues Notizbuch</div></div></div>' +
      liste.map(function (b) { return coverHTML(b); }).join('') + '</div>';
  }
  function coverMuster() {
    return [2, 0, 6].map(function (c, i) {
      const f = COVER[c];
      return '<div class="nb-cover" style="--c1:' + f[0] + ';--c2:' + f[1] + ';transform:rotate(' + (i - 1) * 9 + 'deg) translateY(' + (i === 1 ? -6 : 4) + 'px)"><div class="nb-ruecken"></div><div class="nb-glanz"></div></div>';
    }).join('');
  }
  function modulZeichnen(el, modulId) {
    if (!geladen || ladeFehler) { el.innerHTML = ''; return; }
    const ohne = modulId === '__ohne__';
    const liste = sortiert(buecher.filter(function (b) {
      return ohne ? !(b.modul_id && K && K.modulVon(b.modul_id)) : b.modul_id === modulId;
    }));
    el.innerHTML = '<div class="abschnitt">Notizbücher<span class="zahl">' + liste.length + '</span></div><div class="nb-reihe">' +
      liste.map(function (b) { return coverHTML(b, true); }).join('') +
      '<div class="nb-buch nb-klein nb-neu-karte" data-nb-neu="' + (ohne ? '' : modulId) + '"><div class="nb-cover"><span>+</span></div><div class="nb-info"><div class="nb-titel">Neu</div></div></div></div>';
  }
  function zeitText(ms) { return ms ? datumText(ms) : 'noch nie'; }
  function einstellungenZeichnen(el) {
    const seiten = buecher.reduce(function (s, b) { return s + (b.anzahl || 1); }, 0);
    const cfg = driveCfg();
    el.innerHTML = '<div class="box"><h3>Notizbücher</h3><p>' + buecher.length + (buecher.length === 1 ? ' Notizbuch' : ' Notizbücher') + ' mit ' + seiten +
      (seiten === 1 ? ' Seite' : ' Seiten') + ' auf diesem Gerät. <span data-nb-speicher></span></p>' +
      '<p>Notizbücher werden <b>nicht automatisch</b> abgeglichen. Tippe nach dem Mitschreiben auf „Mit Google Drive abgleichen“ – auch oben in der Notizbuch-Ansicht. ' +
      'Pro Seite gewinnt die zuletzt bearbeitete Fassung.</p>' +
      '<div class="feld"><label for="nbClientId">Google-Client-ID</label>' +
      '<input id="nbClientId" type="text" autocomplete="off" spellcheck="false" placeholder="1234…apps.googleusercontent.com" value="' + esc(cfg.clientId || '') + '"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-primary" data-nb-drive="1">Mit Google Drive abgleichen</button>' +
      '<button class="btn" data-nb-dateiabgleich="1">Mit Datei abgleichen</button>' +
      (kannDateiMerken() && cfg.dateiName ? '<button class="btn" data-nb-dateiwechsel="1">Andere Abgleich-Datei</button>' : '') +
      (cfg.clientId ? '<button class="btn" data-nb-trennen="1">Google trennen</button>' : '') + '</div>' +
      '<div class="hinweis ok" style="margin-top:12px">Google Drive: ' + (cfg.clientId ? 'zuletzt abgeglichen ' + zeitText(cfg.zuletzt) : 'noch nicht eingerichtet') +
      (cfg.dateiZuletzt ? ' · Datei „' + esc(cfg.dateiName || '') + '“: ' + zeitText(cfg.dateiZuletzt) : '') + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn" data-nb-sichern="1">Sicherung herunterladen</button>' +
      '<button class="btn" data-nb-laden="1">Sicherung einlesen</button></div>' +
      '<input type="file" accept=".json,application/json" class="nb-unsichtbar" data-nb-sicherung></div>';
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function (s) {
        const z = el.querySelector('[data-nb-speicher]');
        if (z && s && s.usage) z.textContent = 'Belegt: ' + (s.usage / 1048576).toFixed(1).replace('.', ',') + ' MB.';
      }).catch(function () { });
    }
    const id = el.querySelector('#nbClientId');
    id.addEventListener('change', function () {
      const wert = id.value.trim();
      const c = driveCfg();
      if (wert && !/\.apps\.googleusercontent\.com$/.test(wert)) {
        alert('Das sieht nicht wie eine Google-Client-ID aus. Sie endet auf „.apps.googleusercontent.com“.');
        id.value = c.clientId || ''; return;
      }
      if (wert !== (c.clientId || '')) { c.clientId = wert; c.verbunden = false; driveToken = null; driveCfgSetzen(c); }
      if (wert) gisLaden().catch(function () { });
      if (K) K.neuZeichnen();
    });
    if (cfg.clientId) gisLaden().catch(function () { });
    const inp = el.querySelector('[data-nb-sicherung]');
    inp.addEventListener('change', async function () {
      const d = inp.files && inp.files[0];
      inp.value = '';
      if (!d) return;
      try { const r = await sicherungEinlesen(d); alert('Sicherung eingelesen – ' + ergebnisText(r) + '.'); }
      catch (e) { alert('Sicherung konnte nicht eingelesen werden: ' + e.message); }
      if (K) K.neuZeichnen();
    });
  }

  /* ---------- Dialog: Notizbuch anlegen / bearbeiten ---------- */
  let dlg = null, dlgZustand = null;
  function dialogBauen() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'dlgNotizbuch';
    dlg.innerHTML =
      '<div class="dlg-koerper">' +
        '<h3 class="nb-dlg-titel">Neues Notizbuch</h3>' +
        '<div class="feld"><label for="nbTitel">Name</label><input id="nbTitel" type="text" maxlength="80" placeholder="z. B. Mathe Mitschrift"></div>' +
        '<div class="feld"><label for="nbModul">Modul</label><select id="nbModul"></select></div>' +
        '<div class="feld"><label>Cover</label><div class="nb-farbwahl" id="nbCover"></div></div>' +
        '<div class="feld nb-nur-neu"><label>Papier</label><div class="nb-vorlagen" id="nbVorlage"></div></div>' +
        '<div class="feld nb-nur-neu"><label>Papierfarbe</label><div class="nb-papierwahl" id="nbPapier"></div></div>' +
        '<div class="feld nb-nur-neu"><button class="btn btn-klein" id="nbPdfWahl" type="button">Aus PDF erstellen …</button> <span class="nb-hinweistext" id="nbPdfName"></span>' +
          '<input type="file" accept="application/pdf,.pdf" class="nb-unsichtbar" id="nbPdfDatei"></div>' +
      '</div>' +
      '<div class="dlg-fuss"><button class="btn btn-danger" id="nbLoeschen" type="button">Löschen</button>' +
        '<button class="btn" id="nbExport" type="button">Als PDF</button>' +
        '<div class="rechts"><button class="btn" id="nbAbbrechen" type="button">Abbrechen</button><button class="btn btn-primary" id="nbSpeichern" type="button">Erstellen</button></div></div>';
    document.body.appendChild(dlg);
    const q = function (s) { return dlg.querySelector(s); };
    q('#nbCover').addEventListener('click', function (e) {
      const b = e.target.closest('[data-c]'); if (!b) return;
      dlgZustand.cover = Number(b.getAttribute('data-c')); dialogAuswahlZeigen();
    });
    q('#nbVorlage').addEventListener('click', function (e) {
      const b = e.target.closest('[data-v]'); if (!b) return;
      dlgZustand.vorlage = b.getAttribute('data-v'); dialogAuswahlZeigen();
    });
    q('#nbPapier').addEventListener('click', function (e) {
      const b = e.target.closest('[data-p]'); if (!b) return;
      dlgZustand.papier = b.getAttribute('data-p'); dialogAuswahlZeigen();
    });
    q('#nbPdfWahl').addEventListener('click', function () { q('#nbPdfDatei').click(); });
    q('#nbPdfDatei').addEventListener('change', function () {
      const d = this.files && this.files[0];
      dlgZustand.pdf = d || null;
      q('#nbPdfName').textContent = d ? d.name : '';
      if (d && !q('#nbTitel').value.trim()) q('#nbTitel').value = d.name.replace(/\.pdf$/i, '');
    });
    q('#nbAbbrechen').addEventListener('click', function () { dlg.close(); });
    q('#nbSpeichern').addEventListener('click', dialogSpeichern);
    q('#nbTitel').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); dialogSpeichern(); } });
    q('#nbLoeschen').addEventListener('click', async function () {
      const b = buecher.find(function (x) { return x.id === dlgZustand.id; });
      if (!b) return;
      if (!confirm('Notizbuch „' + b.titel + '“ mit ' + (b.anzahl || 1) + ((b.anzahl || 1) === 1 ? ' Seite' : ' Seiten') + ' endgültig löschen?')) return;
      dlg.close();
      try { await buchLoeschen(b.id); } catch (e) { alert('Löschen fehlgeschlagen: ' + e.message); }
      if (K) K.neuZeichnen();
    });
    q('#nbExport').addEventListener('click', function () {
      const b = buecher.find(function (x) { return x.id === dlgZustand.id; });
      dlg.close();
      if (b) pdfExportieren(b);
    });
    return dlg;
  }
  function dialogAuswahlZeigen() {
    const z = dlgZustand;
    dlg.querySelector('#nbCover').innerHTML = COVER.map(function (c, i) {
      return '<button type="button" data-c="' + i + '" class="' + (z.cover === i ? 'aktiv' : '') + '" style="--c1:' + c[0] + ';--c2:' + c[1] + '" aria-label="Cover ' + (i + 1) + '"></button>';
    }).join('');
    dlg.querySelector('#nbVorlage').innerHTML = VORLAGEN.map(function (v) {
      return '<button type="button" data-v="' + v[0] + '" class="' + (z.vorlage === v[0] ? 'aktiv' : '') + '"><span class="nb-vl nb-vl-' + v[0] + '" style="background-color:' + PAPIER[z.papier] + '"></span>' + v[1] + '</button>';
    }).join('');
    dlg.querySelector('#nbPapier').innerHTML = [['weiss', 'Weiß'], ['creme', 'Creme']].map(function (p) {
      return '<button type="button" data-p="' + p[0] + '" class="' + (z.papier === p[0] ? 'aktiv' : '') + '"><span style="background:' + PAPIER[p[0]] + '"></span>' + p[1] + '</button>';
    }).join('');
  }
  function dialogOeffnen(id, vorgabeModul) {
    dialogBauen();
    const b = id ? buecher.find(function (x) { return x.id === id; }) : null;
    dlgZustand = b ? { id: b.id, cover: b.cover || 0, vorlage: b.vorlage, papier: b.papier, pdf: null }
      : { id: null, cover: Math.floor(Math.random() * 8), vorlage: 'liniert', papier: 'weiss', pdf: null };
    dlg.querySelector('.nb-dlg-titel').textContent = b ? 'Notizbuch bearbeiten' : 'Neues Notizbuch';
    dlg.querySelector('#nbTitel').value = b ? b.titel : '';
    const module = K ? K.module() : [];
    const gewaehlt = b ? (b.modul_id || '') : (vorgabeModul || (filterModul !== 'alle' && filterModul !== '__ohne__' ? filterModul : ''));
    dlg.querySelector('#nbModul').innerHTML = '<option value="">Ohne Modul</option>' + module.map(function (m) {
      return '<option value="' + esc(m.id) + '"' + (m.id === gewaehlt ? ' selected' : '') + '>' + esc(m.name) + '</option>';
    }).join('');
    if (!b && gewaehlt && !dlg.querySelector('#nbTitel').value) {
      const m = K && K.modulVon(gewaehlt);
      if (m) dlg.querySelector('#nbTitel').placeholder = m.name + ' Mitschrift';
    } else dlg.querySelector('#nbTitel').placeholder = 'z. B. Mathe Mitschrift';
    dlg.querySelector('#nbPdfName').textContent = '';
    dlg.querySelector('#nbPdfDatei').value = '';
    $$(dlg, '.nb-nur-neu').forEach(function (x) { x.style.display = b ? 'none' : ''; });
    dlg.querySelector('#nbLoeschen').style.display = b ? '' : 'none';
    dlg.querySelector('#nbExport').style.display = b ? '' : 'none';
    dlg.querySelector('#nbSpeichern').textContent = b ? 'Speichern' : 'Erstellen';
    dialogAuswahlZeigen();
    if (K && K.auswahlAufbereiten) K.auswahlAufbereiten(dlg);
    dlg.showModal();
    if (!b) setTimeout(function () { try { dlg.querySelector('#nbTitel').focus(); } catch (e) { } }, 50);
  }
  async function dialogSpeichern() {
    const z = dlgZustand;
    const titelFeld = dlg.querySelector('#nbTitel');
    const modul = dlg.querySelector('#nbModul').value || null;
    let titel = titelFeld.value.trim();
    if (!titel) titel = titelFeld.placeholder && titelFeld.placeholder.indexOf('z. B.') !== 0 ? titelFeld.placeholder : '';
    if (!titel) { titelFeld.focus(); titelFeld.classList.add('nb-fehlt'); setTimeout(function () { titelFeld.classList.remove('nb-fehlt'); }, 1200); return; }
    if (z.id) {
      const b = buecher.find(function (x) { return x.id === z.id; });
      if (b) {
        b.titel = titel; b.modul_id = modul; b.cover = z.cover; b.geaendert = jetzt(); b.metaG = jetzt();
        try { await buchSpeichern(b); } catch (e) { alert('Speichern fehlgeschlagen: ' + e.message); return; }
      }
      dlg.close();
      if (K) K.neuZeichnen();
      return;
    }
    dlg.close();
    const daten = { titel: titel, modul_id: modul, cover: z.cover, vorlage: z.vorlage, papier: z.papier };
    try {
      const b = z.pdf ? await buchAusPdf(daten, z.pdf) : await buchAnlegen(daten);
      if (K) K.neuZeichnen();
      oeffnen(b.id);
    } catch (e) { alert('Notizbuch konnte nicht angelegt werden: ' + (e && e.message ? e.message : e)); }
  }

  /* ---------- Klicks in der App ---------- */
  function appKlick(ev) {
    const el = ev.target.closest && ev.target.closest('[data-nb-mehr],[data-nb-neu],[data-nb-oeffnen],[data-nb-filter],[data-nb-sichern],[data-nb-laden],[data-nb-abgleich],[data-nb-drive],[data-nb-dateiabgleich],[data-nb-dateiwechsel],[data-nb-trennen]');
    if (!el || (E && E.el.root.contains(el))) return;
    if (el.hasAttribute('data-nb-abgleich') || el.hasAttribute('data-nb-drive')) {
      const f = document.getElementById('nbClientId');
      if (f && f.value.trim() !== (driveCfg().clientId || '')) { f.dispatchEvent(new Event('change')); }
      driveAbgleichen(); return;
    }
    if (el.hasAttribute('data-nb-dateiabgleich')) { dateiAbgleichen(false); return; }
    if (el.hasAttribute('data-nb-dateiwechsel')) { dateiAbgleichen(true); return; }
    if (el.hasAttribute('data-nb-trennen')) {
      if (!confirm('Google Drive auf diesem Gerät trennen? Deine Notizbücher bleiben auf dem Gerät und in Google Drive erhalten.')) return;
      try { if (driveToken && window.google && window.google.accounts.oauth2.revoke) window.google.accounts.oauth2.revoke(driveToken.wert, function () { }); } catch (e) { }
      driveToken = null; driveCfgSetzen({}); if (K) K.neuZeichnen(); return;
    }
    if (el.hasAttribute('data-nb-mehr')) { ev.stopPropagation(); dialogOeffnen(el.getAttribute('data-nb-mehr')); return; }
    if (el.hasAttribute('data-nb-neu')) { dialogOeffnen(null, el.getAttribute('data-nb-neu') || null); return; }
    if (el.hasAttribute('data-nb-oeffnen')) { oeffnen(el.getAttribute('data-nb-oeffnen')); return; }
    if (el.hasAttribute('data-nb-filter')) { filterModul = el.getAttribute('data-nb-filter'); if (K) K.neuZeichnen(); return; }
    if (el.hasAttribute('data-nb-sichern')) {
      el.disabled = true;
      sicherungErstellen().then(function (blob) {
        const d = new Date();
        herunterladen(blob, 'schulplaner-notizbuecher-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json');
      }).catch(function (e) { alert('Sicherung fehlgeschlagen: ' + e.message); }).then(function () { el.disabled = false; });
      return;
    }
    if (el.hasAttribute('data-nb-laden')) {
      const inp = el.closest('.box') && el.closest('.box').querySelector('[data-nb-sicherung]');
      if (inp) inp.click();
    }
  }

  /* ============================================================
     Gestaltung
     ============================================================ */
  const CSS = `
.nb-unsichtbar{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;overflow:hidden}
html.nb-offen,html.nb-offen body{overflow:hidden;overscroll-behavior:none}
/* Bibliothek */
.nb-filter{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0 4px}
.nb-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--kante);border-radius:999px;padding:7px 14px;font-size:13.5px;font-weight:600;color:var(--text);background:var(--glanz),var(--glas-stark);box-shadow:var(--licht)}
.nb-chip span:last-child{color:var(--muted2);font-weight:500}
.nb-chip .mod-punkt{margin:0}
.nb-chip.aktiv{background:linear-gradient(180deg,#3E94FF,#0A7AFF 55%,#0066E0);color:#fff;border-color:rgba(255,255,255,.35)}
.nb-chip.aktiv span:last-child{color:rgba(255,255,255,.8)}
.nb-gitter{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:26px 20px;margin-top:18px}
.nb-buch{position:relative;cursor:pointer;-webkit-user-select:none;user-select:none;min-width:0}
.nb-cover{position:relative;aspect-ratio:3/4;border-radius:7px 16px 16px 7px;background:linear-gradient(150deg,var(--c1),var(--c2));box-shadow:0 14px 28px rgba(20,25,60,.22),0 2px 4px rgba(20,25,60,.12),inset 0 1px 0 rgba(255,255,255,.35);overflow:hidden;transition:transform .15s ease,box-shadow .15s ease}
.nb-buch:hover .nb-cover{box-shadow:0 18px 34px rgba(20,25,60,.28),0 2px 4px rgba(20,25,60,.12),inset 0 1px 0 rgba(255,255,255,.35)}
.nb-buch:active .nb-cover{transform:scale(.97)}
.nb-ruecken{position:absolute;left:0;top:0;bottom:0;width:13%;background:linear-gradient(90deg,rgba(0,0,0,.24),rgba(0,0,0,.05) 75%,rgba(255,255,255,.14))}
.nb-ruecken::after{content:"";position:absolute;right:4px;top:6%;bottom:6%;border-right:1.5px dashed rgba(255,255,255,.4)}
.nb-glanz{position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.3),rgba(255,255,255,0) 42%)}
.nb-etikett{position:absolute;left:21%;right:9%;top:15%;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.9);color:#1D1D1F;font-weight:700;font-size:13px;line-height:1.25;word-break:break-word;box-shadow:0 2px 8px rgba(0,0,0,.14);max-height:46%;overflow:hidden}
.nb-mehr{position:absolute;right:8px;bottom:8px;width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(0,0,0,.22);color:#fff;display:flex;align-items:center;justify-content:center;padding:0;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.nb-mehr svg{width:18px;height:18px}
.nb-info{padding:10px 2px 0;min-width:0}
.nb-titel{font-weight:650;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nb-meta{display:flex;align-items:center;font-size:12.5px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nb-meta2{color:var(--muted2)}
.nb-neu-karte .nb-cover{background:transparent;border:2px dashed var(--muted2);box-shadow:none;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:42px;font-weight:300}
.nb-neu-karte:hover .nb-cover{box-shadow:none;border-color:var(--accent);color:var(--accent)}
.nb-reihe{display:flex;gap:16px;overflow-x:auto;padding:4px 2px 14px;scrollbar-width:thin}
.nb-klein{flex:0 0 112px;width:112px}
.nb-klein .nb-etikett{font-size:11px;padding:6px 7px}
.nb-klein .nb-mehr{width:26px;height:26px;right:6px;bottom:6px}
.nb-klein .nb-meta2{display:none}
.nb-leer{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:46px 16px;color:var(--muted)}
.nb-leer b{color:var(--text);font-size:18px}
.nb-leer span{max-width:380px}
.nb-leer .btn{margin-top:8px}
.nb-leer-bild{display:flex;margin-bottom:12px}
.nb-leer-bild .nb-cover{width:74px;margin:0 -10px}
/* Dialog */
.nb-dlg-titel{margin:0 0 14px;font-size:19px}
.nb-farbwahl{display:flex;gap:8px;flex-wrap:wrap}
.nb-farbwahl button{width:34px;height:44px;border-radius:4px 9px 9px 4px;border:0;background:linear-gradient(150deg,var(--c1),var(--c2));box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);padding:0}
.nb-farbwahl button.aktiv{box-shadow:0 0 0 2px var(--bg-dialog,#fff),0 0 0 4px var(--accent)}
.nb-vorlagen{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.nb-vorlagen button,.nb-papierwahl button{display:flex;flex-direction:column;align-items:center;gap:6px;border:1px solid var(--kante);border-radius:12px;padding:8px 4px;background:rgba(255,255,255,.4);font-size:12px;font-weight:600;color:var(--text)}
.nb-vorlagen button.aktiv,.nb-papierwahl button.aktiv{border-color:var(--accent);box-shadow:0 0 0 2px rgba(10,122,255,.25);color:var(--accent)}
.nb-papierwahl{display:flex;gap:8px}
.nb-papierwahl button{flex-direction:row;padding:8px 14px}
.nb-papierwahl span{width:18px;height:18px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)}
.nb-vl{display:block;width:100%;max-width:48px;aspect-ratio:3/4;border-radius:4px;background-color:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
.nb-vl-liniert{background-image:repeating-linear-gradient(180deg,transparent 0 6px,#BCCDE8 6px 7px)}
.nb-vl-kariert{background-image:repeating-linear-gradient(180deg,transparent 0 5px,#D0D9E6 5px 6px),repeating-linear-gradient(90deg,transparent 0 5px,#D0D9E6 5px 6px)}
.nb-vl-punktiert{background-image:radial-gradient(circle,#A8B3C3 .9px,transparent 1.2px);background-size:6px 6px}
.nb-vl-cornell{background-image:linear-gradient(90deg,transparent 30%,#9DB3D8 30% calc(30% + 1px),transparent calc(30% + 1px)),linear-gradient(180deg,transparent 18%,#9DB3D8 18% calc(18% + 1px),transparent calc(18% + 1px) 78%,#9DB3D8 78% calc(78% + 1px),transparent calc(78% + 1px))}
.nb-hinweistext{font-size:13px;color:var(--muted);margin-left:6px}
.nb-fehlt{border-color:var(--danger)!important;box-shadow:0 0 0 3px rgba(255,59,48,.2)!important}
/* Editor */
.nb-editor{position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;color:var(--text);background:#E4E6EE;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;overscroll-behavior:none;font-family:${SCHRIFT}}
:root[data-thema="dunkel"] .nb-editor{background:#15161E}
.nb-leiste{position:relative;z-index:4;flex:0 0 auto;padding:calc(6px + env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) 6px max(8px,env(safe-area-inset-left));background:var(--glanz),var(--glas-stark);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border-bottom:1px solid var(--kante);box-shadow:0 4px 18px rgba(0,0,0,.08)}
:root[data-thema="dunkel"] .nb-leiste{background:var(--glanz),rgba(30,32,52,.86)}
.nb-zeile{display:flex;align-items:center;gap:4px;min-width:0}
.nb-zeile2{margin-top:4px;min-height:38px;gap:8px;overflow-x:auto;scrollbar-width:none;padding:0 4px}
.nb-zeile2::-webkit-scrollbar,.nb-werkzeuge::-webkit-scrollbar{display:none}
.nb-buchtitel{font-weight:650;font-size:15px;max-width:22vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 6px}
.nb-werkzeuge{display:flex;gap:2px;margin:0 auto;overflow-x:auto;scrollbar-width:none;min-width:0;padding:0 4px}
.nb-knopf{position:relative;width:42px;height:42px;flex:0 0 42px;border-radius:12px;border:0;background:transparent;color:var(--text);display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer;transition:background .12s ease}
.nb-knopf svg{width:23px;height:23px}
.nb-knopf:hover{background:rgba(127,127,140,.12)}
.nb-knopf.aktiv{background:rgba(10,122,255,.15);color:var(--accent)}
:root[data-thema="dunkel"] .nb-knopf.aktiv{color:#4EA6FF;background:rgba(10,132,255,.22)}
.nb-knopf:disabled{opacity:.3;cursor:default;background:transparent}
.nb-farbstrich{position:absolute;left:12px;right:12px;bottom:5px;height:3px;border-radius:2px}
.nb-name{font-weight:650;font-size:13px;color:var(--muted);white-space:nowrap}
.nb-gruppe{display:flex;align-items:center;gap:6px}
.nb-trenner{width:1px;height:22px;background:var(--kante);flex:0 0 1px}
:root[data-thema="dunkel"] .nb-trenner{background:rgba(255,255,255,.14)}
.nb-farbe{width:28px;height:28px;flex:0 0 28px;border-radius:50%;border:0;padding:0;background:var(--f);box-shadow:inset 0 0 0 1px rgba(0,0,0,.18);cursor:pointer}
.nb-farbe.aktiv{box-shadow:0 0 0 2px var(--nb-ring,#fff),0 0 0 4px var(--accent)}
:root[data-thema="dunkel"] .nb-farbe.aktiv{--nb-ring:#1e2034}
.nb-breite{width:32px;height:32px;flex:0 0 32px;border-radius:9px;border:0;background:transparent;color:var(--text);display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}
.nb-breite span{display:block;border-radius:50%;background:currentColor}
.nb-breite.aktiv{background:rgba(10,122,255,.15);color:var(--accent)}
.nb-segment{display:flex;border:1px solid var(--kante);border-radius:10px;overflow:hidden;flex:0 0 auto}
.nb-segment button{border:0;background:transparent;color:var(--text);padding:6px 11px;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer}
.nb-segment button.aktiv{background:var(--accent);color:#fff}
.nb-schalter,.nb-mini{border:1px solid var(--kante);background:transparent;color:var(--text);border-radius:9px;padding:6px 11px;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer}
.nb-schalter.aktiv{background:var(--accent);color:#fff;border-color:transparent}
.nb-fett{font-weight:800;min-width:34px}
.nb-wert{font-size:13px;font-weight:600;min-width:42px;text-align:center}
.nb-rot{color:var(--danger)!important}
.nb-tipp{font-size:12.5px;color:var(--muted);white-space:nowrap}
.nb-flaeche{position:relative;flex:1 1 auto;overflow:hidden;touch-action:none}
.nb-flaeche canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.nb-live.nb-multiply{mix-blend-mode:multiply}
.nb-eingabe{position:absolute;inset:0;touch-action:none;-webkit-user-select:none;user-select:none;cursor:crosshair}
.nb-editor.wz-text .nb-eingabe{cursor:text}
.nb-textebene{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.nb-text{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none}
.nb-editor.wz-text .nb-text{pointer-events:auto}
.nb-text-inhalt{outline:none;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;line-height:1.3;padding:3px 5px;min-height:1.3em;font-family:${SCHRIFT};cursor:text;-webkit-user-select:text;user-select:text;border-radius:3px}
.nb-editor.wz-text .nb-text-inhalt{box-shadow:inset 0 0 0 1px rgba(10,122,255,.28)}
.nb-text.aktiv .nb-text-inhalt{box-shadow:inset 0 0 0 1.5px var(--accent);background:rgba(10,122,255,.04)}
.nb-text-inhalt:empty::before{content:"Text eingeben";color:#9A9AA3}
.nb-textrahmen{position:absolute;left:0;top:0;pointer-events:none;z-index:2}
.nb-textrahmen[hidden]{display:none}
.nb-tr-griff{position:absolute;left:-6px;top:-34px;width:32px;height:28px;border-radius:9px;border:1px solid var(--kante);background:var(--glanz),var(--glas-stark);color:var(--text);display:flex;align-items:center;justify-content:center;padding:0;pointer-events:auto;cursor:move;touch-action:none;box-shadow:var(--licht),0 4px 10px rgba(0,0,0,.12)}
.nb-tr-griff svg{width:18px;height:18px}
.nb-tr-breite{position:absolute;right:-9px;top:50%;width:18px;height:34px;margin-top:-17px;border-radius:9px;border:2px solid var(--accent);background:#fff;padding:0;pointer-events:auto;cursor:ew-resize;touch-action:none}
.nb-auswahlmenue{position:absolute;left:0;top:0;z-index:3;display:flex;gap:2px;padding:4px;border-radius:14px;border:1px solid var(--kante);background:var(--glanz),var(--glas-stark);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);box-shadow:var(--licht),0 10px 26px rgba(0,0,0,.18)}
:root[data-thema="dunkel"] .nb-auswahlmenue{background:var(--glanz),rgba(34,37,60,.92)}
.nb-auswahlmenue[hidden]{display:none}
.nb-auswahlmenue button{display:flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--text);padding:8px 11px;border-radius:10px;font-size:13.5px;font-weight:600;white-space:nowrap;cursor:pointer}
.nb-auswahlmenue button:hover{background:rgba(127,127,140,.14)}
.nb-auswahlmenue svg{width:17px;height:17px}
.nb-sel-punkt{width:14px;height:14px;border-radius:50%;background:conic-gradient(#FF3B30,#FF9500,#FFD60A,#30D158,#0A84FF,#BF5AF2,#FF3B30)}
.nb-seitenzahl{position:absolute;right:max(14px,env(safe-area-inset-right));bottom:calc(14px + env(safe-area-inset-bottom));z-index:3;border:1px solid var(--kante);border-radius:999px;padding:7px 14px;font-size:13px;font-weight:650;color:var(--text);background:var(--glanz),var(--glas-stark);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);box-shadow:var(--licht),0 6px 16px rgba(0,0,0,.14);cursor:pointer}
:root[data-thema="dunkel"] .nb-seitenzahl{background:var(--glanz),rgba(34,37,60,.86)}
.nb-popover{position:absolute;z-index:10;min-width:220px;max-width:min(340px,calc(100vw - 16px));max-height:calc(100% - 16px);overflow-y:auto;padding:10px;border-radius:16px;border:1px solid var(--kante);background:var(--glanz),rgba(250,251,255,.96);-webkit-backdrop-filter:blur(30px) saturate(180%);backdrop-filter:blur(30px) saturate(180%);box-shadow:var(--licht),0 18px 44px rgba(30,40,90,.24);color:var(--text)}
:root[data-thema="dunkel"] .nb-popover{background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,0) 50%),rgba(28,31,52,.97)}
.nb-pop-titel{font-weight:700;font-size:14px;margin:2px 4px 10px;display:flex;justify-content:space-between;gap:10px}
.nb-pop-wert{color:var(--muted);font-weight:600}
.nb-pop-unter{font-size:12px;font-weight:650;color:var(--muted);margin:10px 4px 6px}
.nb-pop-linie{height:1px;background:var(--kante);margin:8px 0}
.nb-farbgitter{display:grid;grid-template-columns:repeat(6,32px);gap:8px;justify-content:center}
.nb-farbgitter button{width:32px;height:32px;border-radius:50%;border:0;padding:0;background:var(--f);box-shadow:inset 0 0 0 1px rgba(0,0,0,.18);cursor:pointer}
.nb-farbgitter button.aktiv{box-shadow:0 0 0 2px var(--nb-ring,#fff),0 0 0 4px var(--accent)}
.nb-eigene{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;font-size:13px;font-weight:600;padding:0 4px}
.nb-eigene input{width:44px;height:30px;border:0;padding:0;background:none}
.nb-regler{width:100%;accent-color:var(--accent)}
.nb-vorschau{width:100%;height:56px;margin-top:6px}
.nb-menue{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--text);padding:10px 10px;border-radius:10px;font-size:14.5px;cursor:pointer}
.nb-menue:hover{background:rgba(127,127,140,.12)}
.nb-vorlagen-mini{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:4px}
.nb-vorlagen-mini button{display:flex;flex-direction:column;align-items:center;gap:4px;border:1px solid transparent;border-radius:10px;background:transparent;color:var(--text);font-size:11px;font-weight:600;padding:5px 2px;cursor:pointer}
.nb-vorlagen-mini button.aktiv{border-color:var(--accent);color:var(--accent)}
.nb-vorlagen-mini .nb-vl{max-width:34px}
.nb-umschalter{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;font-size:14.5px;cursor:pointer}
.nb-umschalter input{position:absolute;opacity:0;pointer-events:none}
.nb-umschalter i{position:relative;width:46px;height:28px;flex:0 0 46px;border-radius:14px;background:rgba(120,120,128,.32);transition:background .18s ease}
.nb-umschalter i::after{content:"";position:absolute;left:2px;top:2px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:transform .18s ease}
.nb-umschalter input:checked+i{background:#34C759}
.nb-umschalter input:checked+i::after{transform:translateX(18px)}
.nb-toast{position:absolute;left:50%;bottom:calc(64px + env(safe-area-inset-bottom));z-index:20;transform:translate(-50%,20px);opacity:0;pointer-events:none;display:flex;align-items:center;gap:12px;max-width:min(560px,calc(100vw - 24px));padding:10px 16px;border-radius:14px;background:rgba(28,28,34,.92);color:#fff;font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:opacity .2s ease,transform .2s ease}
.nb-toast.sichtbar{opacity:1;transform:translate(-50%,0);pointer-events:auto}
.nb-toast button{border:0;background:rgba(255,255,255,.16);color:#fff;border-radius:9px;padding:6px 10px;font-weight:650;white-space:nowrap;cursor:pointer}
body>.nb-toast{position:fixed}
.nb-fortschritt{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(15,18,35,.32);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
body>.nb-fortschritt{position:fixed;z-index:120}
.nb-fortschritt>div{display:flex;align-items:center;gap:14px;padding:18px 22px;border-radius:18px;background:var(--glanz),rgba(250,251,255,.96);color:#1D1D1F;box-shadow:0 20px 50px rgba(0,0,0,.25);max-width:calc(100vw - 32px)}
:root[data-thema="dunkel"] .nb-fortschritt>div{background:rgba(32,35,58,.97);color:#F2F2F7}
.nb-kreisel{width:22px;height:22px;border-radius:50%;border:3px solid rgba(10,122,255,.25);border-top-color:#0A7AFF;animation:nb-dreh .8s linear infinite}
@keyframes nb-dreh{to{transform:rotate(360deg)}}
.nb-fertig{flex-direction:column;align-items:flex-start!important;gap:6px!important;min-width:260px}
.nb-fertig span{color:var(--muted);font-size:13px}
.nb-fertig-knoepfe{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.nb-uebersicht{position:absolute;inset:0;z-index:25;display:flex;flex-direction:column;background:var(--glanz),rgba(236,238,245,.97);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur)}
:root[data-thema="dunkel"] .nb-uebersicht{background:rgba(20,22,34,.97)}
.nb-ueb-kopf{display:flex;align-items:center;gap:10px;padding:calc(12px + env(safe-area-inset-top)) 16px 12px;border-bottom:1px solid var(--kante)}
.nb-ueb-kopf b{font-size:18px}
.nb-ueb-zahl{color:var(--muted);margin-right:auto}
.nb-ueb-gitter{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:18px;padding:18px 16px calc(24px + env(safe-area-inset-bottom));align-content:start}
.nb-ueb-seite{cursor:pointer}
.nb-ueb-bild{background:#fff;border-radius:6px;box-shadow:0 6px 16px rgba(20,25,60,.16);overflow:hidden}
.nb-ueb-bild canvas{width:100%;height:100%;display:block}
.nb-ueb-fuss{display:flex;align-items:center;justify-content:space-between;padding:6px 2px 0;font-size:13px;font-weight:650;color:var(--muted)}
.nb-ueb-fuss button{border:0;background:transparent;color:var(--muted);width:28px;height:28px;border-radius:8px;padding:4px;cursor:pointer}
.nb-ueb-fuss button:hover{color:var(--danger);background:rgba(255,59,48,.1)}
.nb-ueb-fuss svg{width:18px;height:18px}
.nb-stand{font-size:12.5px;color:var(--muted2);margin:10px 2px 0}
.nb-fertig-hinweis{margin:4px 0 0;font-size:13.5px;line-height:1.45;max-width:340px;color:inherit;opacity:.85}
dialog.nb-wahl{width:min(460px,94vw)!important;max-width:94vw!important;height:fit-content!important;min-height:0!important;max-height:90vh!important;border-radius:26px!important;border:1px solid var(--kante)!important;margin:auto!important}
dialog.nb-wahl .dlg-koerper{max-height:none;padding-top:22px}
.nb-wahl-text{font-size:14.5px;line-height:1.5;color:var(--muted);margin:0 0 16px}
.nb-wahl-knoepfe{display:flex;flex-direction:column;gap:8px;padding-bottom:14px}
.nb-wahl-knoepfe .btn{justify-content:center;width:100%}
@media (max-width:760px){.nb-buchtitel{display:none}}
@media (max-width:560px){
  .nb-gitter{grid-template-columns:repeat(2,1fr);gap:22px 14px}
  .nb-knopf{width:38px;height:38px;flex-basis:38px}
  .nb-zeile:first-child{flex-wrap:wrap}
  .nb-werkzeuge{order:5;flex:1 0 100%;justify-content:space-between;margin:4px 0 0;padding:0}
  .nb-zurueck{margin-right:auto}
  .nb-knopf svg{width:21px;height:21px}
  .nb-vorlagen{grid-template-columns:repeat(3,1fr)}
  .nb-segment button{padding:6px 8px}
}
@media (prefers-reduced-motion: reduce){.nb-kreisel{animation:none}}
`;

  /* ============================================================
     Öffentliche Schnittstelle
     ============================================================ */
  let init = false;
  window.Notizen = {
    init: function (kontext) {
      K = kontext;
      if (init) return;
      init = true;
      const st = document.createElement('style');
      st.id = 'nb-stil';
      st.textContent = CSS;
      document.head.appendChild(st);
      document.addEventListener('click', appKlick);
      if (typeof indexedDB === 'undefined') { geladen = true; ladeFehler = new Error('IndexedDB fehlt'); }
      else buecherLaden();
    },
    nachRender: function (container) {
      const bib = container.querySelector('[data-nb-bibliothek]');
      if (bib) bibliothekZeichnen(bib);
      $$(container, '[data-nb-modul]').forEach(function (el) { modulZeichnen(el, el.getAttribute('data-nb-modul')); });
      const ein = container.querySelector('[data-nb-einstellungen]');
      if (ein) einstellungenZeichnen(ein);
    },
    neu: function (modul) { dialogOeffnen(null, modul || null); },
    oeffnen: oeffnen,
    offen: function () { return !!E; },
    // für Tests
    _intern: {
      get E() { return E; }, get W() { return W; }, get buecher() { return buecher; },
      pdfBauen: pdfBauen, kritzelOpfer: kritzelOpfer, speichern: speichern, editorSchliessen: editorSchliessen,
      werkzeugWaehlen: werkzeugWaehlen, seiteHinzufuegen: seiteHinzufuegen, pdfInsBuch: pdfInsBuch, bildEinfuegen: bildEinfuegen,
      sicherungErstellen: sicherungErstellen, sicherungEinlesen: sicherungEinlesen, buchAusPdf: buchAusPdf, alle: alle,
      zuSeite: zuSeite, skala: function () { return E ? skala() : 0; },
      driveAbgleichen: driveAbgleichen, dateiAbgleichen: dateiAbgleichen, datenZusammenfuehren: datenZusammenfuehren,
      zusammenfuehren: zusammenfuehren, loeschmarken: loeschmarken, buchLoeschen: buchLoeschen, driveCfg: driveCfg
    }
  };
})();
