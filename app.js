/* SchulPlaner - Web-App mit Cloud-Synchronisation
   Funktioniert offline; sobald Internet da ist, gleicht sie sich mit allen Geraeten ab. */
'use strict';

/* ============================================================
   Konstanten
   ============================================================ */
const PRIOS = ['Hoch', 'Mittel', 'Niedrig'];
const PRIO_RANG = { Hoch: 0, Mittel: 1, Niedrig: 2 };
const PRIO_FARBE = { Hoch: '#D93A3F', Mittel: '#DE8A11', Niedrig: '#3E9C5C' };
const STATI = ['Noch nicht angefangen', 'In Bearbeitung', 'Abgeschlossen'];
const STATUS_FARBE = {
  'Noch nicht angefangen': '#9A9AA2',
  'In Bearbeitung': '#2F6FED',
  'Abgeschlossen': '#3E9C5C'
};
const MODUL_FARBEN = ['#2F6FED', '#D93A3F', '#3E9C5C', '#DE8A11', '#7D5BD6', '#12968E', '#C2408A', '#5A6472'];
const STANDARD_MODULE = ['Deutsch', 'Englisch', 'Mathe', 'Naturwissenschaft', 'Medientechnik'];
const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const WT_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const ICON_PLUS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" fill="none"/></svg>';
const SCHLUESSEL_DATEN = 'schulplaner.daten';
const SCHLUESSEL_CFG = 'schulplaner.config';
const GRABSTEIN_TAGE = 60;

/* ============================================================
   Reine Logik (ohne Browser nutzbar, dadurch testbar)
   ============================================================ */
function uid() {
  return 'x' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
function jetztISO() { return new Date().toISOString(); }
function zahl2(n) { return String(n).padStart(2, '0'); }
function datumISO(d) { return d.getFullYear() + '-' + zahl2(d.getMonth() + 1) + '-' + zahl2(d.getDate()); }
function vonISO(s) { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function heuteISO() { return datumISO(new Date()); }
function tageDazu(iso, tage) { const d = vonISO(iso); d.setDate(d.getDate() + tage); return datumISO(d); }

function aktiv(liste) { return (liste || []).filter(function (e) { return !e.geloescht; }); }

function istFertig(t) { return t.status === 'Abgeschlossen'; }
function titelText(t) { return String(t.titel || '').trim() || '(ohne Titel)'; }
function istUeberfaellig(t, heute) {
  heute = heute || heuteISO();
  return !!t.deadline && t.deadline < heute && !istFertig(t);
}
function fortschritt(t) {
  const subs = t.unteraufgaben || [];
  if (!subs.length) return null;
  return { fertig: subs.filter(function (s) { return s.erledigt; }).length, gesamt: subs.length };
}
function sortiere(liste) {
  return liste.slice().sort(function (a, b) {
    if (istFertig(a) !== istFertig(b)) return istFertig(a) ? 1 : -1;
    const da = a.deadline || '9999-12-31', db = b.deadline || '9999-12-31';
    if (da !== db) return da < db ? -1 : 1;
    const pa = PRIO_RANG[a.prioritaet] != null ? PRIO_RANG[a.prioritaet] : 1;
    const pb = PRIO_RANG[b.prioritaet] != null ? PRIO_RANG[b.prioritaet] : 1;
    if (pa !== pb) return pa - pb;
    return String(a.titel || '').localeCompare(String(b.titel || ''), 'de');
  });
}

/* Zwei Listen verschmelzen: pro Eintrag gewinnt die neuere Änderung. */
function zusammenfuehren(a, b) {
  const karte = new Map();
  const alle = (a || []).concat(b || []);
  for (let i = 0; i < alle.length; i++) {
    const e = alle[i];
    if (!e || !e.id) continue;
    const alt = karte.get(e.id);
    if (!alt || String(e.geaendert || '') > String(alt.geaendert || '')) karte.set(e.id, e);
  }
  return Array.from(karte.values());
}
function datenZusammenfuehren(lokal, fern) {
  return {
    module: zusammenfuehren(lokal && lokal.module, fern && fern.module),
    aufgaben: zusammenfuehren(lokal && lokal.aufgaben, fern && fern.aufgaben)
  };
}
/* Alte Löschmarken entfernen, damit die Datei nicht endlos wächst. */
function aufraeumen(daten, heute) {
  const grenze = tageDazu(heute || heuteISO(), -GRABSTEIN_TAGE);
  function filter(liste) {
    return (liste || []).filter(function (e) {
      if (!e.geloescht) return true;
      return String(e.geaendert || '').slice(0, 10) >= grenze;
    });
  }
  return { module: filter(daten.module), aufgaben: filter(daten.aufgaben) };
}
/* Gleichnamige Module zusammenfuehren: sonst entstehen beim ersten Abgleich
   zweier Geraete doppelte Standardmodule und die Aufgaben haengen am falschen. */
function vereinigeDoppelteModule(daten) {
  const module = daten.module || [];
  const aufgaben = daten.aufgaben || [];
  const nachName = new Map();
  for (const m of module) {
    if (m.geloescht) continue;
    const name = String(m.name || '').trim().toLowerCase();
    if (!nachName.has(name)) nachName.set(name, []);
    nachName.get(name).push(m);
  }
  const ersatz = new Map();
  for (const gruppe of nachName.values()) {
    if (gruppe.length < 2) continue;
    gruppe.sort(function (a, b) { return String(a.id) < String(b.id) ? -1 : 1; });
    const behalten = gruppe[0];
    for (const doppelt of gruppe.slice(1)) {
      ersatz.set(doppelt.id, behalten.id);
      doppelt.geloescht = true;
      doppelt.geaendert = jetztISO();
    }
  }
  for (const t of aufgaben) {
    const neu = ersatz.get(t.modul_id);
    if (neu) { t.modul_id = neu; t.geaendert = jetztISO(); }
  }
  return { module: module, aufgaben: aufgaben };
}

function vergleichbar(daten) {
  function norm(liste) {
    return (liste || []).slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; })
      .map(function (e) { return JSON.stringify(e); }).join('|');
  }
  return norm(daten.module) + '#' + norm(daten.aufgaben);
}
function gleich(a, b) { return vergleichbar(a) === vergleichbar(b); }

/* Daten aus der Windows-App (daten.json) übernehmen. */
function importAltdaten(objekt) {
  const zeit = jetztISO();
  const module = (objekt.module || []).map(function (m, i) {
    return {
      id: m.id || uid(), name: m.name || 'Modul',
      farbe: /^#[0-9a-f]{3,8}$/i.test(String(m.farbe || '')) ? m.farbe : MODUL_FARBEN[i % MODUL_FARBEN.length],
      geaendert: m.geaendert || zeit, geloescht: !!m.geloescht
    };
  });
  const ids = module.map(function (m) { return m.id; });
  const aufgaben = (objekt.aufgaben || []).map(function (t) {
    return {
      id: t.id || uid(),
      titel: t.titel || 'Ohne Titel',
      modul_id: ids.indexOf(t.modul_id) >= 0 ? t.modul_id : null,
      prioritaet: PRIOS.indexOf(t.prioritaet) >= 0 ? t.prioritaet : 'Mittel',
      status: STATI.indexOf(t.status) >= 0 ? t.status : STATI[0],
      deadline: t.deadline || null,
      notizen: t.notizen || '',
      unteraufgaben: (t.unteraufgaben || []).map(function (s) {
        return { id: s.id || uid(), titel: s.titel || '', erledigt: !!s.erledigt };
      }).filter(function (s) { return s.titel; }),
      geaendert: t.geaendert || zeit,
      geloescht: !!t.geloescht
    };
  });
  return { module: module, aufgaben: aufgaben };
}

/* ============================================================
   Ab hier: Browser
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    zusammenfuehren: zusammenfuehren, datenZusammenfuehren: datenZusammenfuehren,
    sortiere: sortiere, fortschritt: fortschritt, istUeberfaellig: istUeberfaellig,
    importAltdaten: importAltdaten, aufraeumen: aufraeumen, gleich: gleich,
    vereinigeDoppelteModule: vereinigeDoppelteModule,
    aktiv: aktiv, datumISO: datumISO, tageDazu: tageDazu
  };
} else {
  starteApp();
}

function starteApp() {

  /* Selbstpruefung: passen index.html und app.js zusammen?
     (Neue app.js mit alter index.html sieht kaputt aus.) */
  if (!document.querySelector('.tapete')) {
    let schonVersucht = false;
    try { schonVersucht = sessionStorage.getItem('schulplaner.neuladen') === '1'; } catch (e) { }
    if (!schonVersucht) {
      try { sessionStorage.setItem('schulplaner.neuladen', '1'); } catch (e) { }
      const leeren = (typeof caches !== 'undefined')
        ? caches.keys().then(function (k) { return Promise.all(k.map(function (n) { return caches.delete(n); })); })
        : Promise.resolve();
      leeren.then(function () {
        if (navigator.serviceWorker) {
          return navigator.serviceWorker.getRegistrations().then(function (r) {
            return Promise.all(r.map(function (x) { return x.unregister(); }));
          });
        }
      }).catch(function () { }).then(function () { location.reload(); });
      return;
    }
    const hinweis = document.createElement('div');
    hinweis.setAttribute('style', 'position:fixed;top:0;left:0;right:0;z-index:999;background:#FF3B30;color:#fff;' +
      'font:600 14px/1.4 -apple-system,Segoe UI,sans-serif;padding:10px 16px;text-align:center');
    hinweis.textContent = 'Die Datei index.html ist noch die alte Version. Bitte bei GitHub durch die neue ersetzen ' +
      '(gleicher Name, ohne Zusatz wie „(1)") und die App danach neu öffnen.';
    document.body.appendChild(hinweis);
  } else {
    try { sessionStorage.removeItem('schulplaner.neuladen'); } catch (e) { }
  }

  /* Bedienungstour: Die Einladung ist nur für wirklich neue Nutzer. Wer schon Daten von früher auf dem Gerät hat,
     bekommt sie beim Update nicht. Der Status hängt weder an der App-Version noch am Cache. */
  try {
    if (!localStorage.getItem('schulplaner.tour')) {
      let schonDa = false;
      for (let i = 0; i < localStorage.length; i++) { if (String(localStorage.key(i)).indexOf('schulplaner') === 0) schonDa = true; }
      localStorage.setItem('schulplaner.tour', schonDa ? 'bestand' : 'offen');
    }
  } catch (e) { /* ohne Speicher gibt es keine Einladung */ }

  let daten = { module: [], aufgaben: [] };
  let cfg = { url: '', key: '', code: '' };
  let ansicht = 'heute';
  let modulOffen = null;
  let heute = heuteISO();
  let kalDatum = new Date();
  let kalGewaehlt = heute;
  let filter = { suche: '', modul: '', status: '', prio: '' };
  let syncLaeuft = false, syncTimer = null, letzterSync = null, syncText = '', syncKlasse = 'grau';
  let dlgState = null, modulState = null;
  let geradeErledigt = null;                     // Aufgabe, die eben abgehakt wurde (für die kurze Bestätigungs-Animation)
  let demo = null;                               // Beispieldaten der Bedienungstour – ersetzen nur die Anzeige, nie die echten Daten
  let tour = null;                               // laufende Bedienungstour

  const $ = function (s) { return document.querySelector(s); };
  const esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ---------- Erscheinungsbild ---------- */
  function themaWahl() {
    try { return localStorage.getItem('schulplaner.thema') || 'auto'; } catch (e) { return 'auto'; }
  }
  /* Farbwelten: [id, Name, immer dunkel?, Hintergrund hell, Hintergrund dunkel, Akzent] */
  const FARBWELTEN = [
    ['standard', 'Standard', false, '#E9ECF5', '#080915', '#0A7AFF'],
    ['minze', 'Minze & Rosa', false, '#F8F8F8', '#080915', '#1F6B3A'],
    ['frost', 'Frost & Schiefer', false, '#F7F9FA', '#080915', '#0D7480'],
    ['pastell', 'Karten-Pastell', false, '#F7F7F5', '#080915', '#D0106F'],
    ['nacht', 'Nacht & Himmelblau', true, '#0A0D14', '#0A0D14', '#5AB9FC'],
    ['limette', 'Ruß & Limette', true, '#0F0F0F', '#0F0F0F', '#DAFA9C']
  ];
  function farbwelt() {
    let w = 'standard';
    try { w = localStorage.getItem('schulplaner.farbwelt') || 'standard'; } catch (e) { }
    return FARBWELTEN.find(function (x) { return x[0] === w; }) || FARBWELTEN[0];
  }
  function themaAnwenden() {
    const wahl = themaWahl(), welt = farbwelt();
    const system = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dunkel = welt[2] || wahl === 'dunkel' || (wahl === 'auto' && system);
    document.documentElement.setAttribute('data-farbwelt', welt[0]);
    document.documentElement.setAttribute('data-thema', dunkel ? 'dunkel' : 'hell');
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      m.setAttribute('content', dunkel ? welt[4] : welt[3]);          // Farbe der Titelleiste
    });
  }
  function farbweltSetzen(id) {
    try { localStorage.setItem('schulplaner.farbwelt', id); } catch (e) { }
    const html = document.documentElement;
    html.classList.add('thema-wechsel');
    themaAnwenden(); render();
    setTimeout(function () { html.classList.remove('thema-wechsel'); }, 450);
  }
  function farbweltWahlHTML() {
    const aktiv = farbwelt()[0];
    return '<div class="farbwelt-wahl">' + FARBWELTEN.map(function (w) {
      const hinter = w[2] ? w[4] : w[3];
      return '<button class="farbwelt-option' + (w[0] === aktiv ? ' aktiv' : '') + '" data-farbwelt-wahl="' + w[0] + '">' +
        '<span class="farbwelt-muster' + (w[2] ? ' dunkel' : '') + '" style="background:linear-gradient(135deg,' + hinter + ',' + w[5] + '33)"><b></b><i style="background:' + w[5] + '"></i></span>' + esc(w[1]) + '</button>';
    }).join('') + '</div>';
  }
  /* ---------- Position der Navigationsleiste: standard | unten | rechts ---------- */
  const LEISTEN = [['standard', 'Standard'], ['unten', 'Unten'], ['rechts', 'Rechts']];
  function leistenPos() {
    let w = null; try { w = localStorage.getItem('schulplaner.leiste'); } catch (e) { }
    return LEISTEN.some(function (x) { return x[0] === w; }) ? w : 'standard';
  }
  function leisteAnwenden() {
    leisteStil();
    const pos = leistenPos(), html = document.documentElement;
    if (pos === 'standard') html.removeAttribute('data-leiste'); else html.setAttribute('data-leiste', pos);
    html.classList.remove('leiste-klein');
  }
  function leisteSetzen(pos) {
    try { localStorage.setItem('schulplaner.leiste', pos); } catch (e) { }
    leisteAnwenden();
    document.querySelectorAll('[data-leiste-wahl]').forEach(function (b) { b.classList.toggle('aktiv', b.getAttribute('data-leiste-wahl') === pos); });
    linseSetzen(null);                               // Linse sofort an den neuen Platz des aktiven Tabs
  }
  /* Stil in app.js, damit Markup und Aussehen immer zusammenpassen (auch bei gecachter alter index.html) */
  function leisteStil() {
    if (document.getElementById('leisteStil')) return;
    const U = 'html[data-leiste="unten"]', R = 'html[data-leiste="rechts"]', B = 'html[data-leiste]', D = 'html[data-thema="dunkel"][data-leiste]';
    const st = document.createElement('style'); st.id = 'leisteStil';
    st.textContent = [
      ':root{--leiste-h:64px;--leiste-b:76px}',
      '@media (min-width:881px){:root{--leiste-b:92px}}',
      /* gemeinsam: Seitenleisten-Extras weg, eigener Plus-Knopf, kein Schrumpfen beim Scrollen */
      B + ' .marke,' + B + ' .marke-datum,' + B + ' .seiten-fuss,' + B + ' #neuBtnSeite,' + B + ' .seiten-module{display:none}',
      /* Material: kräftiges Glas, leicht in der Akzentfarbe der Farbwelt getönt – hell und dunkel getrennt */
      B + ' #sidebar{position:fixed;z-index:30;width:auto;flex:none;overflow:visible;margin:0;transform:none!important;transition:none;' +
        'background:linear-gradient(rgba(var(--accent-rgb),.07),rgba(var(--accent-rgb),.07)),rgba(255,255,255,.82);' +
        '-webkit-backdrop-filter:blur(30px) saturate(180%);backdrop-filter:blur(30px) saturate(180%)}',
      D + ' #sidebar{background:linear-gradient(rgba(var(--accent-rgb),.09),rgba(var(--accent-rgb),.09)),rgba(14,16,28,.86)}',
      '@media (prefers-reduced-transparency:reduce),(prefers-contrast:more){' + B + ' #sidebar{-webkit-backdrop-filter:none;backdrop-filter:none;background:#FFFFFF}' + D + ' #sidebar{background:#12141F}}',
      B + ' .nav-item{flex-direction:column;justify-content:center;gap:4px;padding:6px 2px;text-align:center;border-radius:16px;font-size:11.5px;font-weight:500;' +
        'color:var(--text);opacity:.78;touch-action:manipulation;-webkit-user-select:none;user-select:none}',
      B + ' .nav-item svg{width:23px;height:23px;flex:0 0 23px}',
      B + ' .nav-item .lang{display:none}',
      B + ' .nav-item .kurz{display:block;opacity:1!important;white-space:nowrap}',
      /* aktiver Tab: Akzentfarbe + getönte Fläche; inaktive Tabs in voller Textfarbe (leicht zurückgenommen) statt Grau */
      B + ' .nav-item.aktiv{color:var(--accent-tief,var(--accent));font-weight:650;opacity:1}',
      D + ' .nav-item.aktiv{color:var(--accent-hell,var(--accent))}',
      B + ' .nav-linse{border:0;border-radius:16px;background:rgba(var(--accent-rgb),.16)!important;box-shadow:inset 0 0 0 1px rgba(var(--accent-rgb),.28)!important}',
      D + ' .nav-linse{background:rgba(var(--accent-rgb),.24)!important;box-shadow:inset 0 0 0 1px rgba(var(--accent-rgb),.38)!important}',
      B + ' .nav-linse::before{display:none}',
      B + ' #fabNeu{display:flex;position:fixed;z-index:31;width:58px;height:58px;border-radius:50%;border:1px solid rgba(255,255,255,.45);color:var(--akzent-text,#fff);' +
        'align-items:center;justify-content:center;transform:none!important;background:linear-gradient(180deg,var(--accent-hell),var(--accent) 55%,var(--accent-tief));' +
        'box-shadow:var(--glas-rand),0 10px 24px rgba(var(--accent-rgb),.38)}',
      B + ' #fabNeu:active{transform:scale(.92)!important}',
      /* UNTEN: angedockte Leiste über die ganze Breite, Platz für die Home-Leiste */
      U + ' #sidebar{left:0;right:0;bottom:0;top:auto;padding:6px max(10px,env(safe-area-inset-right)) calc(6px + env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));' +
        'border-radius:22px 22px 0 0;border:0;border-top:1px solid var(--kante);box-shadow:0 -8px 30px rgba(30,40,90,.12)}',
      U + ' #nav{flex-direction:row;margin:0 auto;width:100%;max-width:720px;gap:4px}',
      U + ' .nav-item{flex:1;min-width:0;min-height:var(--leiste-h)}',
      U + ' #fabNeu{right:max(16px,env(safe-area-inset-right));bottom:calc(var(--leiste-h) + 26px + env(safe-area-inset-bottom))}',
      U + ' #kiKnopf{bottom:calc(var(--leiste-h) + 26px + env(safe-area-inset-bottom));right:calc(max(16px,env(safe-area-inset-right)) + 70px)}',
      '@media (min-width:881px){' + U + ' #app{padding-bottom:calc(var(--leiste-h) + 26px + env(safe-area-inset-bottom))}' + U + ' #content{padding-bottom:84px}}',
      '@media (max-width:880px){' + U + ' #content{padding-bottom:calc(var(--leiste-h) + 110px + env(safe-area-inset-bottom))}}',
      /* RECHTS: senkrechte Leiste am rechten Rand, Platz im Layout reserviert */
      R + ' #sidebar{top:0;bottom:0;right:0;left:auto;width:calc(var(--leiste-b) + env(safe-area-inset-right));display:flex;flex-direction:column;justify-content:center;' +
        'padding:calc(10px + env(safe-area-inset-top)) calc(6px + env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) 6px;' +
        'border-radius:22px 0 0 22px;border:0;border-left:1px solid var(--kante);box-shadow:-8px 0 30px rgba(30,40,90,.12)}',
      R + ' #nav{flex-direction:column;margin:0;width:100%;gap:4px}',
      R + ' .nav-item{width:100%;min-height:58px}',
      R + ' #app{padding-right:calc(var(--leiste-b) + env(safe-area-inset-right) + 14px)}',
      R + ' #fabNeu{right:calc(var(--leiste-b) + env(safe-area-inset-right) + 16px);bottom:calc(18px + env(safe-area-inset-bottom))}',
      R + ' #kiKnopf{right:calc(var(--leiste-b) + env(safe-area-inset-right) + 16px);bottom:calc(88px + env(safe-area-inset-bottom))}',
      '@media (max-width:880px){' + R + ' #app{padding-right:calc(var(--leiste-b) + env(safe-area-inset-right))}' + R + ' #content{padding-bottom:100px}}',
      '@media (max-height:480px){' + R + ' .nav-item{min-height:44px;padding:3px 2px}' + R + ' .nav-item .kurz{display:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }
  function istDunkel() { return document.documentElement.getAttribute('data-thema') === 'dunkel'; }
  function themaKnopf() {
    const mond = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11z" fill="currentColor"/></svg>';
    const sonne = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.6" fill="currentColor"/>' +
      '<path d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    const dunkel = istDunkel();
    return '<button class="btn thema-knopf" data-thema-umschalten="1" title="' +
      (dunkel ? 'Zum hellen Modus wechseln' : 'Zum dunklen Modus wechseln') + '" aria-label="' +
      (dunkel ? 'Heller Modus' : 'Dunkler Modus') + '">' + (dunkel ? sonne : mond) + '</button>' +
      (window.Assistent && window.Assistent.kopfKnopf ? window.Assistent.kopfKnopf() : '');
  }
  function themaNachpruefen() {
    if (themaWahl() !== 'auto') return;
    const vorher = document.documentElement.getAttribute('data-thema');
    themaAnwenden();
    if (document.documentElement.getAttribute('data-thema') !== vorher) render();
  }
  function themaSetzen(wahl) {
    try { localStorage.setItem('schulplaner.thema', wahl); } catch (e) { }
    if (wahl !== 'dunkel' && farbwelt()[2]) { try { localStorage.setItem('schulplaner.farbwelt', 'standard'); } catch (e) { } }
    const html = document.documentElement;
    html.classList.add('thema-wechsel');
    themaAnwenden();
    render();
    setTimeout(function () { html.classList.remove('thema-wechsel'); }, 450);
  }
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const neu = function () { if (themaWahl() === 'auto') themaAnwenden(); };
    if (mq.addEventListener) mq.addEventListener('change', neu); else if (mq.addListener) mq.addListener(neu);
  }

  /* ---------- Speicher ---------- */
  function ladeLokal() {
    try {
      const roh = localStorage.getItem(SCHLUESSEL_DATEN);
      if (roh) daten = JSON.parse(roh);
    } catch (e) { daten = { module: [], aufgaben: [] }; }
    daten.module = daten.module || [];
    daten.aufgaben = daten.aufgaben || [];
    try {
      const c = localStorage.getItem(SCHLUESSEL_CFG);
      if (c) cfg = Object.assign(cfg, JSON.parse(c));
    } catch (e) { /* egal */ }
    if (!aktiv(daten.module).length && !aktiv(daten.aufgaben).length) {
      daten.module = STANDARD_MODULE.map(function (n, i) {
        return { id: uid(), name: n, farbe: MODUL_FARBEN[i % MODUL_FARBEN.length], geaendert: jetztISO(), geloescht: false };
      });
      speichereLokal();
    }
  }
  function speichereLokal() {
    try { localStorage.setItem(SCHLUESSEL_DATEN, JSON.stringify(daten)); }
    catch (e) { alert('Speichern im Browser fehlgeschlagen: ' + e.message); }
  }
  function speichereCfg() { localStorage.setItem(SCHLUESSEL_CFG, JSON.stringify(cfg)); }

  function geaendert() { speichereLokal(); planeSync(); render(); }

  /* ---------- Synchronisation ---------- */
  function konfiguriert() { return !!(cfg.url && cfg.key && cfg.code); }

  async function rpc(name, koerper) {
    const basis = cfg.url.replace(/\/+$/, '');
    const antwort = await fetch(basis + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(koerper)
    });
    const text = await antwort.text();
    if (!antwort.ok) throw new Error('Server meldet ' + antwort.status + ': ' + text.slice(0, 200));
    return text ? JSON.parse(text) : null;
  }
  async function fernLaden() {
    const zeilen = await rpc('daten_laden', { p_schluessel: cfg.code });
    return zeilen && zeilen.length ? zeilen[0] : null;
  }
  async function fernSpeichern() {
    return rpc('daten_speichern', { p_schluessel: cfg.code, p_inhalt: { module: daten.module, aufgaben: daten.aufgaben } });
  }

  function planeSync() {
    if (!konfiguriert()) { setzeStatus('grau', 'Nur auf diesem Gerät'); return; }
    clearTimeout(syncTimer);
    setzeStatus('blau', 'Änderung wird gesendet …');
    syncTimer = setTimeout(function () { synchronisiere(); }, 1200);
  }

  async function synchronisiere(zeigeFehler) {
    if (!konfiguriert()) { setzeStatus('grau', 'Nur auf diesem Gerät'); return false; }
    if (syncLaeuft) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setzeStatus('grau', 'Offline – wird später gesendet'); return false;
    }
    syncLaeuft = true;
    setzeStatus('blau', 'Synchronisiert …');
    try {
      const fern = await fernLaden();
      const fernDaten = fern && fern.inhalt ? fern.inhalt : { module: [], aufgaben: [] };
      const zusammen = aufraeumen(vereinigeDoppelteModule(datenZusammenfuehren(daten, fernDaten)), heute);
      const lokalNeu = !gleich(zusammen, daten);
      const fernNeu = !gleich(zusammen, fernDaten);
      daten = zusammen;
      speichereLokal();
      if (fernNeu) await fernSpeichern();
      letzterSync = new Date();
      setzeStatus('gruen', 'Synchron (' + uhrzeit(letzterSync) + ')');
      if (lokalNeu) render();
      return true;
    } catch (e) {
      setzeStatus('rot', 'Sync-Fehler');
      if (zeigeFehler) alert('Synchronisieren fehlgeschlagen:\n\n' + e.message);
      return false;
    } finally {
      syncLaeuft = false;
    }
  }
  function uhrzeit(d) { return zahl2(d.getHours()) + ':' + zahl2(d.getMinutes()); }
  function setzeStatus(klasse, text) {
    syncKlasse = klasse; syncText = text;
    const el = $('#syncStatus');
    if (el) el.innerHTML = '<span class="punkt ' + klasse + '"></span>' + esc(text);
    const el2 = $('#syncStatusSeite');
    if (el2) el2.innerHTML = '<span class="punkt ' + klasse + '"></span>' + esc(text);
  }

  /* ---------- Datenzugriff ---------- */
  function module() { return aktiv((demo || daten).module); }
  function aufgaben() { return aktiv((demo || daten).aufgaben); }
  function modulVon(id) {
    const m = (demo || daten).module.filter(function (x) { return x.id === id; })[0];
    return m && !m.geloescht ? m : null;
  }
  function modulName(id) { const m = modulVon(id); return m ? m.name : 'Ohne Modul'; }
  /* Farben stammen auch aus importierten oder abgeglichenen Daten: nur echte Farbcodes in style-Attribute lassen */
  function farbeSicher(f) { return /^#[0-9a-f]{3,8}$/i.test(String(f || '')) ? f : '#9A9AA2'; }
  function modulFarbe(id) { const m = modulVon(id); return m ? farbeSicher(m.farbe) : '#9A9AA2'; }
  function aufgabeVon(id) { return (demo || daten).aufgaben.filter(function (t) { return t.id === id; })[0]; }
  function aufgabenAn(iso) { return aufgaben().filter(function (t) { return t.deadline === iso; }); }

  // Schreiben geht immer in die echten Daten – auch während die Tour Beispieldaten anzeigt
  function aufgabeEcht(id) { return daten.aufgaben.filter(function (t) { return t.id === id; })[0]; }
  function speichereAufgabe(obj) {
    obj.geaendert = jetztISO();
    const vorhanden = aufgabeEcht(obj.id);
    if (vorhanden) Object.assign(vorhanden, obj);
    else daten.aufgaben.push(Object.assign({ geloescht: false }, obj));
    geaendert();
  }
  function loescheAufgabe(id) {
    const t = aufgabeEcht(id);
    if (!t) return;
    t.geloescht = true; t.geaendert = jetztISO();
    geaendert();
  }
  function statusWeiter(id) {
    const t = aufgabeVon(id);
    if (!t) return;
    if (istFertig(t)) {
      t.status = STATI.indexOf(t.status_vorher) >= 0 && t.status_vorher !== 'Abgeschlossen'
        ? t.status_vorher : STATI[0];
    } else {
      t.status_vorher = t.status;
      t.status = 'Abgeschlossen';
      geradeErledigt = { id: t.id, heute: t.deadline === heuteISO() };
      (t.unteraufgaben || []).forEach(function (s) { s.erledigt = true; });
    }
    t.geaendert = jetztISO();
    geaendert();
  }
  function unteraufgabeUmschalten(id, index) {
    const t = aufgabeVon(id);
    if (!t || !t.unteraufgaben || !t.unteraufgaben[index]) return;
    const sub = t.unteraufgaben[index];
    sub.erledigt = !sub.erledigt;
    const alle = t.unteraufgaben.every(function (x) { return x.erledigt; });
    const eine = t.unteraufgaben.some(function (x) { return x.erledigt; });
    if (alle && !istFertig(t)) { t.status_vorher = t.status; t.status = 'Abgeschlossen'; }
    else if (istFertig(t) && !alle) t.status = 'In Bearbeitung';
    else if (t.status === STATI[0] && eine) t.status = 'In Bearbeitung';
    t.geaendert = jetztISO();
    geaendert();
  }


  /* ---------- Glas-Auswahlliste statt der Browser-Auswahl ---------- */
  const GLAS_AUSWAHL = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches &&
                          HTMLElement.prototype.showPopover);
  const PFEIL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const HAKEN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 8.4l2.9 2.9 5.9-6.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let offeneListe = null;

  function farbeFuerOption(sel, wert) {
    const id = sel.id;
    if (id === 'fModul' || id === 'fltModul') {
      if (!wert) return null;
      if (wert === '__ohne__') return '#9A9AA2';
      const m = modulVon(wert); return m ? m.farbe : null;
    }
    if (id === 'fPrio' || id === 'fltPrio') return PRIO_FARBE[wert] || null;
    if (id === 'fStatus' || id === 'fltStatus') return STATUS_FARBE[wert] || null;
    return null;
  }
  function punktHTML(farbe) {
    return farbe ? '<span class="auswahl-punkt" style="background:' + farbeSicher(farbe) + '"></span>' : '';
  }
  function knopfBeschriften(sel) {
    const knopf = sel.nextElementSibling;
    if (!knopf || !knopf.classList.contains('auswahl-knopf')) return;
    const opt = sel.options[sel.selectedIndex];
    knopf.querySelector('.auswahl-text').innerHTML =
      punktHTML(farbeFuerOption(sel, sel.value)) + '<span>' + esc(opt ? opt.text : '') + '</span>';
  }
  function listeSchliessen() {
    if (offeneListe) { try { offeneListe.hidePopover(); } catch (e) { } }
  }
  function listeOeffnen(sel, knopf) {
    listeSchliessen();
    const liste = document.createElement('div');
    liste.className = 'auswahl-liste';
    liste.setAttribute('popover', 'auto');
    liste.setAttribute('role', 'listbox');
    liste.innerHTML = Array.from(sel.options).map(function (o, i) {
      const aktiv = i === sel.selectedIndex;
      return '<button type="button" class="auswahl-option' + (aktiv ? ' aktiv' : '') + '" role="option" aria-selected="' +
        aktiv + '" data-index="' + i + '">' + punktHTML(farbeFuerOption(sel, o.value)) +
        '<span class="auswahl-name">' + esc(o.text) + '</span>' + (aktiv ? HAKEN : '') + '</button>';
    }).join('');
    (sel.closest('dialog') || document.body).appendChild(liste);   // im offenen Dialog bleiben
    liste.addEventListener('toggle', function (ev) {
      if (ev.newState === 'closed') {
        knopf.setAttribute('aria-expanded', 'false');
        liste.remove();
        if (offeneListe === liste) offeneListe = null;
      }
    });
    liste.addEventListener('click', function (ev) {
      const b = ev.target.closest('.auswahl-option');
      if (!b) return;
      sel.selectedIndex = Number(b.getAttribute('data-index'));
      knopfBeschriften(sel);
      listeSchliessen();
      knopf.focus();
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    liste.addEventListener('keydown', function (ev) {
      const knoepfe = Array.from(liste.querySelectorAll('.auswahl-option'));
      const i = knoepfe.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown') { ev.preventDefault(); knoepfe[Math.min(knoepfe.length - 1, i + 1)].focus(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); knoepfe[Math.max(0, i - 1)].focus(); }
      else if (ev.key === 'Home') { ev.preventDefault(); knoepfe[0].focus(); }
      else if (ev.key === 'End') { ev.preventDefault(); knoepfe[knoepfe.length - 1].focus(); }
      else if (ev.key === 'Tab') { listeSchliessen(); }
    });
    offeneListe = liste;
    liste.showPopover();
    knopf.setAttribute('aria-expanded', 'true');
    // Position: unter dem Feld, bei Platzmangel darueber
    const r = knopf.getBoundingClientRect();
    liste.style.minWidth = r.width + 'px';
    liste.style.left = Math.min(r.left, window.innerWidth - liste.offsetWidth - 8) + 'px';
    const hoehe = liste.offsetHeight;
    const unten = window.innerHeight - r.bottom - 10;
    liste.style.top = (unten >= hoehe || unten >= r.top ? r.bottom + 6 : Math.max(8, r.top - hoehe - 6)) + 'px';
    const aktiv = liste.querySelector('.auswahl-option.aktiv') || liste.querySelector('.auswahl-option');
    if (aktiv) aktiv.focus();
  }
  function auswahlAufbereiten(wurzel) {
    if (!GLAS_AUSWAHL || !wurzel) return;
    wurzel.querySelectorAll('select').forEach(function (sel) {
      if (sel.dataset.glas === '1') { knopfBeschriften(sel); return; }
      sel.dataset.glas = '1';
      sel.classList.add('auswahl-versteckt');
      sel.tabIndex = -1;
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'auswahl-knopf';
      knopf.setAttribute('aria-haspopup', 'listbox');
      knopf.setAttribute('aria-expanded', 'false');
      if (sel.id) knopf.id = sel.id + '_glas';
      const label = sel.id && document.querySelector('label[for="' + sel.id + '"]');
      knopf.setAttribute('aria-label', label ? label.textContent : (sel.options[0] ? sel.options[0].text : 'Auswahl'));
      knopf.innerHTML = '<span class="auswahl-text"></span>' + PFEIL;
      sel.insertAdjacentElement('afterend', knopf);
      knopf.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (offeneListe && knopf.getAttribute('aria-expanded') === 'true') listeSchliessen();
        else listeOeffnen(sel, knopf);
      });
      knopf.addEventListener('keydown', function (ev) {
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); listeOeffnen(sel, knopf); }
      });
      sel.addEventListener('focus', function () { knopf.focus(); });   // Klick aufs Label
      knopfBeschriften(sel);
    });
  }
  window.addEventListener('resize', listeSchliessen);
  document.addEventListener('scroll', function (ev) {
    if (offeneListe && !offeneListe.contains(ev.target)) listeSchliessen();
  }, true);

  /* ---------- Formatierung ---------- */
  function langesDatum(iso) {
    const d = vonISO(iso);
    return WOCHENTAGE[(d.getDay() + 6) % 7] + ', ' + d.getDate() + '. ' + MONATE[d.getMonth()] + ' ' + d.getFullYear();
  }
  function kurzesDatum(iso) {
    const d = vonISO(iso);
    return zahl2(d.getDate()) + '.' + zahl2(d.getMonth() + 1) + '.' + d.getFullYear();
  }
  function menschDatum(iso) {
    if (!iso) return 'Kein Datum';
    const tage = Math.round((vonISO(iso) - vonISO(heute)) / 86400000);
    if (tage === 0) return 'Heute';
    if (tage === 1) return 'Morgen';
    if (tage === -1) return 'Gestern';
    if (tage < -1) return kurzesDatum(iso) + ' (' + (-tage) + ' Tage überfällig)';
    const d = vonISO(iso);
    return WT_KURZ[(d.getDay() + 6) % 7] + ', ' + kurzesDatum(iso);
  }

  /* ---------- Bausteine ---------- */
  function karteHTML(t, opt) {
    opt = opt || {};
    const fertig = istFertig(t);
    const fp = fortschritt(t);
    const ueber = istUeberfaellig(t, heute);
    let knopf = '<button class="status-knopf" data-status="' + esc(t.id) + '" aria-label="Status ändern"></button>';
    if (fertig) knopf = '<button class="status-knopf fertig" data-status="' + esc(t.id) + '" aria-label="Wieder öffnen"></button>';
    else if (t.status === 'In Bearbeitung') knopf = '<button class="status-knopf arbeit" data-status="' + esc(t.id) + '"></button>';

    let meta = '';
    if (opt.modul !== false) {
      meta += '<span><span class="mod-punkt" style="background:' + modulFarbe(t.modul_id) + '"></span>' + esc(modulName(t.modul_id)) + '</span>';
    }
    if (opt.datum !== false) {
      meta += '<span class="' + (ueber ? 'ueberfaellig' : '') + '">' + esc(menschDatum(t.deadline)) + '</span>';
    }
    meta += '<span style="color:' + STATUS_FARBE[t.status] + '">' + esc(t.status) + '</span>';

    let balken = '';
    if (fp) {
      const anteil = Math.round(fp.fertig / fp.gesamt * 100);
      balken = '<div class="balken' + (fp.fertig === fp.gesamt ? ' voll' : '') + '"><i style="width:' + anteil + '%"></i></div>' +
        '<div class="balken-text">' + fp.fertig + '/' + fp.gesamt + ' Unteraufgaben</div>' +
        '<div class="unterliste">' +
        (t.unteraufgaben || []).slice(0, 4).map(function (s, i) {
          return '<div class="sub' + (s.erledigt ? ' ok' : '') + '" data-sub-karte="' + esc(t.id) + '|' + i + '">' +
            '<span class="sub-kreis"></span><span>' + esc(s.titel) + '</span></div>';
        }).join('') +
        ((t.unteraufgaben || []).length > 4 ? '<div style="color:var(--muted)">+ ' + ((t.unteraufgaben.length) - 4) + ' weitere</div>' : '') +
        '</div>';
    }
    return '<div class="karte' + (fertig ? ' fertig' : '') + '" data-karte="' + esc(t.id) + '">' +
      '<div class="karte-oben">' + knopf +
      '<div class="karte-titel">' + esc(titelText(t)) + '</div>' +
      (PRIO_FARBE[t.prioritaet] ? '<span class="chip" style="color:' + PRIO_FARBE[t.prioritaet] + ';border-color:' + PRIO_FARBE[t.prioritaet] + '">' + esc(t.prioritaet) + '</span>' : '') +
      '</div><div class="meta">' + meta + '</div>' + balken + '</div>';
  }
  function abschnitt(titel, anzahl, klasse) {
    return '<div class="abschnitt ' + (klasse || '') + '">' + esc(titel) + '<span class="zahl">' + anzahl + '</span></div>';
  }
  function listeHTML(liste, opt) {
    if (!liste.length) return '<div class="leer">Nichts vorhanden.</div>';
    return liste.map(function (t) { return karteHTML(t, opt); }).join('');
  }

  /* ---------- Ansichten ---------- */
  function render() {
    heute = heuteISO();
    $('#kopfDatum').textContent = langesDatum(heute);
    zeichneNav();
    zeichneSeitenModule();
    zaehlerAktualisieren();
    setzeStatus(syncKlasse, syncText || (konfiguriert() ? 'Bereit' : 'Nur auf diesem Gerät'));
    const c = $('#content');
    if (ansicht === 'heute') c.innerHTML = htmlHeute();
    else if (ansicht === 'kalender') c.innerHTML = htmlKalender();
    else if (ansicht === 'module') c.innerHTML = modulOffen ? htmlModulDetail() : htmlModule();
    else if (ansicht === 'alle') c.innerHTML = htmlAlle();
    else if (ansicht === 'notizen') c.innerHTML = htmlNotizen();
    else c.innerHTML = htmlEinstellungen();
    if (ansicht === 'alle') {
      const s = $('#suchfeld');
      if (s) { s.value = filter.suche; }
    }
    auswahlAufbereiten(c);
    if (geradeErledigt) {                         // Haken bestätigt das Abhaken mit einem kurzen „Plopp“
      const k = c.querySelector('.status-knopf.fertig[data-status="' + (window.CSS && CSS.escape ? CSS.escape(geradeErledigt.id) : geradeErledigt.id) + '"]');
      if (k) k.classList.add('ploppt');
      geradeErledigt = null;
    }
    if (window.Notizen) { try { window.Notizen.nachRender(c); } catch (e) { console.error(e); } }
    if (window.Assistent) { try { window.Assistent.nachRender(c); } catch (e) { console.error(e); } }
  }

  function htmlNotizen() {
    return '<div class="seite"><div class="kopf"><div><h1>Notizbücher</h1>' +
      '<div class="unter">Mitschriften mit dem Apple Pencil – ein Notizbuch pro Fach</div></div>' +
      '<div class="kopf-rechts">' + themaKnopf() + '<button class="btn" data-nb-abgleich="1"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18.5h10.5a4 4 0 00.6-7.95A6 6 0 006.6 9.1 4.7 4.7 0 007 18.5z"/><path d="M10 13.6l2-2 2 2M12 11.6v5"/></svg><span>Abgleichen</span></button>' +
      '<button class="btn btn-primary" data-nb-neu="">' + ICON_PLUS + '<span>Neues Notizbuch</span></button></div></div>' +
      (window.Notizen ? '<div data-nb-bibliothek="1"></div>' : '<div class="hinweis fehler">Die Datei notizen.js fehlt – bitte mit hochladen.</div>') +
      '</div>';
  }


  /* ============================================================
     Moodle-Abgleich über die Kalenderdatei (.ics) von elearning
     Nur lesen: in Moodle wird nichts gestartet oder abgegeben.
     Der Kalender-Link ist wie ein Schlüssel und bleibt nur auf diesem Gerät.
     ============================================================ */
  const MOODLE_KEY = 'schulplaner.moodle';
  const MOODLE_STANDARD = 'https://elearning.tgm.ac.at';
  function moodleCfg() { try { const c = JSON.parse(localStorage.getItem(MOODLE_KEY) || '{}'); return c && typeof c === 'object' ? c : {}; } catch (e) { return {}; } }
  function moodleCfgSetzen(c) { try { localStorage.setItem(MOODLE_KEY, JSON.stringify(c)); } catch (e) { } }
  function moodleBasis() {
    const u = moodleCfg().url;
    try { if (u) return new URL(u).origin; } catch (e) { }
    return MOODLE_STANDARD;
  }
  function moodleLinkGueltig(u) {
    try { const x = new URL(u); return x.protocol === 'https:' && /export_execute\.php/.test(x.pathname) && x.searchParams.get('authtoken'); } catch (e) { return false; }
  }

  /* --- Kalenderdatei lesen (RFC 5545, so wie Moodle sie schreibt) --- */
  function icsLesen(text) {
    const zeilen = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    const ereignisse = []; let e = null;
    const wert = function (v) { return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim(); };
    zeilen.forEach(function (z) {
      if (z === 'BEGIN:VEVENT') { e = {}; return; }
      if (z === 'END:VEVENT') { if (e) ereignisse.push(e); e = null; return; }
      if (!e) return;
      const i = z.indexOf(':'); if (i < 0) return;
      const kopf = z.slice(0, i), name = kopf.split(';')[0].toUpperCase(), v = z.slice(i + 1);
      if (name === 'UID') e.uid = v.trim();
      else if (name === 'SUMMARY') e.titel = wert(v);
      else if (name === 'DESCRIPTION') e.text = wert(v);
      else if (name === 'CATEGORIES') e.kurs = wert(v).split(',')[0].trim();
      else if (name === 'DTSTART' || (name === 'DTEND' && !e.start)) e[name === 'DTSTART' ? 'start' : 'ende'] = v.trim();
    });
    return ereignisse;
  }
  function icsDatum(v) {                          // 20261112T225900Z -> lokales Datum (Abgabe 23:59 bleibt am richtigen Tag)
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(v || '');
    if (!m) return null;
    if (!m[4]) return m[1] + '-' + m[2] + '-' + m[3];
    const d = m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return datumISO(d);
  }
  function moodleTitel(t) {                       // „Hausübung 3 ist fällig“ -> „Hausübung 3“
    return String(t || '').replace(/^["„'‚]|["“'‘]$/g, '')
      .replace(/\s+(ist fällig|ist zu erledigen|ist bis|ist abzugeben|endet|schließt|is due|closes|due)\.?$/i, '').trim();
  }
  function moodleNormal(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim(); }

  /* --- Vergleich mit den vorhandenen Aufgaben: nie doppelt eintragen --- */
  function moodlePlan(ereignisse) {
    const grenze = tageDazu(heute, -7), alle = daten.aufgaben.filter(function (t) { return !t.geloescht; });
    const plan = { neu: [], geaendert: [], vorhanden: [], uebersprungen: 0, kurse: {} };
    const gesehen = new Set();
    ereignisse.forEach(function (e) {
      if (!e.uid || !e.titel || /\s(öffnet|opens|beginnt)\.?$/i.test(e.titel)) { plan.uebersprungen++; return; }
      const deadline = icsDatum(e.start || e.ende);
      if (!deadline || deadline < grenze || gesehen.has(e.uid)) { plan.uebersprungen++; return; }
      gesehen.add(e.uid);
      const titel = moodleTitel(e.titel) || e.titel, kurs = e.kurs || 'Ohne Kurs';
      plan.kurse[kurs] = (plan.kurse[kurs] || 0) + 1;
      const eintrag = { uid: e.uid, titel: titel, deadline: deadline, kurs: kurs, text: (e.text || '').slice(0, 400) };
      let t = alle.find(function (x) { return x.moodle_uid === e.uid; });
      if (!t) t = alle.find(function (x) { return !x.moodle_uid && moodleNormal(x.titel) === moodleNormal(titel) && (!x.deadline || x.deadline === deadline); });
      if (!t) { plan.neu.push(eintrag); return; }
      eintrag.id = t.id;
      if (t.deadline !== deadline && !istFertig(t)) { eintrag.alt = t.deadline; plan.geaendert.push(eintrag); }
      else plan.vorhanden.push(eintrag);
    });
    return plan;
  }
  function moodleUebernehmen(plan, auswahl) {
    const zuordnung = moodleCfg().kurse || {};
    const modulFuer = function (kurs) {
      const z = zuordnung[kurs];
      if (z && z !== '__neu__' && z !== '__ohne__' && modulVon(z)) return z;
      if (z === '__neu__') {
        const da = module().find(function (m) { return m.name.toLowerCase() === kurs.toLowerCase(); });
        if (da) return da.id;
        const m = { id: uid(), name: kurs.slice(0, 60), farbe: MODUL_FARBEN[module().length % MODUL_FARBEN.length], geaendert: jetztISO(), geloescht: false };
        daten.module.push(m); zuordnung[kurs] = m.id;
        const c = moodleCfg(); c.kurse = zuordnung; moodleCfgSetzen(c);
        return m.id;
      }
      return null;
    };
    let neu = 0, geaendertZahl = 0;
    plan.neu.forEach(function (e) {
      if (!auswahl.has(e.uid) || zuordnung[e.kurs] === '__weg__') return;
      daten.aufgaben.push({
        id: uid(), titel: e.titel.slice(0, 200), modul_id: modulFuer(e.kurs), deadline: e.deadline,
        status: 'Noch nicht angefangen', prioritaet: /test|schularbeit|prüfung|quiz|(^|[^a-zäöüß])(sa|smü|gkü|gkv|wh)([^a-zäöüß]|$)/i.test(e.titel) ? 'Hoch' : 'Mittel',
        notizen: 'Aus Moodle (' + e.kurs + ')' + (e.text ? '\n' + e.text : ''), unteraufgaben: [], moodle_uid: e.uid,
        geaendert: jetztISO(), geloescht: false
      });
      neu++;
    });
    plan.geaendert.forEach(function (e) {
      if (!auswahl.has(e.uid)) return;
      const t = aufgabeVon(e.id); if (!t) return;
      t.deadline = e.deadline; t.moodle_uid = e.uid; t.geaendert = jetztISO(); geaendertZahl++;
    });
    plan.vorhanden.forEach(function (e) {           // eigene Einträge mit Moodle verknüpfen, damit sie künftig sicher erkannt werden
      const t = aufgabeVon(e.id); if (t && !t.moodle_uid) { t.moodle_uid = e.uid; t.geaendert = jetztISO(); }
    });
    const c = moodleCfg(); c.zuletzt = jetztISO(); moodleCfgSetzen(c);
    geaendert();
    return { neu: neu, geaendert: geaendertZahl };
  }

  /* --- Fenster: verbinden, Datei holen, Kurse zuordnen, Vorschau --- */
  let moodleZustand = null;
  function moodleDialog() {
    let dlg = document.getElementById('dlgMoodle');
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.id = 'dlgMoodle'; dlg.className = 'neu-dlg moodle-dlg';
      document.body.appendChild(dlg);
      dlg.addEventListener('click', moodleKlick);
      dlg.addEventListener('change', function (e) {
        if (e.target.matches('[data-moodle-datei]') && e.target.files[0]) moodleDateiLesen(e.target.files[0]);
        if (e.target.matches('[data-moodle-kurs]')) { const c = moodleCfg(); c.kurse = c.kurse || {}; c.kurse[e.target.getAttribute('data-moodle-kurs')] = e.target.value; moodleCfgSetzen(c); }
        if (e.target.matches('[data-moodle-wahl]')) { const u = e.target.getAttribute('data-moodle-wahl'); e.target.checked ? moodleZustand.auswahl.add(u) : moodleZustand.auswahl.delete(u); moodleZeichnen(); }
      });
      dlg.addEventListener('dragover', function (e) { e.preventDefault(); });
      dlg.addEventListener('drop', function (e) { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) moodleDateiLesen(f); });
    }
    moodleZustand = { schritt: moodleCfg().url ? 'holen' : 'verbinden', plan: null, auswahl: new Set(), fehler: '' };
    moodleZeichnen();
    if (!dlg.open) dlg.showModal();
  }
  function moodleDateiLesen(datei) {
    const r = new FileReader();
    r.onload = function () {
      const ereignisse = icsLesen(r.result);
      if (!/BEGIN:VCALENDAR/.test(String(r.result))) { moodleZustand.fehler = 'Das ist keine Kalenderdatei (.ics). Bitte die Datei aus elearning wählen.'; moodleZeichnen(); return; }
      moodleZustand.plan = moodlePlan(ereignisse);
      moodleZustand.auswahl = new Set(moodleZustand.plan.neu.concat(moodleZustand.plan.geaendert).map(function (e) { return e.uid; }));
      const zuordnung = moodleCfg().kurse || {};
      const offen = Object.keys(moodleZustand.plan.kurse).filter(function (k) { return !zuordnung[k]; });
      moodleZustand.schritt = offen.length ? 'kurse' : 'vorschau'; moodleZustand.fehler = '';
      moodleZeichnen();
    };
    r.onerror = function () { moodleZustand.fehler = 'Die Datei konnte nicht gelesen werden.'; moodleZeichnen(); };
    r.readAsText(datei);
  }
  /* typische Fach-Kürzel an HTLs (Kurzname in Moodle, z. B. „AM_2AHIT“) */
  const MOODLE_KUERZEL = { am: ['mathe', 'mathematik'], d: ['deutsch'], e: ['englisch', 'english'], nwt: ['netzwerk'], sew: ['software', 'sew'],
    nawi: ['naturwiss', 'physik', 'chemie', 'biologie', 'nawi'], nw: ['naturwiss', 'physik', 'chemie'], ggp: ['geschichte', 'politik'], ggpb: ['geschichte', 'politik'],
    besp: ['sport', 'bewegung'], bsp: ['sport', 'bewegung'], rk: ['religion'], re: ['religion'], wir: ['wirtschaft', 'recht'], itp: ['projekt'], insy: ['informationssystem', 'datenbank'],
    medt: ['medientechnik', 'medien'], syt: ['systemtechnik'], itsi: ['sicherheit'], kosy: ['kommunikation'], prmt: ['projektmanagement'] };
  function moodleVorschlag(kurs) {                // Modul mit ähnlichem Namen oder passendem Kürzel vorschlagen
    const k = moodleNormal(kurs), kuerzel = String(kurs).toLowerCase().split(/[_\s\-.]/)[0];
    const woerter = (MOODLE_KUERZEL[kuerzel] || []).concat(k ? [k] : []);
    const m = module().find(function (x) {
      const n = moodleNormal(x.name);
      return n && woerter.some(function (w) { return n.indexOf(w) >= 0 || (w.length > 2 && w.indexOf(n) >= 0); });
    });
    return m ? m.id : '__neu__';
  }
  function moodleZeichnen() {
    const dlg = document.getElementById('dlgMoodle'), z = moodleZustand, c = moodleCfg();
    let h = '<div class="dlg-koerper"><h2>Moodle-Abgleich</h2>';
    if (z.fehler) h += '<div class="hinweis fehler">' + esc(z.fehler) + '</div>';
    if (z.schritt === 'verbinden') {
      h += '<div class="neu-unter">Einmal einrichten – danach reichen zwei Taps.</div><ol class="moodle-schritte">' +
        '<li><button class="btn" data-moodle-oeffnen="export">elearning-Kalender öffnen</button></li>' +
        '<li>Dort <b>„Alle Kurse“</b> und <b>„Kommende Ereignisse“</b> (oder „Letzte und kommende 60 Tage“) wählen, dann <b>„Kalender-URL abrufen“</b>.</li>' +
        '<li>Den Link kopieren und hier einfügen:<input id="moodleLink" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://…/calendar/export_execute.php?…"></li></ol>' +
        '<p class="moodle-klein">🔑 Der Link ist wie ein Schlüssel zu deinem Kalender: Wer ihn hat, sieht deine Termine (ändern oder abgeben kann man damit nichts). Er bleibt nur auf diesem Gerät – nicht weitergeben.</p>' +
        '</div><div class="dlg-fuss"><button class="btn" data-moodle-schritt="datei">Nur Datei</button><div class="rechts"><button class="btn" data-moodle-zu>Abbrechen</button><button class="btn btn-primary" data-moodle-speichern>Speichern</button></div></div>';
    } else if (z.schritt === 'holen' || z.schritt === 'datei') {
      h += (z.schritt === 'holen' ? '<ol class="moodle-schritte"><li><button class="btn btn-primary" data-moodle-oeffnen="link">Kalender herunterladen</button><span class="moodle-klein">öffnet deinen gespeicherten Link – der Browser lädt die Datei herunter</span></li>' +
        '<li>Zurück hierher und die Datei wählen:</li></ol>' : '<div class="neu-unter">In elearning unter Kalender → Exportieren die Datei herunterladen und hier wählen.</div>') +
        '<label class="moodle-ablage"><input type="file" accept=".ics,text/calendar" data-moodle-datei hidden><b>Datei wählen</b><span>oder hierher ziehen (am Laptop)</span></label>' +
        (c.zuletzt ? '<p class="moodle-klein">Zuletzt abgeglichen: ' + esc(menschDatum(c.zuletzt.slice(0, 10))) + '</p>' : '') +
        '</div><div class="dlg-fuss">' + (c.url ? '<button class="btn" data-moodle-schritt="verbinden">Link ändern</button>' : '') + '<div class="rechts"><button class="btn" data-moodle-zu>Schließen</button></div></div>';
    } else if (z.schritt === 'kurse') {
      const zu = c.kurse || {};
      h += '<div class="neu-unter">Einmalig: In welches Modul gehören die Aufgaben aus diesen Kursen?</div>' + Object.keys(z.plan.kurse).sort().map(function (k) {
        const wert = zu[k] || moodleVorschlag(k);
        if (!zu[k]) { const cc = moodleCfg(); cc.kurse = cc.kurse || {}; cc.kurse[k] = wert; moodleCfgSetzen(cc); }
        return '<div class="moodle-kurs"><div><b>' + esc(k) + '</b><small>' + z.plan.kurse[k] + (z.plan.kurse[k] === 1 ? ' Eintrag' : ' Einträge') + '</small></div><select data-moodle-kurs="' + esc(k) + '">' +
          module().map(function (m) { return '<option value="' + esc(m.id) + '"' + (wert === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') +
          '<option value="__neu__"' + (wert === '__neu__' ? ' selected' : '') + '>➕ Neues Modul „' + esc(k.slice(0, 30)) + '“</option>' +
          '<option value="__ohne__"' + (wert === '__ohne__' ? ' selected' : '') + '>Ohne Modul</option>' +
          '<option value="__weg__"' + (wert === '__weg__' ? ' selected' : '') + '>Nicht übernehmen</option></select></div>';
      }).join('') + '</div><div class="dlg-fuss"><div class="rechts"><button class="btn btn-primary" data-moodle-schritt="vorschau">Weiter</button></div></div>';
    } else if (z.schritt === 'vorschau') {
      const p = z.plan, zu = c.kurse || {};
      const zeile = function (e, art) {
        const weg = zu[e.kurs] === '__weg__';
        return '<label class="moodle-zeile' + (weg ? ' weg' : '') + '"><input type="checkbox" data-moodle-wahl="' + esc(e.uid) + '"' + (z.auswahl.has(e.uid) && !weg ? ' checked' : '') + (weg ? ' disabled' : '') + '>' +
          '<span><b>' + esc(e.titel) + '</b><small>' + esc(e.kurs) + ' · ' + esc(menschDatum(e.deadline)) + (art === 'geaendert' ? ' (vorher ' + esc(e.alt ? menschDatum(e.alt) : 'ohne Datum') + ')' : '') + '</small></span></label>';
      };
      const zahl = p.neu.concat(p.geaendert).filter(function (e) { return z.auswahl.has(e.uid) && zu[e.kurs] !== '__weg__'; }).length;
      h += '<div class="moodle-zahlen"><span><b>' + p.neu.length + '</b> neu</span><span><b>' + p.geaendert.length + '</b> geändert</span><span><b>' + p.vorhanden.length + '</b> schon da</span></div>' +
        (p.neu.length ? '<h3 class="moodle-h">Neu</h3>' + p.neu.map(function (e) { return zeile(e, 'neu'); }).join('') : '') +
        (p.geaendert.length ? '<h3 class="moodle-h">Termin geändert</h3>' + p.geaendert.map(function (e) { return zeile(e, 'geaendert'); }).join('') : '') +
        (!p.neu.length && !p.geaendert.length ? '<div class="leer">Alles schon eingetragen – nichts Neues in Moodle. 👍</div>' : '') +
        '</div><div class="dlg-fuss"><button class="btn" data-moodle-schritt="kurse">Kurse</button><div class="rechts"><button class="btn" data-moodle-zu>Abbrechen</button>' +
        (zahl ? '<button class="btn btn-primary" data-moodle-uebernehmen>' + zahl + ' übernehmen</button>' : '') + '</div></div>';
    }
    dlg.innerHTML = h;
  }
  function moodleKlick(e) {
    const z = moodleZustand, dlg = document.getElementById('dlgMoodle');
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-moodle-zu')) { dlg.close(); return; }
    if (b.hasAttribute('data-moodle-oeffnen')) {
      const ziel = b.getAttribute('data-moodle-oeffnen') === 'link' ? moodleCfg().url : moodleBasis() + '/calendar/export.php';
      if (ziel) window.open(ziel, '_blank', 'noopener');
      return;
    }
    if (b.hasAttribute('data-moodle-speichern')) {
      const v = (document.getElementById('moodleLink').value || '').trim();
      if (!moodleLinkGueltig(v)) { z.fehler = 'Das sieht nicht wie der Kalender-Link aus. Er beginnt mit https:// und enthält „export_execute.php“ und „authtoken“.'; moodleZeichnen(); return; }
      const c = moodleCfg(); c.url = v; moodleCfgSetzen(c);
      z.schritt = 'holen'; z.fehler = ''; moodleZeichnen(); render(); return;
    }
    if (b.hasAttribute('data-moodle-schritt')) { z.schritt = b.getAttribute('data-moodle-schritt'); z.fehler = ''; moodleZeichnen(); return; }
    if (b.hasAttribute('data-moodle-uebernehmen')) {
      const r = moodleUebernehmen(z.plan, z.auswahl);
      dlg.close();
      setTimeout(function () { alert('Moodle-Abgleich fertig: ' + r.neu + ' neu eingetragen' + (r.geaendert ? ', ' + r.geaendert + ' Termin(e) aktualisiert' : '') + '.'); }, 50);
    }
  }

  /* ============================================================
     Heute-Seite in vier Designs (wählbar beim ersten Start und in den Einstellungen)
     ============================================================ */
  const HEUTE_STILE = [
    ['klassisch', 'Klassisch', 'Kennzahlen und Listen – so wie bisher'],
    ['widgets', 'Widgets', 'Überblick in Zahlen: nächste Abgabe, Wochenring, Wichtiges'],
    ['zeitleiste', 'Zeitleiste', 'Nach Zeit geordnet, Tage in der Woche antippen'],
    ['fokus', 'Fokus', 'Eine Aufgabe nach der anderen – „Erledigt“ oder „Später“']
  ];
  function heuteStil() {
    let s = null;
    try { s = localStorage.getItem('schulplaner.heute.stil'); } catch (e) { }
    return HEUTE_STILE.some(function (x) { return x[0] === s; }) ? s : null;
  }
  function heuteStilSetzen(s) { try { localStorage.setItem('schulplaner.heute.stil', s); } catch (e) { } }
  let zeitTag = 0;                                  // Zeitleiste: gewählter Tag (0 = heute)
  const fokusSpaeter = [];                          // Fokus: in dieser Sitzung zurückgestellte Aufgaben
  let letzteFokusId = null;                         // neue Karte gleitet herein, dieselbe bleibt ruhig

  function heuteKopf(titel) {
    return '<div class="kopf"><div><h1>' + esc(titel) + '</h1><div class="unter">' + esc(langesDatum(heute)) + '</div></div>' +
      '<div class="kopf-rechts">' + themaKnopf() + '<button class="btn btn-primary" data-neu="heute">' + ICON_PLUS + '<span>Neue Aufgabe</span></button></div></div>';
  }
  function statusKnopf(t) {
    return '<button class="status-knopf' + (istFertig(t) ? ' fertig' : t.status === 'In Bearbeitung' ? ' arbeit' : '') + '" data-status="' + esc(t.id) + '" aria-label="' + (istFertig(t) ? 'Wieder öffnen' : 'Erledigt') + '"></button>';
  }
  function modulPunkt(t) { return '<span class="mod-punkt" style="background:' + modulFarbe(t.modul_id) + '"></span>' + esc(modulName(t.modul_id)); }
  function tageBis(iso) { return Math.round((vonISO(iso) - vonISO(heute)) / 86400000); }
  function faelligChip(t) {
    if (istFertig(t)) return '';
    if (!t.deadline) return '<span class="h-chip grau">Ohne Datum</span>';
    const n = tageBis(t.deadline);
    if (n < 0) return '<span class="h-chip rot">Überfällig</span>';
    if (n === 0) return '<span class="h-chip rot">Heute</span>';
    if (n === 1) return '<span class="h-chip blau">Morgen</span>';
    return '<span class="h-chip grau">' + (n < 7 ? WT_KURZ[(vonISO(t.deadline).getDay() + 6) % 7] : kurzesDatum(t.deadline).slice(0, 6)) + '</span>';
  }

  /* ---------- Widgets: Überblick in Zahlen ---------- */
  function htmlHeuteWidgets() {
    const alle = aufgaben(), offen = alle.filter(function (t) { return !istFertig(t); });
    const naechste = sortiere(offen.filter(function (t) { return t.deadline && t.deadline >= heute; }))[0];
    const bis = tageDazu(heute, 6);
    const woche = alle.filter(function (t) { return t.deadline && t.deadline >= heute && t.deadline <= bis; });
    const wFertig = woche.filter(istFertig).length, anteil = woche.length ? wFertig / woche.length : 0;
    const heuteL = sortiere(alle.filter(function (t) { return t.deadline === heute; }));
    const ueber = sortiere(offen.filter(function (t) { return istUeberfaellig(t, heute); }));
    const wichtig = offen.filter(function (t) { return t.prioritaet === 'Hoch' && (!t.deadline || t.deadline <= tageDazu(heute, 14)); });
    let h = '<div class="seite h-widgets">' + heuteKopf('Heute') + '<div class="w-raster">';
    if (naechste) {
      const n = tageBis(naechste.deadline);
      h += '<div class="w h-glas w-abgabe" data-karte="' + esc(naechste.id) + '"><h3>Nächste Abgabe</h3><div class="t">' + esc(titelText(naechste)) + '</div>' +
        '<div class="w-zeit">' + (n === 0 ? 'heute' : n === 1 ? 'morgen' : 'in ' + n + ' Tagen') + '</div><small>' + modulPunkt(naechste) + '</small></div>';
    } else h += '<div class="w h-glas"><h3>Nächste Abgabe</h3><div class="w-gross gruen">–</div><div class="w-klein">Keine Abgabe geplant</div></div>';
    h += '<div class="w h-glas w-mitte"><h3>Diese Woche</h3><div class="w-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(127,127,150,.22)" stroke-width="4"/>' +
      '<circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--done)" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="' + Math.round(100 - anteil * 100) + '"/></svg><b>' + Math.round(anteil * 100) + '%</b></div>' +
      '<div class="w-klein">' + (woche.length ? wFertig + ' von ' + woche.length + ' erledigt' : 'Nichts fällig') + '</div></div>';
    h += '<div class="w h-glas breit"><h3>Heute fällig</h3>' + (heuteL.length ? heuteL.slice(0, 6).map(function (t) {
      return '<div class="w-zeile' + (istFertig(t) ? ' fertig' : '') + '" data-karte="' + esc(t.id) + '">' + statusKnopf(t) + '<div><div class="h-titel">' + esc(titelText(t)) + '</div><div class="h-u">' + modulPunkt(t) + '</div></div>' + faelligChip(t) + '</div>';
    }).join('') + (heuteL.length > 6 ? '<div class="h-u">+ ' + (heuteL.length - 6) + ' weitere</div>' : '') : '<div class="leer">Heute ist nichts fällig. Gut geplant.</div>') + '</div>';
    h += '<div class="w h-glas"' + (ueber[0] ? ' data-karte="' + esc(ueber[0].id) + '"' : '') + '><h3>Überfällig</h3><div class="w-gross ' + (ueber.length ? 'rot' : 'gruen') + '">' + ueber.length + '</div><div class="w-klein">' + (ueber.length ? esc(titelText(ueber[0])) + (ueber.length > 1 ? ' und ' + (ueber.length - 1) + ' weitere' : '') : 'Alles im Plan') + '</div></div>';
    h += '<div class="w h-glas"><h3>Wichtig</h3><div class="w-gross">' + wichtig.length + '</div><div class="w-klein">Hohe Priorität in den nächsten 14 Tagen</div></div>';
    const buecher = window.Notizen && window.Notizen.zuletzt ? window.Notizen.zuletzt(3) : [];
    if (buecher.length) h += '<div class="w h-glas breit"><h3>Zuletzt geöffnet</h3><div class="w-buecher">' + buecher.map(function (b) {
      return '<button class="w-buch" data-nb-oeffnen="' + esc(b.id) + '" style="background:linear-gradient(150deg,' + farbeSicher(b.c1) + ',' + farbeSicher(b.c2) + ')"><span>' + esc(b.titel) + '</span></button>';
    }).join('') + '</div></div>';
    return h + '</div></div>';
  }

  /* ---------- Zeitleiste: nach Zeit geordnet ---------- */
  function zeitKarte(t, i) {
    return '<div class="z-karte h-glas' + (istFertig(t) ? ' fertig' : '') + '" data-karte="' + esc(t.id) + '" style="--m:' + modulFarbe(t.modul_id) + ';animation-delay:' + Math.min(i, 8) * 40 + 'ms">' +
      statusKnopf(t) + '<div class="z-text"><div class="h-titel">' + esc(titelText(t)) + '</div><div class="h-u">' + modulPunkt(t) +
      ((t.unteraufgaben || []).length ? ' · ' + t.unteraufgaben.filter(function (s) { return s.erledigt; }).length + '/' + t.unteraufgaben.length + ' Schritte' : '') + '</div></div>' + faelligChip(t) + '</div>';
  }
  function htmlHeuteZeitleiste() {
    const alle = aufgaben(), offen = alle.filter(function (t) { return !istFertig(t); });
    const tag = tageDazu(heute, zeitTag), stunde = new Date().getHours();
    const gruss = stunde < 11 ? 'Guten Morgen' : stunde < 17 ? 'Hallo' : 'Guten Abend';
    let h = '<div class="seite h-zeit">' + heuteKopf(gruss) + '<div class="z-woche h-glas">';
    for (let i = 0; i < 7; i++) {
      const d = tageDazu(heute, i), dd = vonISO(d);
      const hat = offen.some(function (t) { return t.deadline === d; });
      h += '<button class="z-tag' + (i === zeitTag ? ' aktiv' : '') + '" data-zeit-tag="' + i + '">' + WT_KURZ[(dd.getDay() + 6) % 7] + '<b>' + dd.getDate() + '</b>' + (hat ? '<i></i>' : '') + '</button>';
    }
    h += '</div>';
    const ueber = sortiere(offen.filter(function (t) { return istUeberfaellig(t, heute); }));
    const amTag = sortiere(alle.filter(function (t) { return t.deadline === tag; }));
    const danach = sortiere(offen.filter(function (t) { return t.deadline && t.deadline > tag; }));
    const ohne = sortiere(offen.filter(function (t) { return !t.deadline; }));
    const start = ueber.concat(amTag.filter(function (t) { return !istFertig(t); }))[0];
    if (zeitTag === 0 && start) h += '<div class="z-fokus h-glas" data-karte="' + esc(start.id) + '"><div class="k">Fang hiermit an</div><p>' + esc(titelText(start)) + '</p></div>';
    const gruppe = function (titel, zahl, liste, leer) {
      return '<div class="z-gruppe"><h2>' + esc(titel) + ' <span>' + zahl + '</span></h2><div class="z-liste">' +
        (liste.length ? liste.map(zeitKarte).join('') : '<div class="leer">' + leer + '</div>') + '</div></div>';
    };
    if (zeitTag === 0 && ueber.length) h += gruppe('Überfällig', ueber.length, ueber, '');
    h += gruppe(zeitTag === 0 ? 'Heute' : langesDatum(tag).replace(/ \d{4}$/, ''), amTag.filter(function (t) { return !istFertig(t); }).length + ' offen', amTag,
      zeitTag === 0 && geradeErledigt && geradeErledigt.heute ? '🎉 Alles für heute erledigt!' : 'Nichts fällig an diesem Tag.');
    if (danach.length) h += gruppe('Danach', danach.length, danach.slice(0, 12), '');
    if (ohne.length) h += gruppe('Ohne Datum', ohne.length, ohne, '');
    return h + '</div>';
  }

  /* ---------- Fokus: eine Aufgabe nach der anderen ---------- */
  function fokusReihe() {
    const offen = sortiere(aufgaben().filter(function (t) { return !istFertig(t); }));
    const rang = function (t) { return !t.deadline ? 3 : t.deadline < heute ? 0 : t.deadline === heute ? 1 : 2; };
    offen.sort(function (a, b) {
      const sa = fokusSpaeter.indexOf(a.id), sb = fokusSpaeter.indexOf(b.id);
      if ((sa >= 0) !== (sb >= 0)) return sa >= 0 ? 1 : -1;
      if (sa >= 0) return sa - sb;
      return rang(a) - rang(b);
    });
    return offen;
  }
  function htmlHeuteFokus() {
    const reihe = fokusReihe(), t = reihe[0];
    const bereich = aufgaben().filter(function (x) { return x.deadline && (x.deadline < heute ? !istFertig(x) : x.deadline === heute); });
    const fertig = bereich.filter(istFertig).length;
    let h = '<div class="seite h-fokus">' + heuteKopf('Heute');
    if (bereich.length) h += '<div class="f-fortschritt"><div class="f-balken"><i style="transform:scaleX(' + (fertig / bereich.length) + ')"></i></div>' + fertig + ' von ' + bereich.length + ' für heute</div>';
    if (!t) return h + '<div class="f-fertig h-glas"><span>🎉</span><h2>Alles erledigt!</h2><p>Keine offenen Aufgaben – genieß die freie Zeit.</p></div></div>';
    const label = !t.deadline ? 'Als Nächstes · ohne Datum' : t.deadline < heute ? 'Überfällig – zuerst das' : t.deadline === heute ? 'Als Nächstes · heute fällig' : 'Als Nächstes · ' + menschDatum(t.deadline);
    const neueKarte = t.id !== letzteFokusId; letzteFokusId = t.id;
    h += '<div class="f-karte h-glas' + (neueKarte ? ' rein' : '') + '" data-fokus="' + esc(t.id) + '"><div class="f-label">' + esc(label) + '</div>' +
      '<h2 data-karte="' + esc(t.id) + '">' + esc(titelText(t)) + '</h2><div class="f-meta"><span>' + modulPunkt(t) + '</span>' + faelligChip(t) +
      (t.prioritaet === 'Hoch' ? '<span class="h-chip rot">Hoch</span>' : '') + '</div>';
    if ((t.unteraufgaben || []).length) h += '<div class="f-unter">' + t.unteraufgaben.map(function (s, i) {
      return '<div class="sub' + (s.erledigt ? ' ok' : '') + '" data-sub-karte="' + esc(t.id) + '|' + i + '"><span class="sub-kreis"></span><span>' + esc(s.titel) + '</span></div>';
    }).join('') + '</div>';
    if (t.notizen) h += '<p class="f-notiz">' + esc(String(t.notizen).slice(0, 220)) + '</p>';
    h += '<div class="f-knoepfe"><button class="btn" data-fokus-spaeter="' + esc(t.id) + '">Später</button>' +
      '<button class="btn btn-primary" data-status="' + esc(t.id) + '">Erledigt</button></div></div>';
    if (reihe.length > 1) h += '<details class="f-danach"><summary>Danach noch ' + (reihe.length - 1) + '</summary>' + reihe.slice(1).map(function (x) {
      return '<div class="f-mini h-glas" data-karte="' + esc(x.id) + '"><span class="mod-punkt" style="background:' + modulFarbe(x.modul_id) + '"></span><span class="h-titel">' + esc(titelText(x)) + '</span>' + faelligChip(x) + '</div>';
    }).join('') + '</details>';
    return h + '</div>';
  }

  /* ---------- Auswahl beim ersten Start und in den Einstellungen ---------- */
  /* Mini-Ansicht jedes Designs mit seinen typischen Bausteinen, damit man sieht, was man bekommt */
  function stilVorschau(id) {
    const zeile = function (farbe, fertig) { return '<span class="vz"><em class="' + (fertig ? 'ok' : '') + '"></em><u></u><s style="background:' + farbe + '"></s></span>'; };
    if (id === 'widgets') return '<span class="vw-raster">' +
      '<span class="vw-kachel"><u class="kurz"></u><b class="blau">morgen</b></span>' +
      '<span class="vw-kachel vw-mitte"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="13" fill="none" stroke="rgba(127,127,150,.25)" stroke-width="5"/><circle cx="18" cy="18" r="13" fill="none" stroke="#2FB956" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="35" transform="rotate(-90 18 18)"/></svg></span>' +
      '<span class="vw-kachel vw-breit">' + zeile('#AF52DE') + zeile('#FF9500', true) + '</span>' +
      '<span class="vw-kachel"><b class="rot">1</b></span><span class="vw-kachel"><b>2</b></span></span>';
    if (id === 'zeitleiste') {
      let tage = '';
      for (let i = 0; i < 7; i++) tage += '<span class="vt-tag' + (i === 0 ? ' aktiv' : '') + '"></span>';
      return '<span class="vt-woche">' + tage + '</span><span class="vt-strahl">' +
        ['#2FB956', '#AF52DE', '#FF9500', '#2F6FEB'].map(function (f) { return '<span class="vt-karte"><i style="background:' + f + '"></i><u></u></span>'; }).join('') + '</span>';
    }
    if (id === 'fokus') return '<span class="vf-balken"><i></i></span><span class="vf-karte"><u class="kurz"></u><u class="dick"></u><u class="dick halb"></u>' +
      '<span class="vf-knoepfe"><i></i><i class="blau"></i></span></span><span class="vf-danach"><u></u></span>';
    return '<span class="vk-stats"><b class="blau">3</b><b class="rot">1</b><b>5</b><b class="gruen">2</b></span>' + zeile('#2F6FEB') + zeile('#FF9500') + zeile('#AF52DE', true);
  }
  /* Aussehen der Mini-Ansichten liegt bewusst hier in app.js: so passen Bausteine und Stil immer zusammen,
     auch wenn das Gerät noch eine ältere index.html zwischengespeichert hat */
  function stilVorschauStil() {
    if (document.getElementById('stilVorschauCss')) return;
    const st = document.createElement('style');
    st.id = 'stilVorschauCss';
    st.textContent = `.stil-bild{width:100%;height:104px;border-radius:12px;background:linear-gradient(140deg,rgba(122,167,255,.5),rgba(255,158,196,.5));padding:7px;display:flex;flex-direction:column;gap:4px;overflow:hidden;font-style:normal;text-decoration:none}
.stil-bild *{font-style:normal;text-decoration:none}
.stil-bild u{display:block;height:5px;border-radius:3px;background:rgba(60,60,80,.28);flex:1}
.stil-bild u.kurz{flex:0 0 auto;width:55%}
.stil-bild b{font-weight:800;line-height:1;color:#1D1D1F}
.stil-bild .blau{color:#0A7AFF} .stil-bild .rot{color:#FF3B30} .stil-bild .gruen{color:#2FB956}
/* Listenzeile mit Haken, Text und Modulfarbe */
.vz{display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.88);border-radius:6px;padding:4px 6px;flex:1;min-height:0}
.vz em{width:8px;height:8px;border-radius:50%;border:1.5px solid #A9A9B3;flex:0 0 8px}
.vz em.ok{background:#2FB956;border-color:#2FB956}
.vz s{width:6px;height:6px;border-radius:50%;flex:0 0 6px}
/* Klassisch: vier Kennzahlen, darunter Listen */
.vk-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;flex:0 0 26px}
.vk-stats b{display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.88);border-radius:6px;font-size:13px}
/* Widgets: Kacheln mit Ring, großer Zahl und Liste */
.vw-raster{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1.15fr 1fr .8fr;gap:4px;height:100%}
.vw-kachel{background:rgba(255,255,255,.88);border-radius:7px;padding:4px 6px;display:flex;flex-direction:column;justify-content:center;gap:3px;min-height:0;overflow:hidden}
.vw-kachel b{font-size:14px}
.vw-kachel b.blau{font-size:11.5px;letter-spacing:-.2px}
.vw-mitte{align-items:center} .vw-mitte svg{height:100%;max-height:30px}
.vw-breit{grid-column:span 2;grid-row:3;flex-direction:row;padding:3px;gap:3px}
.vw-breit .vz{padding:2px 5px;background:transparent}
.vw-raster > .vw-kachel:nth-child(4){grid-row:2;grid-column:1} .vw-raster > .vw-kachel:nth-child(5){grid-row:2;grid-column:2}
/* Zeitleiste: Wochenstreifen und Zeitstrahl mit Modulfarben */
.vt-woche{display:flex;gap:3px;background:rgba(255,255,255,.88);border-radius:7px;padding:3px;flex:0 0 18px}
.vt-tag{flex:1;border-radius:4px;background:rgba(60,60,80,.12)}
.vt-tag.aktiv{background:#0A7AFF}
.vt-strahl{position:relative;flex:1;display:flex;flex-direction:column;gap:3px;padding-left:12px}
.vt-strahl::before{content:"";position:absolute;left:4px;top:3px;bottom:3px;width:2px;background:rgba(60,60,80,.25);border-radius:2px}
.vt-karte{position:relative;flex:1;display:flex;align-items:center;background:rgba(255,255,255,.88);border-radius:6px;padding:0 6px}
.vt-karte i{position:absolute;left:-11px;width:6px;height:6px;border-radius:50%}
/* Fokus: Fortschrittsbalken, eine große Karte mit Knöpfen */
.vf-balken{flex:0 0 5px;border-radius:3px;background:rgba(60,60,80,.15);overflow:hidden}
.vf-balken i{display:block;width:40%;height:100%;background:linear-gradient(90deg,#2FB956,#22B8E8)}
.vf-karte{flex:1;background:rgba(255,255,255,.92);border-radius:9px;padding:6px 7px;display:flex;flex-direction:column;gap:4px;box-shadow:0 3px 8px rgba(0,0,0,.1)}
.vf-karte u{flex:0 0 5px}
.vf-karte u.dick{flex:0 0 8px;background:rgba(30,30,40,.6)} .vf-karte u.halb{width:60%}
.vf-knoepfe{display:flex;gap:4px;margin-top:auto}
.vf-knoepfe i{flex:1;height:11px;border-radius:6px;background:rgba(60,60,80,.15)}
.vf-knoepfe i.blau{background:#0A7AFF}
.vf-danach{flex:0 0 8px;display:flex;align-items:center}
.vf-danach u{flex:0 0 40%;opacity:.7}
`;
    document.head.appendChild(st);
  }
  function stilWahlHTML(aktuell) {
    stilVorschauStil();
    return '<div class="stil-wahl">' + HEUTE_STILE.map(function (s) {
      return '<button class="stil-option' + (s[0] === aktuell ? ' aktiv' : '') + '" data-heute-stil="' + s[0] + '"><span class="stil-bild stil-' + s[0] + '">' + stilVorschau(s[0]) + '</span>' +
        '<b>' + esc(s[1]) + '</b><small>' + esc(s[2]) + '</small></button>';
    }).join('') + '</div>';
  }
  function designWahlZeigen() {
    let dlg = document.getElementById('dlgStil');
    if (!dlg) {
      neuDlgStil();
      dlg = document.createElement('dialog');
      dlg.id = 'dlgStil'; dlg.className = 'neu-dlg stil-dlg';
      document.body.appendChild(dlg);
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); });   // erst wählen
    }
    dlg.innerHTML = '<div class="dlg-koerper"><h2>Wie soll deine Heute-Seite aussehen?</h2>' +
      '<div class="neu-unter">Du kannst das später jederzeit in den Einstellungen ändern.</div>' + stilWahlHTML(heuteStil() || 'klassisch') + '</div>';
    if (!dlg.open) dlg.showModal();
  }
  function designWahlPruefen() {
    if (tour || heuteStil() || document.querySelector('dialog[open]') || (window.Notizen && window.Notizen.offen())) return;
    designWahlZeigen();
  }

  function htmlHeute() {
    const stil = heuteStil();
    if (stil === 'widgets') return htmlHeuteWidgets();
    if (stil === 'zeitleiste') return htmlHeuteZeitleiste();
    if (stil === 'fokus') return htmlHeuteFokus();
    const offen = aufgaben().filter(function (t) { return !istFertig(t); });
    const ueber = sortiere(offen.filter(function (t) { return istUeberfaellig(t, heute); }));
    const heuteListe = sortiere(offen.filter(function (t) { return t.deadline === heute; }));
    const inArbeit = sortiere(offen.filter(function (t) {
      return t.status === 'In Bearbeitung' && t.deadline !== heute && !istUeberfaellig(t, heute);
    }));
    const grenze = tageDazu(heute, 7);
    const bald = sortiere(offen.filter(function (t) { return t.deadline && t.deadline > heute && t.deadline <= grenze; }));
    const ohne = sortiere(offen.filter(function (t) { return !t.deadline && t.status !== 'In Bearbeitung'; }));
    const fertigHeute = aufgaben().filter(function (t) { return istFertig(t) && t.deadline === heute; });

    let h = '<div class="seite"><div class="kopf"><div><h1>Heute</h1>' +
      '<div class="unter">' + esc(langesDatum(heute)) + '</div></div>' +
      '<div class="kopf-rechts">' + themaKnopf() + '<button class="btn btn-primary" data-neu="heute">' + ICON_PLUS + '<span>Neue Aufgabe</span></button></div></div>';
    h += '<div class="stats">' +
      '<div class="stat blau"><b>' + heuteListe.length + '</b><span>Heute fällig</span></div>' +
      '<div class="stat rot"><b>' + ueber.length + '</b><span>Überfällig</span></div>' +
      '<div class="stat"><b>' + bald.length + '</b><span>Nächste 7 Tage</span></div>' +
      '<div class="stat gruen"><b>' + fertigHeute.length + '</b><span>Heute erledigt</span></div></div>';

    if (ueber.length) h += abschnitt('Überfällig', ueber.length, 'rot') + listeHTML(ueber);
    h += abschnitt('Heute fällig', heuteListe.length, 'blau');
    // eben die letzte Aufgabe von heute abgehakt: kleiner Moment der Freude (selten -> darf sein)
    const allesGeschafft = !heuteListe.length && geradeErledigt && geradeErledigt.heute;
    h += heuteListe.length ? listeHTML(heuteListe, { datum: false })
      : allesGeschafft ? '<div class="leer geschafft"><span>🎉</span>Alles für heute erledigt!</div>'
      : '<div class="leer">Heute ist nichts fällig. Gut geplant.</div>';
    if (inArbeit.length) h += abschnitt('In Bearbeitung', inArbeit.length) + listeHTML(inArbeit);
    if (bald.length) h += abschnitt('Nächste 7 Tage', bald.length) + listeHTML(bald);
    if (ohne.length) h += abschnitt('Ohne Deadline', ohne.length) + listeHTML(ohne, { datum: false });
    if (fertigHeute.length) h += abschnitt('Heute erledigt', fertigHeute.length, 'gruen') + listeHTML(fertigHeute, { datum: false });
    return h + '</div>';
  }

  function wochenFuerMonat(jahr, monat) {
    const erster = new Date(jahr, monat, 1);
    const versatz = (erster.getDay() + 6) % 7;
    const tage = new Date(jahr, monat + 1, 0).getDate();
    const wochen = Math.ceil((versatz + tage) / 7);
    const liste = [];
    for (let w = 0; w < wochen; w++) {
      const zeile = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(jahr, monat, 1 - versatz + w * 7 + i);
        zeile.push(d);
      }
      liste.push(zeile);
    }
    return liste;
  }

  function htmlKalender() {
    const jahr = kalDatum.getFullYear(), monat = kalDatum.getMonth();
    let h = '<div class="seite"><div class="kopf"><div><h1>Kalender</h1>' +
      '<div class="unter">Überblick über alle Deadlines</div></div>' +
      '<div class="kopf-rechts">' + themaKnopf() + '<button class="btn btn-primary" data-neu="gewaehlt">' + ICON_PLUS + '<span>Neue Aufgabe</span></button></div></div>';
    h += '<div class="kal-leiste"><button class="pfeil" data-monat="-1">‹</button>' +
      '<h2>' + MONATE[monat] + ' ' + jahr + '</h2>' +
      '<button class="pfeil" data-monat="1">›</button>' +
      '<button class="btn btn-klein" data-monat="0">Heute</button></div>';

    h += '<div class="kal">' + WT_KURZ.map(function (w) { return '<div class="wt">' + w + '</div>'; }).join('');
    wochenFuerMonat(jahr, monat).forEach(function (woche) {
      woche.forEach(function (d) {
        const iso = datumISO(d);
        const liste = sortiere(aufgabenAn(iso));
        const klassen = ['tag'];
        if (d.getMonth() !== monat) klassen.push('fremd');
        if (iso === heute) klassen.push('heute');
        if (iso === kalGewaehlt) klassen.push('gewaehlt');
        h += '<button class="' + klassen.join(' ') + '" data-tag="' + iso + '">' +
          '<span class="nr">' + d.getDate() + '</span>' +
          (liste.length ? '<span class="anz">' + liste.length + '</span>' : '') +
          liste.slice(0, 3).map(function (t) {
            const farbe = istFertig(t) ? '#3E9C5C' : (istUeberfaellig(t, heute) ? '#D93A3F' : modulFarbe(t.modul_id));
            return '<span class="eintrag' + (istFertig(t) ? ' ok' : '') + '" title="' + esc(titelText(t)) + '">' +
              '<span class="mod-punkt" style="background:' + farbe + '"></span>' +
              '<span class="txt">' + esc(titelText(t)) + '</span></span>';
          }).join('') +
          (liste.length > 3 ? '<span class="mehr">+' + (liste.length - 3) + ' weitere</span>' : '') +
          '</button>';
      });
    });
    h += '</div>';

    const liste = sortiere(aufgabenAn(kalGewaehlt));
    h += '<div class="tagespanel"><div class="wt">' + WOCHENTAGE[(vonISO(kalGewaehlt).getDay() + 6) % 7] + '</div>' +
      '<h3>' + vonISO(kalGewaehlt).getDate() + '. ' + MONATE[vonISO(kalGewaehlt).getMonth()] + ' ' + vonISO(kalGewaehlt).getFullYear() + '</h3>' +
      '<button class="btn btn-klein" style="margin:10px 0" data-neu="gewaehlt">' + ICON_PLUS + '<span>Aufgabe für diesen Tag</span></button>' +
      (liste.length ? listeHTML(liste, { datum: false }) : '<div class="leer">Keine Aufgaben an diesem Tag.</div>') +
      '</div>';
    return h + '</div>';
  }

  function htmlModule() {
    let h = '<div class="seite"><div class="kopf"><div><h1>Module</h1>' +
      '<div class="unter">Wähle ein Fach, um die Aufgaben zu sehen</div></div>' +
      '<div class="kopf-rechts">' + themaKnopf() + '<button class="btn btn-primary" data-modul-neu="1">' + ICON_PLUS + '<span>Neues Modul</span></button></div></div>';
    h += '<div class="modul-gitter">';
    module().forEach(function (m) {
      const liste = aufgaben().filter(function (t) { return t.modul_id === m.id; });
      const offen = liste.filter(function (t) { return !istFertig(t); });
      const fertig = liste.filter(istFertig);
      const ueber = offen.filter(function (t) { return istUeberfaellig(t, heute); });
      const anteil = liste.length ? Math.round(fertig.length / liste.length * 100) : 0;
      h += '<button class="modul-karte" data-modul="' + esc(m.id) + '">' +
        '<div class="strich" style="background:' + farbeSicher(m.farbe) + '"></div><div class="inhalt">' +
        '<h3>' + esc(m.name) + '</h3>' +
        '<p>' + offen.length + ' offen · ' + fertig.length + ' erledigt</p>' +
        (ueber.length ? '<p class="warn">' + ueber.length + ' überfällig</p>' : '') +
        '<div class="balken" style="margin-left:0"><i style="width:' + anteil + '%;background:' + farbeSicher(m.farbe) + '"></i></div>' +
        '</div></button>';
    });
    const ohne = aufgaben().filter(function (t) { return !modulVon(t.modul_id); });
    if (ohne.length) {
      h += '<button class="modul-karte" data-modul="__ohne__">' +
        '<div class="strich" style="background:#9A9AA2"></div><div class="inhalt">' +
        '<h3>Ohne Modul</h3><p>' + ohne.length + (ohne.length === 1 ? ' Aufgabe' : ' Aufgaben') + '</p></div></button>';
    }
    return h + '</div></div>';
  }

  function htmlModulDetail() {
    const ohneModul = modulOffen === '__ohne__';
    const m = ohneModul ? null : modulVon(modulOffen);
    if (!ohneModul && !m) { modulOffen = null; return htmlModule(); }
    const name = ohneModul ? 'Ohne Modul' : m.name;
    const farbe = ohneModul ? '#9A9AA2' : farbeSicher(m.farbe);
    const liste = aufgaben().filter(function (t) {
      return ohneModul ? !modulVon(t.modul_id) : t.modul_id === modulOffen;
    });
    const offen = liste.filter(function (t) { return !istFertig(t); });
    const fertig = sortiere(liste.filter(istFertig));
    const ueber = sortiere(offen.filter(function (t) { return istUeberfaellig(t, heute); }));
    const rest = sortiere(offen.filter(function (t) { return !istUeberfaellig(t, heute); }));

    let h = '<div class="seite"><button class="zurueck" data-zurueck="1">‹ Zurück zu den Modulen</button>' +
      '<div class="kopf"><div><h1><span class="mod-punkt" style="width:12px;height:12px;background:' + farbe + '"></span> ' + esc(name) + '</h1>' +
      '<div class="unter">' + offen.length + ' offen · ' + fertig.length + ' erledigt</div></div><div class="kopf-rechts">' + themaKnopf() +
      (ohneModul ? '' : '<button class="btn" data-modul-bearbeiten="' + esc(m.id) + '">Bearbeiten</button>') +
      '<button class="btn btn-primary" data-neu="modul">' + ICON_PLUS + '<span>Neue Aufgabe</span></button></div></div>';
    if (window.Notizen) h += '<div data-nb-modul="' + (ohneModul ? '__ohne__' : esc(m.id)) + '"></div>';
    if (ueber.length) h += abschnitt('Überfällig', ueber.length, 'rot') + listeHTML(ueber, { modul: false });
    h += abschnitt('Offene Aufgaben', rest.length);
    h += rest.length ? listeHTML(rest, { modul: false }) : '<div class="leer">Keine offenen Aufgaben in diesem Modul.</div>';
    if (fertig.length) h += abschnitt('Abgeschlossen', fertig.length, 'gruen') + listeHTML(fertig, { modul: false });
    return h + '</div>';
  }

  function htmlAlle() {
    let liste = aufgaben().filter(function (t) {
      const q = filter.suche.trim().toLowerCase();
      if (q) {
        const text = (t.titel + ' ' + (t.notizen || '') + ' ' +
          (t.unteraufgaben || []).map(function (s) { return s.titel; }).join(' ')).toLowerCase();
        if (text.indexOf(q) < 0) return false;
      }
      if (filter.modul === '__ohne__' && modulVon(t.modul_id)) return false;
      if (filter.modul && filter.modul !== '__ohne__' && t.modul_id !== filter.modul) return false;
      if (filter.status && t.status !== filter.status) return false;
      if (filter.prio && t.prioritaet !== filter.prio) return false;
      return true;
    });
    liste = sortiere(liste);
    let h = '<div class="seite"><div class="kopf"><div><h1>Alle Aufgaben</h1>' +
      '<div class="unter">Suchen, filtern und sortieren</div></div>' +
      '<div class="kopf-rechts">' + themaKnopf() + '<button class="btn" data-moodle-start="1" title="Aufgaben aus elearning übernehmen">🎓<span>Moodle</span></button><button class="btn btn-primary" data-neu="leer">' + ICON_PLUS + '<span>Neue Aufgabe</span></button></div></div>';
    h += '<div class="filter">' +
      '<input id="suchfeld" type="search" placeholder="Suche in Titel, Notizen, Unteraufgaben">' +
      '<select id="fltModul"><option value="">Alle Module</option>' +
      module().map(function (m) {
        return '<option value="' + esc(m.id) + '"' + (filter.modul === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>';
      }).join('') +
      '<option value="__ohne__"' + (filter.modul === '__ohne__' ? ' selected' : '') + '>Ohne Modul</option></select>' +
      '<select id="fltStatus"><option value="">Alle Stati</option>' +
      STATI.map(function (s) { return '<option' + (filter.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<select id="fltPrio"><option value="">Alle Prioritäten</option>' +
      PRIOS.map(function (p) { return '<option' + (filter.prio === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select>' +
      '<button class="btn btn-klein" data-filter-reset="1">Zurücksetzen</button></div>';
    h += '<div class="leer">' + liste.length + (liste.length === 1 ? ' Aufgabe' : ' Aufgaben') + ' gefunden</div>';
    h += liste.length ? listeHTML(liste) : '';
    return h + '</div>';
  }

  function htmlEinstellungen() {
    const anzahl = aufgaben().length;
    let h = '<div class="seite"><div class="kopf"><div><h1>Einstellungen</h1>' +
      '<div class="unter">Synchronisation und Daten</div></div>' +
      '<div class="kopf-rechts">' + themaKnopf() + '</div></div>';

    h += '<div class="box"><h3>Synchronisation</h3>' +
      '<p>Trage auf <b>jedem</b> Gerät dieselben drei Angaben ein. Danach gleichen sich iPad und PC automatisch ab.</p>' +
      '<div class="feld"><label for="cfgUrl">Projekt-URL (Supabase)</label>' +
      '<input id="cfgUrl" type="url" placeholder="https://xxxxx.supabase.co" value="' + esc(cfg.url) + '"></div>' +
      '<div class="feld"><label for="cfgKey">Anon-Key (öffentlicher Schlüssel)</label>' +
      '<input id="cfgKey" type="text" placeholder="eyJhbGciOi..." value="' + esc(cfg.key) + '"></div>' +
      '<div class="feld"><label for="cfgCode">Persönlicher Sync-Code (mindestens 12 Zeichen)</label>' +
      '<input id="cfgCode" class="code" type="text" value="' + esc(cfg.code) + '"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-primary" data-cfg-speichern="1">Speichern &amp; verbinden</button>' +
      '<button class="btn" data-code-neu="1">Neuen Code erzeugen</button>' +
      '<button class="btn" data-sync-jetzt="1">Jetzt synchronisieren</button></div>' +
      '<div class="hinweis ok" id="syncStatusSeite" style="margin-top:12px"></div></div>';

    const wahl = themaWahl();
    h += '<div class="box"><h3>Farbwelt</h3><p>Die Farben der ganzen App. „Nacht“ und „Limette“ sind immer dunkel, die anderen folgen Hell/Dunkel.</p>' + farbweltWahlHTML() + '</div>';

    h += '<div class="box"><h3>Erscheinungsbild</h3>' +
      '<p>„Automatisch" folgt dem Hell- oder Dunkelmodus deines Geräts.</p><div class="thema-wahl">' +
      [['auto', 'Automatisch'], ['hell', 'Hell'], ['dunkel', 'Dunkel']].map(function (o) {
        return '<button class="btn' + (wahl === o[0] ? ' aktiv' : '') + '" data-thema-wahl="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div></div>';

    h += '<div class="box"><h3>Position der Navigationsleiste</h3>' +
      '<p>„Standard“ ist die bisherige Leiste: links am großen Bildschirm, unten als Kapsel am Handy.</p><div class="thema-wahl">' +
      LEISTEN.map(function (o) {
        return '<button class="btn' + (leistenPos() === o[0] ? ' aktiv' : '') + '" data-leiste-wahl="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div></div>';

    h += '<div class="box"><h3>Daten</h3><p>Aktuell ' + anzahl + (anzahl === 1 ? ' Aufgabe' : ' Aufgaben') +
      ' und ' + module().length + ' Module auf diesem Gerät.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn" data-export="1">Als Datei sichern</button>' +
      '<button class="btn" data-import="1">Datei einlesen (auch daten.json)</button></div>' +
      '<input type="file" id="importDatei" accept=".json,application/json" style="display:none"></div>';

    if (window.Notizen) h += '<div data-nb-einstellungen="1"></div>';
    if (window.Assistent) h += '<div data-ki-einstellungen="1"></div>';

    const mc = moodleCfg();
    h += '<div class="box"><h3>Moodle-Abgleich</h3><p>Übernimmt Abgaben und Tests aus dem elearning-Kalender – ohne Passwort, nichts wird doppelt eingetragen. In Moodle wird nichts gestartet oder abgegeben.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" data-moodle-start="1">' + (mc.url ? 'Jetzt abgleichen' : 'Moodle verbinden') + '</button>' +
      (mc.url ? '<button class="btn" data-moodle-trennen="1">Link entfernen</button>' : '') + '</div>' +
      '<div class="hinweis ok" style="margin-top:12px">' + (mc.url ? 'Kalender-Link gespeichert' + (mc.zuletzt ? ' · zuletzt abgeglichen ' + esc(menschDatum(mc.zuletzt.slice(0, 10))) : '') : 'Noch nicht verbunden') + '</div></div>';

    h += '<div class="box"><h3>Heute-Ansicht</h3><p>Wähle, wie deine Heute-Seite aussieht.</p>' + stilWahlHTML(heuteStil() || 'klassisch') + '</div>';

    h += '<div class="box"><h3>Bedienungshilfe</h3><p>Die Tour zeigt dir SchulPlaner in rund 30 Sekunden – mit Beispielen, an deinen Aufgaben und Notizen ändert sich nichts.</p>' +
      '<button class="btn" data-tour-start="1">Tour erneut ansehen</button></div>';

    h += '<div class="box"><h3>Version</h3><p>SchulPlaner Version ' + VERSION + '.</p>' +
      '<button class="btn" data-neuigkeiten="1">Was ist neu?</button></div>';

    h += '<div class="box"><h3>Hinweis</h3><p>Alles wird sofort auf dem Gerät gespeichert und funktioniert auch ohne Internet. ' +
      'Sobald wieder Verbindung besteht, wird automatisch abgeglichen. Wird dieselbe Aufgabe auf beiden Geräten geändert, ' +
      'gewinnt die zuletzt gespeicherte Version.</p></div>';
    return h + '</div>';
  }

  /* ---------- Navigation ---------- */
  /* Ein Icon pro Tab (24er-Raster, 1,8er Strich, runde Enden) – gilt für alle Leisten-Positionen */
  const NAV = [
    { id: 'heute', text: 'Tagesansicht', kurz: 'Heute', icon: 'M8 12a4 4 0 108 0 4 4 0 10-8 0 M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4' },
    { id: 'kalender', text: 'Kalenderansicht', kurz: 'Kalender', icon: 'M5.5 5h13A2.5 2.5 0 0121 7.5v11a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 18.5v-11A2.5 2.5 0 015.5 5z M3 10h18 M8 3v4 M16 3v4 M7.5 14h1 M11.5 14h1 M15.5 14h1 M7.5 17.5h1 M11.5 17.5h1' },
    { id: 'module', text: 'Modulansicht', kurz: 'Module', icon: 'M6 4h3a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z M15 4h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2V6a2 2 0 012-2z M6 13h3a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3a2 2 0 012-2z M15 13h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2v-3a2 2 0 012-2z' },
    { id: 'alle', text: 'Alle Aufgaben', kurz: 'Alle', icon: 'M3.5 6.5l1.5 1.5 3-3 M3.5 12.5l1.5 1.5 3-3 M3.5 18.5l1.5 1.5 3-3 M11 6.5h9.5 M11 12.5h9.5 M11 18.5h9.5' },
    { id: 'notizen', text: 'Notizbücher', kurz: 'Notizen', icon: 'M7 3h10.5A1.5 1.5 0 0119 4.5v15a1.5 1.5 0 01-1.5 1.5H7a2 2 0 01-2-2V5a2 2 0 012-2z M9 3v18 M12.5 8h3.5 M12.5 11.5h3.5' },
    { id: 'einstellungen', text: 'Einstellungen', kurz: 'Sync', icon: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M13 7a2 2 0 104 0 2 2 0 10-4 0 M7 17a2 2 0 104 0 2 2 0 10-4 0' }
  ];
  /* Glas-Linse unter dem aktiven Tab: gleitet beim Wechsel wie ein Tropfen zum neuen Tab (wie bei iOS) */
  function zeichneNav() {
    const nav = $('#nav'), alt = nav.querySelector('.nav-linse');
    const vorher = alt && alt.offsetWidth ? { x: alt.offsetLeft, y: alt.offsetTop, b: alt.offsetWidth, h: alt.offsetHeight } : null;
    nav.innerHTML = NAV.map(function (n) {
      const svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        n.icon.split(' M').map(function (p, i) { return '<path d="' + (i ? 'M' + p : p) + '"/>'; }).join('') + '</svg>';
      return '<button class="nav-item' + (ansicht === n.id ? ' aktiv' : '') + '" data-ansicht="' + n.id + '" aria-label="' + n.text + '"' + (ansicht === n.id ? ' aria-current="page"' : '') + '>' +
        svg + '<span class="lang">' + n.text + '</span><span class="kurz">' + n.kurz + '</span></button>';
    }).join('') + '<span class="nav-linse" aria-hidden="true"></span>';
    nav.classList.add('mit-linse');
    linseSetzen(vorher);
  }
  function linseSetzen(vorher, ziel) {
    const nav = $('#nav'), l = nav.querySelector('.nav-linse');
    const a = ziel || nav.querySelector('.nav-item.aktiv');
    if (!l) return;
    if (!a || !a.offsetWidth) { l.style.opacity = '0'; return; }
    l.style.opacity = '';
    l.style.left = a.offsetLeft + 'px'; l.style.top = a.offsetTop + 'px';
    l.style.width = a.offsetWidth + 'px'; l.style.height = a.offsetHeight + 'px';
    if (!vorher || !l.animate || (vorher.x === a.offsetLeft && vorher.y === a.offsetTop)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // vom alten Platz aus starten (FLIP) und unterwegs in Bewegungsrichtung leicht dehnen
    const dx = vorher.x + vorher.b / 2 - (a.offsetLeft + a.offsetWidth / 2), dy = vorher.y + vorher.h / 2 - (a.offsetTop + a.offsetHeight / 2);
    const sx = vorher.b / a.offsetWidth, sy = vorher.h / a.offsetHeight, quer = Math.abs(dx) >= Math.abs(dy);
    const dehnen = quer ? 'scale(1.22,.9)' : 'scale(.96,1.18)';
    l.animate([
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')' },
      { transform: 'translate(' + dx * 0.4 + 'px,' + dy * 0.4 + 'px) ' + dehnen, offset: 0.45 },
      { transform: 'none' }
    ], { duration: 420, easing: 'cubic-bezier(.32,.72,0,1)' });
  }
  /* Am Handy mit dem Finger über die Leiste streichen: die Linse folgt, beim Loslassen wird der Tab gewählt */
  function navWischenEinrichten() {
    const nav = $('#nav');
    let z = null;
    const itemBei = function (x) {
      let best = null;
      nav.querySelectorAll('.nav-item').forEach(function (b) { const r = b.getBoundingClientRect(); if (x >= r.left && x <= r.right) best = b; });
      return best;
    };
    nav.addEventListener('pointerdown', function (e) {
      const pos = leistenPos();
      if (e.pointerType === 'mouse' || z || pos === 'rechts' || (pos === 'standard' && !window.matchMedia('(max-width:880px)').matches)) return;
      z = { id: e.pointerId, x0: e.clientX, los: false };
    });
    nav.addEventListener('pointermove', function (e) {
      if (!z || e.pointerId !== z.id) return;
      if (!z.los && Math.abs(e.clientX - z.x0) < 10) return;            // erst ab 10 px gilt es als Wischen
      if (!z.los) { z.los = true; try { nav.setPointerCapture(e.pointerId); } catch (x) { } nav.classList.add('wischt'); }
      const b = itemBei(e.clientX);
      if (b && b !== z.ziel) { z.ziel = b; linseSetzen(null, b); }
    });
    const ende = function (e) {
      if (!z || e.pointerId !== z.id) return;
      const ziel = z.los ? z.ziel : null;
      z = null; nav.classList.remove('wischt');
      if (ziel) { e.preventDefault(); zeige(ziel.getAttribute('data-ansicht')); }
    };
    nav.addEventListener('pointerup', ende);
    nav.addEventListener('pointercancel', function (e) { if (z && e.pointerId === z.id) { z = null; nav.classList.remove('wischt'); linseSetzen(null); } });
    window.addEventListener('resize', function () { linseSetzen(null); });
  }
  function zeichneSeitenModule() {
    const ziel = $('#seitenModule');
    if (!ziel) return;
    ziel.innerHTML = module().map(function (m) {
      return '<button class="seiten-modul" data-seite-modul="' + esc(m.id) + '">' +
        '<span class="mod-punkt" style="background:' + farbeSicher(m.farbe) + '"></span>' + esc(m.name) + '</button>';
    }).join('');
  }
  function zaehlerAktualisieren() {
    const offen = aufgaben().filter(function (t) { return !istFertig(t); });
    const heuteAnz = offen.filter(function (t) { return t.deadline === heute; }).length;
    const ueber = offen.filter(function (t) { return istUeberfaellig(t, heute); }).length;
    $('#zaehler').textContent = offen.length + (offen.length === 1 ? ' Aufgabe offen' : ' Aufgaben offen') +
      ' · ' + heuteAnz + ' heute · ' + ueber + ' überfällig';
  }
  function zeige(neu) {
    ansicht = neu;
    if (neu !== 'module') modulOffen = null;
    render();
    $('#content').scrollTop = 0;
    document.documentElement.classList.remove('leiste-klein');
  }

  /* ---------- Aufgaben-Dialog ---------- */
  function fuelleAuswahl(el, werte, gewaehlt, leerText) {
    el.innerHTML = (leerText ? '<option value="">' + leerText + '</option>' : '') +
      werte.map(function (w) {
        const wert = w.id !== undefined ? w.id : w;
        const text = w.name !== undefined ? w.name : w;
        return '<option value="' + esc(wert) + '"' + (String(wert) === String(gewaehlt) ? ' selected' : '') + '>' + esc(text) + '</option>';
      }).join('');
  }
  function oeffneAufgabe(id, vorgabe) {
    vorgabe = vorgabe || {};
    const t = id ? aufgabeVon(id) : null;
    dlgState = {
      id: t ? t.id : null,
      subs: t ? (t.unteraufgaben || []).map(function (s) { return Object.assign({}, s); }) : []
    };
    $('#fTitel').value = t ? t.titel : '';
    fuelleAuswahl($('#fModul'), module(), t ? t.modul_id : (vorgabe.modul || ''), 'Ohne Modul');
    fuelleAuswahl($('#fPrio'), PRIOS, t ? t.prioritaet : 'Mittel');
    fuelleAuswahl($('#fStatus'), STATI, t ? t.status : STATI[0]);
    $('#fDatum').value = t ? (t.deadline || '') : (vorgabe.datum || '');
    $('#fNotiz').value = t ? (t.notizen || '') : '';
    $('#fLoeschen').style.display = t ? '' : 'none';
    zeichneUnteraufgaben();
    auswahlAufbereiten($('#dlgAufgabe'));
    $('#dlgAufgabe').showModal();
    if (!t) setTimeout(function () { $('#fTitel').focus(); }, 50);
  }
  function zeichneUnteraufgaben() {
    const box = $('#fUnter');
    if (!dlgState.subs.length) { box.innerHTML = '<div class="leer" style="padding:4px">Noch keine Unteraufgaben.</div>'; return; }
    box.innerHTML = dlgState.subs.map(function (s, i) {
      return '<div class="unter-zeile' + (s.erledigt ? ' ok' : '') + '">' +
        '<input type="checkbox" data-sub="' + i + '"' + (s.erledigt ? ' checked' : '') + '>' +
        '<span>' + esc(s.titel) + '</span>' +
        '<button data-sub-weg="' + i + '" aria-label="Entfernen">×</button></div>';
    }).join('');
  }
  function unteraufgabeHinzu() {
    const feld = $('#fUnterNeu');
    const titel = feld.value.trim();
    if (!titel) return;
    dlgState.subs.push({ id: uid(), titel: titel, erledigt: false });
    feld.value = '';
    zeichneUnteraufgaben();
    feld.focus();
  }
  function aufgabeSpeichern() {
    const titel = $('#fTitel').value.trim();
    if (!titel) { alert('Bitte gib der Aufgabe einen Titel.'); $('#fTitel').focus(); return; }
    speichereAufgabe({
      id: dlgState.id || uid(),
      titel: titel,
      modul_id: $('#fModul').value || null,
      prioritaet: $('#fPrio').value,
      status: $('#fStatus').value,
      deadline: $('#fDatum').value || null,
      notizen: $('#fNotiz').value.trim(),
      unteraufgaben: dlgState.subs
    });
    $('#dlgAufgabe').close();
  }

  /* ---------- Modul-Dialog ---------- */
  function oeffneModul(id) {
    const m = id ? modulVon(id) : null;
    modulState = { id: m ? m.id : null, farbe: m ? m.farbe : MODUL_FARBEN[0] };
    $('#mName').value = m ? m.name : '';
    $('#mLoeschen').style.display = m ? '' : 'none';
    zeichneFarben();
    $('#dlgModul').showModal();
  }
  function zeichneFarben() {
    $('#mFarben').innerHTML = MODUL_FARBEN.map(function (f) {
      return '<button data-farbe="' + f + '" style="width:34px;height:34px;border-radius:8px;background:' + f +
        ';border:3px solid ' + (f === modulState.farbe ? '#1E1F24' : '#E2E2E6') + '"></button>';
    }).join('');
  }
  function modulSpeichern() {
    const name = $('#mName').value.trim();
    if (!name) { alert('Bitte gib dem Modul einen Namen.'); return; }
    if (modulState.id) {
      const m = modulVon(modulState.id);
      m.name = name; m.farbe = modulState.farbe; m.geaendert = jetztISO();
    } else {
      daten.module.push({ id: uid(), name: name, farbe: modulState.farbe, geaendert: jetztISO(), geloescht: false });
    }
    $('#dlgModul').close();
    geaendert();
  }
  function modulLoeschen() {
    const m = modulVon(modulState.id);
    if (!m) return;
    const anzahl = aufgaben().filter(function (t) { return t.modul_id === m.id; }).length;
    const text = 'Modul „' + m.name + '" löschen?' +
      (anzahl ? '\n\n' + anzahl + ' Aufgabe(n) bleiben erhalten und stehen danach unter „Ohne Modul".' : '');
    if (!confirm(text)) return;
    m.geloescht = true; m.geaendert = jetztISO();
    $('#dlgModul').close();
    modulOffen = null;
    geaendert();
  }

  /* ---------- Import / Export ---------- */
  function exportiere() {
    const blob = new Blob([JSON.stringify({ module: daten.module, aufgaben: daten.aufgaben }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'schulplaner-' + heute + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function importiere(datei) {
    const leser = new FileReader();
    leser.onload = function () {
      try {
        const objekt = JSON.parse(String(leser.result));
        const neu = importAltdaten(objekt);
        if (!neu.aufgaben.length && !neu.module.length) { alert('In der Datei wurden keine Aufgaben gefunden.'); return; }
        daten = vereinigeDoppelteModule(datenZusammenfuehren(daten, neu));
        speichereLokal();
        alert(neu.aufgaben.length + ' Aufgabe(n) und ' + neu.module.length + ' Modul(e) übernommen.');
        planeSync();
        render();
      } catch (e) {
        alert('Die Datei konnte nicht gelesen werden:\n' + e.message);
      }
    };
    leser.readAsText(datei);
  }

  /* ---------- Ereignisse ---------- */
  function verdrahte() {
    document.addEventListener('click', function (ev) {
      const start = ev.target && ev.target.closest ? ev.target : null;
      const ziel = function (attr) { return start ? start.closest('[' + attr + ']') : null; };
      let el;

      if ((el = ziel('data-status'))) { ev.stopPropagation(); statusWeiter(el.getAttribute('data-status')); return; }
      if ((el = ziel('data-sub-karte'))) {
        ev.stopPropagation();
        const teile = el.getAttribute('data-sub-karte').split('|');
        unteraufgabeUmschalten(teile[0], Number(teile[1]));
        return;
      }
      if ((el = ziel('data-heute-stil'))) {
        heuteStilSetzen(el.getAttribute('data-heute-stil'));
        const d = document.getElementById('dlgStil');
        if (d && d.open) d.close();
        render(); return;
      }
      if (ziel('data-moodle-start')) { moodleDialog(); return; }
      if (ziel('data-moodle-trennen')) { if (confirm('Den gespeicherten Kalender-Link von diesem Gerät entfernen?')) { const c = moodleCfg(); delete c.url; moodleCfgSetzen(c); render(); } return; }
      if ((el = ziel('data-zeit-tag'))) { zeitTag = Number(el.getAttribute('data-zeit-tag')) || 0; render(); return; }
      if ((el = ziel('data-fokus-spaeter'))) {
        const id = el.getAttribute('data-fokus-spaeter'), i = fokusSpaeter.indexOf(id);
        if (i >= 0) fokusSpaeter.splice(i, 1);
        fokusSpaeter.push(id); render(); return;
      }
      if ((el = ziel('data-karte'))) { oeffneAufgabe(el.getAttribute('data-karte')); return; }
      if ((el = ziel('data-ansicht'))) { zeige(el.getAttribute('data-ansicht')); return; }
      if ((el = ziel('data-neu'))) {
        const art = el.getAttribute('data-neu');
        if (art === 'heute') oeffneAufgabe(null, { datum: heute });
        else if (art === 'gewaehlt') oeffneAufgabe(null, { datum: kalGewaehlt });
        else if (art === 'modul') oeffneAufgabe(null, { modul: modulOffen === '__ohne__' ? '' : modulOffen });
        else oeffneAufgabe(null, {});
        return;
      }
      if ((el = ziel('data-monat'))) {
        const v = Number(el.getAttribute('data-monat'));
        if (v === 0) { kalDatum = new Date(); kalGewaehlt = heute; }
        else kalDatum = new Date(kalDatum.getFullYear(), kalDatum.getMonth() + v, 1);
        render(); return;
      }
      if ((el = ziel('data-tag'))) {
        const iso = el.getAttribute('data-tag');
        if (iso === kalGewaehlt) { oeffneAufgabe(null, { datum: iso }); return; }
        kalGewaehlt = iso;
        kalDatum = vonISO(iso);
        render(); return;
      }
      if ((el = ziel('data-seite-modul'))) {
        ansicht = 'module'; modulOffen = el.getAttribute('data-seite-modul');
        render(); $('#content').scrollTop = 0; return;
      }
      if ((el = ziel('data-modul'))) { modulOffen = el.getAttribute('data-modul'); render(); return; }
      if (ziel('data-zurueck')) { modulOffen = null; render(); return; }
      if (ziel('data-modul-neu')) { oeffneModul(null); return; }
      if ((el = ziel('data-modul-bearbeiten'))) { oeffneModul(el.getAttribute('data-modul-bearbeiten')); return; }
      if (ziel('data-filter-reset')) { filter = { suche: '', modul: '', status: '', prio: '' }; render(); return; }

      if (ziel('data-cfg-speichern')) {
        cfg.url = $('#cfgUrl').value.trim();
        cfg.key = $('#cfgKey').value.trim();
        cfg.code = $('#cfgCode').value.trim();
        if (cfg.code && cfg.code.length < 12) { alert('Der Sync-Code muss mindestens 12 Zeichen haben.'); return; }
        speichereCfg();
        synchronisiere(true).then(function (ok) { if (ok) alert('Verbunden. Deine Daten werden jetzt abgeglichen.'); });
        return;
      }
      if (ziel('data-code-neu')) {
        const zeichen = 'abcdefghjkmnpqrstuvwxyz23456789';
        let code = '';
        for (let i = 0; i < 20; i++) code += zeichen[Math.floor(Math.random() * zeichen.length)];
        $('#cfgCode').value = code;
        return;
      }
      if ((el = ziel('data-farbwelt-wahl'))) { farbweltSetzen(el.getAttribute('data-farbwelt-wahl')); return; }
      if ((el = ziel('data-thema-wahl'))) { themaSetzen(el.getAttribute('data-thema-wahl')); return; }
      if ((el = ziel('data-leiste-wahl'))) { leisteSetzen(el.getAttribute('data-leiste-wahl')); return; }
      if (ziel('data-thema-umschalten')) { themaSetzen(istDunkel() ? 'hell' : 'dunkel'); return; }
      if (ziel('data-sync-jetzt')) { synchronisiere(true); return; }
      if (ziel('data-export')) { exportiere(); return; }
      if (ziel('data-neuigkeiten')) { neuigkeitenZeigen(); return; }
      if (ziel('data-tour-start')) { tourAnfordern({ klick: ev }); return; }
      if (ziel('data-import')) { $('#importDatei').click(); return; }
      if ((el = ziel('data-farbe'))) { modulState.farbe = el.getAttribute('data-farbe'); zeichneFarben(); return; }
      if ((el = ziel('data-sub-weg'))) {
        dlgState.subs.splice(Number(el.getAttribute('data-sub-weg')), 1);
        zeichneUnteraufgaben(); return;
      }
    });

    /* Schnellbuttons fuer das Datum */
    document.querySelectorAll('#dlgAufgabe [data-tage]').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        const v = b.getAttribute('data-tage');
        $('#fDatum').value = v === '' ? '' : tageDazu(heute, Number(v));
      });
    });

    document.addEventListener('change', function (ev) {
      const t = ev.target;
      if (t.id === 'importDatei' && t.files && t.files[0]) { importiere(t.files[0]); t.value = ''; return; }
      if (t.hasAttribute && t.hasAttribute('data-sub')) {
        dlgState.subs[Number(t.getAttribute('data-sub'))].erledigt = t.checked;
        zeichneUnteraufgaben(); return;
      }
      if (t.id === 'fltModul') { filter.modul = t.value; render(); return; }
      if (t.id === 'fltStatus') { filter.status = t.value; render(); return; }
      if (t.id === 'fltPrio') { filter.prio = t.value; render(); return; }
    });

    document.addEventListener('input', function (ev) {
      if (ev.target.id === 'suchfeld') {
        filter.suche = ev.target.value;
        const pos = ev.target.selectionStart;
        render();
        const neu = $('#suchfeld');
        if (neu) { neu.focus(); try { neu.setSelectionRange(pos, pos); } catch (e) { } }
      }
    });

    $('#fSpeichern').addEventListener('click', aufgabeSpeichern);
    $('#fAbbrechen').addEventListener('click', function () { $('#dlgAufgabe').close(); });
    $('#fLoeschen').addEventListener('click', function () {
      if (dlgState.id && confirm('Diese Aufgabe wirklich löschen?')) {
        loescheAufgabe(dlgState.id);
        $('#dlgAufgabe').close();
      }
    });
    $('#fUnterAdd').addEventListener('click', unteraufgabeHinzu);
    $('#fUnterNeu').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); unteraufgabeHinzu(); }
    });
    $('#fTitel').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); aufgabeSpeichern(); }
    });
    $('#mSpeichern').addEventListener('click', modulSpeichern);
    $('#mAbbrechen').addEventListener('click', function () { $('#dlgModul').close(); });
    $('#mLoeschen').addEventListener('click', modulLoeschen);
    function neuKnopf() {
      if (ansicht === 'notizen' && window.Notizen) { window.Notizen.neu(); return; }
      oeffneAufgabe(null, { datum: ansicht === 'kalender' ? kalGewaehlt : heute });
    }
    $('#neuBtnSeite').addEventListener('click', function () { oeffneAufgabe(null, { datum: ansicht === 'kalender' ? kalGewaehlt : heute }); });
    $('#fabNeu').addEventListener('click', neuKnopf);

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        if (window.Notizen && window.Notizen.offen()) return;
        if (document.querySelector('dialog[open]')) return;
        e.preventDefault(); neuKnopf();
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        themaNachpruefen();                       // Systemwechsel im Hintergrund nachholen
        tageswechselPruefen(); synchronisiere();
      }
    });
    window.addEventListener('online', function () { synchronisiere(); });
    window.addEventListener('focus', function () { themaNachpruefen(); });
  }

  function tageswechselPruefen() {
    const neu = heuteISO();
    if (neu !== heute) {
      heute = neu;
      if (ansicht === 'kalender') { kalGewaehlt = neu; kalDatum = new Date(); }
      render();
    }
  }

  /* ============================================================
     Bedienungstour (optional)
     Zeigt die echte Oberfläche in fünf kurzen Szenen. Sie läuft nur mit Beispieldaten (demo):
     es wird nichts gespeichert, kein Notizbuch angelegt und keine KI-Anfrage gesendet.
     Bewegungsidee: EINE Hervorhebung führt den Blick zum nächsten Ziel; steht sie, erscheint der Satz dazu.
     ============================================================ */
  const TOUR_KEY = 'schulplaner.tour';            // 'offen' | 'eingeladen' | 'bestand' – unabhängig von VERSION und Cache
  const TOUR_SZENEN = [
    ['Heute', 'Heute zeigt dir sofort, was als Nächstes fällig ist.'],
    ['Aufgaben', 'Mit dem Plus legst du eine Aufgabe an und ordnest sie einem Fach zu.'],
    ['Kalender', 'Im Kalender tippst du auf einen Tag und siehst, was fällig ist.'],
    ['Notizbücher', 'In Notizbüchern schreibst du mit dem Stift wie auf Papier.'],
    ['KI-Assistent', 'Der KI-Assistent beantwortet Lernfragen und trägt Aufgaben ein.']
  ];
  const TOUR_STOPP = {};                           // Signal: Szene wurde abgebrochen (Weiter, Überspringen)
  const TOUR_GLEITEN = 'cubic-bezier(.32,.72,0,1)';   // dieselbe Kurve wie die Tab-Linse: zügig los, weich abbremsen
  const TOUR_AUS = 'cubic-bezier(.23,1,.32,1)';       // = --ease-out

  function tourStatus() { try { return localStorage.getItem(TOUR_KEY); } catch (e) { return null; } }
  function tourStatusSetzen(s) {
    try { localStorage.setItem(TOUR_KEY, s); return localStorage.getItem(TOUR_KEY) === s; } catch (e) { return false; }
  }

  /* ---------- Einmalige Einladung ---------- */
  function tourEinladungPruefen() {
    if (tourStatus() !== 'offen') return false;
    if (tour || document.querySelector('dialog[open]') || (window.Notizen && window.Notizen.offen())) return false;
    // Schon beim Anzeigen merken – lässt sich nichts merken, lieber gar nicht zeigen als bei jedem Start.
    if (!tourStatusSetzen('eingeladen')) return false;
    try { localStorage.setItem('schulplaner.version', String(VERSION)); } catch (e) { }   // Neulinge brauchen kein „Was ist neu?“
    tourEinladungZeigen();
    return true;
  }
  function tourEinladungZeigen() {
    neuDlgStil(); tourStil();
    let dlg = document.getElementById('dlgTour');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'dlgTour'; dlg.className = 'neu-dlg tour-dlg';
      dlg.setAttribute('aria-labelledby', 'tourTitel');
      document.body.appendChild(dlg);
      dlg.addEventListener('click', function (e) {
        const ziel = e.target && e.target.closest ? e.target : null;
        if (!ziel) return;
        if (ziel.closest('[data-tour-ja]')) tourAnfordern({ danach: designWahlPruefen, klick: e });
        else if (ziel.closest('[data-tour-nein]')) { tourEinladungWeg(); setTimeout(designWahlPruefen, 250); }
      });
      dlg.addEventListener('cancel', function () { setTimeout(designWahlPruefen, 250); });   // Esc = überspringen
      dlg.addEventListener('close', function () { dlg.remove(); });                        // einmalig: danach nicht im Dokument liegen lassen
    }
    const nav = function (id) { return NAV.filter(function (n) { return n.id === id; })[0].icon; };
    const bild = function (pfad, klasse) {
      return '<span class="tour-kachel ' + klasse + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        pfad.split(' M').map(function (p, i) { return '<path d="' + (i ? 'M' + p : p) + '"/>'; }).join('') + '</svg></span>';
    };
    dlg.innerHTML = '<div class="dlg-koerper">' +
      '<div class="tour-kacheln" aria-hidden="true">' + bild(nav('heute'), '') + bild(nav('kalender'), '') + bild('M12 5v14 M5 12h14', 'mitte') +
      bild(nav('notizen'), '') + bild('M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z', '') + '</div>' +
      '<h2 id="tourTitel">Willkommen bei SchulPlaner</h2>' +
      '<p class="tour-dlg-text">Lerne SchulPlaner in rund 30 Sekunden kennen. Du kannst die Tour auch später unter Einstellungen → Bedienungshilfe ansehen.</p></div>' +
      '<div class="dlg-fuss"><button class="btn" data-tour-nein="1">Überspringen</button>' +
      '<button class="btn btn-primary" data-tour-ja="1">Tour ansehen</button></div>';
    if (!dlg.open) dlg.showModal();
    const ja = dlg.querySelector('[data-tour-ja]');
    if (ja) ja.blur();                                // kein Fokusrahmen beim Öffnen
  }

  function tourEinladungWeg() {                     // Einladung schließen UND aus dem Dokument nehmen – danach kann sie nichts mehr blockieren
    const d = document.getElementById('dlgTour');
    if (!d) return;
    try { if (d.open) d.close(); } catch (e) { }
    d.remove();
  }
  /* Ein Einstieg für beide Wege – Willkommensfenster und Einstellungen → „Tour erneut ansehen“.
     Früher startete die Tour im selben Augenblick, in dem das Willkommensfenster zuging, und gab still auf, sobald noch
     irgendein Fenster als offen galt. Jetzt: erst das eigene Fenster sicher weg, dann starten; ist kurz noch etwas im Weg,
     wird gewartet statt aufgegeben. */
  let tourWartet = false;
  function tourAnfordern(opt) {
    opt = opt || {};
    if (tour || tourWartet) return;
    tourWartet = true;
    tourEinladungWeg();
    // Ort des Tipps merken (Tastatur-„Klicks“ haben keinen Ort) – siehe Doppeltipp-Schutz in tourStarten
    const klick = opt.klick && (opt.klick.clientX || opt.klick.clientY) ? { x: opt.klick.clientX, y: opt.klick.clientY } : null;
    let versuche = 0;
    const versuch = function () {
      const fenster = document.querySelector('dialog[open]'), heft = !!(window.Notizen && window.Notizen.offen());
      if ((fenster || heft) && versuche++ < 30) { setTimeout(versuch, 50); return; }
      tourWartet = false;
      if (heft) { if (opt.danach) setTimeout(opt.danach, 300); return; }   // ein offenes Notizbuch wird nie überdeckt
      // steht nach 1,5 s immer noch ein Hinweis-Fenster offen, macht es der Tour Platz
      document.querySelectorAll('dialog.neu-dlg[open]').forEach(function (d) { try { d.close(); } catch (e) { } });
      if (!tourStarten({ danach: opt.danach, klick: klick }) && opt.danach) setTimeout(opt.danach, 300);
    };
    setTimeout(versuch, 0);                         // einen Wimpernschlag später: Schließen, Fokus-Rückgabe und Tipp sind dann abgeschlossen
  }

  /* ---------- Stil (hier in app.js, damit er immer zum Tour-Code passt) ---------- */
  function tourStil() {
    if (document.getElementById('tourStil')) return;
    const st = document.createElement('style');
    st.id = 'tourStil';
    st.textContent = [
      ':root{--tour-schleier:rgba(16,20,46,.5)}',
      ':root[data-thema="dunkel"]{--tour-schleier:rgba(0,0,0,.6)}',
      /* Einladung */
      '.tour-dlg .dlg-koerper{text-align:center;padding-top:28px}',
      '.tour-dlg h2{margin:16px 0 6px;font-size:23px;text-wrap:balance}',
      '.tour-dlg-text{margin:0 auto 6px;max-width:330px;color:var(--muted);font-size:14.5px;line-height:1.45;text-wrap:pretty}',
      '.tour-kacheln{display:flex;justify-content:center;align-items:center;gap:8px}',
      '.tour-kachel{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;color:var(--accent);background:rgba(var(--accent-rgb),.12);border:1px solid rgba(var(--accent-rgb),.16)}',
      '.tour-kachel svg{width:22px;height:22px}',
      '.tour-kachel.mitte{width:56px;height:56px;border-radius:18px;color:var(--akzent-text,#fff);border:0;background:linear-gradient(180deg,var(--accent-hell),var(--accent) 55%,var(--accent-tief));box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 8px 20px rgba(var(--accent-rgb),.35)}',
      '.tour-kachel.mitte svg{width:26px;height:26px}',
      /* Ebenen: Schild (fängt Eingaben ab) < Requisiten < Hervorhebung < Karte */
      '.tour-schild{position:fixed;inset:0;z-index:1990;touch-action:none;background:transparent}',
      '.tour-loch{position:fixed;left:0;top:0;z-index:2000;pointer-events:none;box-sizing:border-box;' +
        'box-shadow:0 0 0 2px var(--accent),0 0 0 7px rgba(var(--accent-rgb),.22),0 0 0 200vmax var(--tour-schleier)}',
      '.tour-loch::after{content:"";position:absolute;inset:-4px;border-radius:inherit;opacity:0;box-shadow:0 0 0 3px rgba(var(--accent-rgb),.65),0 0 34px 8px rgba(var(--accent-rgb),.55)}',
      '.tour-loch.leuchtet::after{animation:tour-leuchten 1100ms ' + TOUR_AUS + ' both}',
      '@keyframes tour-leuchten{0%{opacity:0}30%{opacity:1}100%{opacity:0}}',
      '.tour-ebene.geht{opacity:0;transition:opacity 180ms ease-out;pointer-events:none}',
      '.tour-ebene.geht .tour-schild,.tour-ebene.geht .tour-karte,.tour-ebene.geht .tour-skip{pointer-events:none}',
      /* Karte mit Satz und Steuerung – „Tour überspringen“ steht unten rechts */
      '.tour-karte{position:fixed;z-index:2010;left:10px;right:10px;bottom:calc(92px + env(safe-area-inset-bottom));padding:13px 16px 10px;border-radius:22px;' +
        'border:1px solid var(--kante);color:var(--text);background:#FAFBFF;box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 18px 44px rgba(15,20,50,.32);' +
        'touch-action:none;outline:none;-webkit-user-select:none;user-select:none;animation:tour-blende 200ms ease-out both}',
      ':root[data-thema="dunkel"] .tour-karte{background:#1E2036;box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 18px 44px rgba(0,0,0,.6)}',
      /* Tablet hochkant: gleiche Anordnung wie am Handy, aber größere Schrift */
      '@media (min-width:561px){.tour-karte{padding:16px 20px 12px;border-radius:24px}.tour-kopf{font-size:14px}' +
        '.tour-texte{margin:9px 0 13px}.tour-texte p{font-size:21px;line-height:1.36}' +
        '.tour-knoepfe{gap:8px}.tour-knoepfe .btn{min-height:42px;padding:9px 17px;font-size:15px}.tour-knoepfe [data-tour-pause]{min-width:112px}.tour-skip{font-size:15px}}',
      /* Laptop / iPad quer: große Textkarte mittig unter dem Inhalt (Lage setzt tourKarteSetzen) */
      '.tour-karte.gross{right:auto;padding:18px 24px 15px;border-radius:26px}',
      '.tour-karte.gross .tour-texte p{font-size:23px;line-height:1.34;letter-spacing:-.012em}',
      '@media (min-width:1500px){.tour-karte.gross .tour-texte p{font-size:25px}}',
      '@media (max-height:520px){.tour-karte .tour-texte p,.tour-karte.gross .tour-texte p{font-size:17px;line-height:1.35}.tour-karte,.tour-karte.gross{padding:11px 16px 9px}.tour-texte{margin:5px 0 8px}}',
      '.tour-skip.frei{position:fixed;z-index:2010;margin:0;min-height:44px;padding:0 18px;border-radius:999px;text-decoration:none;font-size:15px;color:var(--text);' +
        'background:#FAFBFF;border:1px solid var(--kante);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 12px 30px rgba(15,20,50,.32);touch-action:none;animation:tour-blende 200ms ease-out both}',
      ':root[data-thema="dunkel"] .tour-skip.frei{background:#1E2036;box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 12px 30px rgba(0,0,0,.6)}',
      '@keyframes tour-blende{from{opacity:0}to{opacity:1}}',
      '.tour-kopf{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--muted)}',
      '.tour-zahl{color:var(--accent);font-variant-numeric:tabular-nums}',
      '.tour-punkte{margin-left:auto;display:flex;gap:4px}',
      '.tour-punkte i{width:16px;height:4px;border-radius:2px;background:rgba(127,127,140,.3);transition:background-color 200ms ease}',
      '.tour-punkte i.an{background:var(--accent)}',
      '.tour-texte{display:grid;margin:7px 0 10px}',
      '.tour-texte p{grid-area:1/1;margin:0;font-size:16px;line-height:1.4;font-weight:600;letter-spacing:-.005em;text-wrap:balance;opacity:0;transition:opacity 150ms ease-out}',
      '.tour-texte p.an{opacity:1;transition:opacity 260ms ' + TOUR_AUS + '}',
      '.tour-knoepfe{display:flex;flex-wrap:wrap;align-items:center;gap:6px}',
      '.tour-knoepfe .btn{min-height:38px;padding:8px 13px;font-size:14px}',
      '.tour-knoepfe [data-tour-pause]{min-width:100px;justify-content:center}',
      '.tour-knoepfe [hidden]{display:none}',
      '.tour-skip{margin-left:auto;min-height:38px;padding:8px 2px 8px 6px;border:0;background:none;color:var(--muted);font:inherit;font-size:13.5px;font-weight:600;white-space:nowrap;cursor:pointer;border-radius:10px;text-decoration:underline;text-decoration-color:rgba(127,127,140,.45);text-underline-offset:3px}',
      '.tour-skip:active{opacity:.6}',
      '.tour-skip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
      '@media (hover:hover) and (pointer:fine){.tour-skip:hover{color:var(--text)}}',
      '@media (pointer:coarse){.tour-knoepfe .btn,.tour-skip{min-height:44px}}',
      /* sehr schmale Handys: Pause/Fortsetzen als Symbol, damit alles in einer Zeile bleibt und die Karte niedrig */
      '@media (max-width:359px){.tour-knoepfe [data-tour-pause]{min-width:0;width:44px;padding:0;font-size:0}' +
        '.tour-knoepfe [data-tour-pause]::before{content:"❚❚";font-size:11px;letter-spacing:1px}.tour-knoepfe [data-tour-pause].laeuft-nicht::before{content:"▶";font-size:13px;letter-spacing:0}' +
        '.tour-texte p{font-size:15px}.tour-karte{padding:11px 13px 8px}}',
      /* Requisiten (Beispiele) – liegen unter der Hervorhebung, über der App */
      '.tour-req{position:fixed;z-index:1995;pointer-events:none}',
      '@keyframes tour-req-auf{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}',
      'dialog#dlgAufgabe.tour-demo{position:fixed;inset:auto;margin:0;z-index:1995;max-width:none;height:auto;max-height:none;border-radius:26px;border:1px solid var(--kante);' +
        'pointer-events:none;overflow:hidden;animation:tour-req-auf 300ms ' + TOUR_AUS + ' both}',
      /* Beispiel-Formular ohne Weichzeichner und der wandernde Hintergrund ruht: so bleibt die Tour auch auf schwachen Geräten flüssig */
      'dialog#dlgAufgabe.tour-demo{-webkit-backdrop-filter:none;backdrop-filter:none;background:linear-gradient(180deg,rgba(255,255,255,.5),rgba(255,255,255,0) 40%),#F4F5FB}',
      ':root[data-thema="dunkel"] dialog#dlgAufgabe.tour-demo{background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,0) 40%),#1B1D31}',
      'html.tour-laeuft .tapete,html.tour-laeuft .tapete::before,html.tour-laeuft .tapete::after{animation-play-state:paused}',
      '#dlgAufgabe.tour-demo .dlg-koerper{max-height:var(--tour-dlg-h,300px);overflow:hidden;padding-top:22px;-webkit-mask-image:linear-gradient(#000 72%,transparent);mask-image:linear-gradient(#000 72%,transparent)}',
      '#dlgAufgabe.tour-demo .dlg-fuss{display:none}',
      '#dlgAufgabe.tour-demo #fTitel{caret-color:transparent}',
      '.tour-blatt{border-radius:16px;overflow:hidden;background:#FDFDFB;color:#1C1C2A;box-shadow:0 24px 60px rgba(15,20,50,.38),0 0 0 1px rgba(20,25,60,.08);display:flex;flex-direction:column;animation:tour-req-auf 320ms ' + TOUR_AUS + ' both}',
      '.tour-blatt-kopf{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(20,25,60,.08);background:#F3F4F8;font-size:13px;font-weight:600}',
      '.tour-blatt-kopf small{font-weight:500;color:#6B6F80;margin-left:2px}',
      '.tour-wz{margin-left:auto;display:flex;gap:4px;padding:3px;border-radius:999px;background:rgba(20,25,60,.06)}',
      '.tour-wz span{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;color:#5A5F72}',
      '.tour-wz span.an{background:var(--accent);color:var(--akzent-text,#fff)}',
      '.tour-wz svg{width:16px;height:16px}',
      '.tour-papier{flex:1;position:relative;background-image:repeating-linear-gradient(#FDFDFB 0 33px,#D5DEF0 33px 34px);background-position:0 20px}',
      '.tour-papier svg{position:absolute;left:8%;top:14%;width:84%;height:auto;overflow:visible}',
      '.tour-strich{fill:none;stroke:var(--tour-tinte,#2457D6);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1}',
      '.tour-chat{border-radius:24px;overflow:hidden;border:1px solid var(--kante);color:var(--text);background:#F8F9FD;box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 24px 60px rgba(15,20,50,.36);animation:tour-req-auf 300ms ' + TOUR_AUS + ' both}',
      ':root[data-thema="dunkel"] .tour-chat{background:#1C1E32;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 24px 60px rgba(0,0,0,.6)}',
      '.tour-chat-kopf{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--kante)}',
      '.tour-chat-kopf b{display:block;font-size:15px}',
      '.tour-chat-kopf small{display:block;font-size:12px;color:var(--muted)}',
      '.tour-chat-liste{display:flex;flex-direction:column;gap:10px;padding:14px}',
      '.tour-chat-liste .ki-msg{opacity:0;transform:translateY(8px);transition:opacity 240ms ' + TOUR_AUS + ',transform 240ms ' + TOUR_AUS + '}',
      '.tour-chat-liste .ki-msg.da{opacity:1;transform:none}',
      '.tour-versteckt > :not(.tour-gitter){display:none!important}',
      /* Während der Tour: Platz zum Rollen unter der Karte, Auftakt der Heute-Ansicht */
      'html.tour-laeuft #content .seite::after{content:"";display:block;height:var(--tour-platz,260px)}',
      'html.tour-auftritt #content .seite > *{animation:tour-auf 560ms ' + TOUR_AUS + ' both}',
      'html.tour-auftritt #content .seite > :nth-child(1){animation-name:tour-auf-kopf}',
      'html.tour-auftritt #content .seite > :nth-child(2){animation-delay:90ms}',
      'html.tour-auftritt #content .seite > :nth-child(3){animation-delay:170ms}',
      'html.tour-auftritt #content .seite > :nth-child(4){animation-delay:240ms}',
      'html.tour-auftritt #content .seite > :nth-child(5){animation-delay:300ms}',
      'html.tour-auftritt #content .seite > :nth-child(6){animation-delay:350ms}',
      'html.tour-auftritt #content .seite > :nth-child(n+7){animation-delay:390ms}',
      '@keyframes tour-auf-kopf{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}',
      '@keyframes tour-auf{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}',
      'html.tour-pause .tour-ebene *,html.tour-pause .tour-loch::after,html.tour-pause #dlgAufgabe.tour-demo,html.tour-pause #content .seite > *{animation-play-state:paused!important}',
      /* Bewegung reduzieren: nichts gleitet oder wächst, es wird nur ein- und ausgeblendet */
      '@media (prefers-reduced-motion: reduce){' +
        'dialog#dlgAufgabe.tour-demo,.tour-blatt,.tour-chat{animation:tour-blende 160ms ease-out both}' +
        '.tour-chat-liste .ki-msg{transform:none;transition:opacity 160ms ease-out}' +
        '.tour-loch.leuchtet::after{animation:none}' +
        'html.tour-auftritt #content .seite > *{animation:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ---------- Beispieldaten (leben nur im Speicher) ---------- */
  function tourDemoDaten() {
    const z = jetztISO();
    const m = function (id, name, farbe) { return { id: id, name: name, farbe: farbe, geaendert: z, geloescht: false }; };
    const a = function (id, titel, modul, prio, status, tage) {
      return { id: id, titel: titel, modul_id: modul, prioritaet: prio, status: status, deadline: tageDazu(heuteISO(), tage),
        notizen: '', unteraufgaben: [], geaendert: z, geloescht: false };
    };
    return {
      module: [m('tour-m1', 'Mathematik', MODUL_FARBEN[0]), m('tour-m2', 'Deutsch', MODUL_FARBEN[3]), m('tour-m3', 'Englisch', MODUL_FARBEN[4]),
        m('tour-m4', 'Biologie', MODUL_FARBEN[2]), m('tour-m5', 'Informatik', MODUL_FARBEN[5])],
      aufgaben: [a('tour-a1', 'Übungsblatt 4 abgeben', 'tour-m1', 'Hoch', 'In Bearbeitung', 0),
        a('tour-a2', 'Vokabeln Unit 5 lernen', 'tour-m3', 'Mittel', STATI[0], 1),
        a('tour-a3', 'Erörterung überarbeiten', 'tour-m2', 'Niedrig', STATI[0], 6)]
    };
  }
  const TOUR_NEU = { id: 'tour-a9', titel: 'Biologie-Referat vorbereiten', modul: 'tour-m4', tage: 3 };
  function tourNeueAufgabeDazu() {                  // die Aufgabe aus Szene 2 – taucht danach im Kalender auf
    if (!demo || demo.aufgaben.some(function (t) { return t.id === TOUR_NEU.id; })) return;
    demo.aufgaben.push({ id: TOUR_NEU.id, titel: TOUR_NEU.titel, modul_id: TOUR_NEU.modul, prioritaet: 'Mittel', status: STATI[0],
      deadline: tageDazu(heuteISO(), TOUR_NEU.tage), notizen: '', unteraufgaben: [], geaendert: jetztISO(), geloescht: false });
  }

  /* ---------- Geometrie ---------- */
  function tourRechtsKante() { return leistenPos() === 'rechts' ? $('#sidebar').getBoundingClientRect().left : window.innerWidth; }   // linke Kante der rechten Leiste
  function tourMobil() { const f = $('#fabNeu'); return !!f && getComputedStyle(f).display !== 'none'; }
  function tourSichtbar(el) { return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; }
  function tourRechteck(el, rand) {                 // Rechteck der Hervorhebung um ein Element (etwas Luft, passende Rundung)
    rand = rand == null ? 6 : rand;
    const r = el.getBoundingClientRect(), roh = getComputedStyle(el).borderTopLeftRadius || '0';
    let rund = parseFloat(roh) || 0;
    if (roh.indexOf('%') > 0) rund = Math.min(r.width, r.height) * rund / 100;
    rund = Math.min(rund, Math.min(r.width, r.height) / 2);
    return { x: r.left - rand, y: r.top - rand, b: r.width + 2 * rand, h: r.height + 2 * rand, r: rund + rand };
  }
  function tourVollbild() { return { x: -60, y: -60, b: window.innerWidth + 120, h: window.innerHeight + 120, r: 0 }; }
  function tourLochStil(q) {
    return { transform: 'translate(' + q.x.toFixed(1) + 'px,' + q.y.toFixed(1) + 'px)', width: q.b.toFixed(1) + 'px', height: q.h.toFixed(1) + 'px', borderRadius: q.r.toFixed(1) + 'px' };
  }
  function tourLochDirekt(q) {
    const T = tour; if (!T) return;
    if (T.lochAnim) { try { T.lochAnim.cancel(); } catch (e) { } T.lochAnim = null; }
    Object.assign(T.loch.style, tourLochStil(q));
    T.lochQ = q;
  }
  function tourLochJetzt() {                        // wo die Hervorhebung gerade wirklich ist (auch mitten im Flug)
    const T = tour, r = T.loch.getBoundingClientRect();
    return { x: r.left, y: r.top, b: r.width, h: r.height, r: parseFloat(getComputedStyle(T.loch).borderTopLeftRadius) || 0 };
  }
  /* Die Hervorhebung gleitet zum Ziel. Ziel ist ein Element, ein Rechteck oder eine Funktion, die eins davon liefert
     (die Funktion wird auch nach Drehen/Größenänderung des Fensters wieder gefragt). */
  function tourLochZu(t, ziel, dauer, kurve) {
    const T = tour;
    if (!T || t.ab) return Promise.reject(TOUR_STOPP);
    const holen = typeof ziel === 'function' ? ziel : function () { return ziel; };
    const messen = function () { const z = holen(); return !z ? null : (z.nodeType ? tourRechteck(z) : z); };
    const nach = messen();
    if (!nach) return Promise.resolve();
    T.zielFn = messen;
    const von = tourLochJetzt();
    tourLochDirekt(nach);
    if (T.rm || !T.loch.animate || dauer === 0) return Promise.resolve();
    const anim = T.loch.animate([tourLochStil(von), tourLochStil(nach)], { duration: dauer || 320, easing: kurve || TOUR_GLEITEN });
    T.lochAnim = anim;
    if (T.pause) anim.pause();
    return new Promise(function (ok, nein) {
      const fertig = function () { if (T.lochAnim === anim) T.lochAnim = null; if (t.ab) nein(TOUR_STOPP); else ok(); };
      anim.onfinish = fertig; anim.oncancel = fertig;
    });
  }
  /* Wartezeit, die bei „Pause“ stehen bleibt und bei Abbruch sofort endet */
  function tourWarte(t, ms) {
    return new Promise(function (ok, nein) {
      let vergangen = 0, letzt = null;
      (function tick(z) {
        if (t.ab) { nein(TOUR_STOPP); return; }
        if (z != null) { if (letzt != null && !(tour && tour.pause)) vergangen += Math.min(100, z - letzt); letzt = z; }
        if (vergangen >= ms) ok(); else requestAnimationFrame(tick);
      })(null);
    });
  }
  function tourWarteAuf(t, pruefen, maxMs) {        // z. B. bis das Ziel nach einem Ansichtswechsel wirklich sichtbar ist
    return new Promise(function (ok, nein) {
      const start = performance.now();
      (function tick() {
        if (t.ab) { nein(TOUR_STOPP); return; }
        let w = null;
        try { w = pruefen(); } catch (e) { }
        if (w || performance.now() - start > (maxMs || 2500)) ok(w || null); else requestAnimationFrame(tick);
      })();
    });
  }
  function tourAnim(el, bilder, opt) {              // kleine Animation an einem Element, hält bei „Pause“ mit an
    const T = tour;
    if (!T || !el || !el.animate) return Promise.resolve();
    const a = el.animate(bilder, opt);
    T.anims.push(a);
    if (T.pause) a.pause();
    return new Promise(function (ok) {
      const fertig = function () { const i = T.anims.indexOf(a); if (i >= 0) T.anims.splice(i, 1); ok(); };
      a.onfinish = fertig; a.oncancel = fertig;
    });
  }
  function tourRoller() { const c = $('#content'); return getComputedStyle(c).overflowY === 'visible' ? null : c; }
  function tourRollPos() { const r = tourRoller(); return r ? r.scrollTop : window.scrollY; }
  function tourRollSetzen(y) { const r = tourRoller(); if (r) r.scrollTop = y; else window.scrollTo(0, y); }
  function tourBuehne() {                           // freier Bereich für Beispiele: über der Karte, neben der Seitenleiste
    const T = tour, k = T.karte.getBoundingClientRect();
    const links = tourMobil() ? 12 : Math.max(12, $('#sidebar').getBoundingClientRect().right + 16);
    const oben = 12 + T.sicherOben, unten = k.top - 18;
    return { x: links, y: oben, b: Math.max(200, tourRechtsKante() - 12 - links), h: Math.max(140, unten - oben) };
  }
  /* Liegt das Ziel unter der Karte oder außerhalb des Bildschirms, rollt die Seite – die Hervorhebung bleibt dabei an „mit“ haften. */
  function tourInSicht(t, el, mit) {
    const T = tour;
    if (!T || !el) return Promise.resolve();
    const r = el.getBoundingClientRect(), k = T.karte.getBoundingClientRect();
    const oben = 12 + T.sicherOben + (tourMobil() ? 0 : $('#content').getBoundingClientRect().top);
    const unten = (r.right > k.left - 8 && r.left < k.right + 8 ? k.top : window.innerHeight) - 20;
    let delta = 0;
    if (r.bottom > unten) delta = r.bottom - unten;
    if (r.top - delta < oben) delta = r.top - oben;
    if (Math.abs(delta) < 2) return Promise.resolve();
    const start = tourRollPos(), dauer = T.rm ? 0 : 340;
    const haften = function () { const m = mit && mit(); if (m) tourLochDirekt(tourRechteck(m)); };
    if (!dauer) { tourRollSetzen(start + delta); haften(); return Promise.resolve(); }
    return new Promise(function (ok, nein) {
      let vergangen = 0, letzt = null;
      (function tick(z) {
        if (t.ab) { nein(TOUR_STOPP); return; }
        if (z != null) { if (letzt != null && !T.pause) vergangen += Math.min(100, z - letzt); letzt = z; }
        const p = Math.min(1, vergangen / dauer);
        tourRollSetzen(start + delta * (1 - Math.pow(1 - p, 3)));
        haften();
        if (p < 1) requestAnimationFrame(tick); else ok();
      })(null);
    });
  }

  /* ---------- Karte: Zähler, Satz, Steuerung ---------- */
  /* Platz der Erklärkarte.
     Handy (und alles Schmale/Niedrige): über der Tab-Leiste, „Tour überspringen“ unten rechts in der Karte – wie bisher.
     iPad und Laptop: große Karte mittig unter dem Geschehen – nie weiter als nötig von der Aktion entfernt –
     und „Tour überspringen“ als eigener Knopf unten rechts am Bildschirm. */
  function tourKarteSetzen() {
    const T = tour; if (!T) return;
    const k = T.karte, vw = window.innerWidth, vh = window.innerHeight, mobil = tourMobil();
    const gross = vw >= 700 && vh >= 600;
    k.classList.toggle('gross', gross);
    T.skip.classList.toggle('frei', gross);
    const heim = gross ? T.ebene : k.querySelector('.tour-knoepfe');
    if (T.skip.parentNode !== heim) heim.appendChild(T.skip);
    const rk = tourRechtsKante();
    const leiste = !mobil ? vh : leistenPos() === 'rechts' ? $('#fabNeu').getBoundingClientRect().top : Math.min($('#sidebar').getBoundingClientRect().top, $('#fabNeu').getBoundingClientRect().top);
    if (!gross) {
      k.style.left = k.style.width = T.skip.style.right = T.skip.style.bottom = '';
      k.style.right = rk < vw ? Math.round(vw - rk + 10) + 'px' : '';
      const ki = document.getElementById('kiKnopf');
      k.style.bottom = Math.round(mobil ? vh - leiste + 12 : (tourSichtbar(ki) ? vh - ki.getBoundingClientRect().top + 16 : 24)) + 'px';
      return;
    }
    // „Tour überspringen“: unten rechts – über dem Plus-Knopf (Tab-Leiste) bzw. über dem KI-Knopf (Seitenleiste)
    const ki = document.getElementById('kiKnopf');
    k.style.right = '';
    T.skip.style.right = Math.round(vw - rk + (mobil ? 14 : 28)) + 'px';
    T.skip.style.bottom = Math.round(mobil ? vh - leiste + 12 : (tourSichtbar(ki) ? vh - ki.getBoundingClientRect().top + 14 : 28)) + 'px';
    const sk = T.skip.getBoundingClientRect();
    // Karte: mittig unter der Inhaltsspalte; auf hohen Bildschirmen nicht ganz unten, sondern nah am Geschehen
    const c = $('#content').getBoundingClientRect();
    const mitte = mobil ? rk / 2 : c.left + Math.min(c.width, 1200) / 2;
    const platz = mobil ? rk - 28 : c.width - 32;
    const boden = mobil ? sk.top - 12 : vh - 28;                         // tiefste erlaubte Unterkante
    const setzen = function (breite) {
      k.style.width = Math.round(breite) + 'px';
      const h = k.offsetHeight, oben = Math.min(boden - h, 660);
      k.style.left = Math.round(Math.max(mobil ? 14 : c.left + 12, mitte - breite / 2)) + 'px';
      k.style.bottom = Math.round(vh - oben - h) + 'px';
      return { oben: oben, unten: oben + h };
    };
    const lage = setzen(Math.min(700, platz));
    if (!mobil && lage.unten > sk.top - 12 && lage.oben < sk.bottom + 12) {   // läge sonst unter dem Überspringen-Knopf: schmaler
      setzen(Math.max(380, Math.min(700, platz, 2 * (sk.left - 16 - mitte))));
    }
  }
  function tourPlatzSetzen() {                      // genug Platz zum Rollen, damit jedes Ziel über die Karte passt
    const T = tour; if (!T) return;
    document.documentElement.style.setProperty('--tour-platz', Math.round(window.innerHeight - T.karte.getBoundingClientRect().top + 60) + 'px');
  }
  function tourKopf(i) {
    const T = tour; if (!T) return;
    T.karte.querySelector('.tour-zahl').textContent = (i + 1) + ' von ' + TOUR_SZENEN.length;
    T.karte.querySelector('.tour-name').textContent = '· ' + TOUR_SZENEN[i][0];
    T.karte.querySelectorAll('.tour-punkte i').forEach(function (p, n) { p.classList.toggle('an', n <= i); });
    const w = T.karte.querySelector('[data-tour-weiter]');
    w.textContent = i === TOUR_SZENEN.length - 1 ? 'Fertig' : 'Weiter';
  }
  function tourText(i) {                            // i = null blendet den Satz aus
    const T = tour; if (!T) return;
    T.karte.querySelectorAll('.tour-texte p').forEach(function (p, n) {
      p.classList.toggle('an', n === i);
      if (n === i) p.removeAttribute('aria-hidden'); else p.setAttribute('aria-hidden', 'true');
    });
    if (i != null) T.textAb = performance.now();
  }
  function tourLesezeit(i) { return Math.max(3200, 1500 + TOUR_SZENEN[i][1].length * 52); }   // Standzeit richtet sich nach der Textlänge
  function tourRestLesen(t, i, mindestens) {        // nach der Aktion noch so lange stehen bleiben, bis der Satz gelesen ist
    const T = tour, schon = T ? performance.now() - T.textAb : 0;
    return tourWarte(t, Math.max(mindestens || 1200, tourLesezeit(i) - schon));
  }
  function tourPauseSetzen(an) {
    const T = tour; if (!T) return;
    T.pause = !!an;
    document.documentElement.classList.toggle('tour-pause', T.pause);
    const b = T.karte.querySelector('[data-tour-pause]');
    b.textContent = T.pause ? 'Fortsetzen' : 'Pause';
    b.classList.toggle('laeuft-nicht', T.pause);
    T.anims.concat(T.lochAnim ? [T.lochAnim] : []).forEach(function (a) { try { if (T.pause) a.pause(); else a.play(); } catch (e) { } });
  }

  /* ---------- Requisiten: Beispiele, die nur während einer Szene zu sehen sind ---------- */
  function tourDialogAuf(ausgang) {                 // das echte Aufgaben-Formular, aber gesperrt und nicht modal
    const T = tour, d = $('#dlgAufgabe'), b = tourBuehne();
    dlgState = { id: null, subs: [] };
    $('#fTitel').value = '';
    fuelleAuswahl($('#fModul'), module(), '', 'Ohne Modul');
    fuelleAuswahl($('#fPrio'), PRIOS, 'Mittel');
    fuelleAuswahl($('#fStatus'), STATI, STATI[0]);
    $('#fDatum').value = tageDazu(heuteISO(), TOUR_NEU.tage);
    $('#fNotiz').value = '';
    $('#fLoeschen').style.display = 'none';
    zeichneUnteraufgaben();
    auswahlAufbereiten(d);
    const breite = Math.min(540, b.b);
    d.classList.add('tour-demo');
    d.inert = true;
    d.style.setProperty('--tour-dlg-h', Math.round(Math.max(150, Math.min(318, b.h - 30))) + 'px');
    d.style.width = breite + 'px';
    d.style.left = Math.round(b.x + (b.b - breite) / 2) + 'px';
    d.style.top = '0px';
    d.show();
    const hoehe = d.offsetHeight, oben = Math.round(b.y + Math.max(0, (b.h - hoehe) / 2));
    d.style.top = oben + 'px';
    if (ausgang) {                                  // wächst aus dem Plus-Knopf heraus
      const a = ausgang.getBoundingClientRect(), l = parseFloat(d.style.left);
      d.style.transformOrigin = Math.max(0, Math.min(100, (a.left + a.width / 2 - l) / breite * 100)).toFixed(0) + '% ' +
        Math.max(0, Math.min(100, (a.top + a.height / 2 - oben) / hoehe * 100)).toFixed(0) + '%';
    }
    T.dialogAn = true;
    try { T.karte.focus({ preventScroll: true }); } catch (e) { }
    return { x: parseFloat(d.style.left) - 6, y: oben - 6, b: breite + 12, h: hoehe + 12, r: 32 };
  }
  function tourDialogZu() {
    const T = tour, d = $('#dlgAufgabe');
    if (!d || !d.classList.contains('tour-demo')) return;
    try { d.getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) { }
    try { d.close(); } catch (e) { }
    d.classList.remove('tour-demo');
    d.inert = false;
    d.removeAttribute('style');
    $('#fTitel').value = '';
    dlgState = null;
    if (T) T.dialogAn = false;
  }
  function tourReq(html, klasse) {
    const el = document.createElement('div');
    el.className = 'tour-req ' + klasse;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = html;
    tour.ebene.insertBefore(el, tour.loch);
    tour.reqs.push(el);
    return el;
  }
  function tourUrsprung(el, q, ausgang) {           // Requisite wächst aus dem Element heraus, das sie ausgelöst hat
    if (!ausgang) return;
    const a = ausgang.getBoundingClientRect();
    el.style.transformOrigin = Math.max(0, Math.min(100, (a.left + a.width / 2 - q.x) / q.b * 100)).toFixed(0) + '% ' +
      Math.max(0, Math.min(100, (a.top + a.height / 2 - q.y) / q.h * 100)).toFixed(0) + '%';
  }
  function tourBlattAuf(ausgang) {                  // Beispielseite eines Notizbuchs (kein echtes Notizbuch, nichts wird gespeichert)
    const b = tourBuehne();
    const breite = Math.min(b.b, 400), hoehe = Math.min(b.h, Math.round(breite * 1.22), 470);
    const q = { x: Math.round(b.x + (b.b - breite) / 2), y: Math.round(b.y + (b.h - hoehe) / 2), b: breite, h: hoehe };
    const wz = function (pfad, an) { return '<span' + (an ? ' class="an"' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + pfad + '</svg></span>'; };
    const el = tourReq(
      '<div class="tour-blatt-kopf"><span>Biologie<small>· Beispielseite</small></span><div class="tour-wz">' +
      wz('<path d="M5 9c0-3 3-5 7-5s7 2 7 5-3 5-7 5c-2 0-4 1-4 3s2 3 4 3"/>') +
      wz('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>', true) +
      wz('<path d="M8 20h11"/><path d="M4.5 14.5l8-8 5 5-8 8H7z"/>') +
      wz('<path d="M6 6h12"/><path d="M12 6v13"/>') + '</div></div>' +
      '<div class="tour-papier"><svg viewBox="0 0 300 120"><path class="tour-strich" pathLength="1" d="' +
      'M14 84c16-2 30-18 33-40 3-20-13-22-13 0 0 26 12 42 30 40 16-2 28-20 31-42 3-20-13-22-13 0 0 26 12 44 30 42 13-1 22-12 27-26 4-12-9-15-12-1-4 16 5 28 21 27 12-1 22-8 31-18' +
      '"/><path class="tour-strich" pathLength="1" d="M36 106c60-9 130-11 228-5"/></svg></div>', 'tour-blatt');
    Object.assign(el.style, { left: q.x + 'px', top: q.y + 'px', width: q.b + 'px', height: q.h + 'px' });
    tourUrsprung(el, q, ausgang);
    return { el: el, q: { x: q.x - 6, y: q.y - 6, b: q.b + 12, h: q.h + 12, r: 22 } };
  }
  function tourChatAuf(ausgang) {                   // fiktive Lernfrage – es wird nichts an die KI gesendet
    const T = tour, b = tourBuehne(), a = ausgang ? ausgang.getBoundingClientRect() : null;
    const funke = (document.querySelector('#kiKnopf svg, .ki-kopf-start svg') || {}).outerHTML || '';
    const breite = Math.min(b.b, 340);
    const el = tourReq(
      '<div class="tour-chat-kopf">' + (funke ? '<span class="ki-logo-klein">' + funke + '</span>' : '') + '<div><b>KI-Assistent</b><small>Beispiel</small></div></div>' +
      '<div class="tour-chat-liste"><div class="ki-msg ki-ich">Erklär mir die Fotosynthese in einem Satz.</div>' +
      '<div class="ki-msg ki-ki">Pflanzen machen aus Licht, Wasser und CO₂ Zucker – dabei entsteht Sauerstoff.</div></div>', 'tour-chat');
    el.style.width = breite + 'px';
    const hoehe = el.offsetHeight, k = T.karte.getBoundingClientRect();
    const rechts = a ? Math.min(window.innerWidth - 12, Math.max(a.right, b.x + breite)) : b.x + b.b;
    const x = Math.round(Math.max(b.x, rechts - breite));
    // Knopf oben (Handy): Chat darunter. Knopf unten (Desktop): Chat über der Karte.
    const y = a && a.top < window.innerHeight / 2 ? Math.round(Math.min(a.bottom + 16, Math.max(b.y, k.top - 18 - hoehe))) : Math.round(Math.max(b.y, k.top - 18 - hoehe));
    Object.assign(el.style, { left: x + 'px', top: y + 'px' });
    const q = { x: x, y: y, b: breite, h: hoehe };
    tourUrsprung(el, q, ausgang);
    return { el: el, q: { x: x - 6, y: y - 6, b: breite + 12, h: hoehe + 12, r: 30 } };
  }
  function tourReqRaus(t, el) {                     // Requisite verabschiedet sich kurz und schlicht
    const T = tour;
    if (!T || !el) return Promise.resolve();
    if (T.rm || !el.animate) { el.remove(); return Promise.resolve(); }
    return tourAnim(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 170, easing: 'ease-out', fill: 'forwards' })
      .then(function () { el.remove(); if (t.ab) throw TOUR_STOPP; });
  }
  function tourBuchEin() {                          // Demo-Notizbuch in die Bibliothek stellen (nur Anzeige)
    const bib = $('#content [data-nb-bibliothek]');
    if (!bib || bib.querySelector('.tour-buch')) return bib ? bib.querySelector('.tour-buch') : null;
    if (!bib.firstElementChild || bib.firstElementChild.classList.contains('leer')) return null;   // Bibliothek lädt noch
    const farbe = modulFarbe('tour-m4');
    const karte = document.createElement('div');
    karte.className = 'nb-buch tour-buch';
    karte.innerHTML = '<div class="nb-cover" style="--c1:#4CD07D;--c2:#1E9A55"><div class="nb-ruecken"></div><div class="nb-glanz"></div><div class="nb-etikett">Biologie</div></div>' +
      '<div class="nb-info"><div class="nb-titel">Biologie</div><div class="nb-meta"><span class="mod-punkt" style="background:' + farbe + '"></span>Biologie</div>' +
      '<div class="nb-meta nb-meta2">1 Seite · Beispiel</div></div>';
    const gitter = bib.querySelector('.nb-gitter:not(.tour-gitter)');
    if (gitter) {
      bib.classList.remove('tour-versteckt');
      const neu = gitter.querySelector('.nb-neu-karte');
      if (neu && neu.nextSibling) gitter.insertBefore(karte, neu.nextSibling); else gitter.appendChild(karte);
    } else {                                        // noch keine Notizbücher: eigenes kleines Regal zeigen
      const regal = document.createElement('div');
      regal.className = 'nb-gitter tour-gitter';
      regal.appendChild(karte);
      bib.classList.add('tour-versteckt');
      bib.appendChild(regal);
    }
    return karte;
  }
  function tourBuchWeg() {
    document.querySelectorAll('.tour-buch, .tour-gitter').forEach(function (e) { e.remove(); });
    document.querySelectorAll('.tour-versteckt').forEach(function (e) { e.classList.remove('tour-versteckt'); });
  }
  function tourRequisitenWeg(buchBleibt) {          // alles Szenen-Eigene sofort entfernen (auch mitten in einer Bewegung)
    const T = tour; if (!T) return;
    document.documentElement.classList.remove('tour-auftritt');
    T.anims.slice().forEach(function (a) { try { a.cancel(); } catch (e) { } });
    T.anims = [];
    tourDialogZu();
    T.reqs.forEach(function (e) { e.remove(); });
    T.reqs = [];
    if (!buchBleibt) { T.buchAn = false; tourBuchWeg(); }
    T.loch.classList.remove('leuchtet');
  }

  /* ---------- Die fünf Szenen ---------- */
  function tourAnsicht(id) {                        // Ansicht wechseln und oben anfangen
    zeige(id);                                    // zeichnet auch die Beispieldaten
    tourRollSetzen(0);
    document.documentElement.classList.remove('leiste-klein');
  }
  function tourZiel(sel) { return function () { const e = document.querySelector(sel); return tourSichtbar(e) ? e : null; }; }
  function tourNavZiel(id) { return tourZiel('#nav [data-ansicht="' + id + '"]'); }

  const TOUR_ABLAUF = [
    /* 1 · Heute: die Ansicht erscheint, die nächste fällige Aufgabe rückt in den Fokus (Auftakt) */
    async function (t) {
      const T = tour, ziel = tourZiel('#content [data-karte="tour-a1"], #content [data-fokus="tour-a1"]');
      tourText(null);
      tourLochDirekt(tourVollbild());
      if (!T.rm) document.documentElement.classList.add('tour-auftritt');
      tourAnsicht('heute');
      await tourWarteAuf(t, ziel);
      await tourInSicht(t, ziel());
      if (!T.rm) await tourWarte(t, 700);            // erst erscheint die Ansicht …
      tourText(0);                                   // Satz erscheint schon, während der Fokus sich zusammenzieht – Lesen und Bewegung überlappen
      await tourLochZu(t, ziel, 720, 'cubic-bezier(.77,0,.175,1)');   // … dann zieht sich der Fokus ruhig um die nächste Aufgabe zusammen
      document.documentElement.classList.remove('tour-auftritt');
      if (!T.rm) T.loch.classList.add('leuchtet');
      await tourWarte(t, 1900);                      // ~2,6 s lesbar insgesamt, danach zügig weiter (vorher volle Lesezeit erst ab Ende der Bewegung)
    },
    /* 2 · Aufgaben und Module: am echten Plus-Knopf eine Aufgabe anlegen und einem Fach zuordnen */
    async function (t) {
      const T = tour;
      const plus = function () { const f = $('#fabNeu'); return tourSichtbar(f) ? f : (tourSichtbar($('#neuBtnSeite')) ? $('#neuBtnSeite') : null); };
      tourText(null);
      tourAnsicht('heute');
      await tourLochZu(t, plus);
      tourText(1);
      await tourWarte(t, 1000);                      // erst lesen lassen, dann geht die Aktion los
      if (!T.rm && plus()) await tourAnim(plus(), [{ transform: 'scale(1)' }, { transform: 'scale(.92)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
      if (t.ab) throw TOUR_STOPP;
      const q = tourDialogAuf(plus());               // Formular wächst aus dem Plus, die Hervorhebung geht mit
      await tourLochZu(t, function () { return q; }, 340);
      await tourWarte(t, 260);
      const titel = $('#fTitel');
      if (T.rm) titel.value = TOUR_NEU.titel;
      else for (let i = 1; i <= TOUR_NEU.titel.length; i++) { titel.value = TOUR_NEU.titel.slice(0, i); await tourWarte(t, 30); }
      await tourWarte(t, 320);
      await tourLochZu(t, function () { const f = $('#fModul'); return f ? f.closest('.feld') : null; });
      await tourWarte(t, 300);
      $('#fModul').value = TOUR_NEU.modul;           // dem Fach zuordnen
      knopfBeschriften($('#fModul'));
      await tourRestLesen(t, 1, 1500);
      tourNeueAufgabeDazu();
      tourText(null);
      if (!T.rm) await tourAnim($('#dlgAufgabe'), [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 170, easing: 'ease-out', fill: 'forwards' });
      if (t.ab) throw TOUR_STOPP;
      tourRequisitenWeg();
      render();
    },
    /* 3 · Kalender: zum markierten Abgabetermin, dann dorthin, wo die Aufgabe erscheint */
    async function (t) {
      const T = tour, tag = tageDazu(heuteISO(), TOUR_NEU.tage);
      const zelle = tourZiel('#content .kal [data-tag="' + tag + '"]');
      const karte = tourZiel('#content .tagespanel [data-karte="' + TOUR_NEU.id + '"]');
      tourNeueAufgabeDazu();
      tourText(null);
      if (ansicht !== 'kalender') {
        await tourLochZu(t, tourNavZiel('kalender'));  // erst zum Tab, dann die Ansicht wechseln
        await tourWarte(t, 120);
      }
      kalDatum = vonISO(tag); kalGewaehlt = heuteISO();
      zeige('kalender'); tourRollSetzen(0);
      await tourWarteAuf(t, zelle);
      if (!T.rm) await tourWarte(t, 360);            // die Tab-Linse kommt erst an
      await tourInSicht(t, zelle());
      await tourLochZu(t, zelle);
      tourText(2);
      await tourWarte(t, 1250);
      kalGewaehlt = tag; render();                   // „Tipp“ auf den Tag: darunter erscheint die Aufgabe
      await tourWarteAuf(t, karte);
      await tourWarte(t, 380);
      await tourInSicht(t, karte(), zelle);
      await tourLochZu(t, karte);
      await tourRestLesen(t, 2, 1700);
    },
    /* 4 · Notizbücher: ein Demo-Notizbuch öffnen, ein Stiftstrich entsteht */
    async function (t) {
      const T = tour, buch = tourZiel('#content .tour-buch .nb-cover');
      tourText(null);
      if (ansicht !== 'notizen') {
        await tourLochZu(t, tourNavZiel('notizen'));
        await tourWarte(t, 120);
      }
      zeige('notizen'); tourRollSetzen(0);
      T.buchAn = true;
      await tourWarteAuf(t, function () { return tourBuchEin(); });
      if (!T.rm) await tourWarte(t, 360);
      await tourInSicht(t, buch());
      await tourLochZu(t, buch);
      tourText(3);
      await tourWarte(t, 1050);
      const blatt = tourBlattAuf(buch());            // die Seite wächst aus dem Notizbuch
      await tourLochZu(t, function () { return blatt.q; }, 340);
      await tourWarte(t, 200);
      const striche = blatt.el.querySelectorAll('.tour-strich');   // erst das Wort, dann der Unterstrich – wie mit der Hand
      for (let i = 0; i < striche.length; i++) {
        if (T.rm) { striche[i].style.strokeDashoffset = '0'; continue; }
        await tourAnim(striche[i], [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: i ? 380 : 1150, easing: 'linear', fill: 'forwards' });
        if (t.ab) throw TOUR_STOPP;
        await tourWarte(t, 110);
      }
      await tourRestLesen(t, 3, 1500);
      tourText(null);
      await tourReqRaus(t, blatt.el);
    },
    /* 5 · KI-Assistent: Einstieg hervorheben, eine fiktive Lernfrage zeigen */
    async function (t) {
      const T = tour;
      const knopf = function () { const k = document.getElementById('kiKnopf'); return tourSichtbar(k) ? k : tourZiel('#content .ki-kopf-start')(); };
      tourText(null);
      if (!knopf()) tourAnsicht('heute');
      tourRollSetzen(0);
      await tourLochZu(t, knopf);
      tourText(4);
      await tourWarte(t, 1050);
      const chat = tourChatAuf(knopf());
      await tourLochZu(t, function () { return chat.q; }, 340);
      await tourWarte(t, 300);
      chat.el.querySelector('.ki-ich').classList.add('da');
      await tourWarte(t, 1000);
      chat.el.querySelector('.ki-ki').classList.add('da');
      await tourRestLesen(t, 4, 2100);
      tourText(null);
      await tourReqRaus(t, chat.el);
    }
  ];

  function tourSzene(i) {
    const T = tour; if (!T) return;
    if (T.token) T.token.ab = true;                 // laufende Szene beenden – nie zwei gleichzeitig
    const t = T.token = { ab: false };
    T.i = i;
    tourRequisitenWeg(i === 4 && ansicht === 'notizen');   // das Demo-Notizbuch bleibt im Regal, solange man es sieht
    tourKopf(i);
    TOUR_ABLAUF[i](t).then(function () {
      if (t.ab || tour !== T) return;
      if (T.rm) return;                             // Bewegung reduziert: weiter geht es nur von Hand
      if (i + 1 < TOUR_ABLAUF.length) tourSzene(i + 1); else tourAbspann();
    }).catch(function (e) {
      if (e === TOUR_STOPP) return;
      console.error(e);                             // unerwarteter Fehler: Tour sauber beenden statt hängen zu bleiben
      if (tour === T) tourBeenden();
    });
  }
  function tourWeiter() {
    const T = tour; if (!T || T.endet) return;
    if (T.pause) tourPauseSetzen(false);
    if (T.i + 1 < TOUR_ABLAUF.length) tourSzene(T.i + 1); else tourAbspann();
  }
  function tourAbspann() {                          // sanft zurück: Ansicht wie vorher, der Fokus öffnet sich wieder
    const T = tour; if (!T || T.endet) return;
    if (T.token) T.token.ab = true;
    const t = T.token = { ab: false };
    if (T.rm) { tourBeenden(); return; }
    T.endet = true;
    tourText(null);
    tourRequisitenWeg();
    tourZustandZurueck();
    [T.karte, T.skip.classList.contains('frei') ? T.skip : null].forEach(function (el) {
      if (el) tourAnim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' });
    });
    tourLochZu(t, tourVollbild, 460).then(function () { if (tour === T) tourBeenden(); }).catch(function () { });
  }

  /* ---------- Start und Ende ---------- */
  function tourZustandZurueck() {                   // echte Daten und die Ausgangsansicht wieder anzeigen
    const T = tour; if (!T || T.zurueck) return;
    T.zurueck = true;
    demo = null;
    ansicht = T.vorher.ansicht; modulOffen = T.vorher.modulOffen;
    kalDatum = T.vorher.kalDatum; kalGewaehlt = T.vorher.kalGewaehlt;
    render();
    const r = tourRoller();
    if (r) r.scrollTop = T.vorher.rollC;
    window.scrollTo(0, T.vorher.rollW);
  }
  function tourTaste(e) {
    const T = tour; if (!T) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tourBeenden(); return; }
    if (T.karte.contains(e.target) || e.target === T.skip) {
      if (e.key === 'ArrowRight') { e.preventDefault(); tourWeiter(); }
      else if (e.key === ' ' && e.target === T.karte) { e.preventDefault(); if (!T.rm && !T.endet) tourPauseSetzen(!T.pause); }
      else if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].indexOf(e.key) >= 0) e.preventDefault();   // die Seite darunter rollt nicht
      e.stopPropagation();
      return;
    }
    e.stopPropagation();                            // Tastenkürzel der App bleiben während der Tour aus
    if (e.key === 'Tab') { e.preventDefault(); T.karte.querySelector('[data-tour-weiter]').focus(); }
    else if (!e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
  }
  function tourGerollt() {                          // rollt die Seite doch einmal, sitzt die Hervorhebung sofort wieder auf ihrem Ziel
    const T = tour; if (!T || T.lochAnim || !T.zielFn) return;
    const q = T.zielFn(); if (q) tourLochDirekt(q);
  }
  function tourGroesse() {
    const T = tour; if (!T) return;
    tourKarteSetzen(); tourPlatzSetzen();
    if (Math.abs(window.innerWidth - T.breite) > 4) {   // gedreht oder Fenster verändert: Szene neu aufbauen
      T.breite = window.innerWidth;
      clearTimeout(T.groesseTimer);
      T.groesseTimer = setTimeout(function () { if (tour === T && !T.endet) tourSzene(T.i); }, 180);
    } else if (T.zielFn && !T.lochAnim) {
      const q = T.zielFn(); if (q) tourLochDirekt(q);
    }
  }
  function tourStarten(opt) {                       // nur über tourAnfordern() aufrufen
    opt = opt || {};
    if (tour) return false;
    if (document.querySelector('dialog[open]') || (window.Notizen && window.Notizen.offen())) return false;
    tourStil();
    const html = document.documentElement;
    const rc = tourRoller();
    const T = tour = {
      i: 0, token: null, pause: false, endet: false, zurueck: false, anims: [], reqs: [], lochAnim: null, zielFn: null, buchAn: false, dialogAn: false,
      rm: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
      danach: opt.danach || null, breite: window.innerWidth, textAb: 0, sicherOben: 0, gesperrt: [],
      gestartet: performance.now(), startKlick: opt.klick || null,
      vorher: { ansicht: ansicht, modulOffen: modulOffen, kalDatum: kalDatum, kalGewaehlt: kalGewaehlt, rollC: rc ? rc.scrollTop : 0, rollW: window.scrollY,
        fokus: document.activeElement, ausEinstellungen: ansicht === 'einstellungen' }
    };
    try {
      if (html.classList.contains('ki-offen')) { const zu = document.querySelector('#kiPanel [data-ki-zu]'); if (zu) zu.click(); }
      listeSchliessen();
      demo = tourDemoDaten();

      const ebene = T.ebene = document.createElement('div');
      ebene.className = 'tour-ebene';
      ebene.innerHTML = '<div class="tour-schild"></div><div class="tour-loch" aria-hidden="true"></div>' +
        '<div class="tour-karte" role="dialog" aria-label="Bedienungstour" tabindex="-1">' +
        '<div class="tour-kopf"><span class="tour-zahl"></span><span class="tour-name"></span><span class="tour-punkte" aria-hidden="true">' +
        TOUR_SZENEN.map(function () { return '<i></i>'; }).join('') + '</span></div>' +
        '<div class="tour-texte" aria-live="polite">' + TOUR_SZENEN.map(function (s) { return '<p aria-hidden="true">' + esc(s[1]) + '</p>'; }).join('') + '</div>' +
        '<div class="tour-knoepfe"><button type="button" class="btn" data-tour-pause="1"' + (T.rm ? ' hidden' : '') + '>Pause</button>' +
        '<button type="button" class="btn btn-primary" data-tour-weiter="1">Weiter</button>' +
        '<button type="button" class="tour-skip" data-tour-ende="1">Tour überspringen</button></div></div>';
      document.body.appendChild(ebene);
      T.schild = ebene.querySelector('.tour-schild'); T.loch = ebene.querySelector('.tour-loch'); T.karte = ebene.querySelector('.tour-karte');
      T.skip = ebene.querySelector('.tour-skip');
      // obere sichere Zone (Notch) einmal ausmessen
      const mess = document.createElement('div');
      mess.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top);visibility:hidden';
      ebene.appendChild(mess); T.sicherOben = mess.offsetHeight || 0; mess.remove();

      // Die App darunter ist während der Tour gesperrt: keine Tipps, kein Fokus, keine Tastenkürzel
      T.gesperrt = ['#app', '#fabNeu', '#kiKnopf', '#kiPanel'].map(function (s) { return document.querySelector(s); })
        .filter(function (e) { return e && !e.inert; });
      T.gesperrt.forEach(function (e) { e.inert = true; });
      ebene.addEventListener('click', function (e) {
        const knopf = e.target && e.target.closest ? e.target.closest('[data-tour-ende],[data-tour-weiter],[data-tour-pause]') : null;
        if (!knopf) return;
        // Ein Doppeltipp auf „Tour ansehen“ darf nicht versehentlich den Knopf treffen, der gerade unter dem Finger erschienen ist
        const k = T.startKlick;
        if (k && performance.now() - T.gestartet < 600 && Math.abs(e.clientX - k.x) < 44 && Math.abs(e.clientY - k.y) < 44) return;
        if (knopf.hasAttribute('data-tour-ende')) tourBeenden();
        else if (knopf.hasAttribute('data-tour-weiter')) tourWeiter();
        else tourPauseSetzen(!T.pause);
      });
      const halt = function (e) { e.preventDefault(); };
      [T.schild, T.karte, T.skip].forEach(function (el) {
        el.addEventListener('wheel', halt, { passive: false });
        el.addEventListener('touchmove', halt, { passive: false });
      });
      window.addEventListener('scroll', tourGerollt, true);
      window.addEventListener('keydown', tourTaste, true);
      window.addEventListener('resize', tourGroesse);
      // Zeichnet die App neu (z. B. nach einem Abgleich), kommt das Demo-Notizbuch wieder an seinen Platz
      if (window.MutationObserver) {
        T.beob = new MutationObserver(function () { if (tour === T && T.buchAn && !document.querySelector('#content .tour-buch')) tourBuchEin(); });
        T.beob.observe($('#content'), { childList: true, subtree: true });
      }
      html.classList.add('tour-laeuft');
      html.classList.remove('leiste-klein');
      tourKarteSetzen(); tourPlatzSetzen();
      tourLochDirekt(tourVollbild());
      try { T.karte.focus({ preventScroll: true }); } catch (e) { }
      tourSzene(0);
      return true;
    } catch (fehler) {                              // Start gescheitert: nichts halb Aufgebautes zurücklassen, die App bleibt bedienbar
      console.error(fehler);
      tourNotAus(T);
      return false;
    }
  }
  function tourNotAus(T) {
    if (T.token) T.token.ab = true;
    demo = null;
    if (tour === T) tour = null;
    try { tourDialogZu(); tourBuchWeg(); } catch (e) { }
    (T.gesperrt || []).forEach(function (e) { e.inert = false; });
    if (T.beob) T.beob.disconnect();
    window.removeEventListener('keydown', tourTaste, true);
    window.removeEventListener('resize', tourGroesse);
    window.removeEventListener('scroll', tourGerollt, true);
    document.documentElement.classList.remove('tour-laeuft', 'tour-pause', 'tour-auftritt');
    document.documentElement.style.removeProperty('--tour-platz');
    if (T.ebene) T.ebene.remove();
    ansicht = T.vorher.ansicht; modulOffen = T.vorher.modulOffen; kalDatum = T.vorher.kalDatum; kalGewaehlt = T.vorher.kalGewaehlt;
    try { render(); } catch (e) { }
  }
  /* Ende der Tour – ob fertig oder übersprungen: Timer, Animationen und Ebenen weg, Ausgangsansicht und Fokus zurück */
  function tourBeenden() {
    const T = tour; if (!T) return;
    if (T.token) T.token.ab = true;
    clearTimeout(T.groesseTimer);
    tourRequisitenWeg();
    if (T.lochAnim) { try { T.lochAnim.cancel(); } catch (e) { } }
    tourZustandZurueck();
    if (T.beob) T.beob.disconnect();
    window.removeEventListener('keydown', tourTaste, true);
    window.removeEventListener('resize', tourGroesse);
    window.removeEventListener('scroll', tourGerollt, true);
    T.gesperrt.forEach(function (e) { e.inert = false; });
    const html = document.documentElement;
    html.classList.remove('tour-laeuft', 'tour-pause', 'tour-auftritt');
    html.style.removeProperty('--tour-platz');
    tour = null;
    // Die App ist sofort wieder bedienbar; die Ebene blendet nur noch kurz aus
    T.ebene.classList.add('geht');
    setTimeout(function () { T.ebene.remove(); }, T.rm ? 0 : 200);
    let fokus = T.vorher.ausEinstellungen ? document.querySelector('#content [data-tour-start]') : null;
    if (!fokus && T.vorher.fokus && T.vorher.fokus.isConnected && T.vorher.fokus !== document.body) fokus = T.vorher.fokus;
    if (fokus) { try { fokus.focus({ preventScroll: true }); } catch (e) { } }
    else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (T.danach) setTimeout(T.danach, 300);
  }

  /* ---------- Start ---------- */
  themaAnwenden();
  leisteAnwenden();
  ladeLokal();
  verdrahte();
  if (window.Notizen) {
    try {
      window.Notizen.init({
        module: module, modulVon: modulVon, auswahlAufbereiten: auswahlAufbereiten, zeige: zeige,
        neuZeichnen: function () { if (ansicht === 'notizen' || ansicht === 'module' || ansicht === 'einstellungen') render(); }
      });
    } catch (e) { console.error(e); }
  }
  if (window.Assistent) {
    try {
      window.Assistent.init({
        // immer die echten Daten – auch wenn die Bedienungstour gerade Beispiele anzeigt
        aufgaben: function () { return aktiv(daten.aufgaben); }, module: function () { return aktiv(daten.module); },
        modulVon: function (id) { const m = daten.module.filter(function (x) { return x.id === id; })[0]; return m && !m.geloescht ? m : null; },
        aufgabeVon: aufgabeEcht,
        speichereAufgabe: speichereAufgabe, loescheAufgabe: loescheAufgabe, uid: uid,
        oeffneAufgabe: function (id) { oeffneAufgabe(id); }, auswahlAufbereiten: auswahlAufbereiten,
        neuZeichnen: function () { if (ansicht === 'einstellungen') render(); },
        modulAnlegen: function (name) {
          const m = { id: uid(), name: name, farbe: MODUL_FARBEN[module().length % MODUL_FARBEN.length], geaendert: jetztISO(), geloescht: false };
          daten.module.push(m); geaendert(); return m;
        }
      });
    } catch (e) { console.error(e); }
  }
  /* ---------- Was ist neu (erscheint einmal nach jedem Update) ---------- */
  // Bei jedem Update: VERSION erhöhen (gleiche Nummer wie der Cache in sw.js) und NEUIGKEITEN anpassen.
  const VERSION = 27.2;
  const NEUIGKEITEN = [
    ['🧭', 'Position der Navigationsleiste', 'Unter Einstellungen wählst du jetzt, wo die Leiste sitzt: Standard, Unten oder Rechts.']
  ];
  function neuDlgStil() {                       // gemeinsamer Stil für kleine Hinweis-Fenster (Neuigkeiten, Tour-Einladung)
    if (document.getElementById('neuDlgStil')) return;
    const stil = document.createElement('style');
    stil.id = 'neuDlgStil';
    stil.textContent =
      'dialog.neu-dlg{width:min(440px,92vw);max-width:92vw;height:fit-content;min-height:0;max-height:86vh;margin:auto;border-radius:26px;border:1px solid var(--kante)}' +
      '.neu-dlg .dlg-koerper{max-height:calc(86vh - 80px);padding-top:24px}' +
      '.neu-dlg h2{margin:0 0 2px;font-size:22px}' +
      '.neu-dlg .neu-unter{color:var(--muted);font-size:13.5px;margin-bottom:14px}' +
      '.neu-punkt{display:flex;gap:12px;align-items:flex-start;padding:8px 0}' +
      '.neu-punkt .neu-icon{font-size:22px;line-height:1.2;flex:0 0 28px;text-align:center}' +
      '.neu-punkt b{display:block;font-size:15px}' +
      '.neu-punkt span{display:block;color:var(--muted);font-size:13.5px;line-height:1.4}' +
      '.neu-dlg .dlg-fuss .btn{flex:1}';
    document.head.appendChild(stil);
  }
  function neuigkeitenZeigen() {
    let dlg = document.getElementById('dlgNeu');
    if (!dlg) {
      neuDlgStil();
      dlg = document.createElement('dialog');
      dlg.id = 'dlgNeu';
      dlg.className = 'neu-dlg';
      document.body.appendChild(dlg);
      dlg.addEventListener('click', function (e) {
        if (e.target === dlg || e.target.closest('[data-neu-ok]')) { dlg.close(); setTimeout(designWahlPruefen, 250); }
      });
    }
    dlg.innerHTML = '<div class="dlg-koerper"><h2>Neu im SchulPlaner</h2>' +
      '<div class="neu-unter">Version ' + VERSION + ' – du bist auf dem neuesten Stand.</div>' +
      NEUIGKEITEN.map(function (n) {
        return '<div class="neu-punkt"><div class="neu-icon">' + n[0] + '</div><div><b>' + esc(n[1]) + '</b><span>' + esc(n[2]) + '</span></div></div>';
      }).join('') + '</div>' +
      '<div class="dlg-fuss"><button class="btn btn-primary" data-neu-ok="1">Los geht’s</button></div>';
    if (!dlg.open) dlg.showModal();
    const ok = dlg.querySelector('[data-neu-ok]');
    if (ok) ok.blur();                                  // kein Fokusrahmen beim Öffnen
  }
  function neuigkeitenPruefen() {
    let gesehen = 0;
    try { gesehen = Number(localStorage.getItem('schulplaner.version')) || 0; } catch (e) { }
    if (gesehen >= VERSION) return;
    try { localStorage.setItem('schulplaner.version', String(VERSION)); } catch (e) { }
    if (document.querySelector('dialog[open]') || (window.Notizen && window.Notizen.offen())) return;
    neuigkeitenZeigen();
    return true;
  }

  render();
  navWischenEinrichten();
  // Tab-Leiste am Handy: beim Runterscrollen kleiner, beim Hochscrollen wieder groß (wie bei iOS)
  (function () {
    let letzt = window.scrollY;
    window.addEventListener('scroll', function () {
      const y = window.scrollY, d = y - letzt;
      if (tour || leistenPos() !== 'standard') { letzt = y; return; }             // während der Tour bleibt die Leiste ruhig
      if (Math.abs(d) < 8) return;
      document.documentElement.classList.toggle('leiste-klein', d > 0 && y > 80);
      letzt = y;
    }, { passive: true });
  })();
  // Nie zwei Fenster übereinander: Einladung zur Tour (nur Neulinge) → sonst „Was ist neu?“ → sonst Design-Auswahl
  setTimeout(function () { if (tourEinladungPruefen()) return; if (!neuigkeitenPruefen()) designWahlPruefen(); }, 700);
  setzeStatus(konfiguriert() ? 'blau' : 'grau', konfiguriert() ? 'Verbinde …' : 'Nur auf diesem Gerät');
  synchronisiere();
  setInterval(function () { tageswechselPruefen(); themaNachpruefen(); }, 20000);
  setInterval(function () { if (!document.hidden) synchronisiere(); }, 25000);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* egal */ });
    });
  }
}
