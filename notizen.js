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
  const FORMATE = { a4: [595, 842], a5: [420, 595] };
  function formatGroesse(buch) { const f = FORMATE[buch && buch.format] || FORMATE.a4; return buch && buch.quer ? [f[1], f[0]] : f; }
  const LUECKE = 22, NEU_H = 96;                // Abstand zwischen Seiten, Kachel „Neue Seite“
  const LINIE = 22.7, KARO = 14.17;             // 8 mm Lineatur, 5 mm Karo
  const SCHRIFT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif';
  const COVER = [
    ['#4C8DFF', '#1E55D9'], ['#8E6BFF', '#5B33D6'], ['#FF6FAE', '#D6336F'], ['#FF6B5E', '#D33A2E'],
    ['#FFB347', '#E8840C'], ['#F4D35E', '#D4A20A'], ['#4CD07D', '#1E9A55'], ['#3CC8C8', '#138C9A'],
    ['#8A94A3', '#4A5361'], ['#3A4150', '#151820']
  ];
  const VORLAGEN_GRUPPEN = [
    ['Herkömmlich', [['blanko', 'Leer'], ['punktiert', 'Gepunktet'], ['liniert_schmal', 'Liniert schmal'], ['liniert', 'Liniert breit'], ['kariert', 'Kariert'], ['kariert_gross', 'Kariert groß']]],
    ['Schreibpapier', [['cornell', 'Cornell'], ['notizblock', 'Notizblock'], ['spalte1', 'Eine Spalte'], ['spalten3', 'Drei Spalten']]],
    ['Mathe & Technik', [['millimeter', 'Millimeter'], ['koordinaten', 'Koordinaten']]],
    ['Planung', [['todo', 'To-dos'], ['woche', 'Wochenplaner'], ['monat', 'Monatsplaner']]],
    ['Musik', [['noten', 'Notenpapier'], ['tabs', 'Gitarren-Tabs']]]
  ];
  const VORLAGEN = [].concat.apply([], VORLAGEN_GRUPPEN.map(function (g) { return g[1]; }));
  const PAPIER = { weiss: '#FFFFFF', creme: '#FBF6E8', gelb: '#FFF7CF', grau: '#ECEEF2', dunkel: '#23262F' };
  const PAPIER_NAMEN = [['weiss', 'Weiß'], ['creme', 'Creme'], ['gelb', 'Gelb'], ['grau', 'Grau'], ['dunkel', 'Dunkel']];
  // Farbpalette wie bei GoodNotes: 3 Reihen à 5
  const PALETTE = ['#1D1D1F', '#4A4A52', '#8E8E96', '#D1D1D6', '#FFFFFF',
    '#E53935', '#8E24AA', '#F4511E', '#F48FB1', '#FB8C00',
    '#1E66F5', '#1A237E', '#2E7D32', '#7CB342', '#FDD835'];
  const MARKER_PALETTE = ['#FFE14D', '#FFC94D', '#FFB35C', '#FF8A80', '#FF9ADF',
    '#C9A7FF', '#8FD3FF', '#80DEEA', '#7CF0B0', '#C6F36B',
    '#E0E0E0', '#B0BEC5', '#FFD8A8', '#B2F2BB', '#D0BFFF'];
  const TAPE_PALETTE = ['#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C', '#4DABF7',
    '#9775FA', '#F783AC', '#ADB5BD', '#868E96', '#343A40',
    '#FFC9C9', '#FFE8CC', '#FFF3BF', '#D3F9D8', '#D0EBFF'];
  const ZETTEL_PALETTE = ['#FFF3A3', '#FFE0A3', '#FFC9D9', '#E5D4FF', '#C7E8FF',
    '#C7F0C2', '#FFFFFF', '#F1F3F5', '#FFD6A5', '#CAFFBF',
    '#9BF6FF', '#BDB2FF', '#FFC6FF', '#FDFFB6', '#E9ECEF'];
  const FARBEN = PALETTE, MARKER_FARBEN = MARKER_PALETTE;
  const STIFTARTEN = ['fueller', 'kuli', 'pinsel'];
  const STIFTGRUPPE = ['fueller', 'kuli', 'pinsel', 'bleistift', 'marker', 'tape', 'formstift'];
  const STIFTE = STIFTARTEN;
  const TINTE = ['fueller', 'kuli', 'pinsel', 'bleistift', 'formstift'];
  const NAMEN = { fueller: 'Füller', kuli: 'Kugelschreiber', pinsel: 'Pinselstift', bleistift: 'Bleistift', marker: 'Textmarker', tape: 'Tape',
    formstift: 'Formstift', radierer: 'Radierer', lasso: 'Lasso', text: 'Textfeld', formen: 'Formen', zettel: 'Notizzettel', laser: 'Laserpointer',
    stift: 'Stift', bild: 'Bild', audio: 'Aufnahme' };
  const FORM_ARTEN = [['auto', 'Automatisch'], ['linie', 'Linie'], ['pfeil', 'Pfeil'], ['winkel', 'Winkelpfeil'], ['bogen', 'Bogenpfeil'],
    ['rechteck', 'Rechteck'], ['kreis', 'Kreis'], ['dreieck', 'Dreieck'], ['raute', 'Raute'], ['rund', 'Abgerundetes Rechteck']];

  const W_STANDARD = {
    wz: 'fueller', stiftArt: 'fueller', letzterStift: 'fueller', vorRadierer: 'fueller',
    farben: {
      stift: ['#1D1D1F', '#1E66F5', '#E53935'], bleistift: ['#3A3A40', '#8E8E96', '#2E7D32'], marker: ['#FFE14D', '#7CF0B0', '#FF9ADF'],
      tape: ['#FF6B6B', '#FFA94D', '#FFD43B'], formen: ['#1D1D1F', '#1E66F5', '#E53935'], zettel: ['#FFF3A3', '#FFC9D9', '#C7E8FF'],
      laser: ['#FF3B30', '#30D158', '#0A84FF']
    },
    farbe: { stift: 0, bleistift: 0, marker: 0, tape: 0, formen: 0, zettel: 0, laser: 0 },
    eigeneFarben: [],
    breiten: { fueller: [0.7, 1.5, 3.2], kuli: [0.7, 1.4, 3.0], pinsel: [1.6, 3.6, 8], bleistift: [0.8, 1.6, 3.2], marker: [8, 13, 20],
      tape: [10, 16, 24], formstift: [0.9, 1.8, 3.6], formen: [0.9, 1.8, 3.6], radierer: [7, 14, 26] },
    v: 2,
    breite: { fueller: 1, kuli: 1, pinsel: 1, bleistift: 1, marker: 1, tape: 1, formstift: 1, formen: 1, radierer: 1 },
    einst: { fueller: { sp: 0.5, dr: 0.5, st: 0 }, kuli: { st: 0 }, pinsel: { dr: 0.5, st: 0 }, bleistift: { st: 0 }, marker: { st: 0 }, formstift: { st: 0 } },
    markerGerade: false, tapeGerade: true,
    radierModus: 'standard', radierFilter: { stift: true, bleistift: true, marker: true, tape: true }, radierAuto: false,
    lassoArt: 'frei', lassoFilter: { schrift: true, bilder: true, formen: true, pfeile: true, text: true, tape: true, zettel: true },
    formArt: 'auto', formFuellen: false, formDeckkraft: 0.25,
    laserArt: 'spur',
    textGroesse: 14, textFett: false,
    finger: false, fingerTipps: true, kritzeln: true, kritzelAlles: true, umkreisen: true, formen: true, format: 'a4', ausrichten: true, horizontal: false,
    vorlage: 'liniert', papier: 'weiss',
    leiste: { lasso: true, stift: true, radierer: true, text: true, bild: true, formen: true, zettel: true, laser: true, audio: true }
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
  function istObjekt(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function verschmelzen(ziel, quelle) {
    Object.keys(ziel).forEach(function (k) {
      if (quelle[k] === undefined || quelle[k] === null) return;
      if (istObjekt(ziel[k]) && istObjekt(quelle[k])) verschmelzen(ziel[k], quelle[k]);
      else if (Array.isArray(ziel[k]) && Array.isArray(quelle[k])) { if (quelle[k].length >= ziel[k].length || k === 'eigeneFarben') ziel[k] = quelle[k].slice(); }
      else if (typeof ziel[k] === typeof quelle[k]) ziel[k] = quelle[k];
    });
  }
  function werkzeugLaden() {
    const w = kopie(W_STANDARD);
    try {
      const g = JSON.parse(localStorage.getItem(W_SCHLUESSEL) || 'null');
      if (istObjekt(g)) {
        // Einstellungen der älteren Version übernehmen
        if (Array.isArray(g.stiftFarben)) { g.farben = g.farben || {}; g.farben.stift = g.stiftFarben; g.farbe = g.farbe || {}; g.farbe.stift = g.stiftFarbe || 0; }
        if (Array.isArray(g.markerFarben)) { g.farben = g.farben || {}; g.farben.marker = g.markerFarben; g.farbe = g.farbe || {}; g.farbe.marker = g.markerFarbe || 0; }
        if (g.radierModus === 'praezise' || g.radierModus === 'marker') g.radierModus = 'standard';
        // Version 2: neue, deutlicher abgestufte Stiftstärken
        if (g.v !== 2 && istObjekt(g.breiten)) TINTE.concat(['formen']).forEach(function (k) { delete g.breiten[k]; });
        verschmelzen(w, g);
      }
    } catch (e) { /* Standard behalten */ }
    if (!NAMEN[w.wz] || w.wz === 'stift' || w.wz === 'bild' || w.wz === 'audio') w.wz = 'fueller';
    if (STIFTARTEN.indexOf(w.stiftArt) < 0) w.stiftArt = 'fueller';
    if (STIFTGRUPPE.indexOf(w.letzterStift) < 0) w.letzterStift = 'fueller';
    Object.keys(w.farbe).forEach(function (g) { w.farbe[g] = grenze(w.farbe[g] | 0, 0, w.farben[g].length - 1); });
    return w;
  }
  function farbGruppe(wz) {
    if (wz === 'bleistift' || wz === 'marker' || wz === 'tape' || wz === 'formen' || wz === 'zettel' || wz === 'laser') return wz;
    return 'stift';
  }
  function paletteFuer(g) { return g === 'marker' ? MARKER_PALETTE : g === 'tape' ? TAPE_PALETTE : g === 'zettel' ? ZETTEL_PALETTE : PALETTE; }
  function aktuelleFarbe(wz) { const g = farbGruppe(wz); return W.farben[g][W.farbe[g]]; }
  function einst(wz) { return W.einst[wz] || {}; }
  function hauptWerkzeug(wz) { return STIFTGRUPPE.indexOf(wz) >= 0 ? 'stift' : wz; }
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
  let ordnerOffen = null, suchText = '';
  let bibModus = (function () { try { return localStorage.getItem('schulplaner.notizen.ansicht') === 'ordner' ? 'ordner' : 'faecher'; } catch (e) { return 'faecher'; } })();
  function ordnerListe() {
    const m = new Set();
    buecher.forEach(function (b) { if (b.ordner) m.add(b.ordner); });
    return Array.from(m).sort(function (a, b) { return a.localeCompare(b, 'de', { numeric: true }); });
  }

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
      id: uid(), buch: buch.id, b: o.b || formatGroesse(buch)[0], h: o.h || formatGroesse(buch)[1],
      v: o.v || buch.vorlage || 'liniert', papier: o.papier || buch.papier || 'weiss',
      hg: o.hg || null, striche: [], texte: [], bilder: [], erstellt: jetzt(), g: jetzt(),
      pdfText: o.pdfText ? String(o.pdfText).slice(0, 30000) : undefined
    };
  }
  async function buchAnlegen(daten) {
    const b = {
      id: uid(), titel: daten.titel || 'Notizbuch', modul_id: daten.modul_id || null,
      cover: daten.cover || 0, vorlage: daten.vorlage || 'liniert', papier: daten.papier || 'weiss',
      format: FORMATE[daten.format] ? daten.format : 'a4', ordner: String(daten.ordner || '').trim(), quer: !!daten.quer,
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
      (buch.aufnahmen || []).forEach(function (a) { benutzt.add(a.d); });
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

  /* Druckkurve: normaler Schreibdruck (≈ 0,3) ergibt genau die eingestellte Stärke */
  function druckFaktor(wz, d, dr) {
    d = grenze(d, 0, 1);
    if (wz === 'pinsel') return Math.max(0.12, 1 + (0.15 + 1.55 * Math.sqrt(d) - 1) * dr * 2);
    return Math.max(0.3, 1 + (0.45 + Math.sqrt(d) - 1) * dr * 2);
  }
  function breitenFuer(p, wz, b, sp, dr) {
    sp = sp == null ? 0.5 : sp; dr = dr == null ? 0.5 : dr;
    const n = p.length / 3, W2 = new Array(n);
    for (let i = 0; i < n; i++) {
      let w = b * druckFaktor(wz, p[i * 3 + 2], dr);
      if (wz === 'fueller' && i > 0) {                 // schnelle Züge werden etwas schmaler
        const v = Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2]);
        w *= 1 - Math.min(0.25 * sp, v / (b * 14));
      }
      W2[i] = w;
    }
    for (let i = 1; i < n; i++) W2[i] = W2[i - 1] * 0.6 + W2[i] * 0.4;
    return W2;
  }
  function laenge(p) {
    let l = 0;
    for (let i = 3; i < p.length; i += 3) l += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]);
    return l;
  }
  /* Mittellinie gleichmäßig neu abtasten und leicht glätten.
     Dichte, zittrige Stiftpunkte (Apple Pencil schreibt mit 240 Hz) würden sonst Löcher und Zacken erzeugen. */
  function mittellinie(p, W2, abstand) {
    const n = p.length / 3, xs = [p[0]], ys = [p[1]], ws = [W2 ? W2[0] : 0];
    let rest = 0;
    for (let i = 1; i < n; i++) {
      const ax = p[i * 3 - 3], ay = p[i * 3 - 2], bx = p[i * 3], by = p[i * 3 + 1];
      const seg = Math.hypot(bx - ax, by - ay);
      if (seg < 1e-6) continue;
      let t = abstand - rest;
      while (t <= seg) {
        const f = t / seg;
        xs.push(ax + (bx - ax) * f); ys.push(ay + (by - ay) * f);
        ws.push(W2 ? W2[i - 1] + (W2[i] - W2[i - 1]) * f : 0);
        t += abstand;
      }
      rest = seg - (t - abstand);
    }
    const e = n - 1, m = xs.length;
    if (m > 1 && rest < abstand * 0.35) { xs[m - 1] = p[e * 3]; ys[m - 1] = p[e * 3 + 1]; ws[m - 1] = W2 ? W2[e] : 0; }
    else { xs.push(p[e * 3]); ys.push(p[e * 3 + 1]); ws.push(W2 ? W2[e] : 0); }
    for (let k = 0; k < 2; k++) {                     // [1,2,1]-Glättung, Endpunkte bleiben
      for (let i = 1, px = xs[0], py = ys[0]; i < xs.length - 1; i++) {
        const x = xs[i], y = ys[i];
        xs[i] = (px + 2 * x + xs[i + 1]) / 4; ys[i] = (py + 2 * y + ys[i + 1]) / 4;
        px = x; py = y;
      }
    }
    return { x: xs, y: ys, w: ws };
  }
  function glattePfad(xs, ys, pfad) {                // Kurve durch die Mittelpunkte
    const n = xs.length;
    pfad.moveTo(xs[0], ys[0]);
    if (n === 1) { pfad.lineTo(xs[0] + 0.01, ys[0]); return pfad; }
    for (let i = 1; i < n - 1; i++) pfad.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
    pfad.lineTo(xs[n - 1], ys[n - 1]);
    return pfad;
  }
  /* Stifte mit gleichmäßiger Strichstärke (Kugelschreiber, Bleistift, Formstift):
     als Linie mit runden Enden gezeichnet – immer vollständig gefüllt */
  function gleichPfad(p) {
    const n = p.length / 3, pfad = new Path2D();
    if (!n) return pfad;
    if (n === 1 || laenge(p) < 0.4) { pfad.moveTo(p[0], p[1]); pfad.lineTo(p[0] + 0.01, p[1]); return pfad; }
    const m = mittellinie(p, null, 0.6);
    return glattePfad(m.x, m.y, pfad);
  }
  /* Umriss eines Teilstücks [a..e] mit runden Enden (alle Teile haben dieselbe Umlaufrichtung) */
  function umrissTeil(pfad, X, Y, B, a, e) {
    if (e - a < 1) { pfad.moveTo(X[a] + B[a] / 2, Y[a]); pfad.arc(X[a], Y[a], B[a] / 2, 0, Math.PI * 2); return; }
    const L = [], R = [];
    let nx = 0, ny = 1;
    for (let i = a; i <= e; i++) {
      const v = i > a ? i - 1 : i, h = i < e ? i + 1 : i;
      const dx = X[h] - X[v], dy = Y[h] - Y[v], l = Math.hypot(dx, dy);
      if (l > 1e-6) { nx = -dy / l; ny = dx / l; }
      const hw = B[i] / 2;
      L.push(X[i] + nx * hw, Y[i] + ny * hw); R.push(X[i] - nx * hw, Y[i] - ny * hw);
    }
    const n = e - a + 1;
    pfad.moveTo(L[0], L[1]);
    for (let i = 1; i < n - 1; i++) pfad.quadraticCurveTo(L[i * 2], L[i * 2 + 1], (L[i * 2] + L[i * 2 + 2]) / 2, (L[i * 2 + 1] + L[i * 2 + 3]) / 2);
    pfad.lineTo(L[(n - 1) * 2], L[(n - 1) * 2 + 1]);
    const aL = Math.atan2(L[(n - 1) * 2 + 1] - Y[e], L[(n - 1) * 2] - X[e]);
    pfad.arc(X[e], Y[e], B[e] / 2, aL, aL - Math.PI, true);
    for (let i = n - 2; i > 0; i--) pfad.quadraticCurveTo(R[i * 2], R[i * 2 + 1], (R[i * 2] + R[i * 2 - 2]) / 2, (R[i * 2 + 1] + R[i * 2 - 1]) / 2);
    pfad.lineTo(R[0], R[1]);
    const aR = Math.atan2(R[1] - Y[a], R[0] - X[a]);
    pfad.arc(X[a], Y[a], B[a] / 2, aR, aR - Math.PI, true);
    pfad.closePath();
  }
  /* Füller und Pinselstift: Breite folgt Druck und Tempo */
  function tintenPfad(p, wz, b, sp, dr) {
    const n = p.length / 3, pfad = new Path2D();
    if (!n) return pfad;
    sp = sp == null ? 0.5 : sp;
    const W2 = breitenFuer(p, wz, b, sp, dr);
    if (n === 1 || laenge(p) < 0.6) {
      let r = 0;
      for (let i = 0; i < n; i++) r = Math.max(r, W2[i]);
      pfad.arc(p[0], p[1], r / 2, 0, Math.PI * 2);
      return pfad;
    }
    const abstand = Math.max(0.4, b * 0.5);
    const m = mittellinie(p, W2, abstand), X = m.x, Y = m.y, B = m.w, k = X.length;
    // Spitze ausdünnen (Füller am Ende, Pinsel an beiden Enden)
    const auslauf = wz === 'pinsel' ? b * 3 : b * (1.5 + 3 * sp);
    let s = 0;
    for (let i = k - 1; i > 0 && s < auslauf; i--) { B[i] *= 0.5 + 0.5 * s / auslauf; s += Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]); }
    if (wz === 'pinsel' || sp > 0.6) {
      s = 0;
      for (let i = 0; i < k - 1 && s < auslauf; i++) { B[i] *= 0.5 + 0.5 * s / auslauf; s += Math.hypot(X[i + 1] - X[i], Y[i + 1] - Y[i]); }
    }
    for (let i = 0; i < k; i++) B[i] = Math.max(B[i], 0.25);
    // an scharfen Knicken teilen – sonst faltet sich der Umriss und es entstehen Löcher
    let a = 0;
    for (let i = 1; i < k - 1; i++) {
      const w1 = Math.atan2(Y[i] - Y[i - 1], X[i] - X[i - 1]), w2 = Math.atan2(Y[i + 1] - Y[i], X[i + 1] - X[i]);
      let dw = Math.abs(w2 - w1); if (dw > Math.PI) dw = 2 * Math.PI - dw;
      const seg = Math.min(Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]), Math.hypot(X[i + 1] - X[i], Y[i + 1] - Y[i]));
      if (dw > 0.85 * seg / (B[i] / 2) && dw > 0.35) { umrissTeil(pfad, X, Y, B, a, i); a = i; }
    }
    umrissTeil(pfad, X, Y, B, a, k - 1);
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
  function eckPfad(p, zu) {                          // gerade Verbindungen (Formen)
    const pf = new Path2D(), n = p.length / 3;
    if (!n) return pf;
    pf.moveTo(p[0], p[1]);
    for (let i = 1; i < n; i++) pf.lineTo(p[i * 3], p[i * 3 + 1]);
    if (n === 1) pf.lineTo(p[0] + 0.01, p[1]);
    if (zu) pf.closePath();
    return pf;
  }
  function kopfPfad(p, b, amAnfang) {                 // Pfeilspitze
    const n = p.length / 3;
    if (n < 2) return null;
    let ax, ay, bx, by;
    if (amAnfang) { bx = p[0]; by = p[1]; ax = p[3]; ay = p[4]; }
    else { bx = p[(n - 1) * 3]; by = p[(n - 1) * 3 + 1]; ax = p[(n - 2) * 3]; ay = p[(n - 2) * 3 + 1]; }
    // bei Bögen weiter zurückgehen, damit die Richtung stimmt
    if (n > 6) {
      const k = amAnfang ? 3 : n - 4;
      ax = p[k * 3]; ay = p[k * 3 + 1];
    }
    const w = Math.atan2(by - ay, bx - ax), l = Math.max(7, b * 4.2), o = 0.45;
    const pf = new Path2D();
    pf.moveTo(bx + Math.cos(w) * b * 0.6, by + Math.sin(w) * b * 0.6);
    pf.lineTo(bx - Math.cos(w - o) * l, by - Math.sin(w - o) * l);
    pf.lineTo(bx - Math.cos(w) * l * 0.72, by - Math.sin(w) * l * 0.72);
    pf.lineTo(bx - Math.cos(w + o) * l, by - Math.sin(w + o) * l);
    pf.closePath();
    return pf;
  }
  const GLEICH = { kuli: 1, bleistift: 1, formstift: 1 };     // Stifte mit gleichmäßiger Strichstärke
  function pfad(st) {
    let x = PFADE.get(st);
    if (!x) {
      if (st.w === 'marker' || st.w === 'tape') x = linienPfad(st.p);
      else if (st.w === 'form') x = eckPfad(st.p, !!st.z);
      else if (GLEICH[st.w]) x = gleichPfad(st.p);
      else x = tintenPfad(st.p, st.w, st.b, st.sp, st.dr);
      PFADE.set(st, x);
    }
    return x;
  }
  const KORN = new Map();
  function hexRgb(h) {
    const m = String(h || '').replace('#', '');
    const v = m.length === 3 ? m.split('').map(function (c) { return c + c; }).join('') : m.padEnd(6, '0');
    return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0];
  }
  function kornKachel(farbe) {
    let c = KORN.get(farbe);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), img = x.createImageData(64, 64), rgb = hexRgb(farbe);
      let saat = 1234567;
      const zufall = function () { saat = (saat * 16807) % 2147483647; return saat / 2147483647; };
      for (let i = 0; i < 64 * 64; i++) {
        const z = zufall();
        img.data[i * 4] = rgb[0]; img.data[i * 4 + 1] = rgb[1]; img.data[i * 4 + 2] = rgb[2];
        img.data[i * 4 + 3] = z < 0.16 ? 0 : Math.round(110 + zufall() * 145);
      }
      x.putImageData(img, 0, 0);
      KORN.set(farbe, c);
    }
    return c;
  }
  function kornMuster(ctx, farbe) {
    try {
      const m = ctx.createPattern(kornKachel(farbe), 'repeat');
      if (m && m.setTransform && typeof DOMMatrix === 'function') m.setTransform(new DOMMatrix().scale(0.3));
      return m || farbe;
    } catch (e) { return farbe; }
  }
  /* Einen Strich malen – gemeinsam für Seite, Live-Ebene, Vorschau und PDF */
  /* auf dunklem Papier wird sehr dunkle Tinte automatisch hell dargestellt */
  const TINTE_HELL = {};
  function tinte(f, o) {
    if (!o || !o.dunkel || !f) return f;
    if (TINTE_HELL[f] !== undefined) return TINTE_HELL[f] || f;
    const m = /^#([0-9a-f]{6})$/i.exec(f);
    let r = null;
    if (m) {
      const n = parseInt(m[1], 16), R = n >> 16 & 255, G = n >> 8 & 255, B = n & 255;
      const l = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
      if (l < 0.22) r = '#F2F2F7';
      else if (l < 0.4) r = '#' + [R, G, B].map(function (c) { return Math.min(255, Math.round(c + (255 - c) * 0.45)).toString(16).padStart(2, '0'); }).join('');
    }
    TINTE_HELL[f] = r || '';
    return r || f;
  }
  function strichMalen(ctx, st, o) {
    const F = tinte(st.f, o);
    if (st.w === 'marker') {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = F; ctx.lineWidth = st.b;
      if (o && o.dunkel) { ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.42; ctx.stroke(pfad(st)); ctx.restore(); return; }
      ctx.stroke(pfad(st)); return;
    }
    if (st.w === 'tape') {
      const offen = o && o.tapeOffen && o.tapeOffen.has(st.id);
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = st.b; ctx.strokeStyle = F;
      if (offen) { ctx.globalAlpha = 0.18; ctx.stroke(pfad(st)); }
      else {
        ctx.stroke(pfad(st));
        ctx.globalAlpha = 0.22; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = st.b * 0.28; ctx.stroke(pfad(st));
      }
      ctx.restore(); return;
    }
    if (st.w === 'form') {
      const pf = pfad(st);
      if (st.fu && st.z) { ctx.save(); ctx.globalAlpha = st.fo == null ? 0.25 : st.fo; ctx.fillStyle = tinte(st.fu, o); ctx.fill(pf); ctx.restore(); }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = F; ctx.lineWidth = st.b; ctx.stroke(pf);
      if (st.k) {
        ctx.fillStyle = F;
        const k1 = kopfPfad(st.p, st.b, false); if (k1) ctx.fill(k1);
        if (st.k === 2) { const k2 = kopfPfad(st.p, st.b, true); if (k2) ctx.fill(k2); }
      }
      return;
    }
    if (GLEICH[st.w]) {
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = st.b;
      if (st.w === 'bleistift') { ctx.globalAlpha = st.a || 0.88; ctx.strokeStyle = kornMuster(ctx, F); }
      else ctx.strokeStyle = F;
      ctx.stroke(pfad(st)); ctx.restore(); return;
    }
    ctx.fillStyle = F; ctx.fill(pfad(st));
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
      let h = st.b * (st.w === 'pinsel' ? 1 : 0.8);
      if (st.w === 'marker' || st.w === 'tape') h = st.b / 2 + 1;
      if (st.w === 'form') h = st.b + (st.k ? Math.max(7, st.b * 4.2) : 0);
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
    if (!W.kritzeln || TINTE.indexOf(st.w) < 0 || !seite.striche.length) return null;
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
      if (!W.kritzelAlles && TINTE.indexOf(a.w) < 0) return;
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
  function radierGruppe(w) {
    if (w === 'bleistift') return 'bleistift';
    if (w === 'marker') return 'marker';
    if (w === 'tape') return 'tape';
    return 'stift';
  }
  function radieren(seite, x, y, r) {
    const modus = W.radierModus, filter = W.radierFilter || {};
    let geaendert = false;
    const neu = [];
    seite.striche.forEach(function (st) {
      if (filter[radierGruppe(st.w)] === false) { neu.push(st); return; }
      const rr = r + st.b / 2, bb = rahmen(st);
      if (x < bb.x0 - rr || x > bb.x1 + rr || y < bb.y0 - rr || y > bb.y1 + rr) { neu.push(st); return; }
      const p = st.p, n = p.length / 3, rr2 = rr * rr;
      if (modus === 'strich' || st.w === 'form' || st.w === 'tape') {
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
        if (t.length >= 6) { const k = Object.assign({}, st, { id: uid(), p: t }); neu.push(k); }
      });
    });
    if (geaendert) seite.striche = neu;
    return geaendert;
  }

  /* ============================================================
     Zeichnen einer Seite (Bildschirm, Vorschau, PDF)
     ============================================================ */
  function papierFarbe(seite) { return PAPIER[seite.papier] || PAPIER.weiss; }
  function istDunklesPapier(seite) { return seite.papier === 'dunkel' || seite.papier === 'schwarz'; }
  function zeichneVorlage(ctx, seite, ppu) {
    const b = seite.b, h = seite.h, lw = Math.max(0.25, 0.9 / ppu), dunkel = istDunklesPapier(seite);
    const LIN = dunkel ? '#4A5064' : '#C4D3EC', GITTER = dunkel ? '#3E4354' : '#D3DBE7', PUNKT = dunkel ? '#5A6075' : '#AEB8C6',
      STARK = dunkel ? '#6A7290' : '#9DB3D8', ROT = dunkel ? '#8A4B57' : '#F2A9A9', TXT = dunkel ? '#8A90A6' : '#8E99AE';
    const v = seite.v;
    ctx.lineWidth = lw;
    const linien = function (y0, y1, abstand, x0, x1) {
      ctx.beginPath();
      for (let y = y0; y < y1; y += abstand) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
    };
    const gitter = function (abstand, farbe, x0, y0, x1, y1) {
      ctx.strokeStyle = farbe; ctx.beginPath();
      const ox = x0 + ((x1 - x0) % abstand) / 2, oy = y0 + ((y1 - y0) % abstand) / 2;
      for (let x = ox; x <= x1 + 0.01; x += abstand) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = oy; y <= y1 + 0.01; y += abstand) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
    };
    const beschriftung = function (text, x, y, g) {
      ctx.save(); ctx.fillStyle = TXT; ctx.font = '600 ' + (g || 7) + 'px ' + SCHRIFT; ctx.fillText(text, x, y); ctx.restore();
    };
    const rand = b < 500 ? 46 : 70;
    if (v === 'liniert' || v === 'liniert_schmal') {
      ctx.strokeStyle = LIN; linien(v === 'liniert' ? 86 : 72, h - 30, v === 'liniert' ? LINIE : 17, 0, b);
      ctx.strokeStyle = ROT; ctx.beginPath(); ctx.moveTo(rand, 0); ctx.lineTo(rand, h); ctx.stroke();
    } else if (v === 'kariert') gitter(KARO, GITTER, 0, 0, b, h);
    else if (v === 'kariert_gross') gitter(KARO * 2, GITTER, 0, 0, b, h);
    else if (v === 'millimeter') {
      gitter(2.835, dunkel ? '#2F3342' : '#EBEFF5', 0, 0, b, h);
      gitter(14.17, GITTER, 0, 0, b, h);
      ctx.lineWidth = lw * 1.6; gitter(28.35, STARK, 0, 0, b, h); ctx.lineWidth = lw;
    } else if (v === 'punktiert') {
      ctx.fillStyle = PUNKT;
      const r = Math.max(0.55, 1.1 / ppu), ox = (b % KARO) / 2, oy = (h % KARO) / 2;
      ctx.beginPath();
      for (let x = ox; x <= b; x += KARO) {
        for (let y = oy; y <= h; y += KARO) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      }
      ctx.fill();
    } else if (v === 'cornell') {
      const kopf = 95, fuss = h - 160, links = Math.min(170, b * 0.29);
      ctx.strokeStyle = LIN; linien(kopf + LINIE, fuss - 4, LINIE, links, b - 20);
      ctx.strokeStyle = STARK; ctx.lineWidth = lw * 1.8; ctx.beginPath();
      ctx.moveTo(20, kopf); ctx.lineTo(b - 20, kopf);
      ctx.moveTo(links, kopf); ctx.lineTo(links, fuss);
      ctx.moveTo(20, fuss); ctx.lineTo(b - 20, fuss);
      ctx.stroke();
      beschriftung('STICHWORTE', 24, kopf + 14); beschriftung('NOTIZEN', links + 6, kopf + 14); beschriftung('ZUSAMMENFASSUNG', 24, fuss + 14);
    } else if (v === 'notizblock') {
      ctx.fillStyle = dunkel ? '#2C3140' : '#EEF3FB'; ctx.fillRect(0, 0, b, 64);
      ctx.strokeStyle = STARK; ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(b, 64); ctx.stroke();
      beschriftung('THEMA', 20, 26); beschriftung('DATUM', b - 120, 26);
      ctx.strokeStyle = LIN; linien(64 + LINIE, h - 30, LINIE, 20, b - 20);
    } else if (v === 'spalte1') {
      ctx.strokeStyle = STARK; ctx.lineWidth = lw * 1.6; ctx.beginPath(); ctx.moveTo(30, 70); ctx.lineTo(b - 30, 70); ctx.stroke(); ctx.lineWidth = lw;
      beschriftung('DATUM', 30, 60);
      ctx.strokeStyle = LIN; linien(70 + LINIE, h - 40, LINIE, 30, b - 30);
    } else if (v === 'spalten3') {
      const spalte = (b - 60) / 3;
      ctx.strokeStyle = LIN;
      for (let k = 0; k < 3; k++) linien(90, h - 40, LINIE, 30 + k * spalte + 6, 30 + (k + 1) * spalte - 6);
      ctx.strokeStyle = STARK; ctx.beginPath();
      for (let k = 1; k < 3; k++) { ctx.moveTo(30 + k * spalte, 70); ctx.lineTo(30 + k * spalte, h - 40); }
      ctx.moveTo(30, 70); ctx.lineTo(b - 30, 70); ctx.stroke();
    } else if (v === 'todo') {
      beschriftung('TO-DOS', 30, 58, 10);
      ctx.strokeStyle = STARK; ctx.beginPath(); ctx.moveTo(30, 68); ctx.lineTo(b - 30, 68); ctx.stroke();
      ctx.strokeStyle = LIN;
      for (let y = 68 + 30; y < h - 40; y += 30) {
        ctx.beginPath(); ctx.moveTo(56, y); ctx.lineTo(b - 30, y); ctx.stroke();
        ctx.strokeRect(32, y - 16, 12, 12);
      }
    } else if (v === 'woche') {
      const tage = ['MONTAG', 'DIENSTAG', 'MITTWOCH', 'DONNERSTAG', 'FREITAG', 'SAMSTAG', 'SONNTAG', 'NOTIZEN'];
      const kw = (b - 60) / 2, kh = (h - 100) / 4;
      beschriftung('WOCHE', 30, 52, 11);
      ctx.strokeStyle = STARK;
      for (let k = 0; k < 8; k++) {
        const x = 30 + (k % 2) * kw, y = 70 + Math.floor(k / 2) * kh;
        ctx.strokeRect(x, y, kw, kh); beschriftung(tage[k], x + 8, y + 14);
        ctx.save(); ctx.strokeStyle = LIN; linien(y + 22 + LINIE * 0.8, y + kh - 4, LINIE * 0.8, x + 8, x + kw - 8); ctx.restore();
      }
    } else if (v === 'monat') {
      const tage = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'], kw = (b - 60) / 7, kh = (h - 130) / 6;
      beschriftung('MONAT', 30, 52, 11);
      ctx.strokeStyle = STARK;
      tage.forEach(function (t, k) { beschriftung(t, 30 + k * kw + 6, 84); });
      for (let r = 0; r < 6; r++) for (let k = 0; k < 7; k++) ctx.strokeRect(30 + k * kw, 92 + r * kh, kw, kh);
    } else if (v === 'noten' || v === 'tabs') {
      const zeilen = v === 'noten' ? 5 : 6, abst = v === 'noten' ? 6.2 : 7.5, block = (zeilen - 1) * abst, frei = v === 'noten' ? 34 : 38;
      ctx.strokeStyle = dunkel ? '#7A8098' : '#5E6678';
      for (let y = 70; y + block < h - 40; y += block + frei) {
        ctx.beginPath();
        for (let z = 0; z < zeilen; z++) { ctx.moveTo(30, y + z * abst); ctx.lineTo(b - 30, y + z * abst); }
        ctx.moveTo(30, y); ctx.lineTo(30, y + block); ctx.moveTo(b - 30, y); ctx.lineTo(b - 30, y + block);
        ctx.stroke();
        if (v === 'tabs') { ctx.save(); ctx.fillStyle = TXT; ctx.font = '700 7px ' + SCHRIFT; ['T', 'A', 'B'].forEach(function (c, z) { ctx.fillText(c, 34, y + 13 + z * 11); }); ctx.restore(); }
      }
    } else if (v === 'koordinaten') {
      gitter(KARO, GITTER, 0, 0, b, h);
      const cx = Math.round(b / 2 / KARO) * KARO + (b % KARO) / 2, cy = Math.round(h / 2 / KARO) * KARO + (h % KARO) / 2;
      ctx.strokeStyle = dunkel ? '#A8AEC4' : '#55607A'; ctx.lineWidth = lw * 2; ctx.beginPath();
      ctx.moveTo(14, cy); ctx.lineTo(b - 14, cy); ctx.moveTo(cx, h - 14); ctx.lineTo(cx, 14);
      ctx.moveTo(b - 20, cy - 4); ctx.lineTo(b - 14, cy); ctx.lineTo(b - 20, cy + 4);
      ctx.moveTo(cx - 4, 20); ctx.lineTo(cx, 14); ctx.lineTo(cx + 4, 20);
      ctx.stroke(); ctx.lineWidth = lw;
      beschriftung('x', b - 22, cy + 14, 9); beschriftung('y', cx + 6, 24, 9);
    }
  }
  /* kleine Vorschau einer Vorlage (für Galerie und Menü) */
  function vorlageVorschau(c, v, papier, quer, format) {
    const g = FORMATE[format] || FORMATE.a4, b = quer ? g[1] : g[0], h = quer ? g[0] : g[1];
    const B = c.clientWidth || 70, k = B / b, dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(B * dpr); c.height = Math.round(h * k * dpr);
    c.style.height = 'auto';
    const ctx = c.getContext('2d');
    ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    const s = { b: b, h: h, v: v, papier: papier };
    ctx.fillStyle = papierFarbe(s); ctx.fillRect(0, 0, b, h);
    zeichneVorlage(ctx, s, k * dpr);
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
  function zeichneTextFeld(ctx, t, o) {
    if (t.bg) {
      ctx.save();
      ctx.font = (t.fett ? '700 ' : '400 ') + t.g + 'px ' + SCHRIFT;
      const zeilenZ = t.text ? zeilenUmbrechen(ctx, t.text, Math.max(10, t.w - 20)).length : 0;
      const hoehe = Math.max(t.zh || 150, zeilenZ * t.g * 1.3 + 20);
      ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.fillStyle = t.bg; ctx.fillRect(t.x, t.y, t.w, hoehe);
      ctx.restore();
    }
    if (!t.text) return;
    ctx.save();
    ctx.font = (t.fett ? '700 ' : '400 ') + t.g + 'px ' + SCHRIFT;
    ctx.fillStyle = t.bg ? t.f : tinte(t.f, o);
    ctx.textBaseline = 'alphabetic';
    const pad = t.bg ? 10 : 5;
    const zh = t.g * 1.3, links = t.x + pad, innen = Math.max(10, t.w - pad * 2);
    const zeilen = zeilenUmbrechen(ctx, t.text, innen);
    zeilen.forEach(function (z, i) { ctx.fillText(z, links, t.y + (t.bg ? 8 : 3) + zh * i + (zh + t.g * 0.72) / 2); });
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
      if (im) bildMalen(ctx, im, 0, 0, seite.b, seite.h, seite.hgRot || 0);
    } else zeichneVorlage(ctx, seite, ppu);
    const sicht = o.sicht;
    seite.bilder.forEach(function (bi) {
      if (verst && verst.has(bi.id)) return;
      const im = o.bildHolen ? o.bildHolen(bi.d) : bild(bi.d);
      if (im) bildMalen(ctx, im, bi.x, bi.y, bi.w, bi.h, bi.r || 0);
      else { ctx.fillStyle = 'rgba(120,130,150,.15)'; ctx.fillRect(bi.x, bi.y, bi.w, bi.h); }
    });
    const sichtbar = function (st) {
      if (verst && verst.has(st.id)) return false;
      if (!sicht) return true;
      const r = rahmen(st);
      return !(r.x1 < sicht.x0 || r.x0 > sicht.x1 || r.y1 < sicht.y0 || r.y0 > sicht.y1);
    };
    const oS = Object.assign({}, o, { dunkel: istDunklesPapier(seite) });
    ctx.globalCompositeOperation = 'multiply';
    seite.striche.forEach(function (st) { if (st.w === 'marker' && sichtbar(st)) strichMalen(ctx, st, oS); });
    ctx.globalCompositeOperation = 'source-over';
    seite.striche.forEach(function (st) { if (st.w !== 'marker' && st.w !== 'tape' && sichtbar(st)) strichMalen(ctx, st, oS); });
    if (o.mitText) seite.texte.forEach(function (t) { zeichneTextFeld(ctx, t, oS); });
    seite.striche.forEach(function (st) { if (st.w === 'tape' && sichtbar(st)) strichMalen(ctx, st, oS); });
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
    if (E.anim) animSchritt(t);
    const p = E.planen;
    E.planen = {};
    if (p.haupt) zeichneHaupt();
    if (p.live) zeichneLive();
    if (p.text || p.haupt) textSync();
    if (p.haupt && E.lineal) linealSync();
    if (p.haupt) seitenzahlAktualisieren();
    if (E.traegheit || E.anim) plane('haupt', 'live', 'text');
  }

  /* ---------- Layout und Kamera ---------- */
  function layout() {
    E.horiz = !!W.horizontal;
    let refB = SEITE_B, refH = SEITE_H;
    E.seiten.forEach(function (s) { refB = Math.max(refB, s.b); refH = Math.max(refH, s.h); });
    E.refB = refB; E.refH = refH;
    let p = 0;
    E.pos = E.seiten.map(function (s) {
      let r;
      if (E.horiz) { r = { x: p, y: (refH - s.h) / 2, b: s.b, h: s.h }; p += s.b + LUECKE * 2; }
      else { r = { x: (refB - s.b) / 2, y: p, b: s.b, h: s.h }; p += s.h + LUECKE; }
      return r;
    });
    if (E.horiz) { E.gesamtB = p; E.gesamtH = refH; } else { E.gesamtH = p; E.gesamtB = refB; }
  }
  function rand() { return E.vw < 600 ? 10 : 28; }
  function passung() {
    if (E.horiz) return Math.max(0.05, Math.min((E.vw - 2 * rand()) / E.refB, (E.vh - 2 * rand()) / E.refH));
    return Math.max(0.05, (E.vw - 2 * rand()) / E.refB);
  }
  function skala() { return passung() * E.zoom; }
  function welt(sx, sy) { const s = skala(); return { x: sx / s + E.cam.x, y: sy / s + E.cam.y }; }
  function kameraBegrenzen() {
    const s = skala(), pad = rand();
    if (E.horiz) {
      const ch = E.refH * s;
      if (ch + 2 * pad <= E.vh) E.cam.y = -(E.vh - ch) / 2 / s;
      else E.cam.y = grenze(E.cam.y, -pad / s, E.refH - (E.vh - pad) / s);
      const minX = -pad / s, maxX = Math.max(minX, E.gesamtB + NEU_H - (E.vw - pad) / s);
      E.cam.x = grenze(E.cam.x, minX, maxX);
      return;
    }
    const cw = E.refB * s;
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
    if (E.horiz) { const h = Math.min(E.refH, SEITE_H) * 0.6; return { x: E.gesamtB, y: (E.refH - h) / 2, b: NEU_H - 18, h: h }; }
    const b = Math.min(E.refB, SEITE_B);
    return { x: (E.refB - b) / 2, y: E.gesamtH, b: b, h: NEU_H - 18 };
  }
  function inKachel(w) {
    const k = kachelRahmen();
    return w.x >= k.x && w.x <= k.x + k.b && w.y >= k.y && w.y <= k.y + k.h;
  }
  function aktuelleSeite() {
    const s = skala(), mx = E.cam.x + E.vw / 2 / s, my = E.cam.y + E.vh / 2 / s;
    let beste = 0, abst = Infinity;
    E.pos.forEach(function (r, i) {
      const m = E.horiz ? mx : my, a = E.horiz ? r.x : r.y, l = E.horiz ? r.b : r.h;
      const d = m < a ? a - m : (m > a + l ? m - a - l : 0);
      if (d < abst) { abst = d; beste = i; }
    });
    return beste;
  }
  function zuSeite(i) {
    i = grenze(i, 0, E.seiten.length - 1);
    const s = skala();
    if (E.horiz) E.cam.x = E.pos[i].x + E.pos[i].b / 2 - E.vw / 2 / s;
    else E.cam.y = E.pos[i].y - 16 / s;
    kameraBegrenzen();
    planeAlles();
  }
  function seiteSichtbarMachen(i) {
    const r = E.pos[i], s = skala();
    if (!r) return;
    if (E.horiz) {
      const l = (r.x - E.cam.x) * s, re = (r.x + r.b - E.cam.x) * s;
      if (re < 0 || l > E.vw) zuSeite(i);
      return;
    }
    const oben = (r.y - E.cam.y) * s, unten = (r.y + r.h - E.cam.y) * s;
    if (unten < 0 || oben > E.vh) zuSeite(i);
  }
  /* seitenweises Blättern: nach dem Wischen sanft zur nächsten Seite */
  function seiteEinrasten(richtung) {
    let i = aktuelleSeite();
    if (richtung > 0) i = Math.min(E.seiten.length - 1, i + 1);
    else if (richtung < 0) i = Math.max(0, i - 1);
    const s = skala(), ziel = E.pos[i].x + E.pos[i].b / 2 - E.vw / 2 / s;
    E.anim = { von: E.cam.x, nach: ziel, t0: performance.now(), dauer: 260 };
    plane('haupt');
  }
  function animSchritt(t) {
    const a = E.anim, u = grenze((t - a.t0) / a.dauer, 0, 1), e = 1 - Math.pow(1 - u, 3);
    E.cam.x = a.von + (a.nach - a.von) * e;
    kameraBegrenzen();
    if (u >= 1) E.anim = null;
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
    const y0 = E.cam.y, y1 = E.cam.y + E.vh / s, x0 = E.cam.x, x1 = E.cam.x + E.vw / s;
    const dunkel = document.documentElement.getAttribute('data-thema') === 'dunkel';
    for (let i = 0; i < E.seiten.length; i++) {
      const r = E.pos[i];
      if (r.y > y1 || r.y + r.h < y0 || r.x > x1 || r.x + r.b < x0) continue;
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
      zeichneSeite(ctx, seite, d * s, { versteckt: E.versteckt, sicht: sicht, tapeOffen: E.tapeOffen });
      if (seite.lz) {
        ctx.setTransform(d, 0, 0, d, 0, 0);
        const bx = ox + r.b * s - 38, bh = 30;
        ctx.beginPath(); ctx.moveTo(bx, oy); ctx.lineTo(bx + 18, oy); ctx.lineTo(bx + 18, oy + bh); ctx.lineTo(bx + 9, oy + bh - 7); ctx.lineTo(bx, oy + bh); ctx.closePath();
        ctx.fillStyle = '#FF3B30'; ctx.fill();
      }
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
      ctx.fillText(kb < 140 ? '+' : '+  Neue Seite', kx + kb / 2, ky + kh / 2);
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
  function liveStrich(st, p) {
    const x = { id: 'live', w: st.art || st.wz, f: st.f, b: st.b, p: p, sp: st.sp, dr: st.dr, a: st.a };
    if (st.formObj) Object.assign(x, st.formObj, { p: st.formObj.p });
    return x;
  }
  function zeichneLive() {
    const c = E.el.live, ctx = c.getContext('2d'), s = skala(), d = E.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    E.el.live.classList.toggle('nb-multiply', !!(E.strich && E.strich.wz === 'marker' && !istDunklesPapier(E.seiten[E.strich.i])));
    if (E.strich) {
      const st = E.strich, seite = E.seiten[st.i];
      seitenTransform(ctx, st.i);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, seite.b, seite.h); ctx.clip();
      let p;
      const r = st.roh, n = r.length;
      if (st.form) p = st.form;
      else if (st.gerade) p = [r[0], r[1], r[2], r[n - 3], r[n - 2], r[n - 1]];
      else p = st.glatt.concat([r[n - 3], r[n - 2], r[n - 1]]);
      strichMalen(ctx, liveStrich(st, p), { dunkel: istDunklesPapier(seite) });
      ctx.restore();
    }
    if (E.formZug) {
      const z = E.formZug, seite = E.seiten[z.i];
      seitenTransform(ctx, z.i);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, seite.b, seite.h); ctx.clip();
      const o = formZugObjekt(z); o.id = 'live';
      strichMalen(ctx, o, { dunkel: istDunklesPapier(seite) });
      ctx.restore();
    }
    if (E.laserZug) laserZeichnen(ctx);
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
        const zj = zielSeite(a, z.dx, z.dy, z.k), zs = E.seiten[zj];
        ctx.beginPath(); ctx.rect(E.pos[zj].x - E.pos[a.i].x, E.pos[zj].y - E.pos[a.i].y, zs.b, zs.h); ctx.clip();
        ctx.translate(a.bb.x0 + z.dx, a.bb.y0 + z.dy); ctx.scale(z.k, z.k); ctx.translate(-a.bb.x0, -a.bb.y0);
        seite.bilder.forEach(function (bi) {
          if (!a.b.has(bi.id)) return;
          const im = bild(bi.d); if (im) bildMalen(ctx, im, bi.x, bi.y, bi.w, bi.h, bi.r || 0);
        });
        ctx.globalCompositeOperation = 'multiply';
        seite.striche.forEach(function (st) { if (a.s.has(st.id) && st.w === 'marker') strichMalen(ctx, st, { dunkel: istDunklesPapier(seite) }); });
        ctx.globalCompositeOperation = 'source-over';
        seite.striche.forEach(function (st) { if (a.s.has(st.id) && st.w !== 'marker') strichMalen(ctx, st, { tapeOffen: E.tapeOffen, dunkel: istDunklesPapier(seite) }); });
        ctx.restore();
      }
      if (E.ziehen && E.hilfslinien && E.hilfslinien.length) {
        ctx.save(); ctx.strokeStyle = '#FF2D92'; ctx.lineWidth = 1 / s; ctx.setLineDash([4 / s, 3 / s]); ctx.beginPath();
        E.hilfslinien.forEach(function (l) { if (l.x != null) { ctx.moveTo(l.x, 0); ctx.lineTo(l.x, seite.h); } else { ctx.moveTo(0, l.y); ctx.lineTo(seite.b, l.y); } });
        ctx.stroke(); ctx.restore();
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
    } else if (a.typ === 'gruppe') {
      (rueck ? a.teile.slice().reverse() : a.teile).forEach(function (t) { anwenden(t, rueck); });
    } else if (a.typ === 'seite-ordnung') {
      seitenOrdnen(rueck ? a.vorher : a.nachher);
    } else if (a.typ === 'seite-meta') {
      const seite = seiteNachId(a.id);
      if (!seite) return;
      Object.assign(seite, rueck ? a.vorher : a.nachher);
      schmutzig(seite);
      layout(); kameraBegrenzen();
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
    if (liste.length || weg.length || ed.buchGeaendert) { ed.buch.geaendert = jetzt(); ed.buchGeaendert = false; }
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
    if (e.pointerType === 'pen') return e.pressure > 0 ? Math.min(1, e.pressure) : 0.3;
    return 0.3;                                                   // Maus und Finger: wie normaler Schreibdruck
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
      if (linealTouchStart(e, pt)) return;
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
    if (e.pointerType === 'mouse' && E.lineal && E.zeiger === null && !linealKante(pt) && imLineal(pt)) { linealTouchStart(e, pt, true); return; }
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
    if (W.wz === 'laser') { laserStart(pt); return; }                   // zeigt nur – geht auch im Nur-lesen-Modus
    const w = welt(pt.x, pt.y);
    E.kachelTipp = inKachel(w);
    if (E.kachelTipp) return;
    if (E.auswahl) {
      const h = auswahlTreffer(pt);
      if (h) { E.ziehen = { art: h, start: pt, dx: 0, dy: 0, k: 1 }; auswahlVerstecken(); plane('haupt', 'live', 'text'); return; }
      auswahlAufheben();
    }
    if (E.nurLesen) { E.leseTipp = { pt: pt, letzt: pt }; return; }
    if (W.wz === 'text') { E.textTipp = { pt: pt }; return; }
    if (W.wz === 'zettel') { E.textTipp = { pt: pt, zettel: true }; return; }
    if (W.wz === 'lasso') { lassoStart(w); return; }
    if (W.wz === 'radierer') { radiererStart(pt, w); return; }
    if (W.wz === 'formen' && W.formArt !== 'auto') { formZugStart(w); return; }
    strichStart(w, e, pt);
  }
  function aufMove(e) {
    if (!E) return;
    if (E.linealZug && E.linealZug.touches.has(e.pointerId)) { linealTouchMove(e); return; }
    if (E.mausPan) { const pt = punktAus(e); verschieben(pt.x - E.mausPan.x, pt.y - E.mausPan.y); E.mausPan = pt; return; }
    if (e.pointerId === E.zeiger) {
      const evs = teilEvents(e);
      if (E.ziehen) { ziehenMove(punktAus(e)); return; }
      if (E.leseTipp) { const q = punktAus(e); verschieben(q.x - E.leseTipp.letzt.x, q.y - E.leseTipp.letzt.y); E.leseTipp.letzt = q; return; }
      if (E.kachelTipp || E.textTipp) return;
      if (E.laserZug && E.laserZug.an) { evs.forEach(function (x) { laserMove(punktAus(x)); }); return; }
      if (E.formZug) { formZugMove(punktAus(e)); return; }
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
    if (E.linealZug && E.linealZug.touches.has(e.pointerId)) { linealTouchEnde(e); return; }
    if (E.mausPan && e.pointerType === 'mouse') { E.mausPan = null; return; }
    if (e.pointerId === E.zeiger) {
      const pt = punktAus(e);
      const start = E.zeigerStart;
      E.zeiger = null; E.zeigerTyp = '';
      const tipp = Math.hypot(pt.x - start.x, pt.y - start.y) < 8;
      if (E.kachelTipp) { E.kachelTipp = false; if (tipp && inKachel(welt(pt.x, pt.y))) seiteHinzufuegen(E.seiten.length - 1); return; }
      if (E.ziehen) { ziehenEnde(); return; }
      if (E.leseTipp) { E.leseTipp = null; if (tipp) leseTippen(pt); return; }
      if (E.textTipp) { const tt = E.textTipp; E.textTipp = null; if (tipp) { if (tt.zettel) zettelTipp(pt); else textTipp(pt); } return; }
      if (E.laserZug && E.laserZug.an) { laserEnde(); return; }
      if (E.formZug) { formZugEnde(); return; }
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
      if (tap.max === 2) { if (W.fingerTipps !== false) { rueckgaengig(); toast('Rückgängig (Zwei-Finger-Tipp)'); } }
      else if (tap.max === 3) { if (W.fingerTipps !== false) { wiederholen(); toast('Wiederholt (Drei-Finger-Tipp)'); } }
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
    if (E.horiz && E.zoom <= 1.05) {
      let sx = 0; v.forEach(function (x) { sx += x.dx; });
      const dt = v.length > 1 ? (v[v.length - 1].t - v[0].t) || 16 : 16, vx = sx / dt;
      seiteEinrasten(Math.abs(vx) > 0.3 ? (vx < 0 ? 1 : -1) : 0);
      return;
    }
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
    if (W.wz === 'text' && !E.nurLesen) { textTipp(pt); return; }
    if (W.wz === 'zettel' && !E.nurLesen) { zettelTipp(pt); return; }
    if (E.auswahl && !auswahlTreffer(pt)) auswahlAufheben();
    if (E.textAktiv) textBeenden();
    else { const i = seiteBei(w.x, w.y); if (i >= 0) tapeUmschalten(E.seiten[i], w.x - E.pos[i].x, w.y - E.pos[i].y); }
  }
  function leseTippen(pt) {
    const w = welt(pt.x, pt.y), i = seiteBei(w.x, w.y);
    if (i >= 0) tapeUmschalten(E.seiten[i], w.x - E.pos[i].x, w.y - E.pos[i].y);
  }
  function aufRad(e) {
    if (!E) return;
    e.preventDefault();
    rechteckAktualisieren();
    const pt = punktAus(e);
    const f = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? E.vh : 1);
    if (e.ctrlKey || e.metaKey) zoomen(Math.exp(-e.deltaY * f * 0.01), pt.x, pt.y);
    else if (E.horiz) verschieben(-(e.deltaX || e.deltaY) * f, 0);
    else verschieben(-e.deltaX * f, -e.deltaY * f);
  }

  /* ---------- Stifte und Textmarker ---------- */
  function strichStart(w, e, pt) {
    const kante = pt && E.lineal ? linealKante(pt) : null;
    if (kante) { const q = aufKante(E.lineal, kante, pt); w = welt(q.x, q.y); }
    const i = seiteBei(w.x, w.y);
    if (i < 0) return;
    const r = E.pos[i], x = w.x - r.x, y = w.y - r.y, d = druck(e);
    let wz = W.wz;
    const autoForm = wz === 'formen';                        // Formen-Werkzeug „Automatisch“
    if (autoForm) wz = 'formstift';
    const es = einst(wz);
    E.strich = {
      i: i, wz: wz, autoForm: autoForm, f: autoForm ? aktuelleFarbe('formen') : aktuelleFarbe(wz),
      b: autoForm ? aktuelleBreite('formen') : aktuelleBreite(wz), roh: [x, y, d], glatt: [x, y, d], t0: performance.now(),
      sp: wz === 'fueller' ? es.sp : undefined, dr: wz === 'fueller' || wz === 'pinsel' ? es.dr : undefined,
      gerade: ((wz === 'marker' && W.markerGerade) || (wz === 'tape' && W.tapeGerade)) && !kante, kante: kante,
      halt: pt ? { x: pt.x, y: pt.y } : null, stab: es.st || 0
    };
    haltenPlanen();
    plane('live');
  }
  function haltenPlanen() {
    clearTimeout(E.haltTimer);
    const st = E.strich;
    if (!W.formen || !st || st.kante || st.gerade || st.form || st.wz === 'tape') return;
    E.haltTimer = setTimeout(formPruefen, 550);
  }
  function formPruefen() {
    const st = E && E.strich;
    if (!st || st.form || st.kante) return;
    const f = formErkennen(st.roh, skala());
    if (!f) return;
    st.form = f.punkte; st.formArt = f.art;
    plane('live');
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (x) { } }
  }
  function strichPunkt(ev) {
    const st = E.strich;
    if (st.form) return;                                                        // Form steht – Stift kann losgelassen werden
    let pt = punktAus(ev);
    if (st.kante && E.lineal) pt = aufKante(E.lineal, st.kante, pt);
    const w = welt(pt.x, pt.y), r = E.pos[st.i];
    const x = w.x - r.x, y = w.y - r.y, d = druck(ev);
    const n = st.roh.length;
    if (st.halt && Math.hypot(pt.x - st.halt.x, pt.y - st.halt.y) > 4) { st.halt = { x: pt.x, y: pt.y }; haltenPlanen(); }
    if (Math.hypot(x - st.roh[n - 3], y - st.roh[n - 2]) < 0.5 / skala()) { st.roh[n - 1] = d; return; }
    st.roh.push(x, y, d);
    // Strich-Stabilisierung: 0 = direkt, 1 = stark geglättet
    const g = st.glatt, m = g.length;
    let a = 1 - 0.85 * grenze(st.stab, 0, 1);
    if (E.zeigerTyp !== 'pen') a *= 0.8;
    g.push(g[m - 3] + (x - g[m - 3]) * a, g[m - 2] + (y - g[m - 2]) * a, g[m - 1] + (d - g[m - 1]) * 0.4);
  }
  function istTipp(st) {
    const r = st.roh;
    let maxD = 0;
    for (let k = 3; k < r.length; k += 3) maxD = Math.max(maxD, Math.hypot(r[k] - r[0], r[k + 1] - r[1]));
    return maxD * skala() < 4 && performance.now() - st.t0 < 450;
  }
  function strichEnde() {
    const st = E.strich;
    E.strich = null;
    clearTimeout(E.haltTimer);
    if (!st) return;
    const seite = E.seiten[st.i], r = st.roh, n = r.length;
    // kurzer Tipp auf ein Tape: aufdecken statt Punkt zeichnen
    if (istTipp(st) && st.wz !== 'tape' && tapeUmschalten(seite, r[0], r[1])) { planeAlles(); return; }
    let p = st.form ? st.form : st.gerade ? [r[0], r[1], r[2], r[n - 3], r[n - 2], r[n - 1]] : st.glatt.concat([r[n - 3], r[n - 2], r[n - 1]]);
    let formInfo = st.form ? { art: st.formArt } : null;
    if (st.wz === 'formstift' && !st.form) {
      const f = formErkennen(st.roh, skala());
      if (f) { p = f.punkte; formInfo = f; }
    }
    p = neuAbtasten(p, 2);
    const strich = { id: uid(), w: st.wz, f: st.f, b: st.b, p: p };
    if (st.sp != null) strich.sp = st.sp;
    if (st.dr != null) strich.dr = st.dr;
    if (st.wz === 'bleistift') {
      let summe = 0;
      for (let k = 2; k < r.length; k += 3) summe += r[k];
      strich.a = r2(Math.min(0.95, 0.6 + 0.5 * grenze(summe / (r.length / 3), 0, 1)));
    }
    if (st.autoForm || (st.wz === 'formstift' && formInfo)) {            // als echtes Formobjekt speichern
      if (formInfo) {
        strich.w = 'form';
        strich.z = /kreis|ellipse|dreieck|viereck/.test(formInfo.art) ? 1 : 0;
        if (strich.z && W.formFuellen && st.autoForm) { strich.fu = st.f; strich.fo = W.formDeckkraft; }
      } else if (st.autoForm) strich.w = 'formstift';
    }
    const opfer = st.gerade || st.form || st.kante || formInfo || TINTE.indexOf(st.wz) < 0 ? null : kritzelOpfer(seite, strich, st.roh);
    aendern(seite, function () {
      if (opfer) {
        const weg = new Set(opfer);
        seite.striche = seite.striche.filter(function (x) { return !weg.has(x); });
      } else seite.striche = seite.striche.concat([strich]);
    });
    if (opfer) toast(opfer.length === 1 ? 'Durchgekritzelt – gelöscht' : 'Durchgekritzelt – ' + opfer.length + ' Striche gelöscht', true);
    else if (!formInfo && TINTE.indexOf(st.wz) >= 0 && !st.kante) umkreisenPruefen(st.i, strich);
    planeAlles();
  }

  /* ---------- Tape: abdecken und aufdecken ---------- */
  function tapeTreffer(seite, x, y) {
    for (let k = seite.striche.length - 1; k >= 0; k--) {
      const t = seite.striche[k];
      if (t.w !== 'tape') continue;
      const bb = rahmen(t);
      if (x < bb.x0 || x > bb.x1 || y < bb.y0 || y > bb.y1) continue;
      const q = t.p, rr = t.b / 2 + 2;
      for (let j = 0; j + 3 < q.length; j += 3) {
        if (abstandStrecke({ x: x, y: y }, { x: q[j], y: q[j + 1] }, { x: q[j + 3], y: q[j + 4] }) <= rr) return t;
      }
      if (q.length === 3 && Math.hypot(q[0] - x, q[1] - y) <= rr) return t;
    }
    return null;
  }
  function tapeUmschalten(seite, x, y) {
    const t = tapeTreffer(seite, x, y);
    if (!t) return false;
    if (E.tapeOffen.has(t.id)) E.tapeOffen.delete(t.id); else E.tapeOffen.add(t.id);
    plane('haupt');
    return true;
  }
  function tapeAlleEntfernen() {
    const i = aktuelleSeite(), seite = E.seiten[i];
    if (!seite.striche.some(function (s) { return s.w === 'tape'; })) { toast('Auf dieser Seite ist kein Tape.'); return; }
    aendern(seite, function () { seite.striche = seite.striche.filter(function (s) { return s.w !== 'tape'; }); });
    planeAlles(); toast('Tape von der Seite entfernt', true);
  }
  function tapeAlleUmschalten(offen) {
    E.seiten.forEach(function (s) { s.striche.forEach(function (t) { if (t.w === 'tape') { if (offen) E.tapeOffen.add(t.id); else E.tapeOffen.delete(t.id); } }); });
    plane('haupt');
  }

  /* ---------- Umkreisen zum Auswählen ---------- */
  function umkreisenPruefen(i, strich) {
    if (!W.umkreisen) return;
    const p = strich.p, n = p.length / 3;
    if (n < 12) return;
    const bb = rahmen(strich), diag = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0);
    if (diag * skala() < 40) return;
    const sehne = Math.hypot(p[0] - p[(n - 1) * 3], p[1] - p[(n - 1) * 3 + 1]);
    if (sehne > diag * 0.25 || laenge(p) < diag * 2) return;
    const poly = [];
    for (let k = 0; k < p.length; k += 3) poly.push(p[k], p[k + 1]);
    const seite = E.seiten[i];
    const sel = { i: i, s: new Set(), t: new Set(), b: new Set(), bb: null };
    seite.striche.forEach(function (st) {
      if (st === strich) return;
      const q = st.p, m = q.length / 3, schritt = Math.max(1, Math.floor(m / 30));
      let drin = 0, ges = 0;
      for (let k = 0; k < m; k += schritt) { ges++; if (imPolygon(q[k * 3], q[k * 3 + 1], poly)) drin++; }
      if (ges && drin / ges >= 0.9) sel.s.add(st.id);
    });
    seite.texte.forEach(function (t) { if (imPolygon(t.x + t.w / 2, t.y + textHoehe(t) / 2, poly)) sel.t.add(t.id); });
    seite.bilder.forEach(function (bi) { if (imPolygon(bi.x + bi.w / 2, bi.y + bi.h / 2, poly)) sel.b.add(bi.id); });
    if (!sel.s.size && !sel.t.size && !sel.b.size) return;
    const r = E.pos[i], s = skala();
    const blase = document.createElement('button');
    blase.className = 'nb-umkreis';
    blase.innerHTML = icon('lasso') + 'Auswählen';
    blase.style.left = ((r.x + bb.x1 - E.cam.x) * s + 6) + 'px';
    blase.style.top = ((r.y + bb.y0 - E.cam.y) * s - 6) + 'px';
    if (E.el.umkreis) E.el.umkreis.remove();
    E.el.flaeche.appendChild(blase);
    E.el.umkreis = blase;
    const weg = function () { if (blase.isConnected) blase.remove(); if (E && E.el.umkreis === blase) E.el.umkreis = null; };
    blase.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    blase.addEventListener('click', function () {
      weg();
      if (!E) return;
      aendern(seite, function () { seite.striche = seite.striche.filter(function (x) { return x !== strich; }); });
      sel.bb = auswahlRahmen(seite, sel);
      E.auswahl = sel;
      planeAlles();
    });
    setTimeout(weg, 3500);
  }

  /* ---------- Formen-Werkzeug: Form aufziehen ---------- */
  function formErzeugen(art, x0, y0, x1, y1) {
    const pts = [];
    const dazu = function (x, y) { pts.push(r2(x), r2(y), 0.5); };
    const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2, w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    const lx = Math.min(x0, x1), ty = Math.min(y0, y1), rx = Math.max(x0, x1), by = Math.max(y0, y1);
    let z = 1, k = 0;
    if (art === 'linie' || art === 'pfeil') {
      const e = winkelEinrasten({ x: x0, y: y0 }, { x: x1, y: y1 });
      dazu(x0, y0); dazu(e.x, e.y); z = 0; k = art === 'pfeil' ? 1 : 0;
    } else if (art === 'winkel') {
      dazu(x0, y0); dazu(x1, y0); dazu(x1, y1); z = 0; k = 1;
    } else if (art === 'bogen') {
      const dx = x1 - x0, dy = y1 - y0, cx = xm - dy * 0.3, cy = ym + dx * 0.3;
      for (let t = 0; t <= 24; t++) {
        const u = t / 24;
        dazu((1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1, (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1);
      }
      z = 0; k = 1;
    } else if (art === 'rechteck') { dazu(lx, ty); dazu(rx, ty); dazu(rx, by); dazu(lx, by); dazu(lx, ty); }
    else if (art === 'kreis') {
      for (let t = 0; t <= 72; t++) { const u = t / 72 * Math.PI * 2; dazu(xm + Math.cos(u) * w / 2, ym + Math.sin(u) * h / 2); }
    } else if (art === 'dreieck') { dazu(xm, ty); dazu(rx, by); dazu(lx, by); dazu(xm, ty); }
    else if (art === 'raute') { dazu(xm, ty); dazu(rx, ym); dazu(xm, by); dazu(lx, ym); dazu(xm, ty); }
    else if (art === 'rund') {
      const rr = Math.min(w, h) * 0.22;
      const ecke = function (cx, cy, a0) { for (let t = 0; t <= 8; t++) { const u = a0 + t / 8 * Math.PI / 2; dazu(cx + Math.cos(u) * rr, cy + Math.sin(u) * rr); } };
      ecke(rx - rr, ty + rr, -Math.PI / 2); ecke(rx - rr, by - rr, 0); ecke(lx + rr, by - rr, Math.PI / 2); ecke(lx + rr, ty + rr, Math.PI);
      dazu(rx - rr, ty);
    }
    return { p: pts, z: z, k: k };
  }
  function formZugStart(w) {
    const i = seiteBei(w.x, w.y);
    if (i < 0) return;
    const r = E.pos[i];
    E.formZug = { i: i, x0: w.x - r.x, y0: w.y - r.y, x1: w.x - r.x, y1: w.y - r.y };
    plane('live');
  }
  function formZugMove(pt) {
    const z = E.formZug, w = welt(pt.x, pt.y), r = E.pos[z.i];
    z.x1 = w.x - r.x; z.y1 = w.y - r.y;
    if (z.quadrat || (W.formArt === 'kreis' || W.formArt === 'rechteck') && E.shift) {
      const d = Math.max(Math.abs(z.x1 - z.x0), Math.abs(z.y1 - z.y0));
      z.x1 = z.x0 + Math.sign(z.x1 - z.x0 || 1) * d; z.y1 = z.y0 + Math.sign(z.y1 - z.y0 || 1) * d;
    }
    plane('live');
  }
  function formZugObjekt(z) {
    const f = formErzeugen(W.formArt, z.x0, z.y0, z.x1, z.y1);
    const o = { w: 'form', f: aktuelleFarbe('formen'), b: aktuelleBreite('formen'), p: f.p, z: f.z, k: f.k };
    if (f.z && W.formFuellen) { o.fu = o.f; o.fo = W.formDeckkraft; }
    return o;
  }
  function formZugEnde() {
    const z = E.formZug;
    E.formZug = null;
    if (!z) return;
    if (Math.hypot(z.x1 - z.x0, z.y1 - z.y0) * skala() < 8) {           // nur getippt: Standardgröße
      const g = 60;
      z.x0 -= g / 2; z.y0 -= g / 2; z.x1 = z.x0 + g; z.y1 = z.y0 + (/linie|pfeil|bogen|winkel/.test(W.formArt) ? 0 : g);
    }
    const o = formZugObjekt(z), seite = E.seiten[z.i];
    o.id = uid(); o.p = neuAbtasten(o.p, 2);
    aendern(seite, function () { seite.striche = seite.striche.concat([o]); });
    planeAlles();
  }

  /* ---------- Laserpointer ---------- */
  const LASER_SPUR = 650, LASER_AUS = 380;           // ms: so lange bleibt die Spur, so schnell blendet sie aus
  function laserStart(pt) {
    const t = performance.now();
    E.laserZug = { punkte: [{ x: pt.x, y: pt.y, t: t }], an: true, x: pt.x, y: pt.y, ende: 0 };
    if (!E.laserLaeuft) { E.laserLaeuft = true; requestAnimationFrame(laserTakt); }
    plane('live');
  }
  function laserMove(pt) {
    const z = E.laserZug;
    if (!z || !z.an) return;
    z.x = pt.x; z.y = pt.y;
    const l = z.punkte[z.punkte.length - 1];
    if (!l || Math.hypot(pt.x - l.x, pt.y - l.y) >= 1.5) z.punkte.push({ x: pt.x, y: pt.y, t: performance.now() });
  }
  function laserEnde() {
    const z = E && E.laserZug;
    if (!z || !z.an) return;
    z.an = false; z.ende = performance.now();
    plane('live');
  }
  function laserTakt() {
    if (!E) return;
    const z = E.laserZug, t = performance.now();
    if (!z) { E.laserLaeuft = false; return; }
    while (z.punkte.length && t - z.punkte[0].t > LASER_SPUR) z.punkte.shift();
    if (!z.an && t - z.ende > LASER_AUS) { E.laserZug = null; E.laserLaeuft = false; plane('live'); return; }
    plane('live');
    requestAnimationFrame(laserTakt);
  }
  function laserZeichnen(ctx) {
    const z = E.laserZug;
    if (!z) return;
    const d = E.dpr, farbe = aktuelleFarbe('laser'), t = performance.now();
    const aus = z.an ? 1 : Math.max(0, 1 - (t - z.ende) / LASER_AUS);
    if (aus <= 0) return;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.save();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';                      // runde Enden würden an den Stufengrenzen Perlen bilden
    if (W.laserArt === 'spur') {
      const q = z.an ? z.punkte.concat([{ x: z.x, y: z.y, t: t }]) : z.punkte;
      // Spur in Altersstufen zeichnen: jede Stufe ein Pfad, damit sich halbtransparente Stücke nicht überlagern
      const STUFEN = 14, schichten = [[0.26, 7, 9, farbe], [1, 2.2, 2.6, farbe], [0.75, 0.8, 1.2, '#FFFFFF']];
      for (let sch = 0; sch < schichten.length; sch++) {
        const S = schichten[sch];
        for (let st = 0; st < STUFEN; st++) {
          const f = (st + 1) / STUFEN;
          let offen = false, leer = true;
          ctx.beginPath();
          for (let k = 1; k < q.length; k++) {
            const jung = 1 - (t - q[k].t) / LASER_SPUR;
            if (jung <= 0 || Math.min(STUFEN - 1, Math.floor(jung * STUFEN)) !== st) { offen = false; continue; }
            if (!offen) { ctx.moveTo(q[k - 1].x, q[k - 1].y); offen = true; }
            ctx.lineTo(q[k].x, q[k].y); leer = false;
          }
          if (leer) continue;
          ctx.globalAlpha = aus * S[0] * f;
          ctx.lineWidth = S[1] + S[2] * f; ctx.strokeStyle = S[3];
          ctx.stroke();
        }
      }
    }
    // leuchtender Punkt an der Stiftspitze
    const x = z.x, y = z.y, glanz = ctx.createRadialGradient(x, y, 0, x, y, 16);
    const rgb = hexRgb(farbe).join(',');
    glanz.addColorStop(0, 'rgba(' + rgb + ',1)'); glanz.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.globalAlpha = aus * 0.45; ctx.fillStyle = glanz;
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = aus; ctx.fillStyle = farbe;
    ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = aus * 0.85; ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  /* ---------- Formen erkennen (Stift am Ende kurz halten) ---------- */
  function rdp(pts, eps) {                                     // Ramer-Douglas-Peucker
    if (pts.length < 3) return pts.slice();
    let maxD = 0, idx = 0;
    const a = pts[0], b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const d = abstandStrecke(pts[i], a, b);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= eps) return [a, b];
    const l = rdp(pts.slice(0, idx + 1), eps), r = rdp(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  function abstandStrecke(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = grenze(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  function winkelEinrasten(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
    let w = Math.atan2(dy, dx);
    const raster = Math.round(w / (Math.PI / 4)) * (Math.PI / 4);
    if (Math.abs(w - raster) < 4 * Math.PI / 180) w = raster;
    return { x: a.x + Math.cos(w) * l, y: a.y + Math.sin(w) * l };
  }
  function formErkennen(roh, s) {
    const pts = [];
    let druckSumme = 0;
    for (let i = 0; i < roh.length; i += 3) {
      const q = { x: roh[i], y: roh[i + 1] };
      if (!pts.length || Math.hypot(q.x - pts[pts.length - 1].x, q.y - pts[pts.length - 1].y) > 0.3) pts.push(q);
      druckSumme += roh[i + 2];
    }
    if (pts.length < 4) return null;
    const druckM = grenze(druckSumme / (roh.length / 3), 0.25, 0.9);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, L = 0;
    pts.forEach(function (q, i) {
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
      if (i) L += Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y);
    });
    const diag = Math.hypot(x1 - x0, y1 - y0);
    if (diag * s < 24) return null;
    const flach = function (liste) { const out = []; liste.forEach(function (q) { out.push(r2(q.x), r2(q.y), druckM); }); return out; };
    const a = pts[0], b = pts[pts.length - 1], sehne = Math.hypot(b.x - a.x, b.y - a.y);
    // gerade Linie
    if (sehne / L > 0.55) {
      let maxD = 0;
      pts.forEach(function (q) { maxD = Math.max(maxD, abstandStrecke(q, a, b)); });
      if (maxD < Math.max(4 / s, sehne * 0.06)) return { art: 'linie', punkte: flach([a, winkelEinrasten(a, b)]) };
    }
    const geschlossen = sehne < Math.max(0.2 * diag, 10 / s) && L > 2.2 * diag * 0.9;
    if (geschlossen) {
      // Ellipse oder Kreis (achsenparallel)
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.max(1, (x1 - x0) / 2), ry = Math.max(1, (y1 - y0) / 2);
      let fehler = 0;
      pts.forEach(function (q) { fehler += Math.abs(Math.hypot((q.x - cx) / rx, (q.y - cy) / ry) - 1); });
      fehler /= pts.length;
      const ecken = rdp(pts.concat([pts[0]]), 0.07 * diag);
      const nEcken = ecken.length - 1;
      if (fehler < 0.1 && nEcken > 4) {
        let ex = rx, ey = ry;
        if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.15) { ex = ey = (rx + ry) / 2; }
        const kreis = [];
        for (let k = 0; k <= 96; k++) { const t = k / 96 * Math.PI * 2; kreis.push({ x: cx + Math.cos(t) * ex, y: cy + Math.sin(t) * ey }); }
        return { art: ex === ey ? 'kreis' : 'ellipse', punkte: flach(kreis) };
      }
      if (nEcken === 3 || nEcken === 4) {
        let v = ecken.slice(0, nEcken);
        if (nEcken === 4) {
          // fast achsenparallel? dann sauberes Rechteck
          let achsen = true;
          for (let k = 0; k < 4; k++) {
            const p1 = v[k], p2 = v[(k + 1) % 4], w = Math.abs(Math.atan2(p2.y - p1.y, p2.x - p1.x)) % (Math.PI / 2);
            if (Math.min(w, Math.PI / 2 - w) > 12 * Math.PI / 180) achsen = false;
          }
          if (achsen) {
            const vx0 = Math.min.apply(null, v.map(function (q) { return q.x; })), vx1 = Math.max.apply(null, v.map(function (q) { return q.x; }));
            const vy0 = Math.min.apply(null, v.map(function (q) { return q.y; })), vy1 = Math.max.apply(null, v.map(function (q) { return q.y; }));
            v = [{ x: vx0, y: vy0 }, { x: vx1, y: vy0 }, { x: vx1, y: vy1 }, { x: vx0, y: vy1 }];
          }
        }
        return { art: nEcken === 3 ? 'dreieck' : 'viereck', punkte: flach(v.concat([v[0]])) };
      }
      return null;
    }
    // offener Linienzug (z. B. Winkel, Pfeilspitze, Zickzack mit wenigen Knicken)
    const knicke = rdp(pts, 0.06 * diag);
    if (knicke.length >= 3 && knicke.length <= 4) {
      let ok = true;
      pts.forEach(function (q) {
        let best = Infinity;
        for (let k = 0; k < knicke.length - 1; k++) best = Math.min(best, abstandStrecke(q, knicke[k], knicke[k + 1]));
        if (best > 0.08 * diag) ok = false;
      });
      if (ok) return { art: 'linienzug', punkte: flach(knicke) };
    }
    return null;
  }

  /* ---------- Lineal ---------- */
  function linealUmschalten() {
    if (E.lineal) { E.lineal = null; }
    else {
      const L = Math.min(E.vw * 0.86, 820);
      E.lineal = { cx: E.vw / 2, cy: E.vh * 0.45, w: 0, L: L, B: 76 };
      toast('Lineal: mit einem Finger verschieben, mit zwei Fingern drehen. Mit dem Stift an der Kante entlangfahren.', false, 4200);
    }
    E.el.linealKnopf.classList.toggle('aktiv', !!E.lineal);
    linealSync();
  }
  function linealAchsen(l) { const c = Math.cos(l.w), sn = Math.sin(l.w); return { ux: c, uy: sn, nx: -sn, ny: c }; }
  function linealLokal(l, pt) { const a = linealAchsen(l), dx = pt.x - l.cx, dy = pt.y - l.cy; return { u: dx * a.ux + dy * a.uy, v: dx * a.nx + dy * a.ny }; }
  function imLineal(pt) { const l = E.lineal; if (!l) return false; const q = linealLokal(l, pt); return Math.abs(q.u) <= l.L / 2 && Math.abs(q.v) <= l.B / 2; }
  function linealKante(pt) {
    const l = E.lineal;
    if (!l) return null;
    const q = linealLokal(l, pt);
    if (Math.abs(q.u) > l.L / 2 + 30) return null;
    const oben = Math.abs(q.v + l.B / 2), unten = Math.abs(q.v - l.B / 2);
    if (Math.min(oben, unten) > 26) return null;
    return { v: oben < unten ? -l.B / 2 : l.B / 2 };
  }
  function aufKante(l, kante, pt) {
    const a = linealAchsen(l), q = linealLokal(l, pt);
    return { x: l.cx + a.ux * q.u + a.nx * kante.v, y: l.cy + a.uy * q.u + a.ny * kante.v };
  }
  function linealTouchStart(e, pt, maus) {
    if (!E.lineal) return false;
    if (E.linealZug) {                                           // zweiter Finger → drehen
      if (E.linealZug.touches.size >= 2) return true;
      E.linealZug.touches.set(e.pointerId, { x: pt.x, y: pt.y });
      linealZugBasis();
      try { E.el.eingabe.setPointerCapture(e.pointerId); } catch (x) { }
      return true;
    }
    if (E.touches.size || E.zeiger !== null || !imLineal(pt)) return false;
    E.linealZug = { touches: new Map([[e.pointerId, { x: pt.x, y: pt.y }]]), maus: !!maus };
    if (maus) {                                                   // Maus: an den Enden drehen, in der Mitte schieben
      const q = linealLokal(E.lineal, pt);
      E.linealZug.drehen = Math.abs(q.u) > E.lineal.L * 0.36;
    }
    linealZugBasis();
    try { E.el.eingabe.setPointerCapture(e.pointerId); } catch (x) { }
    return true;
  }
  function linealZugBasis() {
    const z = E.linealZug, l = E.lineal, ts = Array.from(z.touches.values());
    z.basis = { cx: l.cx, cy: l.cy, w: l.w, punkte: ts.map(function (t) { return { x: t.x, y: t.y }; }) };
  }
  function linealTouchMove(e) {
    const z = E.linealZug, l = E.lineal;
    if (!l) return;
    const pt = punktAus(e);
    z.touches.set(e.pointerId, { x: pt.x, y: pt.y });
    const ts = Array.from(z.touches.values()), b = z.basis;
    if (ts.length >= 2 && b.punkte.length >= 2) {
      const w0 = Math.atan2(b.punkte[1].y - b.punkte[0].y, b.punkte[1].x - b.punkte[0].x);
      const w1 = Math.atan2(ts[1].y - ts[0].y, ts[1].x - ts[0].x);
      l.w = b.w + (w1 - w0);
      l.cx = b.cx + ((ts[0].x + ts[1].x) - (b.punkte[0].x + b.punkte[1].x)) / 2;
      l.cy = b.cy + ((ts[0].y + ts[1].y) - (b.punkte[0].y + b.punkte[1].y)) / 2;
    } else if (z.maus && z.drehen) {
      l.w = b.w + Math.atan2(pt.y - l.cy, pt.x - l.cx) - Math.atan2(b.punkte[0].y - l.cy, b.punkte[0].x - l.cx);
    } else {
      l.cx = b.cx + pt.x - b.punkte[0].x; l.cy = b.cy + pt.y - b.punkte[0].y;
    }
    const grad = l.w * 180 / Math.PI, rund = Math.round(grad / 45) * 45;
    if (Math.abs(grad - rund) < 2.5) l.w = rund * Math.PI / 180;
    l.cx = grenze(l.cx, -l.L / 3, E.vw + l.L / 3); l.cy = grenze(l.cy, 0, E.vh);
    linealSync();
  }
  function linealTouchEnde(e) {
    const z = E.linealZug;
    z.touches.delete(e.pointerId);
    if (!z.touches.size) E.linealZug = null; else linealZugBasis();
  }
  function linealSync() {
    let el = E.el.lineal;
    if (!E.lineal) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('div');
      el.className = 'nb-lineal';
      el.innerHTML = '<div class="nb-lineal-skala"></div><div class="nb-lineal-skala nb-unten"></div><span class="nb-lineal-grad"></span>';
      E.el.flaeche.insertBefore(el, E.el.eingabe.nextSibling);
      E.el.lineal = el;
    }
    const l = E.lineal;
    el.hidden = false;
    el.style.width = l.L + 'px'; el.style.height = l.B + 'px';
    el.style.transform = 'translate(' + (l.cx - l.L / 2).toFixed(1) + 'px,' + (l.cy - l.B / 2).toFixed(1) + 'px) rotate(' + l.w.toFixed(4) + 'rad)';
    const cm = 28.3465 * skala();
    el.style.setProperty('--cm', cm.toFixed(2) + 'px');
    el.style.setProperty('--mm', (cm / 10).toFixed(3) + 'px');
    el.classList.toggle('ohne-mm', cm / 10 < 4);
    let g = ((l.w * 180 / Math.PI) % 180 + 180) % 180;
    if (g > 90) g = 180 - g;
    el.querySelector('.nb-lineal-grad').textContent = Math.round(g) + '°';
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
    if (W.radierAuto && W.vorRadierer && W.vorRadierer !== 'radierer') werkzeugWaehlen(W.vorRadierer);
  }
  function seiteLeeren(i) {
    const seite = E.seiten[i];
    if (!seite.striche.length && !seite.texte.length && !seite.bilder.length) { toast('Die Seite ist schon leer.'); return; }
    aendern(seite, function () { seite.striche = []; seite.texte = []; seite.bilder = []; });
    planeAlles(); toast('Seite geleert', true);
  }

  /* ---------- Lasso ---------- */
  function lassoStart(w) {
    const i = seiteBei(w.x, w.y);
    if (i < 0) return;
    const r = E.pos[i];
    E.lasso = { i: i, pts: [w.x - r.x, w.y - r.y], rechteck: W.lassoArt === 'rechteck', x0: w.x - r.x, y0: w.y - r.y };
  }
  function lassoPunkt(pt) {
    const l = E.lasso, w = welt(pt.x, pt.y), r = E.pos[l.i];
    const x = w.x - r.x, y = w.y - r.y, n = l.pts.length;
    if (l.rechteck) { l.pts = [l.x0, l.y0, x, l.y0, x, y, l.x0, y, l.x0, l.y0]; return; }
    if (Math.hypot(x - l.pts[n - 2], y - l.pts[n - 1]) * skala() < 3) return;
    l.pts.push(x, y);
  }
  function lassoEnde() {
    const l = E.lasso;
    E.lasso = null;
    if (!l || l.pts.length < 8) { plane('live'); return; }
    const seite = E.seiten[l.i], poly = l.pts, lf = W.lassoFilter || {};
    const sel = { i: l.i, s: new Set(), t: new Set(), b: new Set(), bb: null };
    seite.striche.forEach(function (st) {
      const art = st.w === 'tape' ? 'tape' : st.w === 'form' ? (st.k ? 'pfeile' : 'formen') : 'schrift';
      if (lf[art] === false) return;
      const q = st.p, m = q.length / 3, schritt = Math.max(1, Math.floor(m / 40));
      let drin = 0, ges = 0;
      for (let k = 0; k < m; k += schritt) { ges++; if (imPolygon(q[k * 3], q[k * 3 + 1], poly)) drin++; }
      if (ges && drin / ges >= 0.6) sel.s.add(st.id);
    });
    seite.texte.forEach(function (t) {
      if (lf[t.bg ? 'zettel' : 'text'] === false) return;
      const h = textHoehe(t);
      if (imPolygon(t.x + t.w / 2, t.y + h / 2, poly)) sel.t.add(t.id);
    });
    if (lf.bilder !== false) seite.bilder.forEach(function (bi) { if (imPolygon(bi.x + bi.w / 2, bi.y + bi.h / 2, poly)) sel.b.add(bi.id); });
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
  function ausrichten(a, dx, dy) {
    E.hilfslinien = [];
    if (W.ausrichten === false) return { dx: dx, dy: dy };
    const seite = E.seiten[a.i], tol = 6 / skala(), bb = a.bb;
    const zx = [0, seite.b / 2, seite.b], zy = [0, seite.h / 2, seite.h];
    let n = 0;
    const kanten = function (x0, y0, x1, y1) { zx.push(x0, (x0 + x1) / 2, x1); zy.push(y0, (y0 + y1) / 2, y1); };
    seite.striche.forEach(function (st) { if (a.s.has(st.id) || n++ > 400) return; const r = rahmen(st); kanten(r.x0, r.y0, r.x1, r.y1); });
    seite.texte.forEach(function (t) { if (!a.t.has(t.id)) kanten(t.x, t.y, t.x + t.w, t.y + textHoehe(t)); });
    seite.bilder.forEach(function (bi) { if (!a.b.has(bi.id)) kanten(bi.x, bi.y, bi.x + bi.w, bi.y + bi.h); });
    const passen = function (eigene, ziele, d) {
      let best = null;
      eigene.forEach(function (e) { ziele.forEach(function (z) { const k = z - (e + d); if (Math.abs(k) < tol && (!best || Math.abs(k) < Math.abs(best.k))) best = { k: k, z: z }; }); });
      return best;
    };
    const bx = passen([bb.x0, (bb.x0 + bb.x1) / 2, bb.x1], zx, dx), by = passen([bb.y0, (bb.y0 + bb.y1) / 2, bb.y1], zy, dy);
    if (bx) { dx += bx.k; E.hilfslinien.push({ x: bx.z }); }
    if (by) { dy += by.k; E.hilfslinien.push({ y: by.z }); }
    return { dx: dx, dy: dy };
  }
  /* Seite, auf der die Auswahl nach dem Verschieben landet (Mittelpunkt entscheidet) */
  function zielSeite(a, dx, dy, k) {
    const r = E.pos[a.i];
    const cx = r.x + a.bb.x0 + dx + (a.bb.x1 - a.bb.x0) * k / 2, cy = r.y + a.bb.y0 + dy + (a.bb.y1 - a.bb.y0) * k / 2;
    const j = seiteBei(cx, cy);
    return j < 0 ? a.i : j;
  }
  /* Beim Ziehen an den Bildschirmrand weiterscrollen – so erreicht man die nächste Seite */
  function randScrollen() {
    const z = E.ziehen;
    if (!z || z.art !== 'verschieben' || !z.pt || z.rand) return;
    const rand = 56, p = z.pt;
    let vx = 0, vy = 0;
    if (E.horiz) { if (p.x < rand) vx = 1; else if (p.x > E.vw - rand) vx = -1; }
    else if (p.y < rand) vy = 1; else if (p.y > E.vh - rand) vy = -1;
    if (!vx && !vy) return;
    z.rand = true;
    requestAnimationFrame(function () {
      if (!E || E.ziehen !== z) return;
      z.rand = false;
      verschieben(vx * 14, vy * 14);
      ziehenMove(z.pt);
    });
  }
  function ziehenMove(pt) {
    const z = E.ziehen, s = skala();
    if (z.art === 'verschieben') {
      z.pt = pt;
      if (!z.cam0) z.cam0 = { x: E.cam.x, y: E.cam.y };
      let dx = (pt.x - z.start.x) / s + (E.cam.x - z.cam0.x), dy = (pt.y - z.start.y) / s + (E.cam.y - z.cam0.y);
      if (zielSeite(E.auswahl, dx, dy, 1) === E.auswahl.i) { const q = ausrichten(E.auswahl, dx, dy); dx = q.dx; dy = q.dy; }
      else E.hilfslinien = [];                                   // über einer anderen Seite: keine Hilfslinien
      z.dx = dx; z.dy = dy;
      randScrollen();
    }
    else {
      const q = auswahlBildschirm();
      const basis = (q.x1 - q.x0) + (q.y1 - q.y0);
      z.k = grenze(((pt.x - q.x0) + (pt.y - q.y0)) / Math.max(10, basis), 0.15, 8);
    }
    plane('live', 'text');
  }
  function ziehenEnde() {
    const z = E.ziehen;
    E.ziehen = null; E.versteckt = null; E.hilfslinien = [];
    if (Math.abs(z.dx) > 0.3 || Math.abs(z.dy) > 0.3 || Math.abs(z.k - 1) > 0.005) {
      const start = E.undo.length, j = zielSeite(E.auswahl, z.dx, z.dy, z.k);
      auswahlTransformieren(z.dx, z.dy, z.k);
      if (j !== E.auswahl.i) { auswahlAufSeite(j); gruppieren(start); toast('Auf Seite ' + (j + 1) + ' verschoben'); }
    }
    planeAlles();
  }
  /* mehrere Schritte (z. B. von Seite A weg, auf Seite B dazu) als ein Rückgängig-Schritt */
  function gruppieren(start) {
    const teile = E.undo.splice(start);
    if (teile.length > 1) aktionMerken({ typ: 'gruppe', teile: teile });
    else if (teile.length) E.undo.push(teile[0]);
  }
  /* Ausgewählte Objekte auf eine andere Seite übertragen (Lage auf dem Bildschirm bleibt gleich) */
  function auswahlAufSeite(j) {
    const a = E.auswahl, von = E.seiten[a.i], nach = E.seiten[j];
    const ox = E.pos[a.i].x - E.pos[j].x, oy = E.pos[a.i].y - E.pos[j].y;
    const st = von.striche.filter(function (x) { return a.s.has(x.id); });
    const te = von.texte.filter(function (x) { return a.t.has(x.id); });
    const bi = von.bilder.filter(function (x) { return a.b.has(x.id); });
    aendern(von, function () {
      if (st.length) von.striche = von.striche.filter(function (x) { return !a.s.has(x.id); });
      if (te.length) von.texte = von.texte.filter(function (x) { return !a.t.has(x.id); });
      if (bi.length) von.bilder = von.bilder.filter(function (x) { return !a.b.has(x.id); });
    });
    aendern(nach, function () {
      if (st.length) nach.striche = nach.striche.concat(st.map(function (x) {
        const q = x.p.slice();
        for (let i = 0; i < q.length; i += 3) { q[i] = r2(q[i] + ox); q[i + 1] = r2(q[i + 1] + oy); }
        return Object.assign({}, x, { p: q });
      }));
      if (te.length) nach.texte = nach.texte.concat(te.map(function (x) { return Object.assign({}, x, { x: r2(x.x + ox), y: r2(x.y + oy) }); }));
      if (bi.length) nach.bilder = nach.bilder.concat(bi.map(function (x) { return Object.assign({}, x, { x: r2(x.x + ox), y: r2(x.y + oy) }); }));
    });
    a.i = j;
    a.bb = { x0: a.bb.x0 + ox, y0: a.bb.y0 + oy, x1: a.bb.x1 + ox, y1: a.bb.y1 + oy };
  }
  function auswahlTransformieren(dx, dy, k) {
    const a = E.auswahl, seite = E.seiten[a.i], ax = a.bb.x0, ay = a.bb.y0;
    const tx = function (x) { return r2(ax + (x - ax) * k + dx); }, ty = function (y) { return r2(ay + (y - ay) * k + dy); };
    aendern(seite, function () {
      if (a.s.size) seite.striche = seite.striche.map(function (st) {
        if (!a.s.has(st.id)) return st;
        const q = st.p.slice();
        for (let i = 0; i < q.length; i += 3) { q[i] = tx(q[i]); q[i + 1] = ty(q[i + 1]); }
        return Object.assign({}, st, { b: r2(st.b * k), p: q });
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
        const k2 = Object.assign({}, st, { id: uid(), p: q }); ns.push(k2); neu.s.add(k2.id);
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
    if (t.bg) el.classList.add('nb-zettel');
    el.addEventListener('pointerdown', function (ev) {
      if (!E || E.nurLesen || !(W.wz === 'text' || (W.wz === 'zettel' && t.bg))) return;
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
      if (!text.trim() && !f.t.bg) {
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
      g: W.textGroesse, f: aktuelleFarbe('fueller'), fett: W.textFett };
    aendern(seite, function () { seite.texte = seite.texte.concat([t]); });
    textSync();
    textAktivieren(t.id, true);
  }
  function zettelTipp(pt) {
    if (E.textAktiv) { textBeenden(); return; }
    const w = welt(pt.x, pt.y), i = seiteBei(w.x, w.y);
    if (i < 0) return;
    const seite = E.seiten[i], r = E.pos[i], g = 150;
    const x = grenze(w.x - r.x - g / 2, 4, seite.b - g - 4), y = grenze(w.y - r.y - g / 2, 4, seite.h - g - 4);
    const t = { id: uid(), x: r2(x), y: r2(y), w: g, zh: g, text: '', g: 13, f: '#1D1D1F', fett: false, bg: aktuelleFarbe('zettel') };
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
        inhalt.style.color = t.bg ? t.f : tinte(t.f, { dunkel: istDunklesPapier(seite) });
        inhalt.style.fontWeight = t.fett ? '700' : '400';
        inhalt.style.background = t.bg || '';
        inhalt.style.minHeight = t.bg ? (t.zh || 150) + 'px' : '';
        el.classList.toggle('nb-zettel', !!t.bg);
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
    if (!id || !(W.wz === 'text' || W.wz === 'zettel')) { rah.hidden = true; return; }
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
      papier: vorbild ? vorbild.papier : E.buch.papier,
      b: vorbild && !vorbild.hg ? vorbild.b : undefined, h: vorbild && !vorbild.hg ? vorbild.h : undefined
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
  function seiteDuplizieren(i) {
    textBeenden(); auswahlAufheben(true);
    const q = E.seiten[i];
    if (!q) return;
    const s = JSON.parse(JSON.stringify(q));
    s.id = uid(); s.erstellt = jetzt(); s.g = jetzt();
    delete s.lz; delete s.ocr;
    s.striche.forEach(function (x) { x.id = uid(); });
    s.texte.forEach(function (x) { x.id = uid(); });
    s.bilder.forEach(function (x) { x.id = uid(); });
    const index = i + 1;
    E.seiten.splice(index, 0, s);
    aktionMerken({ typ: 'seite-neu', index: index, seite: s });
    schmutzig(s); layout(); kameraBegrenzen(); zuSeite(index);
    toast('Seite ' + (i + 1) + ' dupliziert');
  }
  function seitenOrdnen(ids) {
    const nachId = new Map(E.seiten.map(function (s) { return [s.id, s]; }));
    const neu = ids.map(function (id) { return nachId.get(id); }).filter(Boolean);
    E.seiten.forEach(function (s) { if (neu.indexOf(s) < 0) neu.push(s); });
    E.seiten = neu;
    E.buchGeaendert = true;
    layout(); kameraBegrenzen(); buchSchmutzig(); planeAlles();
  }
  function seitenVerschieben(vorher, nachher) {
    if (vorher.join() === nachher.join()) return;
    aktionMerken({ typ: 'seite-ordnung', vorher: vorher, nachher: nachher });
    seitenOrdnen(nachher);
  }
  function lesezeichenTitel(s, i) { return s.lz && s.lz.t ? s.lz.t : 'Seite ' + (i + 1); }
  function lesezeichenSetzen(i, titel) {
    const s = E.seiten[i];
    if (!s) return;
    const nachher = { lz: titel === null ? null : { t: String(titel || '').trim() } };
    aktionMerken({ typ: 'seite-meta', id: s.id, vorher: { lz: s.lz || null }, nachher: nachher });
    s.lz = nachher.lz; schmutzig(s); planeAlles();
  }
  function lesezeichenPopover(anker) {
    const i = aktuelleSeite(), s = E.seiten[i];
    const liste = [];
    E.seiten.forEach(function (x, k) { if (x.lz) liste.push({ k: k, t: lesezeichenTitel(x, k) }); });
    popoverZeigen(anker, '<div class="nb-pop-titel">Lesezeichen</div>' +
      '<div class="nb-lz-feld"><input type="text" maxlength="60" placeholder="Titel für Seite ' + (i + 1) + ' (optional)" value="' + esc(s.lz && s.lz.t || '') + '"></div>' +
      '<div class="nb-lz-knoepfe"><button class="btn btn-klein btn-primary" data-lz="setzen">' + (s.lz ? 'Speichern' : 'Diese Seite markieren') + '</button>' +
      (s.lz ? '<button class="btn btn-klein" data-lz="weg">Entfernen</button>' : '') + '</div>' +
      '<div class="nb-pop-unter">Inhaltsverzeichnis</div>' +
      (liste.length ? liste.map(function (x) {
        return '<button class="nb-menue nb-lz-eintrag' + (x.k === i ? ' aktiv' : '') + '" data-lz-seite="' + x.k + '"><span>' + esc(x.t) + '</span><small>S. ' + (x.k + 1) + '</small></button>';
      }).join('') : '<div class="nb-lz-leer">Noch keine Lesezeichen. Markiere wichtige Seiten, um sie hier schnell zu finden.</div>'),
      function (p) {
        const inp = p.querySelector('input');
        const setzen = function () { lesezeichenSetzen(i, inp.value); popoverSchliessen(); toast('Lesezeichen gesetzt'); };
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); setzen(); } e.stopPropagation(); });
        p.addEventListener('click', function (e) {
          const b = e.target.closest('button');
          if (!b) return;
          const a = b.getAttribute('data-lz');
          if (a === 'setzen') setzen();
          else if (a === 'weg') { lesezeichenSetzen(i, null); popoverSchliessen(); toast('Lesezeichen entfernt'); }
          else if (b.hasAttribute('data-lz-seite')) { popoverSchliessen(); zuSeite(Number(b.getAttribute('data-lz-seite'))); }
        });
      });
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
    const s = E.seiten[i];
    if (E.el.lesezeichen) E.el.lesezeichen.classList.toggle('gesetzt', !!(s && s.lz));
    if (E.el.seitenleiste && E.leisteTab === 'seiten') seitenleisteMarkieren();
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
    bleistift: '<path d="M4 20l1.2-4.6L15.6 5a2 2 0 012.8 0l.6.6a2 2 0 010 2.8L8.6 18.8z"/><path d="M5.2 15.4l3.4 3.4"/><path d="M14 6.6l3.4 3.4"/>',
    tape: '<path d="M3.6 9.5l15.5-5.6 1.3 3.6-15.5 5.6z"/><path d="M5 13.1l1.6 4.6 15.5-5.6-1.7-4.6"/><path d="M8.5 9.6l1.2 3.4M12.5 8.2l1.2 3.4M16.5 6.7l1.2 3.4" opacity=".55"/>',
    formstift: '<path d="M4 20l1-4 8.5-8.5 3 3L8 19z"/><path d="M12 9l3 3"/><rect x="15" y="15" width="5.5" height="5.5" rx="1"/>',
    formen: '<rect x="3.5" y="3.5" width="8" height="8" rx="1.5"/><circle cx="16.5" cy="16.5" r="4"/><path d="M16.5 3.2l4.6 7.6h-9.2z"/>',
    zettel: '<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/>',
    laser: '<path d="M4.5 19.5l9-9 2 2-9 9z"/><path d="M14.5 9.5l5-5"/><circle cx="20" cy="4" r="1.7" fill="currentColor"/>',
    audio: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7"/>',
    filter: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    chevron: '<path d="M7 10l5 5 5-5"/>',
    chevronrechts: '<path d="M10 7l5 5-5 5"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    auge: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    rechteckauswahl: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.5"/>',
    strichradierer: '<path d="M8.4 18L3.6 13.2a1.8 1.8 0 010-2.5L10.7 3.6a1.8 1.8 0 012.5 0l5.2 5.2a1.8 1.8 0 010 2.5L11.2 18z"/><path d="M3 21.5c4-2.5 9 1 18-1.5"/>',
    fuellen: '<path d="M5 11l7-7 7 7-7 7z"/><path d="M5 11h14"/><path d="M20.5 15c0 1.5 1 2.2 1 3.2a1 1 0 01-2 0c0-1 1-1.7 1-3.2z" fill="currentColor"/>',
    f_auto: '<path d="M4 17c2-8 5-11 9-9s4 7 7 3"/><path d="M17.5 2.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="currentColor"/>',
    f_linie: '<path d="M5 19L19 5"/>',
    f_pfeil: '<path d="M5 19L19 5"/><path d="M11 5h8v8"/>',
    f_winkel: '<path d="M4 6h12v12"/><path d="M12 14l4 4 4-4"/>',
    f_bogen: '<path d="M4 18C6 8 13 5 19 7"/><path d="M14 3.5l5 3.5-3.2 5"/>',
    f_rechteck: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
    f_kreis: '<circle cx="12" cy="12" r="8"/>',
    f_dreieck: '<path d="M12 4l8.5 15h-17z"/>',
    f_raute: '<path d="M12 3l9 9-9 9-9-9z"/>',
    f_rund: '<rect x="3.5" y="6" width="17" height="12" rx="5"/>',
    teilen: '<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>',
    liste: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>',
    raster: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
    pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
    seitenleiste: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/>',
    lesen: '<path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z"/><path d="M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5"/>',
    drehen: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
    suche: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    ordner: '<path d="M3.5 7.5a2 2 0 012-2h4l2 2.2h7a2 2 0 012 2v8.3a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/>',
    lesezeichen: '<path d="M7 3.5h10a1 1 0 011 1V20.5l-6-4.2-6 4.2V4.5a1 1 0 011-1z"/>',
    lineal: '<path d="M2.8 16.2L16.2 2.8l5 5L7.8 21.2z"/><path d="M6.6 12.4l1.9 1.9M9.1 9.9l1.2 1.2M11.6 7.4l1.9 1.9M14.1 4.9l1.2 1.2"/>',
    funke: '<path d="M12 3c.5 3.8 1.5 5.8 2.8 7.1C16.1 11.5 18.2 12.5 22 13c-3.8.5-5.9 1.5-7.2 2.9-1.3 1.3-2.3 3.3-2.8 7.1-.5-3.8-1.5-5.8-2.8-7.1C7.9 14.5 5.8 13.5 2 13c3.8-.5 5.9-1.5 7.2-2.9C10.5 8.8 11.5 6.8 12 3z"/>',
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
  const HAUPT = ['lasso', 'stift', 'radierer', 'text', 'bild', 'formen', 'zettel', 'laser', 'audio'];
  function hauptLeisteHTML() {
    return HAUPT.map(function (h) {
      const ic = h === 'stift' ? W.letzterStift : h;
      return '<button class="nb-knopf" data-nb-haupt="' + h + '" title="' + NAMEN[h] + '" aria-label="' + NAMEN[h] + '"' + (W.leiste[h] === false ? ' hidden' : '') + '>' +
        icon(ic) + (h === 'stift' ? '<span class="nb-farbstrich"></span>' : '') + '</button>';
    }).join('') + '<button class="nb-knopf" data-nb-aktion="lineal" title="Lineal" aria-label="Lineal">' + icon('lineal') + '</button>';
  }
  function werkzeugWaehlen(wz) {
    if (!E) return;
    if (wz === 'stift') wz = W.letzterStift || W.stiftArt;
    if (wz === 'bild') { E.el.bildDatei.click(); return; }
    if (wz === 'audio') { audioUmschalten(); return; }
    if (W.wz !== wz) { textBeenden(); auswahlAufheben(); }
    if (wz === 'radierer' && W.wz !== 'radierer') W.vorRadierer = W.wz;
    W.wz = wz;
    if (STIFTGRUPPE.indexOf(wz) >= 0) W.letzterStift = wz;
    if (STIFTARTEN.indexOf(wz) >= 0) W.stiftArt = wz;
    werkzeugSpeichern();
    E.el.root.classList.toggle('wz-text', wz === 'text');
    E.el.root.classList.toggle('wz-zettel', wz === 'zettel');
    const haupt = hauptWerkzeug(wz);
    $$(E.el.root, '[data-nb-haupt]').forEach(function (b) {
      const h = b.getAttribute('data-nb-haupt');
      b.classList.toggle('aktiv', h === haupt);
      if (h === 'stift') { const s = b.querySelector('svg'); if (s) s.outerHTML = icon(W.letzterStift); }
    });
    werkzeugFarbstriche();
    zeile2Zeichnen();
    plane('live', 'text');
  }
  function werkzeugFarbstriche() {
    const b = E.el.root.querySelector('[data-nb-haupt=stift] .nb-farbstrich');
    if (b) b.style.background = aktuelleFarbe(W.letzterStift);
  }
  function punktGroesse(wz, b) {
    if (wz === 'marker' || wz === 'tape') return Math.min(20, 4 + b * 0.6);
    if (wz === 'radierer') return Math.min(22, 6 + b * 0.5);
    return Math.min(16, 3 + b * 2.3);
  }
  function breitenHTML(w) {
    return '<div class="nb-gruppe">' + W.breiten[w].map(function (b, i) {
      const g = punktGroesse(w, b);
      return '<button class="nb-breite' + (i === W.breite[w] ? ' aktiv' : '') + '" data-nb-breite="' + w + ':' + i + '" aria-label="Stärke ' + (i + 1) + '">' +
        (w === 'radierer' ? '<span style="width:' + g + 'px;height:' + g + 'px;background:transparent;border:1.6px solid currentColor"></span>'
          : '<i style="height:' + (w === 'marker' || w === 'tape' ? Math.max(1.5, Math.min(9, g / 2)) : Math.max(1.5, Math.min(9, 1 + b * 1.6))).toFixed(1) + 'px"></i>') + '</button>';
    }).join('') + '</div>';
  }
  function farbenHTML(g, aktivIndex) {
    return '<div class="nb-gruppe">' + W.farben[g].map(function (f, i) {
      return '<button class="nb-farbe' + (i === aktivIndex ? ' aktiv' : '') + '" data-nb-farbe="' + g + ':' + i + '" style="--f:' + f + '" aria-label="Farbe ' + (i + 1) + '"></button>';
    }).join('') + '<button class="nb-farbe nb-farbe-plus" data-nb-farbplus="' + g + '" aria-label="Weitere Farben">' + icon('plus') + '</button></div>';
  }
  function trenner() { return '<span class="nb-trenner"></span>'; }
  function zeile2Zeichnen() {
    if (!E) return;
    const z = E.el.zeile2, wz = W.wz, haupt = hauptWerkzeug(wz);
    let h = '';
    if (E.nurLesen) {
      h = '<span class="nb-name">Nur lesen</span><span class="nb-tipp">Blättern, zoomen und Tape aufdecken – Schreiben ist gesperrt.</span>' +
        '<button class="nb-schalter aktiv" data-nb-nurlesen="1">Bearbeiten</button>';
    } else if (haupt === 'stift') {
      const art = STIFTARTEN.indexOf(wz) >= 0 ? wz : W.stiftArt;
      h = '<div class="nb-gruppe nb-unterwz">' +
        '<button class="nb-uwz' + (STIFTARTEN.indexOf(wz) >= 0 ? ' aktiv' : '') + '" data-nb-uwz="' + art + '" title="' + NAMEN[art] + '">' + icon(art) + '<span class="nb-pfeilchen">' + icon('chevron') + '</span></button>' +
        ['bleistift', 'marker', 'tape', 'formstift'].map(function (u) {
          return '<button class="nb-uwz' + (wz === u ? ' aktiv' : '') + '" data-nb-uwz="' + u + '" title="' + NAMEN[u] + '">' + icon(u) + '</button>';
        }).join('') + '</div>' + trenner() + breitenHTML(wz) + trenner() + farbenHTML(farbGruppe(wz), W.farbe[farbGruppe(wz)]);
      if (wz === 'tape') h += trenner() + '<button class="nb-mini" data-nb-tapeall="1" title="Alle Tapes aufdecken/abdecken">' + icon('auge') + '</button>';
    } else if (wz === 'radierer') {
      h = '<button class="nb-schalter nb-dropdown" data-nb-radmenue="1">' + icon('radierer') + (W.radierModus === 'strich' ? 'Strich' : 'Standard') + icon('chevron') + '</button>' +
        '<button class="nb-mini" data-nb-radfilter="1" title="Erweiterte Einstellungen">' + icon('filter') + '</button>' + trenner() + breitenHTML('radierer');
    } else if (wz === 'lasso') {
      h = '<div class="nb-segment">' + [['frei', 'Freihand'], ['rechteck', 'Rechteckig']].map(function (m) {
        return '<button class="' + (W.lassoArt === m[0] ? 'aktiv' : '') + '" data-nb-lassoart="' + m[0] + '">' + icon(m[0] === 'frei' ? 'lasso' : 'rechteckauswahl') + m[1] + '</button>';
      }).join('') + '</div><button class="nb-mini" data-nb-lassofilter="1" title="Was wird ausgewählt?">' + icon('filter') + '</button>' +
        '<span class="nb-tipp">Einkreisen · ziehen zum Verschieben · Ecke zum Vergrößern</span>';
    } else if (wz === 'formen') {
      h = '<div class="nb-gruppe nb-unterwz">' + FORM_ARTEN.map(function (f) {
        return '<button class="nb-uwz' + (W.formArt === f[0] ? ' aktiv' : '') + '" data-nb-formart="' + f[0] + '" title="' + f[1] + '">' + icon('f_' + f[0]) + '</button>';
      }).join('') + '</div>' + trenner() + breitenHTML('formen') + trenner() + farbenHTML('formen', W.farbe.formen) +
        '<button class="nb-mini' + (W.formFuellen ? ' aktiv' : '') + '" data-nb-formfuellung="1" title="Füllung">' + icon('fuellen') + '</button>';
    } else if (wz === 'zettel') {
      h = '<span class="nb-name">Notizzettel</span>' + farbenHTML('zettel', W.farbe.zettel) + '<span class="nb-tipp">Auf die Seite tippen, um einen Zettel anzulegen</span>';
    } else if (wz === 'laser') {
      h = '<div class="nb-segment">' + [['spur', 'Spur'], ['punkt', 'Punkt']].map(function (m) {
        return '<button class="' + (W.laserArt === m[0] ? 'aktiv' : '') + '" data-nb-laserart="' + m[0] + '">' + m[1] + '</button>';
      }).join('') + '</div>' + trenner() + farbenHTML('laser', W.farbe.laser);
    } else if (wz === 'text') {
      let g = W.textGroesse, fett = W.textFett, farbe = -1;
      if (E.textAktiv) {
        const f = textFinden(E.textAktiv);
        if (f) { g = f.t.g; fett = f.t.fett; farbe = W.farben.stift.indexOf(f.t.f); }
      } else farbe = W.farbe.stift;
      h = '<span class="nb-name">Text</span><div class="nb-gruppe"><button class="nb-mini" data-nb-textgroesse="-1" aria-label="Kleiner">A−</button>' +
        '<span class="nb-wert">' + Math.round(g) + ' pt</span><button class="nb-mini" data-nb-textgroesse="1" aria-label="Größer">A+</button></div>' +
        '<button class="nb-schalter nb-fett' + (fett ? ' aktiv' : '') + '" data-nb-fett="1">B</button>' + trenner() +
        farbenHTML('stift', farbe) +
        (E.textAktiv ? trenner() + '<button class="nb-mini nb-rot" data-nb-textweg="1">Löschen</button>' : '<span class="nb-tipp">Auf die Seite tippen, um ein Textfeld anzulegen</span>');
    }
    z.innerHTML = h;
    $$(z, 'button').forEach(function (b) { b.addEventListener('pointerdown', function (e) { if (E && E.textAktiv) e.preventDefault(); }); });
  }
  function zeile2Klick(e) {
    const b = e.target.closest('button');
    if (!b || !E) return;
    if (b.hasAttribute('data-nb-nurlesen')) { nurLesenUmschalten(); return; }
    if (b.hasAttribute('data-nb-uwz')) {
      const u = b.getAttribute('data-nb-uwz');
      if (W.wz === u || (STIFTARTEN.indexOf(u) >= 0 && STIFTARTEN.indexOf(W.wz) >= 0 && e.target.closest('.nb-pfeilchen'))) stiftPopover(b, W.wz);
      else werkzeugWaehlen(u);
      return;
    }
    if (b.hasAttribute('data-nb-farbe')) {
      const t = b.getAttribute('data-nb-farbe').split(':'), g = t[0], i = Number(t[1]);
      if (W.wz === 'text' && E.textAktiv) { W.farbe.stift = i; textFormat({ f: W.farben.stift[i] }); }
      else if (W.farbe[g] === i) farbPopover(b, g, i);
      else W.farbe[g] = i;
      werkzeugSpeichern(); werkzeugFarbstriche(); zeile2Zeichnen(); return;
    }
    if (b.hasAttribute('data-nb-farbplus')) { const g = b.getAttribute('data-nb-farbplus'); farbPopover(b, g, W.farbe[g]); return; }
    if (b.hasAttribute('data-nb-breite')) {
      const t = b.getAttribute('data-nb-breite').split(':'), wz = t[0], i = Number(t[1]);
      if (W.breite[wz] === i) breitePopover(b, wz, i); else W.breite[wz] = i;
      werkzeugSpeichern(); zeile2Zeichnen(); plane('live'); return;
    }
    if (b.hasAttribute('data-nb-tapeall')) {
      const alle = []; E.seiten.forEach(function (s) { s.striche.forEach(function (t) { if (t.w === 'tape') alle.push(t.id); }); });
      const offen = alle.some(function (id) { return !E.tapeOffen.has(id); });
      tapeAlleUmschalten(offen); toast(offen ? 'Alle Tapes aufgedeckt' : 'Alle Tapes abgedeckt'); return;
    }
    if (b.hasAttribute('data-nb-radmenue')) { radiererMenue(b); return; }
    if (b.hasAttribute('data-nb-radfilter')) { radiererFilterPopover(b); return; }
    if (b.hasAttribute('data-nb-lassoart')) { W.lassoArt = b.getAttribute('data-nb-lassoart'); werkzeugSpeichern(); zeile2Zeichnen(); return; }
    if (b.hasAttribute('data-nb-lassofilter')) { lassoFilterPopover(b); return; }
    if (b.hasAttribute('data-nb-formart')) { W.formArt = b.getAttribute('data-nb-formart'); werkzeugSpeichern(); zeile2Zeichnen(); return; }
    if (b.hasAttribute('data-nb-formfuellung')) { fuellungPopover(b); return; }
    if (b.hasAttribute('data-nb-laserart')) { W.laserArt = b.getAttribute('data-nb-laserart'); werkzeugSpeichern(); zeile2Zeichnen(); return; }
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
  function popoverZeigen(anker, html, binden, klasse) {
    popoverSchliessen();
    const p = document.createElement('div');
    p.className = 'nb-popover' + (klasse ? ' ' + klasse : '');
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
  function umschalterHTML(name, an, text, hinweis) {
    return '<label class="nb-umschalter"><span>' + text + (hinweis ? '<small>' + hinweis + '</small>' : '') + '</span><input type="checkbox" data-u="' + name + '"' + (an ? ' checked' : '') + '><i></i></label>';
  }
  function reglerHTML(name, titel, wert) {
    return '<div class="nb-regler-feld"><div class="nb-regler-kopf"><span>' + titel + '</span><b data-rw="' + name + '">' + Math.round(wert * 100) + '%</b></div>' +
      '<div class="nb-regler-spur"><input class="nb-regler" type="range" min="0" max="100" step="1" value="' + Math.round(wert * 100) + '" data-r="' + name + '" style="--v:' + Math.round(wert * 100) + '%">' +
      '<span class="nb-ticks"><i></i><i></i><i></i><i></i><i></i></span></div></div>';
  }
  function vorschauZeichnen(c, wz, opt) {
    const ctx = c.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const B = c.clientWidth || 260, H = c.clientHeight || 70;
    c.width = Math.round(B * dpr); c.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, B, H);
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      pts.push(24 + t * (B - 48), H / 2 + Math.sin(t * Math.PI * 2 + 0.3) * H * 0.26, 0.2 + 0.75 * Math.sin(t * Math.PI));
    }
    const st = { id: 'vorschau', w: wz, f: opt && opt.farbe || aktuelleFarbe(wz), b: (opt && opt.b || aktuelleBreite(wz)) * 2, p: neuAbtasten(pts, 1.5) };
    const e = einst(wz);
    if (wz === 'fueller') { st.sp = e.sp; st.dr = e.dr; }
    if (wz === 'pinsel') st.dr = e.dr;
    if (wz === 'bleistift') st.a = 0.85;
    if (wz === 'marker' || wz === 'tape') { ctx.globalAlpha = wz === 'marker' ? 0.8 : 1; }
    strichMalen(ctx, st, {});
    ctx.globalAlpha = 1;
  }
  function stiftPopover(anker, wz) {
    const e = einst(wz);
    let ansicht = 'haupt';
    const zeichnen = function (p) {
      if (ansicht === 'gesten') {
        p.innerHTML = '<div class="nb-pop-titel"><button class="nb-zurueckpfeil" data-zur="1">' + icon('zurueck') + '</button>Stiftgesten</div>' +
          umschalterHTML('kritzeln', W.kritzeln, 'Kritzeln zum Löschen') +
          umschalterHTML('kritzelAlles', W.kritzelAlles, 'Formen und Textmarker löschen', 'Handschrift und Zeichnungen durch Überkritzeln löschen') +
          umschalterHTML('umkreisen', W.umkreisen, 'Umkreisen für Lasso', 'Zeichne um etwas herum, um es auszuwählen und zu verschieben');
        return;
      }
      let h = '<div class="nb-pop-titel">' + NAMEN[wz] + '</div><canvas class="nb-vorschau"></canvas>';
      if (STIFTARTEN.indexOf(wz) >= 0) {
        h += '<div class="nb-stiftarten">' + STIFTARTEN.map(function (a) {
          return '<button class="' + (a === wz ? 'aktiv' : '') + '" data-art="' + a + '">' + icon(a) + '<span>' + NAMEN[a] + '</span></button>';
        }).join('') + '</div>';
      }
      if (wz === 'fueller') h += reglerHTML('sp', 'Schärfe der Spitze', e.sp) + reglerHTML('dr', 'Druckempfindlichkeit', e.dr);
      if (wz === 'pinsel') h += reglerHTML('dr', 'Druckempfindlichkeit', e.dr);
      if (wz !== 'tape') h += reglerHTML('st', 'Strich-Stabilisierung', e.st || 0);
      h += '<div class="nb-pop-unter">Einstellungen</div>';
      if (wz === 'marker') h += umschalterHTML('markerGerade', W.markerGerade, 'Gerade Linie zeichnen');
      if (wz === 'tape') {
        h += umschalterHTML('tapeGerade', W.tapeGerade, 'Gerades Tape', 'Tippe auf ein Tape, um darunter zu schauen') +
          '<button class="nb-menue nb-rot" data-tapeweg="1">Alle von der Seite entfernen</button>';
      } else {
        if (wz !== 'formstift') h += umschalterHTML('formen', W.formen, 'Zeichnen und Halten', 'Wandle deine Zeichnung in eine perfekte Form um, indem du den Stift am Ende kurz still hältst');
        h += '<button class="nb-menue nb-pfeilmenue" data-gesten="1">Stiftgesten' + icon('chevronrechts') + '</button>';
      }
      p.innerHTML = h;
      const c = p.querySelector('canvas');
      if (c) requestAnimationFrame(function () { vorschauZeichnen(c, wz); });
    };
    popoverZeigen(anker, '', function (p) {
      zeichnen(p);
      p.addEventListener('click', function (ev) {
        const b = ev.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-art')) { popoverSchliessen(); werkzeugWaehlen(b.getAttribute('data-art')); stiftPopover(E.el.zeile2.querySelector('[data-nb-uwz]'), W.wz); return; }
        if (b.hasAttribute('data-gesten')) { ansicht = 'gesten'; zeichnen(p); return; }
        if (b.hasAttribute('data-zur')) { ansicht = 'haupt'; zeichnen(p); return; }
        if (b.hasAttribute('data-tapeweg')) { popoverSchliessen(); tapeAlleEntfernen(); }
      });
      p.addEventListener('input', function (ev) {
        const r = ev.target.getAttribute('data-r');
        if (!r) return;
        const v = Number(ev.target.value) / 100;
        W.einst[wz] = W.einst[wz] || {};
        W.einst[wz][r] = v;
        ev.target.style.setProperty('--v', Math.round(v * 100) + '%');
        const anz = p.querySelector('[data-rw="' + r + '"]'); if (anz) anz.textContent = Math.round(v * 100) + '%';
        werkzeugSpeichern();
        const c = p.querySelector('canvas'); if (c) vorschauZeichnen(c, wz);
      });
      p.addEventListener('change', function (ev) {
        const u = ev.target.getAttribute('data-u');
        if (!u) return;
        W[u] = ev.target.checked;
        werkzeugSpeichern();
      });
    }, 'nb-pop-stift');
  }
  /* Farbwähler: Palette + eigene Farbe (Farbfeld, Farbton, Hex) */
  function hsvZuHex(h, s, v) {
    const f = function (n) { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return '#' + [f(5), f(3), f(1)].map(function (x) { return Math.round(x * 255).toString(16).padStart(2, '0'); }).join('').toUpperCase();
  }
  function hexZuHsv(hex) {
    const c = hexRgb(hex).map(function (x) { return x / 255; }), mx = Math.max.apply(null, c), mn = Math.min.apply(null, c), d = mx - mn;
    let h = 0;
    if (d) { if (mx === c[0]) h = ((c[1] - c[2]) / d) % 6; else if (mx === c[1]) h = (c[2] - c[0]) / d + 2; else h = (c[0] - c[1]) / d + 4; }
    return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
  }
  function farbPopover(anker, g, index) {
    const aktuell = W.farben[g][index];
    let ansicht = 'palette';
    const setzen = function (f, merken) {
      W.farben[g][index] = f; W.farbe[g] = index;
      if (merken) { W.eigeneFarben = [f].concat((W.eigeneFarben || []).filter(function (x) { return x !== f; })).slice(0, 5); }
      werkzeugSpeichern(); werkzeugFarbstriche(); zeile2Zeichnen();
    };
    const titel = { stift: 'Stiftfarbe', bleistift: 'Bleistiftfarbe', marker: 'Textmarker-Farbe', tape: 'Tape-Farbe', formen: 'Linienfarbe', zettel: 'Zettelfarbe', laser: 'Laserfarbe' }[g] || 'Farbe';
    const zeichnen = function (p) {
      if (ansicht === 'palette') {
        const eigene = (W.eigeneFarben || []).filter(function (f) { return paletteFuer(g).indexOf(f) < 0; });
        p.innerHTML = '<div class="nb-pop-titel">' + titel + '</div><div class="nb-farbgitter">' +
          paletteFuer(g).map(function (f) { return '<button style="--f:' + f + '" data-f="' + f + '" class="' + (f.toLowerCase() === String(W.farben[g][index]).toLowerCase() ? 'aktiv' : '') + '" aria-label="' + f + '"></button>'; }).join('') +
          '</div>' + (eigene.length ? '<div class="nb-pop-unter">Zuletzt</div><div class="nb-farbgitter">' + eigene.map(function (f) { return '<button style="--f:' + f + '" data-f="' + f + '"></button>'; }).join('') + '</div>' : '') +
          '<button class="nb-menue nb-pfeilmenue" data-eigene="1"><span class="nb-regenbogen"></span>Eigene Farbe' + icon('chevronrechts') + '</button>';
        return;
      }
      const hsv = hexZuHsv(W.farben[g][index]);
      p.innerHTML = '<div class="nb-pop-titel"><button class="nb-zurueckpfeil" data-zur="1">' + icon('zurueck') + '</button>' + titel + '</div>' +
        '<div class="nb-sv" style="--h:' + hsv.h + '"><span class="nb-sv-punkt"></span></div>' +
        '<input class="nb-farbton" type="range" min="0" max="359" value="' + Math.round(hsv.h) + '">' +
        '<div class="nb-hexzeile"><span class="nb-hexvorschau"></span><input class="nb-hex" type="text" maxlength="7" spellcheck="false" value="' + W.farben[g][index] + '"></div>';
      const feld = p.querySelector('.nb-sv'), punkt = p.querySelector('.nb-sv-punkt'), ton = p.querySelector('.nb-farbton'), hex = p.querySelector('.nb-hex'), vor = p.querySelector('.nb-hexvorschau');
      let H = hsv.h, S = hsv.s, V = hsv.v;
      const zeigen = function (vonHex) {
        const f = hsvZuHex(H, S, V);
        feld.style.setProperty('--h', H);
        punkt.style.left = (S * 100) + '%'; punkt.style.top = ((1 - V) * 100) + '%';
        vor.style.background = f;
        if (!vonHex) hex.value = f;
        setzen(f, false);
      };
      const ziehen = function (ev) {
        const r = feld.getBoundingClientRect();
        S = grenze((ev.clientX - r.left) / r.width, 0, 1); V = grenze(1 - (ev.clientY - r.top) / r.height, 0, 1);
        zeigen(false);
      };
      feld.addEventListener('pointerdown', function (ev) { try { feld.setPointerCapture(ev.pointerId); } catch (x) { } ziehen(ev); feld._ziehen = true; });
      feld.addEventListener('pointermove', function (ev) { if (feld._ziehen) ziehen(ev); });
      feld.addEventListener('pointerup', function () { feld._ziehen = false; setzen(hsvZuHex(H, S, V), true); });
      ton.addEventListener('input', function () { H = Number(ton.value); zeigen(false); });
      ton.addEventListener('change', function () { setzen(hsvZuHex(H, S, V), true); });
      hex.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
      hex.addEventListener('input', function () {
        let v = hex.value.trim(); if (v[0] !== '#') v = '#' + v;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) { const q = hexZuHsv(v); H = q.h; S = q.s; V = q.v; ton.value = Math.round(H); zeigen(true); setzen(v.toUpperCase(), true); }
      });
      zeigen(true);
    };
    popoverZeigen(anker, '', function (p) {
      zeichnen(p);
      p.addEventListener('click', function (ev) {
        const b = ev.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-f')) { setzen(b.getAttribute('data-f'), false); popoverSchliessen(); return; }
        if (b.hasAttribute('data-eigene')) { ansicht = 'eigen'; zeichnen(p); return; }
        if (b.hasAttribute('data-zur')) { ansicht = 'palette'; zeichnen(p); }
      });
    }, 'nb-pop-farbe');
    return aktuell;
  }
  function breitePopover(anker, wz, index) {
    const bereich = wz === 'marker' || wz === 'tape' ? [4, 40, 0.5] : (wz === 'radierer' ? [4, 40, 1] : [0.3, 12, 0.1]);
    const wert = W.breiten[wz][index];
    const anzeige = function (v) { return wz === 'radierer' ? Math.round(v) + ' px' : (v * 0.3528).toFixed(2).replace('.', ',') + ' mm'; };
    popoverZeigen(anker, '<div class="nb-pop-titel">Stärke <span class="nb-pop-wert">' + anzeige(wert) + '</span></div>' +
      '<input class="nb-regler" type="range" min="' + bereich[0] + '" max="' + bereich[1] + '" step="' + bereich[2] + '" value="' + wert + '">' +
      '<canvas class="nb-vorschau"></canvas>',
      function (p) {
        const regler = p.querySelector('input'), c = p.querySelector('canvas');
        const vorschau = function () {
          const v = Number(regler.value);
          if (wz === 'radierer') {
            const ctx = c.getContext('2d'); c.width = c.clientWidth * 2; c.height = c.clientHeight * 2;
            ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
            ctx.beginPath(); ctx.arc(c.clientWidth / 2, c.clientHeight / 2, Math.min(v, c.clientHeight / 2 - 2), 0, Math.PI * 2); ctx.strokeStyle = '#6E6E78'; ctx.lineWidth = 2; ctx.stroke();
          } else vorschauZeichnen(c, wz === 'formen' ? 'kuli' : wz, { b: v, farbe: aktuelleFarbe(wz) });
        };
        regler.addEventListener('input', function () {
          W.breiten[wz][index] = Number(regler.value);
          p.querySelector('.nb-pop-wert').textContent = anzeige(Number(regler.value));
          werkzeugSpeichern(); vorschau();
        });
        regler.addEventListener('change', function () { zeile2Zeichnen(); });
        requestAnimationFrame(vorschau);
      });
  }
  function radiererMenue(anker) {
    popoverZeigen(anker, '<div class="nb-pop-titel">Radierer</div><div class="nb-stiftarten">' +
      [['standard', 'Standardradierer', 'Löscht genau dort, wo du radierst'], ['strich', 'Strichradierer', 'Löscht ganze Striche auf einmal']].map(function (m) {
        return '<button class="' + (W.radierModus === m[0] ? 'aktiv' : '') + '" data-m="' + m[0] + '">' + icon(m[0] === 'standard' ? 'radierer' : 'strichradierer') + '<span>' + m[1] + '</span></button>';
      }).join('') + '</div><div class="nb-pop-hinweis">' + (W.radierModus === 'strich' ? 'Löscht ganze Striche auf einmal.' : 'Effizientes Löschen ohne Spuren zu hinterlassen.') + '</div>',
      function (p) {
        p.addEventListener('click', function (e) {
          const b = e.target.closest('[data-m]'); if (!b) return;
          W.radierModus = b.getAttribute('data-m'); werkzeugSpeichern(); popoverSchliessen(); zeile2Zeichnen();
        });
      });
  }
  function radiererFilterPopover(anker) {
    const f = W.radierFilter;
    popoverZeigen(anker, '<div class="nb-pop-titel">Erweiterte Einstellungen</div><div class="nb-pop-unter">Radiererfilter</div>' +
      [['stift', 'Stift', 'fueller'], ['bleistift', 'Bleistift', 'bleistift'], ['marker', 'Textmarker', 'marker'], ['tape', 'Tape', 'tape']].map(function (x) {
        return '<label class="nb-umschalter nb-mit-icon">' + icon(x[2]) + '<span>' + x[1] + '</span><input type="checkbox" data-filter="' + x[0] + '"' + (f[x[0]] !== false ? ' checked' : '') + '><i></i></label>';
      }).join('') + '<div class="nb-pop-hinweis">Der Radierer ignoriert alles, was hier ausgeschaltet ist.</div><div class="nb-pop-linie"></div>' +
      umschalterHTML('radierAuto', W.radierAuto, 'Automatisch abwählen', 'Nach dem Radieren zurück zum vorigen Werkzeug') +
      '<button class="nb-menue nb-rot" data-leeren="1">Seite leeren</button>',
      function (p) {
        p.addEventListener('change', function (e) {
          const k = e.target.getAttribute('data-filter');
          if (k) W.radierFilter[k] = e.target.checked;
          const u = e.target.getAttribute('data-u');
          if (u) W[u] = e.target.checked;
          werkzeugSpeichern();
        });
        p.addEventListener('click', function (e) {
          if (e.target.closest('[data-leeren]') && confirm('Alles auf dieser Seite löschen?')) { popoverSchliessen(); seiteLeeren(aktuelleSeite()); }
        });
      });
  }
  function lassoFilterPopover(anker) {
    const f = W.lassoFilter;
    popoverZeigen(anker, '<div class="nb-pop-titel">Lasso-Auswahl</div><div class="nb-pop-unter">In Auswahl inbegriffen</div>' +
      [['schrift', 'Handschrift'], ['bilder', 'Bilder'], ['formen', 'Formen'], ['pfeile', 'Pfeile'], ['text', 'Textfelder'], ['tape', 'Tape'], ['zettel', 'Notizzettel']].map(function (x) {
        return '<label class="nb-umschalter"><span>' + x[1] + '</span><input type="checkbox" data-filter="' + x[0] + '"' + (f[x[0]] !== false ? ' checked' : '') + '><i></i></label>';
      }).join(''),
      function (p) {
        p.addEventListener('change', function (e) { const k = e.target.getAttribute('data-filter'); if (k) { W.lassoFilter[k] = e.target.checked; werkzeugSpeichern(); } });
      });
  }
  function fuellungPopover(anker) {
    popoverZeigen(anker, '<div class="nb-pop-titel">Füllung</div>' + umschalterHTML('formFuellen', W.formFuellen, 'Mit Farbe füllen') +
      reglerHTML('deck', 'Deckkraft', W.formDeckkraft),
      function (p) {
        p.addEventListener('change', function (e) { if (e.target.getAttribute('data-u')) { W.formFuellen = e.target.checked; werkzeugSpeichern(); zeile2Zeichnen(); } });
        p.addEventListener('input', function (e) {
          if (e.target.getAttribute('data-r') !== 'deck') return;
          W.formDeckkraft = Number(e.target.value) / 100; e.target.style.setProperty('--v', e.target.value + '%');
          p.querySelector('[data-rw=deck]').textContent = e.target.value + '%'; werkzeugSpeichern();
        });
      });
  }
  function menuePopover(anker) {
    const i = aktuelleSeite(), s = E.seiten[i];
    const ablage = ablageLesen();
    const m = function (id, text, ic, extra) {
      return '<button class="nb-menue nb-mit-icon" data-m="' + id + '">' + icon(ic) + '<span>' + text + '</span>' + (extra || '') + '</button>';
    };
    popoverZeigen(anker, '<div class="nb-pop-titel">Seite ' + (i + 1) + ' von ' + E.seiten.length + '</div>' +
      m('lz', s.lz ? 'Lesezeichen bearbeiten' : 'Lesezeichen hinzufügen', 'lesezeichen') +
      m('neu', 'Neue Seite danach', 'plus') +
      m('kopie', 'Seite duplizieren', 'kopieren') +
      m('ablage', 'Seite kopieren', 'kopieren', '<small>für ein anderes Notizbuch</small>') +
      (ablage ? m('einfuegen', 'Kopierte Seite einfügen', 'plus') : '') +
      m('drehen', 'Seite drehen', 'drehen') +
      m('vorlage', 'Vorlage wechseln', 'seiten') +
      m('gehe', 'Gehe zu Seite', 'chevronrechts', '<small>' + (i + 1) + ' von ' + E.seiten.length + '</small>') +
      m('uebersicht', 'Alle Seiten · sortieren', 'seiten') +
      m('inhalt', 'Inhaltsverzeichnis', 'lesezeichen') +
      '<div class="nb-pop-unter">Einfügen und Teilen</div>' +
      m('bild', 'Bild einfügen …', 'bild') +
      m('pdf-rein', 'PDF-Seiten einfügen …', 'seiten') +
      m('pdf-raus', 'Als PDF exportieren', 'teilen') +
      '<div class="nb-pop-unter">Mit KI lernen</div>' +
      '<button class="nb-menue nb-ki-menue" data-m="ki-zus">' + icon('funke') + 'Zusammenfassen</button>' +
      '<button class="nb-menue nb-ki-menue" data-m="ki-karten">' + icon('funke') + 'Karteikarten erstellen</button>' +
      '<button class="nb-menue nb-ki-menue" data-m="ki-quiz">' + icon('funke') + 'Quiz erstellen</button>' +
      ((E.buch.lernen || []).length ? '<button class="nb-menue" data-m="lernen">Gespeicherte Lernsets (' + E.buch.lernen.length + ')</button>' : '') +
      '<div class="nb-pop-unter">Seite leeren oder löschen</div>' +
      m('objekte', 'Bestimmte Objekte löschen', 'filter') +
      '<button class="nb-menue nb-mit-icon nb-rot" data-m="leeren">' + icon('radierer') + '<span>Seite leeren</span></button>' +
      '<button class="nb-menue nb-mit-icon nb-rot" data-m="weg">' + icon('loeschen') + '<span>Seite löschen</span></button>' +
      '<div class="nb-pop-unter">Einstellungen</div>' +
      umschalterHTML('ausrichten', W.ausrichten !== false, 'Objekte ausrichten', 'Hilfslinien beim Verschieben') +
      umschalterHTML('horizontal', !!W.horizontal, 'Seitenweise blättern (horizontal)') +
      umschalterHTML('finger', W.finger, 'Mit Finger schreiben') +
      umschalterHTML('fingerTipps', W.fingerTipps !== false, 'Fingertipps für Rückgängig', 'Zwei Finger tippen = rückgängig, drei = wiederholen') +
      m('leiste', 'Werkzeugleiste anpassen', 'filter'),
      function (p) {
        p.addEventListener('click', function (e) {
          const b = e.target.closest('button');
          if (!b) return;
          const a = b.getAttribute('data-m');
          if (!a) return;
          popoverSchliessen();
          if (a === 'neu') seiteHinzufuegen(i);
          else if (a === 'lz') lesezeichenPopover(E.el.lesezeichen);
          else if (a === 'kopie') seiteDuplizieren(i);
          else if (a === 'ablage') seiteInAblage(i);
          else if (a === 'einfuegen') ablageEinfuegen(i);
          else if (a === 'drehen') seiteDrehen(i);
          else if (a === 'vorlage') vorlageGalerie({ titel: 'Vorlage wechseln', v: s.v, papier: s.papier, quer: s.b > s.h, format: E.buch.format, seite: true,
            fertig: function (w) { vorlageFuerSeiten(w.alle ? E.seiten.map(function (x, k) { return k; }) : [i], w); } });
          else if (a === 'gehe') {
            const n = Number(prompt('Zu welcher Seite? (1–' + E.seiten.length + ')', String(i + 1)));
            if (n >= 1 && n <= E.seiten.length) zuSeite(n - 1);
          }
          else if (a === 'inhalt') lesezeichenPopover(E.el.lesezeichen);
          else if (a === 'uebersicht') uebersichtZeigen();
          else if (a === 'bild') E.el.bildDatei.click();
          else if (a === 'pdf-rein') E.el.pdfDatei.click();
          else if (a === 'pdf-raus') pdfExportieren(E.buch, E.seiten);
          else if (a === 'ki-zus') zusammenfassen();
          else if (a === 'ki-karten') lernenErstellen('karten');
          else if (a === 'ki-quiz') lernenErstellen('quiz');
          else if (a === 'lernen') lernenListe(E.buch, true);
          else if (a === 'objekte') objekteLoeschenPopover(E.el.root.querySelector('[data-nb-aktion=mehr]'), i);
          else if (a === 'leeren') { if (confirm('Alles auf Seite ' + (i + 1) + ' löschen?')) seiteLeeren(i); }
          else if (a === 'weg') { if (confirm('Seite ' + (i + 1) + ' wirklich löschen?')) seiteLoeschen(i); }
          else if (a === 'leiste') leisteAnpassen(E.el.root.querySelector('[data-nb-aktion=mehr]'));
        });
        p.addEventListener('change', function (e) {
          const u = e.target.getAttribute('data-u');
          if (!u) return;
          W[u] = e.target.checked; werkzeugSpeichern();
          if (u === 'fingerTipps') toast(e.target.checked ? 'Zwei-/Drei-Finger-Tipp ist eingeschaltet' : 'Zwei-/Drei-Finger-Tipp ist ausgeschaltet');
          if (u === 'finger') toast(e.target.checked ? 'Finger schreibt – zwei Finger blättern und zoomen' : 'Nur Apple Pencil schreibt – Finger blättert');
          if (u === 'horizontal') { const k = aktuelleSeite(); layout(); groesseAnpassen(); zuSeite(k); }
        });
      });
  }
  function leisteAnpassen(anker) {
    popoverZeigen(anker, '<div class="nb-pop-titel">Werkzeugleiste anpassen</div>' +
      HAUPT.map(function (h) {
        return '<label class="nb-umschalter nb-mit-icon">' + icon(h === 'stift' ? 'fueller' : h) + '<span>' + NAMEN[h] + '</span><input type="checkbox" data-h="' + h + '"' + (W.leiste[h] !== false ? ' checked' : '') + '><i></i></label>';
      }).join(''),
      function (p) {
        p.addEventListener('change', function (e) {
          const h = e.target.getAttribute('data-h'); if (!h) return;
          W.leiste[h] = e.target.checked; werkzeugSpeichern();
          const k = E.el.root.querySelector('[data-nb-haupt=' + h + ']'); if (k) k.hidden = !e.target.checked;
        });
      });
  }
  /* ---------- Bestimmte Objekte löschen ---------- */
  function objekteLoeschenPopover(anker, i) {
    const arten = [['schrift', 'Handschrift'], ['marker', 'Textmarker'], ['formen', 'Formen und Pfeile'], ['tape', 'Tape'], ['text', 'Textfelder'], ['zettel', 'Notizzettel'], ['bilder', 'Bilder']];
    popoverZeigen(anker, '<div class="nb-pop-titel">Bestimmte Objekte löschen</div>' +
      arten.map(function (a) { return '<label class="nb-umschalter"><span>' + a[1] + '</span><input type="checkbox" data-a="' + a[0] + '"><i></i></label>'; }).join('') +
      '<div class="nb-lz-knoepfe"><button class="btn btn-klein btn-danger" data-los="1">Löschen</button></div>',
      function (p) {
        p.addEventListener('click', function (e) {
          if (!e.target.closest('[data-los]')) return;
          const wahl = {}; $$(p, 'input:checked').forEach(function (c) { wahl[c.getAttribute('data-a')] = true; });
          popoverSchliessen();
          const seite = E.seiten[i];
          const art = function (st) { return st.w === 'marker' ? 'marker' : st.w === 'tape' ? 'tape' : st.w === 'form' ? 'formen' : 'schrift'; };
          const ok = aendern(seite, function () {
            if (wahl.schrift || wahl.marker || wahl.formen || wahl.tape) seite.striche = seite.striche.filter(function (st) { return !wahl[art(st)]; });
            if (wahl.text || wahl.zettel) seite.texte = seite.texte.filter(function (t) { return !wahl[t.bg ? 'zettel' : 'text']; });
            if (wahl.bilder) seite.bilder = [];
          });
          planeAlles();
          if (ok) toast('Gelöscht', true); else toast('Nichts zum Löschen gefunden.');
        });
      });
  }
  /* ---------- Seite drehen ---------- */
  function seiteDrehen(i) {
    textBeenden(); auswahlAufheben(true);
    const s = E.seiten[i], B = s.b, H = s.h;
    const vorher = { b: s.b, h: s.h, striche: s.striche, texte: s.texte, bilder: s.bilder, hgRot: s.hgRot || 0 };
    const dreh = function (x, y) { return [r2(H - y), r2(x)]; };                // 90° im Uhrzeigersinn
    const striche = s.striche.map(function (st) {
      const q = st.p.slice();
      for (let k = 0; k < q.length; k += 3) { const n = dreh(q[k], q[k + 1]); q[k] = n[0]; q[k + 1] = n[1]; }
      return Object.assign({}, st, { p: q });
    });
    const texte = s.texte.map(function (t) {
      const h = textHoehe(t), mx = t.x + t.w / 2, my = t.y + h / 2, n = dreh(mx, my);
      return Object.assign({}, t, { x: r2(grenze(n[0] - t.w / 2, 0, Math.max(0, H - t.w))), y: r2(grenze(n[1] - h / 2, 0, Math.max(0, B - h))) });
    });
    const bilder = s.bilder.map(function (bi) {
      const mx = bi.x + bi.w / 2, my = bi.y + bi.h / 2, n = dreh(mx, my);
      return Object.assign({}, bi, { x: r2(n[0] - bi.h / 2), y: r2(n[1] - bi.w / 2), w: bi.h, h: bi.w, r: ((bi.r || 0) + 90) % 360 });
    });
    const nachher = { b: H, h: B, striche: striche, texte: texte, bilder: bilder, hgRot: ((s.hgRot || 0) + 90) % 360 };
    Object.assign(s, nachher);
    aktionMerken({ typ: 'seite-meta', id: s.id, vorher: vorher, nachher: nachher });
    schmutzig(s); layout(); kameraBegrenzen(); planeAlles();
    toast('Seite gedreht', true);
  }
  function bildMalen(ctx, im, x, y, w, h, rot) {
    if (!rot) { ctx.drawImage(im, x, y, w, h); return; }
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot * Math.PI / 180);
    const ww = rot % 180 ? h : w, hh = rot % 180 ? w : h;
    ctx.drawImage(im, -ww / 2, -hh / 2, ww, hh);
    ctx.restore();
  }
  /* ---------- Seite kopieren und in anderes Notizbuch einfügen ---------- */
  const ABLAGE_KEY = 'schulplaner.notizen.ablage';
  function ablageLesen() { try { const a = JSON.parse(localStorage.getItem(ABLAGE_KEY) || 'null'); return a && a.seite ? a : null; } catch (e) { return null; } }
  function seiteInAblage(i) {
    const s = E.seiten[i];
    try {
      localStorage.setItem(ABLAGE_KEY, JSON.stringify({ seite: s, buch: E.buch.id, zeit: jetzt() }));
      toast('Seite kopiert – in einem anderen Notizbuch über ⋯ „Kopierte Seite einfügen“');
    } catch (e) { toast('Seite ist zu groß zum Kopieren.'); }
  }
  async function ablageEinfuegen(i) {
    const a = ablageLesen();
    if (!a) return;
    const s = JSON.parse(JSON.stringify(a.seite));
    s.id = uid(); s.buch = E.buch.id; s.erstellt = jetzt(); s.g = jetzt(); delete s.lz; delete s.ocr;
    s.striche.forEach(function (x) { x.id = uid(); }); s.texte.forEach(function (x) { x.id = uid(); }); s.bilder.forEach(function (x) { x.id = uid(); });
    // Bilder/PDF-Hintergrund für dieses Notizbuch kopieren
    const ids = []; if (s.hg) ids.push(s.hg); s.bilder.forEach(function (b) { ids.push(b.d); });
    const neu = {};
    for (const id of ids) {
      if (neu[id]) continue;
      const d = await holen('dateien', id).catch(function () { return null; });
      if (d && d.blob) neu[id] = await dateiSpeichern(d.blob, E.buch.id);
    }
    if (s.hg) s.hg = neu[s.hg] || null;
    s.bilder = s.bilder.filter(function (b) { return neu[b.d]; }).map(function (b) { return Object.assign(b, { d: neu[b.d] }); });
    const index = i + 1;
    E.seiten.splice(index, 0, s);
    aktionMerken({ typ: 'seite-neu', index: index, seite: s });
    schmutzig(s); layout(); kameraBegrenzen(); zuSeite(index);
    toast('Seite eingefügt');
  }
  /* ---------- Vorlage ändern ---------- */
  function vorlageFuerSeiten(liste, w) {
    liste.forEach(function (i) {
      const s = E.seiten[i];
      if (!s) return;
      const vorher = { v: s.v, papier: s.papier, b: s.b, h: s.h }, nachher = { v: s.hg ? s.v : w.v, papier: w.papier, b: s.b, h: s.h };
      if (!s.hg && w.quer !== (s.b > s.h)) { nachher.b = s.h; nachher.h = s.b; }
      Object.assign(s, nachher);
      aktionMerken({ typ: 'seite-meta', id: s.id, vorher: vorher, nachher: nachher });
      schmutzig(s);
    });
    E.buch.vorlage = w.v; E.buch.papier = w.papier; E.buch.quer = !!w.quer; E.buch.metaG = jetzt(); E.buchGeaendert = true;
    layout(); kameraBegrenzen(); planeAlles();
  }
  /* Vorlagen-Galerie wie bei GoodNotes */
  function vorlageGalerie(o) {
    const z = { v: o.v || 'liniert', papier: o.papier || 'weiss', quer: !!o.quer, alle: false };
    const ov = document.createElement('dialog');
    ov.className = 'nb-galerie-dlg';
    document.body.appendChild(ov);
    const schliessen = function () { try { ov.close(); } catch (e) { } ov.remove(); };
    const zeichnen = function () {
      ov.innerHTML = '<div class="nb-ki-karte"><div class="nb-ki-kopf"><b>' + esc(o.titel || 'Vorlage') + '</b><button class="nb-knopf" data-zu aria-label="Schließen">' + icon('schliessen') + '</button></div>' +
        '<div class="nb-gal-optionen"><div class="nb-papierwahl">' + PAPIER_NAMEN.map(function (p) {
          return '<button type="button" data-p="' + p[0] + '" class="' + (z.papier === p[0] ? 'aktiv' : '') + '"><span style="background:' + PAPIER[p[0]] + '"></span>' + p[1] + '</button>';
        }).join('') + '</div><div class="nb-segment"><button class="' + (!z.quer ? 'aktiv' : '') + '" data-q="0">Hochformat</button><button class="' + (z.quer ? 'aktiv' : '') + '" data-q="1">Querformat</button></div></div>' +
        '<div class="nb-ki-text nb-gal-liste">' + VORLAGEN_GRUPPEN.map(function (g) {
          return '<div class="nb-gal-gruppe"><h4>' + g[0] + '</h4><div class="nb-gal-reihe">' + g[1].map(function (v) {
            return '<button type="button" class="nb-gal-v' + (z.v === v[0] ? ' aktiv' : '') + '" data-v="' + v[0] + '"><canvas data-vc="' + v[0] + '"></canvas><span>' + v[1] + '</span></button>';
          }).join('') + '</div></div>';
        }).join('') + '</div>' +
        '<div class="nb-ki-fuss">' + (o.seite ? '<label class="nb-gal-alle"><input type="checkbox" data-alle' + (z.alle ? ' checked' : '') + '> Für alle Seiten</label>' : '') +
        '<span style="margin-left:auto"></span><button class="btn" data-zu>Abbrechen</button><button class="btn btn-primary" data-ok>Übernehmen</button></div></div>';
      $$(ov, 'canvas[data-vc]').forEach(function (c) { vorlageVorschau(c, c.getAttribute('data-vc'), z.papier, z.quer, o.format); });
    };
    ov.showModal();
    zeichnen();
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-zu]')) { schliessen(); return; }
      const v = e.target.closest('[data-v]'); if (v) { z.v = v.getAttribute('data-v'); $$(ov, '.nb-gal-v').forEach(function (x) { x.classList.toggle('aktiv', x === v); }); return; }
      const p = e.target.closest('[data-p]'); if (p) { z.papier = p.getAttribute('data-p'); const y = ov.querySelector('.nb-gal-liste').scrollTop; zeichnen(); ov.querySelector('.nb-gal-liste').scrollTop = y; return; }
      const q = e.target.closest('[data-q]'); if (q) { z.quer = q.getAttribute('data-q') === '1'; const y = ov.querySelector('.nb-gal-liste').scrollTop; zeichnen(); ov.querySelector('.nb-gal-liste').scrollTop = y; return; }
      if (e.target.closest('[data-ok]')) { const a = ov.querySelector('[data-alle]'); z.alle = !!(a && a.checked); schliessen(); o.fertig(z); }
    });
    ov.addEventListener('change', function (e) { if (e.target.hasAttribute('data-alle')) z.alle = e.target.checked; });
    ov.addEventListener('cancel', function (e) { e.preventDefault(); schliessen(); });
  }

  /* ---------- Nur lesen ---------- */
  function nurLesenUmschalten() {
    textBeenden(); auswahlAufheben();
    E.nurLesen = !E.nurLesen;
    E.el.root.classList.toggle('nb-nurlesen', E.nurLesen);
    const b = E.el.root.querySelector('[data-nb-aktion=nurlesen]');
    if (b) b.classList.toggle('aktiv', E.nurLesen);
    zeile2Zeichnen(); planeAlles();
    toast(E.nurLesen ? 'Nur lesen – Schreiben ist gesperrt' : 'Bearbeiten wieder möglich');
  }

  /* ---------- Audio-Aufnahme ---------- */
  function dauerText(ms) { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function audioUmschalten() {
    if (E.aufnahme) { E.aufnahme.rec.stop(); return; }
    const liste = E.buch.aufnahmen || [];
    if (!liste.length) { aufnahmeStarten(); return; }
    popoverZeigen(E.el.root.querySelector('[data-nb-haupt=audio]'), '<div class="nb-pop-titel">Aufnahmen</div>' +
      '<button class="nb-menue nb-aufnahme-start" data-start="1"><span class="nb-rec"></span>Neue Aufnahme starten</button>' +
      '<div class="nb-pop-linie"></div><div class="nb-aufnahmen">' + aufnahmenHTML() + '</div>',
      function (p) { aufnahmenBinden(p); });
  }
  function aufnahmenHTML() {
    const liste = (E.buch.aufnahmen || []).slice().reverse();
    if (!liste.length) return '<div class="nb-lz-leer">Noch keine Aufnahmen. Tippe auf das Mikrofon, um den Unterricht aufzunehmen.</div>';
    return liste.map(function (a) {
      const i = E.seiten.findIndex(function (s) { return s.id === a.seite; });
      return '<div class="nb-aufnahme" data-id="' + a.id + '"><button class="nb-play" data-play="' + a.id + '" aria-label="Abspielen">' + icon('play') + '</button>' +
        '<div><b>' + esc(a.titel) + '</b><small>' + dauerText(a.dauer) + (i >= 0 ? ' · Seite ' + (i + 1) : '') + '</small></div>' +
        (i >= 0 ? '<button class="nb-mini" data-zu="' + i + '">Zur Seite</button>' : '') +
        '<button class="nb-mini" data-weg="' + a.id + '" aria-label="Löschen">' + icon('loeschen') + '</button><audio preload="none"></audio></div>';
    }).join('');
  }
  function aufnahmenBinden(p) {
    p.addEventListener('click', async function (e) {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-start')) { popoverSchliessen(); aufnahmeStarten(); return; }
      if (b.hasAttribute('data-zu')) { zuSeite(Number(b.getAttribute('data-zu'))); return; }
      if (b.hasAttribute('data-weg')) {
        if (!confirm('Diese Aufnahme löschen?')) return;
        const id = b.getAttribute('data-weg');
        E.buch.aufnahmen = (E.buch.aufnahmen || []).filter(function (a) { return a.id !== id; });
        E.buch.aufnahmenWeg = Object.assign({}, E.buch.aufnahmenWeg || {}); E.buch.aufnahmenWeg[id] = jetzt();
        E.buchGeaendert = true; buchSchmutzig();
        b.closest('.nb-aufnahme').remove(); return;
      }
      if (b.hasAttribute('data-play')) {
        const zeile = b.closest('.nb-aufnahme'), au = zeile.querySelector('audio');
        if (!au.src) {
          const a = (E.buch.aufnahmen || []).find(function (x) { return x.id === b.getAttribute('data-play'); });
          const d = a && await holen('dateien', a.d).catch(function () { return null; });
          if (!d || !d.blob) { toast('Aufnahme nicht gefunden – erst abgleichen?'); return; }
          au.src = URL.createObjectURL(d.blob);
          au.addEventListener('ended', function () { b.innerHTML = icon('play'); });
        }
        if (au.paused) { $$(p, 'audio').forEach(function (x) { if (x !== au) x.pause(); }); au.play(); b.innerHTML = icon('pause'); }
        else { au.pause(); b.innerHTML = icon('play'); }
      }
    });
  }
  async function aufnahmeStarten() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder !== 'function') {
      alert('Dieser Browser kann leider nicht aufnehmen.'); return;
    }
    let strom;
    try { strom = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { alert('Kein Zugriff auf das Mikrofon. Bitte in den Einstellungen des Geräts erlauben.'); return; }
    if (!E) { strom.getTracks().forEach(function (t) { t.stop(); }); return; }
    const typ = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(function (t) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); }) || '';
    let rec;
    try { rec = new MediaRecorder(strom, typ ? { mimeType: typ } : undefined); } catch (e) { rec = new MediaRecorder(strom); }
    const ed = E, teile = [], start = Date.now(), seite = ed.seiten[aktuelleSeite()];
    let fertigOk;
    const fertig = new Promise(function (ok) { fertigOk = ok; });
    rec.ondataavailable = function (e) { if (e.data && e.data.size) teile.push(e.data); };
    rec.onstop = async function () {
      strom.getTracks().forEach(function (t) { t.stop(); });
      clearInterval(ed.aufnahme && ed.aufnahme.takt);
      ed.aufnahme = null;
      const k = ed.el.root.querySelector('[data-nb-haupt=audio]'); if (k) k.classList.remove('nimmt-auf');
      if (ed.el.aufnahmeAnzeige) { ed.el.aufnahmeAnzeige.remove(); ed.el.aufnahmeAnzeige = null; }
      try {
        const blob = new Blob(teile, { type: rec.mimeType || typ || 'audio/webm' });
        if (blob.size) {
          const id = await dateiSpeichern(blob, ed.buch.id);
          const d = new Date(start);
          const a = { id: uid(), d: id, start: start, dauer: Date.now() - start, seite: seite && seite.id,
            titel: 'Aufnahme ' + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '. ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') };
          ed.buch.aufnahmen = (ed.buch.aufnahmen || []).concat([a]);
          ed.buchGeaendert = true;
          if (E === ed) { buchSchmutzig(); toast('Aufnahme gespeichert (' + dauerText(a.dauer) + ')'); } else await buchSpeichern(ed.buch);
        }
      } catch (e) { alert('Aufnahme konnte nicht gespeichert werden: ' + e.message); }
      fertigOk();
    };
    rec.start(1000);
    const anz = document.createElement('button');
    anz.className = 'nb-aufnahme-anzeige';
    anz.innerHTML = '<span class="nb-rec"></span><b>0:00</b><span>Stopp</span>';
    anz.addEventListener('click', function () { rec.stop(); });
    E.el.flaeche.appendChild(anz);
    E.el.aufnahmeAnzeige = anz;
    const k = E.el.root.querySelector('[data-nb-haupt=audio]'); if (k) k.classList.add('nimmt-auf');
    E.aufnahme = { rec: rec, start: start, fertig: fertig, takt: setInterval(function () { anz.querySelector('b').textContent = dauerText(Date.now() - start); }, 500) };
    toast('Aufnahme läuft – frag vorher, ob Aufnehmen erlaubt ist.', false, 3500);
  }

  /* ---------- Seitenleiste (wie bei GoodNotes) ---------- */
  const LEISTE_B = 236;
  function seitenleisteUmschalten() {
    const breit = E.el.root.clientWidth >= 720;
    if (!breit) { uebersichtZeigen(); return; }
    if (E.el.seitenleiste) { E.el.seitenleiste.remove(); E.el.seitenleiste = null; E.el.root.classList.remove('mit-leiste'); }
    else { E.leisteTab = E.leisteTab || 'seiten'; seitenleisteBauen(); E.el.root.classList.add('mit-leiste'); }
    const b = E.el.root.querySelector('[data-nb-aktion=seitenleiste]'); if (b) b.classList.toggle('aktiv', !!E.el.seitenleiste);
    groesseAnpassen();
  }
  function seitenleisteBauen() {
    if (!E.el.seitenleiste) {
      const el = document.createElement('aside');
      el.className = 'nb-seitenleiste';
      E.el.root.appendChild(el);
      E.el.seitenleiste = el;
      el.addEventListener('click', seitenleisteKlick);
    }
    const el = E.el.seitenleiste;
    el.style.top = E.el.root.querySelector('.nb-leiste').offsetHeight + 'px';
    const tabs = [['seiten', 'seiten', 'Seiten'], ['gliederung', 'liste', 'Gliederung'], ['lesezeichen', 'lesezeichen', 'Lesezeichen'], ['audio', 'audio', 'Audio']];
    let inhalt = '';
    if (E.leisteTab === 'seiten' || E.leisteTab === 'lesezeichen') {
      const nur = E.leisteTab === 'lesezeichen';
      const liste = E.seiten.map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return !nur || x.s.lz; });
      inhalt = '<div class="nb-sl-gitter' + (nur ? '' : ' nb-sl-sortierbar') + '">' + liste.map(function (x) {
        return '<div class="nb-ueb-seite nb-sl-seite" data-id="' + x.s.id + '"><div class="nb-ueb-bild" style="aspect-ratio:' + x.s.b + '/' + x.s.h + '"><canvas></canvas>' +
          (x.s.lz ? '<span class="nb-ueb-band"></span>' : '') + '</div><div class="nb-ueb-fuss"><span class="nb-ueb-nr">' + (x.i + 1) + (x.s.lz && x.s.lz.t ? ' · ' + esc(x.s.lz.t) : '') + '</span>' +
          (nur ? '' : '<button data-kopie="1" title="Duplizieren">' + icon('kopieren') + '</button><button data-weg="1" title="Löschen">' + icon('loeschen') + '</button>') + '</div></div>';
      }).join('') + (nur ? (liste.length ? '' : '<div class="nb-lz-leer">Noch keine Lesezeichen.</div>') : '<button class="nb-sl-neu" data-neu="1">' + icon('plus') + 'Seite hinzufügen</button>') + '</div>';
    } else if (E.leisteTab === 'gliederung') {
      const liste = [];
      E.seiten.forEach(function (s, i) { if (s.lz) liste.push({ i: i, t: lesezeichenTitel(s, i) }); });
      inhalt = '<div class="nb-sl-text">' + (liste.length ? liste.map(function (x) {
        return '<button class="nb-menue nb-lz-eintrag" data-zu="' + x.i + '"><span>' + esc(x.t) + '</span><small>S. ' + (x.i + 1) + '</small></button>';
      }).join('') : '<div class="nb-lz-leer">Die Gliederung entsteht aus deinen Lesezeichen. Gib ihnen einen Titel wie „Kapitel 3“.</div>') + '</div>';
    } else {
      inhalt = '<div class="nb-sl-text"><button class="nb-menue nb-aufnahme-start" data-start="1"><span class="nb-rec"></span>Neue Aufnahme</button><div class="nb-aufnahmen">' + aufnahmenHTML() + '</div></div>';
    }
    el.innerHTML = '<div class="nb-sl-tabs">' + tabs.map(function (t) {
      return '<button class="' + (E.leisteTab === t[0] ? 'aktiv' : '') + '" data-tab="' + t[0] + '" title="' + t[2] + '">' + icon(t[1]) + '</button>';
    }).join('') + '<button data-grid="1" title="Alle Seiten groß">' + icon('raster') + '</button></div><div class="nb-sl-inhalt">' + inhalt + '</div>';
    if (E.leisteTab === 'audio') aufnahmenBinden(el);
    const gitter = el.querySelector('.nb-sl-sortierbar');
    if (gitter) el._sort = sortierbar(gitter, function () { seitenleisteMarkieren(); });
    seitenleisteMarkieren();
    (async function () {
      const kacheln = $$(el, '.nb-sl-seite');
      for (const k of kacheln) {
        if (!k.isConnected || !E) return;
        const s = E.seiten.find(function (x) { return x.id === k.getAttribute('data-id'); });
        if (!s) continue;
        try { const c = await seiteRendern(s, 180), z = k.querySelector('canvas'); z.width = c.width; z.height = c.height; z.getContext('2d').drawImage(c, 0, 0); } catch (e) { }
      }
    })();
  }
  function seitenleisteKlick(e) {
    const el = E.el.seitenleiste;
    if (el._sort && el._sort.unterdruecken && e.target.closest('.nb-sl-gitter')) { el._sort.unterdruecken = false; return; }
    const t = e.target.closest('[data-tab]');
    if (t) { E.leisteTab = t.getAttribute('data-tab'); seitenleisteBauen(); return; }
    if (e.target.closest('[data-grid]')) { uebersichtZeigen(); return; }
    if (e.target.closest('[data-neu]')) { seiteHinzufuegen(E.seiten.length - 1); seitenleisteBauen(); return; }
    const zu = e.target.closest('[data-zu]');
    if (zu && E.leisteTab === 'gliederung') { zuSeite(Number(zu.getAttribute('data-zu'))); return; }
    if (E.leisteTab === 'audio') { if (e.target.closest('[data-start]')) aufnahmeStarten(); return; }
    const kachel = e.target.closest('.nb-sl-seite');
    if (!kachel) return;
    const i = E.seiten.findIndex(function (x) { return x.id === kachel.getAttribute('data-id'); });
    if (i < 0) return;
    if (e.target.closest('[data-weg]')) { if (confirm('Seite ' + (i + 1) + ' wirklich löschen?')) { seiteLoeschen(i); seitenleisteBauen(); } return; }
    if (e.target.closest('[data-kopie]')) { seiteDuplizieren(i); seitenleisteBauen(); return; }
    zuSeite(i);
  }
  function seitenleisteMarkieren() {
    const el = E && E.el.seitenleiste;
    if (!el) return;
    const id = E.seiten[aktuelleSeite()] && E.seiten[aktuelleSeite()].id;
    $$(el, '.nb-sl-seite').forEach(function (k, n) {
      const an = k.getAttribute('data-id') === id;
      if (an !== k.classList.contains('aktuell')) { k.classList.toggle('aktuell', an); if (an) k.scrollIntoView({ block: 'nearest' }); }
      const i = E.seiten.findIndex(function (x) { return x.id === k.getAttribute('data-id'); }), s = E.seiten[i], nr = k.querySelector('.nb-ueb-nr');
      if (nr && s) { const t = (i + 1) + (s.lz && s.lz.t ? ' · ' + s.lz.t : ''); if (nr.textContent !== t) nr.textContent = t; }
    });
  }

  function sortierbar(gitter, danach) {
    const st = { unterdruecken: false };
    /* Ziehen: Finger lange drücken, Maus/Stift einfach ziehen */
    let zug = null;
    gitter.addEventListener('pointerdown', function (e) {
      const kachel = e.target.closest('.nb-ueb-seite');
      if (!kachel || e.target.closest('button') || zug) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      zug = { kachel: kachel, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, aktiv: false, typ: e.pointerType,
        vorher: E.seiten.map(function (s) { return s.id; }) };
      if (e.pointerType === 'touch') zug.timer = setTimeout(function () { if (zug && !zug.aktiv) zugStarten(); }, 330);
    });
    function zugStarten() {
      zug.aktiv = true;
      try { gitter.setPointerCapture(zug.id); } catch (x) { }
      const r = zug.kachel.getBoundingClientRect();
      const geist = zug.kachel.cloneNode(true);
      const quelle = zug.kachel.querySelector('canvas'), ziel = geist.querySelector('canvas');
      if (quelle && ziel) { ziel.width = quelle.width; ziel.height = quelle.height; ziel.getContext('2d').drawImage(quelle, 0, 0); }
      geist.className = 'nb-ueb-seite nb-ueb-geist';
      geist.style.width = r.width + 'px';
      geist.style.left = r.left + 'px'; geist.style.top = r.top + 'px';
      zug.dx = zug.x - r.left; zug.dy = zug.y - r.top;
      document.body.appendChild(geist);
      zug.geist = geist;
      zug.kachel.classList.add('nb-ueb-platz');
      if (navigator.vibrate) { try { navigator.vibrate(10); } catch (x) { } }
      rollen();
    }
    function rollen() {
      if (!zug || !zug.aktiv) return;
      const r = gitter.getBoundingClientRect();
      if (zug.y < r.top + 70) gitter.scrollTop -= 10;
      else if (zug.y > r.bottom - 70) gitter.scrollTop += 10;
      platzSuchen();
      zug.raf = requestAnimationFrame(rollen);
    }
    function platzSuchen() {
      const kacheln = $$(gitter, '.nb-ueb-seite');
      let ziel = null, nachher = false;
      for (const k of kacheln) {
        if (k === zug.kachel) continue;
        const r = k.getBoundingClientRect();
        if (zug.x >= r.left - 8 && zug.x <= r.right + 8 && zug.y >= r.top - 8 && zug.y <= r.bottom + 8) { ziel = k; nachher = zug.x > r.left + r.width / 2; break; }
      }
      if (!ziel) return;
      if (nachher) { if (ziel.nextSibling !== zug.kachel) gitter.insertBefore(zug.kachel, ziel.nextSibling); }
      else if (ziel.previousSibling !== zug.kachel) gitter.insertBefore(zug.kachel, ziel);
    }
    gitter.addEventListener('pointermove', function (e) {
      if (!zug || e.pointerId !== zug.id) return;
      zug.x = e.clientX; zug.y = e.clientY;
      const weit = Math.hypot(zug.x - zug.x0, zug.y - zug.y0);
      if (!zug.aktiv) {
        if (zug.typ === 'touch') { if (weit > 10) { clearTimeout(zug.timer); zug = null; } return; }   // Finger: normales Scrollen
        if (weit > 8) zugStarten(); else return;
      }
      zug.geist.style.left = (zug.x - zug.dx) + 'px'; zug.geist.style.top = (zug.y - zug.dy) + 'px';
      e.preventDefault();
    });
    gitter.addEventListener('touchmove', function (e) { if (zug && zug.aktiv) e.preventDefault(); }, { passive: false });
    function zugEnde(e) {
      if (!zug || (e && e.pointerId !== zug.id)) return;
      clearTimeout(zug.timer);
      const z = zug; zug = null;
      if (!z.aktiv) return;
      cancelAnimationFrame(z.raf);
      z.geist.remove();
      z.kachel.classList.remove('nb-ueb-platz');
      st.unterdruecken = true;
      setTimeout(function () { st.unterdruecken = false; }, 350);
      const nachher = $$(gitter, '.nb-ueb-seite').map(function (k) { return k.getAttribute('data-id'); });
      seitenVerschieben(z.vorher, nachher);
      if (danach) danach();
      $$(gitter, '.nb-ueb-seite').forEach(function (k, i) {
        const s = E.seiten[i];
        k.querySelector('.nb-ueb-nr').innerHTML = (i + 1) + (s && s.lz && s.lz.t ? ' · ' + esc(s.lz.t) : '');
      });
    }
    gitter.addEventListener('pointerup', zugEnde);
    gitter.addEventListener('pointercancel', zugEnde);
    gitter.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return st;
  }

  /* ---------- Seitenübersicht (mit Sortieren per Ziehen) ---------- */
  function uebersichtZeigen() {
    textBeenden();
    if (E.uebersicht) E.uebersicht.remove();
    const ov = document.createElement('div');
    ov.className = 'nb-uebersicht';
    ov.innerHTML = '<div class="nb-ueb-kopf"><b>Seiten</b><span class="nb-ueb-zahl">' + E.seiten.length + '</span>' +
      '<button class="btn btn-klein" data-u="neu">+ Seite</button><button class="nb-knopf" data-u="zu" aria-label="Schließen">' + icon('schliessen') + '</button></div>' +
      '<div class="nb-ueb-tipp">Zum Sortieren eine Seite gedrückt halten und ziehen.</div>' +
      '<div class="nb-ueb-gitter">' + E.seiten.map(function (s, i) {
        return '<div class="nb-ueb-seite" data-id="' + s.id + '"><div class="nb-ueb-bild" style="aspect-ratio:' + s.b + '/' + s.h + '"><canvas></canvas>' +
          (s.lz ? '<span class="nb-ueb-band" title="' + esc(lesezeichenTitel(s, i)) + '"></span>' : '') + '</div>' +
          '<div class="nb-ueb-fuss"><span class="nb-ueb-nr">' + (i + 1) + (s.lz && s.lz.t ? ' · ' + esc(s.lz.t) : '') + '</span>' +
          '<button data-kopie="1" aria-label="Seite duplizieren" title="Duplizieren">' + icon('kopieren') + '</button>' +
          '<button data-weg="1" aria-label="Seite löschen" title="Löschen">' + icon('loeschen') + '</button></div></div>';
      }).join('') + '</div>';
    E.el.root.appendChild(ov);
    E.uebersicht = ov;
    const gitter = ov.querySelector('.nb-ueb-gitter');
    function indexVon(kachel) { return E.seiten.findIndex(function (x) { return x.id === kachel.getAttribute('data-id'); }); }
    function schliessen() { ov.remove(); if (E) E.uebersicht = null; }
    ov.addEventListener('click', function (e) {
      if (sortSt.unterdruecken && e.target.closest('.nb-ueb-gitter')) { sortSt.unterdruecken = false; e.stopPropagation(); return; }
      const kachel = e.target.closest('.nb-ueb-seite');
      if (e.target.closest('[data-weg]') && kachel) {
        const i = indexVon(kachel);
        if (i >= 0 && confirm('Seite ' + (i + 1) + ' wirklich löschen?')) { schliessen(); seiteLoeschen(i); }
        return;
      }
      if (e.target.closest('[data-kopie]') && kachel) { const i = indexVon(kachel); schliessen(); seiteDuplizieren(i); return; }
      const u = e.target.closest('[data-u]');
      if (u) { const a = u.getAttribute('data-u'); schliessen(); if (a === 'neu') seiteHinzufuegen(E.seiten.length - 1); return; }
      if (kachel) { const i = indexVon(kachel); schliessen(); if (i >= 0) zuSeite(i); }
    });

    const sortSt = sortierbar(gitter);

    (async function () {
      const kacheln = $$(ov, '.nb-ueb-seite');
      for (let i = 0; i < kacheln.length; i++) {
        if (!ov.isConnected || !E) return;
        const s = E.seiten.find(function (x) { return x.id === kacheln[i].getAttribute('data-id'); });
        if (!s) continue;
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
          '<button class="nb-knopf" data-nb-aktion="seitenleiste" title="Seiten" aria-label="Seitenleiste">' + icon('seitenleiste') + '</button>' +
          '<button class="nb-knopf" data-nb-aktion="nurlesen" title="Nur lesen" aria-label="Nur lesen">' + icon('lesen') + '</button>' +
          '<div class="nb-werkzeuge">' + hauptLeisteHTML() + '</div>' +
          '<button class="nb-knopf nb-lz-knopf" data-nb-aktion="lesezeichen" title="Lesezeichen" aria-label="Lesezeichen">' + icon('lesezeichen') + '</button>' +
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
      titel: q('.nb-buchtitel'), bildDatei: q('[data-nb-datei=bild]'), pdfDatei: q('[data-nb-datei=pdf]'),
      lesezeichen: q('[data-nb-aktion=lesezeichen]'), linealKnopf: q('[data-nb-aktion=lineal]')
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
      if (b.hasAttribute('data-nb-haupt')) {
        const h = b.getAttribute('data-nb-haupt');
        if (E.nurLesen) nurLesenUmschalten();
        if (h !== 'bild' && h !== 'audio' && hauptWerkzeug(W.wz) === h) {     // zweiter Tipp: Einstellungen
          if (h === 'stift') stiftPopover(E.el.zeile2.querySelector('.nb-uwz.aktiv') || b, W.wz);
          else if (h === 'lasso') lassoFilterPopover(b);
          else if (h === 'radierer') radiererFilterPopover(b);
          return;
        }
        werkzeugWaehlen(h); return;
      }
      const a = b.getAttribute('data-nb-aktion');
      if (a === 'zurueck') editorSchliessen();
      else if (a === 'undo') rueckgaengig();
      else if (a === 'redo') wiederholen();
      else if (a === 'mehr') menuePopover(b);
      else if (a === 'bild') E.el.bildDatei.click();
      else if (a === 'lesezeichen') lesezeichenPopover(b);
      else if (a === 'lineal') linealUmschalten();
      else if (a === 'nurlesen') nurLesenUmschalten();
      else if (a === 'seitenleiste') seitenleisteUmschalten();
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
  async function oeffnen(id, startSeite) {
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
      popover: null, uebersicht: null, planen: {}, el: null, ro: null,
      tapeOffen: new Set(), formZug: null, laserZug: null, nurLesen: false, leseTipp: null
    };
    if (!buch.seiten || buch.seiten.length !== seiten.length) seiten.forEach(function (s) { E.dirty.add(s.id); });
    document.documentElement.classList.add('nb-offen');
    editorBauen();
    layout();
    werkzeugWaehlen(W.wz);
    knoepfeAktualisieren();
    groesseAnpassen();
    const start = typeof startSeite === 'number' && !isNaN(startSeite) ? grenze(startSeite, 0, seiten.length - 1) : (buch.zuletzt ? grenze(buch.zuletzt.seite || 0, 0, seiten.length - 1) : 0);
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
    if (E.aufnahme) { const f = E.aufnahme.fertig; E.aufnahme.rec.stop(); await f; }
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
    // Lesezeichen als PDF-Gliederung
    const marken = [];
    seiten.forEach(function (s, i) { if (s.lz) marken.push({ i: i, t: lesezeichenTitel(s, i), h: r2(s.h) }); });
    let anzahl = 3 + seiten.length * 3;
    if (marken.length) {
      const wurzel = anzahl, erste = wurzel + 1, letzte = wurzel + marken.length;
      const hex = function (t) {
        let h = 'FEFF';
        for (let k = 0; k < t.length; k++) h += t.charCodeAt(k).toString(16).toUpperCase().padStart(4, '0');
        return '<' + h + '>';
      };
      marken.forEach(function (m, k) {
        const nr = erste + k;
        objekt(nr, '<< /Title ' + hex(m.t) + ' /Parent ' + wurzel + ' 0 R' + (k ? ' /Prev ' + (nr - 1) + ' 0 R' : '') +
          (k < marken.length - 1 ? ' /Next ' + (nr + 1) + ' 0 R' : '') + ' /Dest [' + (3 + m.i * 3) + ' 0 R /XYZ 0 ' + m.h + ' 0] >>');
      });
      objekt(wurzel, '<< /Type /Outlines /First ' + erste + ' 0 R /Last ' + letzte + ' 0 R /Count ' + marken.length + ' >>');
      objekt(1, '<< /Type /Catalog /Pages 2 0 R /Outlines ' + wurzel + ' 0 R /PageMode /UseOutlines >>');
      anzahl = letzte + 1;
    } else objekt(1, '<< /Type /Catalog /Pages 2 0 R >>');
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
        let pdfText = '';
        try { const tc = await seite.getTextContent(); pdfText = tc.items.map(function (x) { return x.str + (x.hasEOL ? '\n' : ' '); }).join('').replace(/[ \t]+/g, ' ').trim(); } catch (e) { }
        ergebnis.push({ b: r2(basis.width), h: r2(basis.height), hg: id, v: 'blanko', pdfText: pdfText });
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
     KI für Notizbücher (Gemini über den Assistenten)
     ============================================================ */
  function kiDa() { return !!(window.Assistent && window.Assistent.verfuegbar && window.Assistent.verfuegbar()); }
  function kiFehltHinweis() {
    alert('Für diese Funktion brauchst du den KI-Assistenten. Trag unter Einstellungen → KI-Assistent deinen Gemini-Schlüssel ein.');
  }
  async function seiteAlsBild(seite, breite) {
    const c = await seiteRendern(seite, breite || 1100);
    const blob = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.82); });
    const url = await alsDataUrl(blob);
    return url.slice(url.indexOf(',') + 1);
  }
  function getippterText(seite) {
    const t = [];
    (seite.texte || []).forEach(function (x) { if (x.text) t.push(x.text); });
    if (seite.pdfText) t.push(seite.pdfText);
    return t.join('\n');
  }
  function brauchtLesen(seite) {
    const hatInhalt = (seite.striche && seite.striche.length) || (seite.bilder && seite.bilder.length) || (seite.hg && !seite.pdfText);
    return !!hatInhalt && !(seite.ocr && seite.ocr.g === seitenZeit(seite));
  }
  /* Handschrift seitenweise von der KI lesen lassen (3 Seiten pro Anfrage) */
  async function seitenLesen(seiten, melden) {
    const offen = seiten.filter(brauchtLesen);
    const schema = { type: 'ARRAY', items: { type: 'OBJECT', properties: { seite: { type: 'INTEGER' }, text: { type: 'STRING' } }, required: ['seite', 'text'] } };
    for (let i = 0; i < offen.length; i += 3) {
      const gruppe = offen.slice(i, i + 3);
      if (melden) melden(Math.min(i + gruppe.length, offen.length), offen.length);
      await Promise.all(gruppe.map(function (s) { return bilderVorbereiten(s); }));
      const teile = [{ text: 'Lies die folgenden ' + gruppe.length + ' Notizbuchseiten eines Schülers. Schreib für jede Seite den gesamten handschriftlichen und gedruckten Text ' +
        'wörtlich ab (Deutsch, Rechtschreibung nicht verbessern). Formeln einfach schreiben, z. B. a^2 + b^2 = c^2 oder Wurzel(x). Zeichnungen kurz in [eckigen Klammern] beschreiben. ' +
        'Leere Seite = leerer Text. Antworte als JSON-Liste mit seite (1 bis ' + gruppe.length + ') und text.' }];
      for (let k = 0; k < gruppe.length; k++) {
        teile.push({ text: 'Seite ' + (k + 1) + ':' });
        teile.push({ inlineData: { mimeType: 'image/jpeg', data: await seiteAlsBild(gruppe[k], 1100) } });
      }
      const antwort = await window.Assistent.gemini({ teile: teile, schema: schema, warten: function () { fortschritt('Limit erreicht – kurz warten …'); } });
      (Array.isArray(antwort) ? antwort : []).forEach(function (a) {
        const s = gruppe[(Number(a.seite) || 0) - 1];
        if (s) s.ocr = { g: seitenZeit(s), t: String(a.text || '').slice(0, 20000) };
      });
      gruppe.forEach(function (s) { if (!s.ocr || s.ocr.g !== seitenZeit(s)) s.ocr = { g: seitenZeit(s), t: '' }; });
      await seitenOhneZeitSpeichern(gruppe);
    }
    return offen.length;
  }
  /* speichert Seiten, ohne den Änderungszeitpunkt zu verstellen (Lesen ist keine Bearbeitung) */
  async function seitenOhneZeitSpeichern(liste) {
    if (E && liste.length && liste[0].buch === E.buch.id) {
      liste.forEach(function (s) { if (E.seiten.indexOf(s) >= 0) E.dirty.add(s.id); });
      const g = liste.map(function (s) { return s.g; });
      await speichern();
      liste.forEach(function (s, i) { s.g = g[i]; });
      return;
    }
    await transaktion(['seiten'], 'readwrite', function (st) { liste.forEach(function (s) { st.seiten.put(s); }); });
  }
  function kiText(seite) { return [seite.ocr && seite.ocr.t, getippterText(seite)].filter(Boolean).join('\n'); }
  /* Inhalt für die KI: wenige Seiten als Bild, viele Seiten als gelesener Text */
  async function kiQuelle(seiten) {
    if (seiten.length <= 4) {
      const teile = [];
      for (let k = 0; k < seiten.length; k++) {
        await bilderVorbereiten(seiten[k]);
        teile.push({ text: 'Seite ' + (k + 1) + (getippterText(seiten[k]) ? ' (getippter Text: ' + getippterText(seiten[k]).slice(0, 4000) + ')' : '') + ':' });
        teile.push({ inlineData: { mimeType: 'image/jpeg', data: await seiteAlsBild(seiten[k], 1100) } });
      }
      return teile;
    }
    await seitenLesen(seiten, function (i, n) { fortschritt('KI liest deine Handschrift … Seite ' + i + ' von ' + n); });
    let text = '';
    seiten.forEach(function (s, k) { const t = kiText(s); if (t) text += '\n--- Seite ' + (k + 1) + ' ---\n' + t; });
    if (!text.trim()) throw new Error('Auf diesen Seiten ist noch nichts zu lesen.');
    return [{ text: 'Mitschrift:\n' + text.slice(0, 120000) }];
  }

  /* ---------- Suche ---------- */
  let suchZaehler = 0, suchTimer = 0;
  function normal(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss'); }
  async function suchen(begriff, max) {
    const q = normal(begriff).trim();
    const erg = { treffer: [], ungelesen: 0 };
    if (!q) return erg;
    const [bs, ss] = await Promise.all([alle('buecher'), alle('seiten')]);
    const nachId = new Map(ss.map(function (s) { return [s.id, s]; }));
    if (E) E.seiten.forEach(function (s) { nachId.set(s.id, s); });
    const woerter = q.split(/\s+/).filter(Boolean);
    sortiert(bs).forEach(function (b) {
      (b.seiten || []).forEach(function (id, idx) {
        const s = nachId.get(id);
        if (!s) return;
        if (brauchtLesen(s)) erg.ungelesen++;
        const roh = [b.titel, s.lz && s.lz.t, kiText(s)].filter(Boolean).join(' · ');
        const n = normal(roh);
        if (!woerter.every(function (w) { return n.indexOf(w) >= 0; })) return;
        const pos = n.indexOf(woerter[0]);
        const start = Math.max(0, pos - 60), stueck = roh.slice(start, start + 180).replace(/\s+/g, ' ');
        erg.treffer.push({ buch: b.id, titel: b.titel, cover: b.cover, seite: idx, auszug: (start ? '…' : '') + stueck + (start + 180 < roh.length ? '…' : '') });
      });
    });
    if (max) erg.treffer = erg.treffer.slice(0, max);
    return erg;
  }
  function markieren(text, begriff) {
    let h = esc(text);
    normal(begriff).split(/\s+/).filter(function (w) { return w.length > 1; }).forEach(function (w) {
      const re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      h = h.replace(re, '<mark>$1</mark>');
    });
    return h;
  }
  function sucheZeigen(el) {
    const box = el.querySelector('.nb-suchergebnis'), inhalt = el.querySelector('.nb-bibinhalt');
    if (!box) return;
    clearTimeout(suchTimer);
    if (!suchText.trim()) { box.hidden = true; box.innerHTML = ''; inhalt.hidden = false; return; }
    suchTimer = setTimeout(async function () {
      const nr = ++suchZaehler, begriff = suchText;
      const erg = await suchen(begriff, 60).catch(function () { return { treffer: [], ungelesen: 0 }; });
      if (nr !== suchZaehler || !box.isConnected) return;
      inhalt.hidden = true; box.hidden = false;
      box.innerHTML = '<div class="nb-suchinfo"><span>' + (erg.treffer.length ? erg.treffer.length + (erg.treffer.length === 1 ? ' Treffer' : ' Treffer') : 'Keine Treffer') +
        (erg.ungelesen ? ' · ' + erg.ungelesen + (erg.ungelesen === 1 ? ' handschriftliche Seite' : ' handschriftliche Seiten') + ' noch nicht gelesen' : '') + '</span>' +
        (erg.ungelesen ? (kiDa() ? '<button class="btn btn-klein btn-primary" data-nb-indexieren>' + icon('funke') + ' Handschrift lesen lassen</button>'
          : '<span>Zum Durchsuchen von Handschrift den KI-Assistenten einrichten.</span>') : '') + '</div>' +
        erg.treffer.map(function (t) {
          const c = COVER[t.cover] || COVER[0];
          return '<button class="nb-treffer" data-nb-treffer="' + t.buch + '|' + t.seite + '"><span class="nb-mini-cover" style="--c1:' + c[0] + ';--c2:' + c[1] + '"></span>' +
            '<span><b>' + esc(t.titel) + '</b><small>Seite ' + (t.seite + 1) + '</small><p>' + markieren(t.auszug, begriff) + '</p></span></button>';
        }).join('');
      const k = box.querySelector('[data-nb-indexieren]');
      if (k) k.addEventListener('click', async function () {
        try {
          const ss = (await alle('seiten')).filter(brauchtLesen);
          const n = await seitenLesen(ss, function (i, m) { fortschritt('KI liest deine Handschrift … Seite ' + i + ' von ' + m); });
          fortschritt(null);
          toast(n + (n === 1 ? ' Seite gelesen' : ' Seiten gelesen'));
        } catch (e) { fortschritt(null); alert(e.message || e); }
        sucheZeigen(el);
      });
    }, 160);
  }

  /* ---------- Zusammenfassen ---------- */
  function kiErgebnisZeigen(titel, text, knoepfe) {
    const ov = document.createElement('div');
    ov.className = 'nb-ki-blatt';
    ov.innerHTML = '<div class="nb-ki-karte"><div class="nb-ki-kopf"><span class="nb-ki-logo">' + icon('funke') + '</span><b>' + esc(titel) + '</b>' +
      '<button class="nb-knopf" data-ki-zu aria-label="Schließen">' + icon('schliessen') + '</button></div>' +
      '<div class="nb-ki-text">' + einfachesMarkdown(text) + '</div><div class="nb-ki-fuss">' +
      knoepfe.map(function (k, i) { return '<button class="btn' + (k.primaer ? ' btn-primary' : '') + '" data-ki-k="' + i + '">' + esc(k.text) + '</button>'; }).join('') +
      '<span class="nb-ki-hinweis">KI kann sich irren – prüf das Wichtigste nach.</span></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-ki-zu]')) { ov.remove(); return; }
      const b = e.target.closest('[data-ki-k]');
      if (b) { const k = knoepfe[Number(b.getAttribute('data-ki-k'))]; if (k.aktion() !== false) ov.remove(); }
    });
    return ov;
  }
  function einfachesMarkdown(text) {
    const zeilen = esc(text).split('\n');
    let h = '', liste = false;
    zeilen.forEach(function (z) {
      const ueber = z.match(/^#{1,4}\s+(.*)$/), punkt = z.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (punkt) { if (!liste) { h += '<ul>'; liste = true; } h += '<li>' + punkt[1] + '</li>'; return; }
      if (liste) { h += '</ul>'; liste = false; }
      if (ueber) h += '<h4>' + ueber[1] + '</h4>';
      else if (z.trim()) h += '<p>' + z + '</p>';
    });
    if (liste) h += '</ul>';
    return h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }
  function kiBereichWaehlen(titel, weiter) {
    const i = aktuelleSeite();
    popoverZeigen(E.el.root.querySelector('[data-nb-aktion=mehr]'), '<div class="nb-pop-titel">' + esc(titel) + '</div>' +
      '<button class="nb-menue" data-b="seite">Nur diese Seite (Seite ' + (i + 1) + ')</button>' +
      (E.seiten.length > 1 ? '<button class="nb-menue" data-b="buch">Ganzes Notizbuch (' + E.seiten.length + ' Seiten)</button>' : '') +
      (E.seiten.some(function (s) { return s.lz; }) ? '<button class="nb-menue" data-b="kapitel">Ab dem letzten Lesezeichen</button>' : ''),
      function (p) {
        p.addEventListener('click', function (e) {
          const b = e.target.closest('[data-b]');
          if (!b) return;
          popoverSchliessen();
          const art = b.getAttribute('data-b');
          let seiten = [E.seiten[i]], name = 'Seite ' + (i + 1);
          if (art === 'buch') { seiten = E.seiten.slice(); name = 'ganzes Notizbuch'; }
          else if (art === 'kapitel') {
            let s0 = 0;
            for (let k = i; k >= 0; k--) if (E.seiten[k].lz) { s0 = k; break; }
            let s1 = E.seiten.length - 1;
            for (let k = s0 + 1; k < E.seiten.length; k++) if (E.seiten[k].lz) { s1 = k - 1; break; }
            seiten = E.seiten.slice(s0, s1 + 1); name = lesezeichenTitel(E.seiten[s0], s0);
          }
          weiter(seiten, name);
        });
      });
  }
  function zusammenfassen() {
    if (!kiDa()) { kiFehltHinweis(); return; }
    textBeenden();
    kiBereichWaehlen('Mit KI zusammenfassen', async function (seiten, name) {
      const ed = E;
      try {
        fortschritt('KI liest und fasst zusammen …');
        const teile = await kiQuelle(seiten);
        fortschritt('KI fasst zusammen …');
        teile.unshift({ text: 'Fasse diese Schul-Mitschrift (' + (ed.buch.titel) + ', ' + name + ') für einen Schüler zusammen: zuerst ein Satz worum es geht, dann die wichtigsten Punkte, ' +
          'Formeln und Begriffe als Liste, zum Schluss „Merke:“ mit 1–3 Kernaussagen. Auf Deutsch, knapp, mit **fett** für Schlüsselbegriffe. Erfinde nichts, was nicht in der Mitschrift steht.' });
        const text = await window.Assistent.gemini({ teile: teile, warten: function () { fortschritt('Limit erreicht – kurz warten …'); } });
        fortschritt(null);
        if (E !== ed) return;
        kiErgebnisZeigen('Zusammenfassung · ' + name, text, [
          { text: 'Als Seite einfügen', primaer: true, aktion: function () { textSeiteEinfuegen('Zusammenfassung – ' + name, text); } },
          { text: 'Kopieren', aktion: function () { try { navigator.clipboard.writeText(text); toast('Kopiert'); } catch (e) { } return false; } }
        ]);
      } catch (e) { fortschritt(null); alert(e.message || e); }
    });
  }
  function textSeiteEinfuegen(titel, text) {
    if (!E) return;
    const i = aktuelleSeite();
    const s = neueSeite(E.buch, { v: 'blanko', papier: E.seiten[i] ? E.seiten[i].papier : E.buch.papier });
    const rein = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,4}\s+/gm, '').replace(/^\s*[*•]\s+/gm, '– ').replace(/^\s*-\s+/gm, '– ');
    s.texte = [
      { id: uid(), x: 36, y: 34, w: s.b - 72, text: titel, g: 18, f: '#1D1D1F', fett: true },
      { id: uid(), x: 36, y: 70, w: s.b - 72, text: rein.slice(0, 6000), g: s.b < 500 ? 10 : 11, f: '#1D1D1F', fett: false }
    ];
    const index = i + 1;
    E.seiten.splice(index, 0, s);
    aktionMerken({ typ: 'seite-neu', index: index, seite: s });
    schmutzig(s); layout(); kameraBegrenzen(); zuSeite(index);
    toast('Zusammenfassung als Seite ' + (index + 1) + ' eingefügt');
  }

  /* ---------- Karteikarten und Quiz ---------- */
  function lernenErstellen(art) {
    if (!kiDa()) { kiFehltHinweis(); return; }
    textBeenden();
    kiBereichWaehlen(art === 'quiz' ? 'Quiz erstellen' : 'Karteikarten erstellen', async function (seiten, name) {
      const ed = E;
      try {
        fortschritt('KI liest deine Mitschrift …');
        const teile = await kiQuelle(seiten);
        fortschritt(art === 'quiz' ? 'KI erstellt das Quiz …' : 'KI erstellt Karteikarten …');
        let schema;
        if (art === 'quiz') {
          teile.unshift({ text: 'Erstelle aus dieser Schul-Mitschrift ein Übungsquiz mit 6 bis 10 Multiple-Choice-Fragen auf Deutsch. Jede Frage hat genau 4 Antworten, genau eine ist richtig ' +
            '(Index 0–3 in „richtig“), die falschen sind plausibel. Gib zu jeder Frage eine kurze Erklärung. Nur Inhalte aus der Mitschrift verwenden.' });
          schema = { type: 'ARRAY', items: { type: 'OBJECT', properties: { frage: { type: 'STRING' }, antworten: { type: 'ARRAY', items: { type: 'STRING' } }, richtig: { type: 'INTEGER' }, erklaerung: { type: 'STRING' } }, required: ['frage', 'antworten', 'richtig'] } };
        } else {
          teile.unshift({ text: 'Erstelle aus dieser Schul-Mitschrift 8 bis 15 Karteikarten zum Lernen auf Deutsch: vorne eine kurze Frage oder ein Begriff, hinten die knappe Antwort (Formeln einfach schreiben). ' +
            'Nur Inhalte aus der Mitschrift verwenden.' });
          schema = { type: 'ARRAY', items: { type: 'OBJECT', properties: { vorne: { type: 'STRING' }, hinten: { type: 'STRING' } }, required: ['vorne', 'hinten'] } };
        }
        let daten = await window.Assistent.gemini({ teile: teile, schema: schema, warten: function () { fortschritt('Limit erreicht – kurz warten …'); } });
        fortschritt(null);
        daten = (Array.isArray(daten) ? daten : []).filter(function (x) {
          return art === 'quiz' ? x && x.frage && Array.isArray(x.antworten) && x.antworten.length >= 2 && x.richtig >= 0 && x.richtig < x.antworten.length : x && x.vorne && x.hinten;
        });
        if (!daten.length) throw new Error('Die KI hat dazu nichts Brauchbares erstellt. Steht auf den Seiten schon genug?');
        if (E !== ed) return;
        const set = { id: uid(), art: art, titel: (art === 'quiz' ? 'Quiz' : 'Karteikarten') + ' · ' + name, erstellt: jetzt(), daten: daten };
        E.buch.lernen = [set].concat(E.buch.lernen || []).slice(0, 12);
        E.buch.metaG = jetzt(); E.buchGeaendert = true; buchSchmutzig();
        lernenStarten(set);
      } catch (e) { fortschritt(null); alert(e.message || e); }
    });
  }
  function lernenListe(buch, ausEditor) {
    const sets = buch.lernen || [];
    const ov = document.createElement('div');
    ov.className = 'nb-ki-blatt';
    ov.innerHTML = '<div class="nb-ki-karte"><div class="nb-ki-kopf"><span class="nb-ki-logo">' + icon('funke') + '</span><b>Lernen · ' + esc(buch.titel) + '</b>' +
      '<button class="nb-knopf" data-ki-zu aria-label="Schließen">' + icon('schliessen') + '</button></div><div class="nb-ki-text">' +
      (sets.length ? sets.map(function (s, i) {
        return '<div class="nb-lernset"><span class="nb-lernset-art">' + (s.art === 'quiz' ? 'Quiz' : 'Karten') + '</span><div><b>' + esc(s.titel) + '</b><small>' + s.daten.length +
          (s.art === 'quiz' ? ' Fragen' : ' Karten') + ' · ' + datumText(s.erstellt) + '</small></div><button class="btn btn-klein btn-primary" data-l="' + i + '">Üben</button>' +
          '<button class="btn btn-klein" data-lw="' + i + '" aria-label="Löschen">' + icon('loeschen') + '</button></div>';
      }).join('') : '<p>Noch nichts zum Lernen da.' + (ausEditor ? '' : ' Öffne das Notizbuch und wähle im Menü ⋯ „Karteikarten erstellen“ oder „Quiz erstellen“.') + '</p>') +
      '</div>' + (ausEditor ? '<div class="nb-ki-fuss"><button class="btn btn-primary" data-neu="karten">Neue Karteikarten</button><button class="btn" data-neu="quiz">Neues Quiz</button></div>' : '') + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', async function (e) {
      if (e.target === ov || e.target.closest('[data-ki-zu]')) { ov.remove(); return; }
      const u = e.target.closest('[data-l]');
      if (u) { ov.remove(); lernenStarten(sets[Number(u.getAttribute('data-l'))]); return; }
      const w = e.target.closest('[data-lw]');
      if (w && confirm('Dieses Lernset löschen?')) {
        buch.lernen = sets.filter(function (x, i) { return i !== Number(w.getAttribute('data-lw')); });
        buch.metaG = jetzt(); buch.geaendert = jetzt();
        if (E && E.buch === buch) { E.buchGeaendert = true; buchSchmutzig(); } else await buchSpeichern(buch);
        ov.remove(); lernenListe(buch, ausEditor); return;
      }
      const n = e.target.closest('[data-neu]');
      if (n) { ov.remove(); lernenErstellen(n.getAttribute('data-neu')); }
    });
  }
  function lernenStarten(set) {
    const ov = document.createElement('div');
    ov.className = 'nb-ki-blatt nb-lernen';
    document.body.appendChild(ov);
    const quiz = set.art === 'quiz';
    let reihe = set.daten.map(function (x, i) { return i; }), pos = 0, umgedreht = false, gewusst = 0, nochmal = [], gewaehlt = -1, punkte = 0;
    function zeichnen() {
      const fertig = pos >= reihe.length;
      let h = '<div class="nb-ki-karte"><div class="nb-ki-kopf"><span class="nb-ki-logo">' + icon('funke') + '</span><b>' + esc(set.titel) + '</b>' +
        '<span class="nb-lern-stand">' + (fertig ? '' : (pos + 1) + ' / ' + reihe.length) + '</span>' +
        '<button class="nb-knopf" data-ki-zu aria-label="Schließen">' + icon('schliessen') + '</button></div>' +
        '<div class="nb-lern-balken"><i style="width:' + Math.round(Math.min(pos, reihe.length) / reihe.length * 100) + '%"></i></div>';
      if (fertig) {
        h += '<div class="nb-lern-ende"><div class="nb-lern-gross">' + (quiz ? punkte + ' / ' + reihe.length : gewusst + ' / ' + reihe.length) + '</div>' +
          '<p>' + (quiz ? (punkte === reihe.length ? 'Alles richtig – stark!' : 'richtig beantwortet') : (nochmal.length ? (nochmal.length === 1 ? '1 Karte solltest du nochmal üben.' : nochmal.length + ' Karten solltest du nochmal üben.') : 'Alles gewusst – super!')) + '</p>' +
          '<div class="nb-ki-fuss">' + (!quiz && nochmal.length ? '<button class="btn btn-primary" data-x="nochmal">Nur die schwierigen nochmal</button>' : '') +
          '<button class="btn' + (quiz || !nochmal.length ? ' btn-primary' : '') + '" data-x="neu">Von vorne</button><button class="btn" data-ki-zu>Fertig</button></div></div>';
      } else if (quiz) {
        const f = set.daten[reihe[pos]];
        h += '<div class="nb-quiz"><div class="nb-quiz-frage">' + esc(f.frage) + '</div>' +
          f.antworten.map(function (a, i) {
            let k = '';
            if (gewaehlt >= 0) k = i === f.richtig ? ' richtig' : (i === gewaehlt ? ' falsch' : ' aus');
            return '<button class="nb-quiz-antwort' + k + '" data-a="' + i + '"' + (gewaehlt >= 0 ? ' disabled' : '') + '><span>' + 'ABCD'[i] + '</span>' + esc(a) + '</button>';
          }).join('') +
          (gewaehlt >= 0 ? '<div class="nb-quiz-erkl">' + (gewaehlt === f.richtig ? '<b>Richtig!</b> ' : '<b>Leider falsch.</b> ') + esc(f.erklaerung || '') + '</div>' +
            '<div class="nb-ki-fuss"><button class="btn btn-primary" data-x="weiter">' + (pos + 1 < reihe.length ? 'Weiter' : 'Ergebnis') + '</button></div>' : '') + '</div>';
      } else {
        const k = set.daten[reihe[pos]];
        h += '<button class="nb-karte' + (umgedreht ? ' um' : '') + '" data-x="drehen"><span class="nb-karte-seite nb-vorne"><small>Frage</small>' + esc(k.vorne) + '</span>' +
          '<span class="nb-karte-seite nb-hinten"><small>Antwort</small>' + esc(k.hinten) + '</span></button>' +
          '<div class="nb-ki-fuss nb-karten-knoepfe">' + (umgedreht ? '<button class="btn" data-x="nochmal1">Nochmal</button><button class="btn btn-primary" data-x="gewusst">Gewusst</button>'
            : '<button class="btn btn-primary" data-x="drehen">Antwort zeigen</button>') + '</div>';
      }
      ov.innerHTML = h + '</div>';
    }
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-ki-zu]')) { ov.remove(); return; }
      const a = e.target.closest('[data-a]');
      if (a && gewaehlt < 0) { gewaehlt = Number(a.getAttribute('data-a')); if (gewaehlt === set.daten[reihe[pos]].richtig) punkte++; zeichnen(); return; }
      const x = e.target.closest('[data-x]');
      if (!x) return;
      const t = x.getAttribute('data-x');
      if (t === 'drehen') umgedreht = !umgedreht;
      else if (t === 'gewusst') { gewusst++; pos++; umgedreht = false; }
      else if (t === 'nochmal1') { nochmal.push(reihe[pos]); pos++; umgedreht = false; }
      else if (t === 'weiter') { pos++; gewaehlt = -1; }
      else if (t === 'nochmal') { reihe = nochmal.slice(); nochmal = []; pos = 0; gewusst = 0; }
      else if (t === 'neu') { reihe = set.daten.map(function (q, i) { return i; }); nochmal = []; pos = 0; gewusst = 0; punkte = 0; gewaehlt = -1; }
      zeichnen();
    });
    ov.tabIndex = -1;
    ov.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') ov.remove();
      if (e.key === ' ' && !quiz) { e.preventDefault(); umgedreht = !umgedreht; zeichnen(); }
    });
    zeichnen();
    try { ov.focus(); } catch (e) { }
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
    return JSON.stringify([b.titel, b.modul_id || null, b.cover, b.vorlage, b.papier, b.format || 'a4', b.ordner || '', (b.lernen || []).length, b.metaG || 0,
      (b.aufnahmen || []).map(function (a) { return a.id; }).join(','), x.seiten.map(function (s) { return s.id + ':' + seitenZeit(s); }),
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
      format: meta.format || 'a4', ordner: meta.ordner || '', lernen: meta.lernen || [],
      aufnahmenWeg: markenVereinen(rb.aufnahmenWeg, lb.aufnahmenWeg),
      aufnahmen: (function () {
        const weg = markenVereinen(rb.aufnahmenWeg, lb.aufnahmenWeg), m = new Map();
        (rb.aufnahmen || []).concat(lb.aufnahmen || []).forEach(function (a) { if (a && a.id && !weg[a.id]) m.set(a.id, a); });
        return Array.from(m.values()).sort(function (x, y) { return x.start - y.start; });
      })(),
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
    (erg.buch.aufnahmen || []).forEach(function (a) { ids.push(a.d); });
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
    const cfgA = driveCfg();
    let kopf = '<div class="nb-bibkopf"><div class="nb-segment nb-bibmodus">' +
      '<button class="' + (bibModus === 'faecher' ? 'aktiv' : '') + '" data-nb-ansicht="faecher">Nach Fach</button>' +
      '<button class="' + (bibModus === 'ordner' ? 'aktiv' : '') + '" data-nb-ansicht="ordner">Ordner</button></div>' +
      '<label class="nb-suchfeld">' + icon('suche') + '<input type="search" data-nb-suche placeholder="In Mitschriften suchen …" value="' + esc(suchText) + '"></label></div>' +
      (cfgA.clientId ? '<div class="nb-stand">Zuletzt mit Google Drive abgeglichen: ' + zeitText(cfgA.zuletzt) + '</div>' : '');
    const neuKarte = function (attr) {
      return '<div class="nb-buch nb-neu-karte" ' + attr + '><div class="nb-cover"><span>+</span></div><div class="nb-info"><div class="nb-titel">Neues Notizbuch</div></div></div>';
    };
    let inhalt = '';
    if (bibModus === 'ordner') {
      const ordner = ordnerListe();
      if (ordnerOffen !== null && ordnerOffen !== '' && !ordner.includes(ordnerOffen) && !leereOrdner.has(ordnerOffen)) ordnerOffen = null;
      if (ordnerOffen === null) {
        const lose = sortiert(buecher.filter(function (b) { return !b.ordner; }));
        const alle = ordner.concat(Array.from(leereOrdner).filter(function (o) { return !ordner.includes(o); }));
        inhalt = '<div class="nb-ordnerleiste"><span>' + alle.length + (alle.length === 1 ? ' Ordner' : ' Ordner') + '</span><button class="btn btn-klein" data-nb-ordnerneu>+ Neuer Ordner</button></div>' +
          '<div class="nb-gitter">' + neuKarte('data-nb-neu=""') + alle.map(ordnerHTML).join('') + lose.map(function (b) { return coverHTML(b); }).join('') + '</div>';
      } else {
        const drin = sortiert(buecher.filter(function (b) { return b.ordner === ordnerOffen; }));
        inhalt = '<div class="nb-ordnerkopf"><button class="zurueck" data-nb-ordnerzurueck>‹ Alle Ordner</button>' +
          '<div class="nb-ordnertitel">' + icon('ordner') + '<b>' + esc(ordnerOffen) + '</b><span>' + drin.length + (drin.length === 1 ? ' Notizbuch' : ' Notizbücher') + '</span></div>' +
          '<div class="nb-ordneraktionen"><button class="btn btn-klein" data-nb-ordnerhinzu>Notizbücher hinzufügen</button>' +
          '<button class="btn btn-klein" data-nb-ordnerumbenennen>Umbenennen</button><button class="btn btn-klein" data-nb-ordneraufloesen>Ordner auflösen</button></div></div>' +
          '<div class="nb-gitter">' + neuKarte('data-nb-neu=""') + drin.map(function (b) { return coverHTML(b); }).join('') + '</div>' +
          (drin.length ? '' : '<div class="leer">Dieser Ordner ist noch leer. Leg hier ein Notizbuch an oder füge vorhandene hinzu.</div>');
      }
    } else {
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
      inhalt = '<div class="nb-filter">' + chips + '</div><div class="nb-gitter">' +
        neuKarte('data-nb-neu="' + (filterModul !== 'alle' && filterModul !== '__ohne__' ? filterModul : '') + '"') +
        liste.map(function (b) { return coverHTML(b); }).join('') + '</div>';
    }
    el.innerHTML = kopf + '<div class="nb-suchergebnis" hidden></div><div class="nb-bibinhalt">' + inhalt + '</div>';
    const feld = el.querySelector('[data-nb-suche]');
    feld.addEventListener('input', function () { suchText = feld.value; sucheZeigen(el); });
    feld.addEventListener('keydown', function (e) { if (e.key === 'Escape') { feld.value = ''; suchText = ''; sucheZeigen(el); } });
    if (suchText) sucheZeigen(el);
  }
  const leereOrdner = new Set();
  function ordnerHTML(name) {
    const drin = buecher.filter(function (b) { return b.ordner === name; });
    const farben = drin.slice(0, 3).map(function (b) { const c = COVER[b.cover] || COVER[0]; return '<i style="--c1:' + c[0] + ';--c2:' + c[1] + '"></i>'; }).join('');
    return '<div class="nb-buch nb-ordner" data-nb-ordner="' + esc(name) + '"><div class="nb-ordner-bild"><div class="nb-ordner-hinten"></div><div class="nb-ordner-buecher">' + farben + '</div><div class="nb-ordner-vorne"></div></div>' +
      '<div class="nb-info"><div class="nb-titel">' + esc(name) + '</div><div class="nb-meta nb-meta2">' + drin.length + (drin.length === 1 ? ' Notizbuch' : ' Notizbücher') + '</div></div></div>';
  }
  async function ordnerUmbenennen(alt, neu) {
    neu = String(neu || '').trim();
    const liste = buecher.filter(function (b) { return b.ordner === alt; });
    for (const b of liste) { b.ordner = neu; b.metaG = jetzt(); b.geaendert = jetzt(); await buchSpeichern(b); }
    leereOrdner.delete(alt);
    if (neu && !liste.length) leereOrdner.add(neu);
    ordnerOffen = neu || null;
    if (K) K.neuZeichnen();
  }
  function ordnerHinzufuegenDialog(name) {
    const kandidaten = sortiert(buecher.filter(function (b) { return b.ordner !== name; }));
    if (!kandidaten.length) { alert('Alle Notizbücher sind schon in diesem Ordner.'); return; }
    const d = document.createElement('dialog');
    d.className = 'nb-wahl';
    d.innerHTML = '<div class="dlg-koerper"><h3 class="nb-dlg-titel">In „' + esc(name) + '“ verschieben</h3><div class="nb-hakenliste">' +
      kandidaten.map(function (b) {
        const c = COVER[b.cover] || COVER[0];
        return '<label><input type="checkbox" value="' + b.id + '"><span class="nb-mini-cover" style="--c1:' + c[0] + ';--c2:' + c[1] + '"></span><span>' + esc(b.titel) +
          '<small>' + esc(b.ordner ? 'aus „' + b.ordner + '“' : modulInfo(b.modul_id).name) + '</small></span></label>';
      }).join('') + '</div><div class="nb-wahl-knoepfe"><button class="btn btn-primary" data-ok>Verschieben</button><button class="btn" data-ab>Abbrechen</button></div></div>';
    document.body.appendChild(d);
    d.addEventListener('close', function () { d.remove(); });
    d.querySelector('[data-ab]').addEventListener('click', function () { d.close(); });
    d.querySelector('[data-ok]').addEventListener('click', async function () {
      const ids = $$(d, 'input:checked').map(function (x) { return x.value; });
      d.close();
      for (const id of ids) { const b = buecher.find(function (x) { return x.id === id; }); if (b) { b.ordner = name; b.metaG = jetzt(); b.geaendert = jetzt(); await buchSpeichern(b); } }
      leereOrdner.delete(name);
      if (K) K.neuZeichnen();
    });
    d.showModal();
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
        '<div class="feld"><label for="nbOrdner">Ordner <span class="nb-optional">(optional, z. B. Schuljahr 2026/27)</span></label>' +
          '<input id="nbOrdner" type="text" maxlength="60" list="nbOrdnerListe" placeholder="Kein Ordner"><datalist id="nbOrdnerListe"></datalist></div>' +
        '<div class="feld"><label>Cover</label><div class="nb-farbwahl" id="nbCover"></div></div>' +
        '<div class="feld"><label id="nbFormatLabel">Format</label><div class="nb-formatwahl" id="nbFormat"></div></div>' +
        '<div class="feld nb-nur-neu"><label>Papier</label><button type="button" class="nb-vorlage-wahl" id="nbVorlage"><canvas></canvas><span><b></b><small></small></span><em>Ändern</em></button></div>' +
        '<div class="feld nb-nur-neu"><button class="btn btn-klein" id="nbPdfWahl" type="button">Aus PDF erstellen …</button> <span class="nb-hinweistext" id="nbPdfName"></span>' +
          '<input type="file" accept="application/pdf,.pdf" class="nb-unsichtbar" id="nbPdfDatei"></div>' +
      '</div>' +
      '<div class="dlg-fuss"><button class="btn btn-danger" id="nbLoeschen" type="button">Löschen</button>' +
        '<button class="btn" id="nbExport" type="button">Als PDF</button>' +
        '<button class="btn" id="nbLernen" type="button">Lernen</button>' +
        '<div class="rechts"><button class="btn" id="nbAbbrechen" type="button">Abbrechen</button><button class="btn btn-primary" id="nbSpeichern" type="button">Erstellen</button></div></div>';
    document.body.appendChild(dlg);
    const q = function (s) { return dlg.querySelector(s); };
    q('#nbCover').addEventListener('click', function (e) {
      const b = e.target.closest('[data-c]'); if (!b) return;
      dlgZustand.cover = Number(b.getAttribute('data-c')); dialogAuswahlZeigen();
    });
    q('#nbVorlage').addEventListener('click', function () {
      const z = dlgZustand;
      vorlageGalerie({ titel: 'Papier wählen', v: z.vorlage, papier: z.papier, quer: z.quer, format: z.format,
        fertig: function (w) { z.vorlage = w.v; z.papier = w.papier; z.quer = w.quer; dialogAuswahlZeigen(); } });
    });
    q('#nbFormat').addEventListener('click', function (e) {
      const b = e.target.closest('[data-f]'); if (!b) return;
      dlgZustand.format = b.getAttribute('data-f'); dialogAuswahlZeigen();
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
    q('#nbLernen').addEventListener('click', function () {
      const b = buecher.find(function (x) { return x.id === dlgZustand.id; });
      dlg.close();
      if (b) lernenListe(b, false);
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
    const vw = dlg.querySelector('#nbVorlage'), vn = VORLAGEN.find(function (v) { return v[0] === z.vorlage; });
    vw.querySelector('b').textContent = vn ? vn[1] : z.vorlage;
    vw.querySelector('small').textContent = (PAPIER_NAMEN.find(function (p) { return p[0] === z.papier; }) || ['', 'Weiß'])[1] + ' · ' + (z.quer ? 'Querformat' : 'Hochformat');
    requestAnimationFrame(function () { vorlageVorschau(vw.querySelector('canvas'), z.vorlage, z.papier, z.quer, z.format); });
    dlg.querySelector('#nbFormat').innerHTML = [['a4', 'A4', '21 × 29,7 cm'], ['a5', 'A5', '14,8 × 21 cm']].map(function (f) {
      return '<button type="button" data-f="' + f[0] + '" class="' + (z.format === f[0] ? 'aktiv' : '') + '"><span class="nb-format-bild nb-format-' + f[0] + '"></span><b>' + f[1] + '</b><small>' + f[2] + '</small></button>';
    }).join('');
  }
  function dialogOeffnen(id, vorgabeModul) {
    dialogBauen();
    const b = id ? buecher.find(function (x) { return x.id === id; }) : null;
    dlgZustand = b ? { id: b.id, cover: b.cover || 0, vorlage: b.vorlage, papier: b.papier, format: b.format || 'a4', quer: !!b.quer, pdf: null }
      : { id: null, cover: Math.floor(Math.random() * 8), vorlage: W.vorlage || 'liniert', papier: W.papier || 'weiss', format: W.format || 'a4', quer: false, pdf: null };
    dlg.querySelector('#nbOrdner').value = b ? (b.ordner || '') : (ordnerOffen && ordnerOffen !== '__ohne__' ? ordnerOffen : '');
    dlg.querySelector('#nbOrdnerListe').innerHTML = ordnerListe().map(function (o) { return '<option value="' + esc(o) + '"></option>'; }).join('');
    dlg.querySelector('#nbFormatLabel').textContent = b ? 'Format für neue Seiten' : 'Format';
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
    dlg.querySelector('#nbLernen').style.display = b && (b.lernen || []).length ? '' : 'none';
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
        b.format = z.format; b.ordner = dlg.querySelector('#nbOrdner').value.trim();
        try { await buchSpeichern(b); } catch (e) { alert('Speichern fehlgeschlagen: ' + e.message); return; }
      }
      dlg.close();
      if (K) K.neuZeichnen();
      return;
    }
    dlg.close();
    const daten = { titel: titel, modul_id: modul, cover: z.cover, vorlage: z.vorlage, papier: z.papier, format: z.format, quer: z.quer, ordner: dlg.querySelector('#nbOrdner').value.trim() };
    W.vorlage = z.vorlage; W.papier = z.papier;
    W.format = z.format; werkzeugSpeichern();
    try {
      const b = z.pdf ? await buchAusPdf(daten, z.pdf) : await buchAnlegen(daten);
      if (K) K.neuZeichnen();
      oeffnen(b.id);
    } catch (e) { alert('Notizbuch konnte nicht angelegt werden: ' + (e && e.message ? e.message : e)); }
  }

  /* ---------- Klicks in der App ---------- */
  function appKlick(ev) {
    const el = ev.target.closest && ev.target.closest('[data-nb-mehr],[data-nb-neu],[data-nb-oeffnen],[data-nb-filter],[data-nb-sichern],[data-nb-laden],[data-nb-abgleich],[data-nb-drive],[data-nb-dateiabgleich],[data-nb-dateiwechsel],[data-nb-trennen],' +
      '[data-nb-ansicht],[data-nb-ordner],[data-nb-ordnerzurueck],[data-nb-ordnerneu],[data-nb-ordnerumbenennen],[data-nb-ordneraufloesen],[data-nb-ordnerhinzu],[data-nb-treffer]');
    if (!el || (E && E.el.root.contains(el))) return;
    if (el.hasAttribute('data-nb-ansicht')) {
      bibModus = el.getAttribute('data-nb-ansicht'); ordnerOffen = null;
      try { localStorage.setItem('schulplaner.notizen.ansicht', bibModus); } catch (e) { }
      if (K) K.neuZeichnen(); return;
    }
    if (el.hasAttribute('data-nb-ordner')) { ordnerOffen = el.getAttribute('data-nb-ordner'); if (K) K.neuZeichnen(); return; }
    if (el.hasAttribute('data-nb-ordnerzurueck')) { ordnerOffen = null; if (K) K.neuZeichnen(); return; }
    if (el.hasAttribute('data-nb-ordnerneu')) {
      const n = (prompt('Name des neuen Ordners (z. B. Schuljahr 2026/27 oder 4AHIT):') || '').trim();
      if (!n) return;
      leereOrdner.add(n); ordnerOffen = n; if (K) K.neuZeichnen(); return;
    }
    if (el.hasAttribute('data-nb-ordnerumbenennen')) {
      const n = prompt('Neuer Name für den Ordner:', ordnerOffen);
      if (n === null || !n.trim() || n.trim() === ordnerOffen) return;
      ordnerUmbenennen(ordnerOffen, n); return;
    }
    if (el.hasAttribute('data-nb-ordneraufloesen')) {
      const anzahl = buecher.filter(function (b) { return b.ordner === ordnerOffen; }).length;
      if (anzahl && !confirm('Ordner „' + ordnerOffen + '“ auflösen? Die ' + anzahl + (anzahl === 1 ? ' Notizbuch bleibt' : ' Notizbücher bleiben') + ' erhalten.')) return;
      leereOrdner.delete(ordnerOffen);
      ordnerUmbenennen(ordnerOffen, ''); return;
    }
    if (el.hasAttribute('data-nb-ordnerhinzu')) { ordnerHinzufuegenDialog(ordnerOffen); return; }
    if (el.hasAttribute('data-nb-treffer')) {
      const t = el.getAttribute('data-nb-treffer').split('|');
      oeffnen(t[0], Number(t[1])); return;
    }
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
:root[data-thema="dunkel"] .nb-farbe:not(.aktiv):not(.nb-farbe-plus){box-shadow:inset 0 0 0 1px rgba(255,255,255,.28)}
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
/* KI-Blätter: Zusammenfassung, Lernen, Quiz */
.nb-ki-menue{display:flex!important;align-items:center;gap:8px}
.nb-ki-menue svg{width:16px;height:16px;color:#6B5BFF;flex:0 0 16px}
.nb-ki-blatt{position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,18,40,.35);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);font-family:inherit;color:var(--text)}
.nb-ki-karte{width:min(640px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;border-radius:24px;border:1px solid var(--kante);overflow:hidden;
  background:linear-gradient(180deg,rgba(255,255,255,.6),rgba(255,255,255,0) 30%),rgba(247,248,253,.97);box-shadow:0 30px 80px rgba(20,25,60,.35)}
:root[data-thema="dunkel"] .nb-ki-karte{background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,0) 30%),rgba(28,30,50,.98)}
.nb-ki-kopf{display:flex;align-items:center;gap:10px;padding:14px 10px 12px 16px;border-bottom:1px solid var(--kante)}
.nb-ki-kopf b{flex:1;font-size:16px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nb-ki-logo{width:30px;height:30px;border-radius:10px;padding:6px;color:#fff;background:linear-gradient(140deg,#8E6BFF,#3E7BFF 55%,#22B8E8);flex:0 0 30px}
.nb-ki-logo svg{width:100%;height:100%;display:block;fill:currentColor;stroke:none}
.nb-ki-text{padding:14px 20px;overflow-y:auto;font-size:15px;line-height:1.55;-webkit-user-select:text;user-select:text}
.nb-ki-text h4{margin:14px 0 6px;font-size:15px} .nb-ki-text p{margin:0 0 8px} .nb-ki-text ul{margin:4px 0 10px;padding-left:22px} .nb-ki-text li{margin:3px 0}
.nb-ki-fuss{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 16px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--kante)}
.nb-ki-hinweis{font-size:12px;color:var(--muted2);margin-left:auto}
.nb-lernset{display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px solid var(--kante)}
.nb-lernset>div{flex:1;min-width:0} .nb-lernset b{display:block;font-size:14.5px} .nb-lernset small{color:var(--muted);font-size:12.5px}
.nb-lernset-art{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6B5BFF;background:rgba(107,91,255,.12);padding:4px 8px;border-radius:8px}
.nb-lernset .btn svg{width:16px;height:16px}
.nb-lern-stand{font-size:13px;color:var(--muted);font-weight:600}
.nb-lern-balken{height:4px;background:rgba(127,127,140,.15)} .nb-lern-balken i{display:block;height:100%;background:linear-gradient(90deg,#8E6BFF,#3E7BFF);transition:width .25s ease}
.nb-karte{position:relative;display:block;margin:22px auto 8px;width:calc(100% - 40px);min-height:240px;border:0;padding:0;background:none;cursor:pointer;perspective:1200px;color:var(--text);font:inherit}
.nb-karte-seite{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;border-radius:20px;text-align:center;font-size:19px;line-height:1.45;font-weight:600;
  background:#fff;border:1px solid var(--kante);box-shadow:0 12px 30px rgba(20,25,60,.14);backface-visibility:hidden;-webkit-backface-visibility:hidden;transition:transform .45s cubic-bezier(.3,.7,.2,1);white-space:pre-wrap}
:root[data-thema="dunkel"] .nb-karte-seite{background:#2A2D48}
.nb-karte-seite small{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.nb-hinten{transform:rotateY(180deg);background:linear-gradient(160deg,#F4F1FF,#E9F3FF)}
:root[data-thema="dunkel"] .nb-hinten{background:linear-gradient(160deg,#35305A,#25344F)}
.nb-karte.um .nb-vorne{transform:rotateY(-180deg)} .nb-karte.um .nb-hinten{transform:rotateY(0)}
.nb-karten-knoepfe{justify-content:center;border-top:0}
.nb-karten-knoepfe .btn{min-width:130px;justify-content:center}
.nb-quiz{padding:16px 20px;overflow-y:auto}
.nb-quiz-frage{font-size:18px;font-weight:650;line-height:1.4;margin-bottom:14px}
.nb-quiz-antwort{display:flex;align-items:center;gap:12px;width:100%;text-align:left;margin:0 0 8px;padding:12px 14px;border-radius:14px;border:1px solid var(--kante);background:rgba(255,255,255,.7);color:var(--text);font:inherit;font-size:15px;cursor:pointer}
:root[data-thema="dunkel"] .nb-quiz-antwort{background:rgba(255,255,255,.06)}
.nb-quiz-antwort span{width:26px;height:26px;flex:0 0 26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;background:rgba(127,127,140,.15)}
.nb-quiz-antwort:hover:not(:disabled){border-color:var(--accent)}
.nb-quiz-antwort.richtig{border-color:#34C759;background:rgba(52,199,89,.15)} .nb-quiz-antwort.richtig span{background:#34C759;color:#fff}
.nb-quiz-antwort.falsch{border-color:#FF3B30;background:rgba(255,59,48,.12)} .nb-quiz-antwort.falsch span{background:#FF3B30;color:#fff}
.nb-quiz-antwort.aus{opacity:.55}
.nb-quiz-erkl{margin:10px 0 4px;padding:12px 14px;border-radius:14px;background:rgba(10,122,255,.08);font-size:14.5px;line-height:1.5}
.nb-quiz .nb-ki-fuss{border-top:0;padding-left:0;padding-right:0}
.nb-lern-ende{padding:30px 20px 4px;text-align:center}
.nb-lern-gross{font-size:46px;font-weight:800;background:linear-gradient(140deg,#8E6BFF,#3E7BFF);-webkit-background-clip:text;background-clip:text;color:transparent}
.nb-lern-ende p{color:var(--muted);margin:6px 0 16px}
.nb-lern-ende .nb-ki-fuss{justify-content:center;border-top:0}
@media (max-width:560px){.nb-ki-blatt{padding:0;align-items:stretch}.nb-ki-karte{max-height:none;border-radius:0;border:0;padding-top:env(safe-area-inset-top)}.nb-karte{min-height:300px}}
/* Bibliothek: Kopf, Suche, Ordner */
.nb-bibkopf{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:18px}
.nb-bibmodus{background:var(--glanz),var(--glas-stark);border-radius:12px}
.nb-bibmodus button{padding:8px 14px}
.nb-suchfeld{flex:1;min-width:200px;display:flex;align-items:center;gap:8px;padding:0 12px;border-radius:12px;border:1px solid var(--kante);background:var(--glanz),var(--glas-stark);box-shadow:var(--licht)}
.nb-suchfeld svg{width:18px;height:18px;flex:0 0 18px;color:var(--muted)}
.nb-suchfeld input{flex:1;min-width:0;border:0;outline:none;background:transparent;color:var(--text);font:inherit;font-size:16px;padding:9px 0}
.nb-ordnerleiste{display:flex;align-items:center;justify-content:space-between;margin:18px 2px 0;color:var(--muted);font-size:13.5px;font-weight:600}
.nb-ordner .nb-ordner-bild{position:relative;aspect-ratio:3/4;display:flex;align-items:flex-end}
.nb-ordner-hinten{position:absolute;left:0;right:0;bottom:0;height:78%;border-radius:10px 16px 16px 16px;background:linear-gradient(160deg,#7FB3FF,#3E7BFF)}
.nb-ordner-hinten::before{content:"";position:absolute;left:0;top:-9%;width:44%;height:14%;border-radius:10px 10px 0 0;background:#6FA8FF}
.nb-ordner-buecher{position:absolute;left:12%;right:12%;bottom:22%;height:62%;display:flex;gap:6%;align-items:flex-end;justify-content:center}
.nb-ordner-buecher i{flex:1;max-width:30%;height:100%;border-radius:4px 7px 7px 4px;background:linear-gradient(150deg,var(--c1),var(--c2));box-shadow:0 2px 6px rgba(0,0,0,.15)}
.nb-ordner-buecher i:nth-child(2){height:88%} .nb-ordner-buecher i:nth-child(3){height:94%}
.nb-ordner-vorne{position:absolute;left:0;right:0;bottom:0;height:52%;border-radius:12px 12px 16px 16px;background:linear-gradient(170deg,rgba(150,195,255,.96),rgba(62,123,255,.96));box-shadow:0 12px 26px rgba(20,60,160,.25),inset 0 1px 0 rgba(255,255,255,.45)}
.nb-ordner:active .nb-ordner-bild{transform:scale(.97)}
.nb-ordnerkopf{margin-top:14px}
.nb-ordnertitel{display:flex;align-items:center;gap:10px;margin:8px 2px 10px}
.nb-ordnertitel svg{width:26px;height:26px;color:var(--accent)}
.nb-ordnertitel b{font-size:20px}
.nb-ordnertitel span{color:var(--muted);font-size:13.5px}
.nb-ordneraktionen{display:flex;gap:8px;flex-wrap:wrap}
.nb-hakenliste{display:flex;flex-direction:column;gap:4px;max-height:50vh;overflow-y:auto;margin-bottom:14px}
.nb-hakenliste label{display:flex;align-items:center;gap:12px;padding:8px 6px;border-radius:12px;cursor:pointer}
.nb-hakenliste label:hover{background:rgba(127,127,140,.1)}
.nb-hakenliste input{width:20px;height:20px;accent-color:var(--accent)}
.nb-hakenliste span:last-child{display:flex;flex-direction:column;font-weight:600}
.nb-hakenliste small{font-weight:400;color:var(--muted);font-size:12.5px}
.nb-mini-cover{width:24px;height:32px;border-radius:3px 6px 6px 3px;background:linear-gradient(150deg,var(--c1),var(--c2));flex:0 0 24px}
.nb-suchergebnis{margin-top:16px;display:flex;flex-direction:column;gap:8px}
.nb-treffer{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:16px;border:1px solid var(--kante);background:var(--glanz),var(--glas-stark);box-shadow:var(--licht);cursor:pointer;text-align:left;color:var(--text);font:inherit}
.nb-treffer:hover{border-color:var(--accent)}
.nb-treffer .nb-mini-cover{margin-top:2px}
.nb-treffer b{display:block;font-size:14.5px}
.nb-treffer small{display:block;color:var(--muted);font-size:12.5px;margin-top:2px}
.nb-treffer p{margin:6px 0 0;font-size:13.5px;line-height:1.45;color:var(--text)}
.nb-treffer mark{background:rgba(255,214,10,.55);color:inherit;border-radius:3px;padding:0 2px}
.nb-suchinfo{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px;color:var(--muted);padding:2px 2px 4px}
/* Dialog: Format */
.nb-formatwahl{display:flex;gap:10px}
.nb-formatwahl button{display:flex;align-items:center;gap:10px;border:1px solid var(--kante);border-radius:12px;padding:8px 14px;background:rgba(255,255,255,.4);color:var(--text);font-size:13px}
.nb-formatwahl button.aktiv{border-color:var(--accent);box-shadow:0 0 0 2px rgba(10,122,255,.25);color:var(--accent)}
.nb-formatwahl b{font-size:15px}
.nb-formatwahl small{color:var(--muted);font-size:12px}
.nb-format-bild{display:block;background:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.18);border-radius:2px}
.nb-format-a4{width:21px;height:30px} .nb-format-a5{width:15px;height:21px}
.nb-optional{font-weight:400;color:var(--muted2)}
/* Editor: Lesezeichen, Lineal, Übersicht */
.nb-lz-knopf.gesetzt{color:#FF3B30}
.nb-lz-knopf.gesetzt svg path{fill:currentColor}
.nb-lz-feld input{width:100%;box-sizing:border-box;border:1px solid var(--kante);border-radius:10px;padding:9px 11px;font:inherit;font-size:16px;background:rgba(255,255,255,.7);color:var(--text)}
:root[data-thema="dunkel"] .nb-lz-feld input{background:rgba(255,255,255,.07)}
.nb-lz-knoepfe{display:flex;gap:8px;margin:8px 0 4px}
.nb-lz-eintrag{display:flex;justify-content:space-between;gap:10px;align-items:center}
.nb-lz-eintrag small{color:var(--muted);font-size:12px;white-space:nowrap}
.nb-lz-eintrag.aktiv{background:rgba(10,122,255,.1)}
.nb-lz-leer{font-size:13px;color:var(--muted);padding:4px 10px 8px;line-height:1.4}
.nb-lineal{position:absolute;left:0;top:0;z-index:1;pointer-events:none;transform-origin:50% 50%;border-radius:8px;
  background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(220,226,240,.55));border:1px solid rgba(60,70,100,.35);
  box-shadow:0 8px 24px rgba(20,30,70,.18);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
:root[data-thema="dunkel"] .nb-lineal{background:linear-gradient(180deg,rgba(90,96,130,.55),rgba(60,64,90,.55));border-color:rgba(255,255,255,.25)}
.nb-lineal[hidden]{display:none}
.nb-lineal-skala{position:absolute;left:0;right:0;top:0;height:20px;
  background-image:linear-gradient(90deg,rgba(30,35,60,.75) 1px,transparent 1px),linear-gradient(90deg,rgba(30,35,60,.45) 1px,transparent 1px);
  background-size:var(--cm) 18px,var(--mm) 9px;background-repeat:repeat-x;background-position:0 0}
.nb-lineal-skala.nb-unten{top:auto;bottom:0;transform:scaleY(-1)}
.nb-lineal.ohne-mm .nb-lineal-skala{background-size:var(--cm) 18px,0 0}
.nb-lineal-grad{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:13px;font-weight:700;color:rgba(30,35,60,.8);background:rgba(255,255,255,.7);padding:2px 8px;border-radius:8px}
:root[data-thema="dunkel"] .nb-lineal-grad{color:#fff;background:rgba(0,0,0,.35)}
.nb-ueb-tipp{font-size:12.5px;color:var(--muted);padding:8px 16px 0}
.nb-ueb-seite{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:pan-y}
.nb-ueb-bild{position:relative}
.nb-ueb-band{position:absolute;right:10%;top:0;width:12px;height:20px;background:#FF3B30;clip-path:polygon(0 0,100% 0,100% 100%,50% 75%,0 100%)}
.nb-ueb-fuss{gap:2px}
.nb-ueb-nr{margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.nb-ueb-fuss button:first-of-type:hover{color:var(--accent);background:rgba(10,122,255,.1)}
.nb-ueb-platz{opacity:.25}
.nb-ueb-geist{position:fixed;z-index:200;pointer-events:none;transform:scale(1.06) rotate(-2deg);box-shadow:0 20px 40px rgba(0,0,0,.3);border-radius:8px;opacity:.95}
.nb-fertig-hinweis{margin:4px 0 0;font-size:13.5px;line-height:1.45;max-width:340px;color:inherit;opacity:.85}
dialog.nb-wahl{width:min(460px,94vw)!important;max-width:94vw!important;height:fit-content!important;min-height:0!important;max-height:90vh!important;border-radius:26px!important;border:1px solid var(--kante)!important;margin:auto!important}
dialog.nb-wahl .dlg-koerper{max-height:none;padding-top:22px}
.nb-wahl-text{font-size:14.5px;line-height:1.5;color:var(--muted);margin:0 0 16px}
.nb-wahl-knoepfe{display:flex;flex-direction:column;gap:8px;padding-bottom:14px}
.nb-wahl-knoepfe .btn{justify-content:center;width:100%}
@media (max-width:760px){.nb-buchtitel{display:none}}
@media (max-width:560px){
  .kopf-rechts [data-nb-neu]{display:none}
  .nb-gitter{grid-template-columns:repeat(2,1fr);gap:22px 14px}
  .nb-knopf{width:38px;height:38px;flex-basis:38px}
  .nb-zeile:first-child{flex-wrap:wrap}
  .nb-werkzeuge{order:5;flex:1 0 100%;justify-content:space-between;margin:4px 0 0;padding:0}
  .nb-zurueck{margin-right:auto}
  .nb-knopf svg{width:21px;height:21px}
  .nb-vorlagen{grid-template-columns:repeat(3,1fr)}
  .nb-segment button{padding:6px 8px}
  .nb-werkzeuge{gap:0}
  .nb-werkzeuge .nb-knopf{width:35px;flex-basis:35px}
}
@media (prefers-reduced-motion: reduce){.nb-kreisel{animation:none}}
/* ===== Werkzeugleiste wie GoodNotes ===== */
.nb-zeile2{width:fit-content;max-width:calc(100% - 8px);margin:6px auto 0;padding:4px 8px;border-radius:16px;border:1px solid var(--kante);
  background:var(--glanz),rgba(255,255,255,.72);box-shadow:var(--licht),0 6px 18px rgba(20,30,70,.12);min-height:40px}
:root[data-thema="dunkel"] .nb-zeile2{background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,0)),rgba(20,22,34,.9)}
.nb-zeile2:empty{display:none}
.nb-unterwz{gap:2px}
.nb-uwz{position:relative;width:38px;height:34px;flex:0 0 38px;border:0;border-radius:10px;background:transparent;color:var(--text);display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer}
.nb-uwz svg{width:21px;height:21px}
.nb-uwz.aktiv{background:var(--accent);color:#fff}
.nb-uwz .nb-pfeilchen{position:absolute;right:1px;bottom:3px;width:10px;height:10px;opacity:.75}
.nb-uwz .nb-pfeilchen svg{width:10px;height:10px;stroke-width:2.4}
.nb-uwz:first-child{width:44px;flex-basis:44px}
.nb-breite i{display:block;width:20px;border-radius:3px;background:currentColor}
.nb-farbe-plus{background:transparent!important;box-shadow:inset 0 0 0 1.5px var(--muted2)!important;color:var(--muted);display:inline-flex;align-items:center;justify-content:center}
.nb-farbe-plus svg{width:15px;height:15px}
.nb-mini svg,.nb-schalter svg{width:17px;height:17px;vertical-align:-3px}
.nb-mini{display:inline-flex;align-items:center;gap:4px}
.nb-mini.aktiv{background:var(--accent);color:#fff;border-color:transparent}
.nb-dropdown{display:inline-flex;align-items:center;gap:6px}
.nb-dropdown svg:last-child{width:13px;height:13px}
.nb-segment button{display:inline-flex;align-items:center;gap:5px}
.nb-segment button svg{width:16px;height:16px}
.nb-knopf[hidden]{display:none}
.nb-knopf.nimmt-auf{color:#FF3B30;background:rgba(255,59,48,.14)}
.nb-editor.nb-nurlesen .nb-werkzeuge{opacity:.45}
/* Popover-Inhalte */
.nb-pop-stift{width:300px}
.nb-popover .nb-vorschau{display:block;width:100%;height:64px;margin:0 0 8px;border-radius:12px;background:rgba(127,127,140,.08)}
.nb-stiftarten{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}
.nb-stiftarten button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 4px;border:1px solid transparent;border-radius:12px;background:rgba(127,127,140,.08);color:var(--text);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.nb-stiftarten button svg{width:22px;height:22px}
.nb-stiftarten button.aktiv{border-color:var(--accent);color:var(--accent);background:rgba(10,122,255,.1)}
.nb-regler-feld{margin:6px 2px 10px}
.nb-regler-kopf{display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.nb-regler-kopf b{color:var(--text)}
.nb-regler-spur{position:relative}
.nb-regler-spur .nb-regler{-webkit-appearance:none;appearance:none;width:100%;height:22px;background:transparent;position:relative;z-index:1;margin:0}
.nb-regler-spur .nb-regler::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(90deg,#4FC3F7 var(--v,50%),rgba(127,127,140,.3) var(--v,50%))}
.nb-regler-spur .nb-regler::-moz-range-track{height:4px;border-radius:2px;background:linear-gradient(90deg,#4FC3F7 var(--v,50%),rgba(127,127,140,.3) var(--v,50%))}
.nb-regler-spur .nb-regler::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:5px solid #2F9BFF;margin-top:-8px;box-shadow:0 2px 6px rgba(0,0,0,.25)}
.nb-regler-spur .nb-regler::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:5px solid #2F9BFF}
.nb-ticks{position:absolute;left:2px;right:2px;top:7px;height:8px;display:flex;justify-content:space-between;pointer-events:none}
.nb-ticks i{width:2px;height:8px;border-radius:1px;background:rgba(127,127,140,.45)}
.nb-umschalter small{display:block;font-size:12px;color:var(--muted);font-weight:400;margin-top:2px;line-height:1.35}
.nb-umschalter.nb-mit-icon{justify-content:flex-start}
.nb-umschalter.nb-mit-icon span{flex:1}
.nb-umschalter.nb-mit-icon>svg{width:20px;height:20px;flex:0 0 20px;color:var(--muted)}
.nb-pfeilmenue{display:flex!important;align-items:center;justify-content:space-between}
.nb-pfeilmenue svg{width:16px;height:16px;color:var(--muted)}
.nb-mit-icon{display:flex!important;align-items:center;gap:10px}
.nb-mit-icon>svg{width:18px;height:18px;flex:0 0 18px;color:var(--muted)}
.nb-mit-icon small{margin-left:auto;color:var(--muted);font-size:12px}
.nb-zurueckpfeil{border:0;background:transparent;color:var(--accent);width:28px;height:28px;padding:4px;margin:-4px 4px -4px -4px;cursor:pointer}
.nb-zurueckpfeil svg{width:100%;height:100%}
.nb-pop-titel{align-items:center}
.nb-pop-hinweis{font-size:12.5px;color:var(--muted);padding:4px 6px 6px;line-height:1.4}
.nb-pop-farbe{width:260px}
.nb-farbgitter{grid-template-columns:repeat(5,34px)!important;gap:10px!important}
.nb-farbgitter button{width:34px!important;height:34px!important}
.nb-regenbogen{width:22px;height:22px;border-radius:50%;background:conic-gradient(#FF3B30,#FF9500,#FFD60A,#30D158,#0A84FF,#BF5AF2,#FF3B30);margin-right:10px;flex:0 0 22px}
.nb-pfeilmenue:has(.nb-regenbogen){justify-content:flex-start;gap:0}
.nb-pfeilmenue:has(.nb-regenbogen) svg{margin-left:auto}
.nb-pop-titel:has(.nb-zurueckpfeil){justify-content:flex-start}
.nb-hexvorschau{display:block;flex:0 0 34px}
.nb-sv{position:relative;height:150px;border-radius:12px;margin:4px 0 12px;cursor:crosshair;touch-action:none;
  background:linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff,hsl(var(--h,0),100%,50%))}
.nb-sv-punkt{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3),0 2px 6px rgba(0,0,0,.3);pointer-events:none}
.nb-farbton{-webkit-appearance:none;appearance:none;width:100%;height:14px;border-radius:7px;background:linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);margin:0 0 12px}
.nb-farbton::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.35)}
.nb-hexzeile{display:flex;align-items:center;gap:10px}
.nb-hexvorschau{width:34px;height:34px;border-radius:10px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
.nb-hex{flex:1;border:1px solid var(--kante);border-radius:10px;padding:8px 10px;font:inherit;font-size:16px;font-family:ui-monospace,Menlo,monospace;background:rgba(255,255,255,.7);color:var(--text)}
:root[data-thema="dunkel"] .nb-hex{background:rgba(255,255,255,.07)}
/* Umkreisen, Zettel, Aufnahme */
.nb-umkreis{position:absolute;z-index:4;display:flex;align-items:center;gap:6px;border:0;border-radius:12px;padding:7px 12px;background:var(--accent);color:#fff;font:inherit;font-size:13.5px;font-weight:650;box-shadow:0 8px 20px rgba(10,122,255,.35);cursor:pointer;animation:nb-auf .18s ease}
.nb-umkreis svg{width:17px;height:17px}
@keyframes nb-auf{from{transform:scale(.8);opacity:0}to{transform:none;opacity:1}}
.nb-text.nb-zettel .nb-text-inhalt{padding:10px;border-radius:3px;box-shadow:0 3px 8px rgba(0,0,0,.18);color:#1D1D1F}
.nb-editor.wz-zettel .nb-text.nb-zettel{pointer-events:auto}
.nb-editor.wz-zettel .nb-zettel.aktiv .nb-text-inhalt{box-shadow:0 0 0 2px var(--accent),0 3px 8px rgba(0,0,0,.18)}
.nb-text.nb-zettel .nb-text-inhalt:empty::before{content:"Notiz …"}
.nb-aufnahme-anzeige{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:10px;border:0;border-radius:999px;padding:7px 14px;background:rgba(28,28,34,.92);color:#fff;font:inherit;font-size:14px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.nb-aufnahme-anzeige span:last-child{color:#FF8A80;font-weight:650}
.nb-rec{width:11px;height:11px;border-radius:50%;background:#FF3B30;display:inline-block;animation:nb-puls 1.2s infinite}
@keyframes nb-puls{50%{opacity:.35}}
.nb-aufnahme-start{display:flex!important;align-items:center;gap:10px}
.nb-aufnahmen{display:flex;flex-direction:column;gap:2px;max-height:300px;overflow-y:auto}
.nb-aufnahme{display:flex;align-items:center;gap:8px;padding:6px 4px;border-radius:10px}
.nb-aufnahme>div{flex:1;min-width:0}
.nb-aufnahme b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nb-aufnahme small{font-size:12px;color:var(--muted)}
.nb-aufnahme audio{display:none}
.nb-play{width:34px;height:34px;flex:0 0 34px;border-radius:50%;border:0;background:var(--accent);color:#fff;padding:9px;cursor:pointer}
.nb-play svg{width:100%;height:100%}
/* Seitenleiste */
.nb-seitenleiste{position:absolute;left:0;bottom:0;width:236px;z-index:3;display:flex;flex-direction:column;border-right:1px solid var(--kante);
  background:var(--glanz),rgba(246,247,252,.94);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur)}
:root[data-thema="dunkel"] .nb-seitenleiste{background:rgba(22,24,36,.96)}
.nb-editor.mit-leiste .nb-flaeche{margin-left:236px}
.nb-sl-tabs{display:flex;gap:2px;padding:8px;border-bottom:1px solid var(--kante)}
.nb-sl-tabs button{flex:1;height:34px;border:0;border-radius:10px;background:transparent;color:var(--muted);padding:6px;cursor:pointer}
.nb-sl-tabs button svg{width:20px;height:20px}
.nb-sl-tabs button.aktiv{background:rgba(10,122,255,.14);color:var(--accent)}
.nb-sl-inhalt{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}
.nb-sl-gitter{display:flex;flex-direction:column;gap:14px;padding:14px 22px 24px}
.nb-sl-seite .nb-ueb-bild{border-radius:5px;outline:2px solid transparent;outline-offset:3px;transition:outline-color .15s}
.nb-sl-seite.aktuell .nb-ueb-bild{outline-color:var(--accent)}
.nb-sl-seite.aktuell .nb-ueb-nr{color:var(--accent)}
.nb-sl-neu{display:flex;align-items:center;justify-content:center;gap:6px;border:2px dashed var(--muted2);border-radius:10px;background:transparent;color:var(--muted);padding:14px;font:inherit;font-weight:600;cursor:pointer}
.nb-sl-neu svg{width:18px;height:18px}
.nb-sl-text{padding:10px}
/* Vorlagen-Galerie */
dialog.nb-galerie-dlg{border:0;padding:0;background:transparent;width:min(760px,96vw);max-width:96vw;height:min(88vh,860px);max-height:none;overflow:visible;box-shadow:none}
dialog.nb-galerie-dlg::backdrop{background:rgba(15,18,40,.35);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
dialog.nb-galerie-dlg .nb-ki-karte{width:100%;height:100%;max-height:none}
.nb-gal-optionen{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--kante)}
.nb-gal-optionen .nb-papierwahl{flex-wrap:wrap}
.nb-gal-optionen .nb-papierwahl button{padding:6px 10px}
.nb-gal-liste{padding:6px 16px 16px}
.nb-gal-gruppe h4{margin:14px 0 8px;font-size:14px}
.nb-gal-reihe{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:14px}
.nb-gal-v{display:flex;flex-direction:column;align-items:center;gap:6px;border:0;background:transparent;padding:0;color:var(--text);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.nb-gal-v canvas{width:100%;border-radius:6px;box-shadow:0 2px 8px rgba(20,25,60,.16),inset 0 0 0 1px rgba(0,0,0,.08);outline:2.5px solid transparent;outline-offset:2px}
.nb-gal-v.aktiv canvas{outline-color:var(--accent)}
.nb-gal-v.aktiv span{color:var(--accent)}
.nb-gal-alle{display:flex;align-items:center;gap:8px;font-size:14px}
.nb-vorlage-wahl{display:flex;align-items:center;gap:12px;width:100%;padding:8px 12px;border:1px solid var(--kante);border-radius:12px;background:rgba(255,255,255,.5);color:var(--text);font:inherit;text-align:left;cursor:pointer}
:root[data-thema="dunkel"] .nb-vorlage-wahl{background:rgba(255,255,255,.06)}
.nb-vorlage-wahl canvas{width:38px;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,.18)}
.nb-vorlage-wahl span{flex:1;display:flex;flex-direction:column}
.nb-vorlage-wahl small{color:var(--muted);font-size:12.5px}
.nb-vorlage-wahl em{font-style:normal;color:var(--accent);font-weight:600;font-size:14px}
@media (max-width:560px){
  .nb-zeile2{margin-top:4px;border-radius:14px;padding:3px 6px}
  .nb-uwz{width:34px;flex-basis:34px}
  dialog.nb-galerie-dlg{width:100vw;max-width:100vw;height:100%;margin:0}
  dialog.nb-galerie-dlg .nb-ki-karte{border-radius:0}
}
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
    suchen: suchen,
    oeffnen: oeffnen,
    offen: function () { return !!E; },
    // für Tests
    _intern: {
      get E() { return E; }, get W() { return W; }, get buecher() { return buecher; },
      pdfBauen: pdfBauen, kritzelOpfer: kritzelOpfer, speichern: speichern, editorSchliessen: editorSchliessen,
      werkzeugWaehlen: werkzeugWaehlen, seiteHinzufuegen: seiteHinzufuegen, pdfInsBuch: pdfInsBuch, bildEinfuegen: bildEinfuegen,
      sicherungErstellen: sicherungErstellen, sicherungEinlesen: sicherungEinlesen, buchAusPdf: buchAusPdf, alle: alle,
      formErkennen: formErkennen, seitenLesen: seitenLesen, lernenStarten: lernenStarten, zuSeite: zuSeite, skala: function () { return E ? skala() : 0; },
      driveAbgleichen: driveAbgleichen, dateiAbgleichen: dateiAbgleichen, datenZusammenfuehren: datenZusammenfuehren,
      zusammenfuehren: zusammenfuehren, loeschmarken: loeschmarken, buchLoeschen: buchLoeschen, driveCfg: driveCfg
    }
  };
})();
