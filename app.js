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
      farbe: m.farbe || MODUL_FARBEN[i % MODUL_FARBEN.length],
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
  function themaAnwenden() {
    const wahl = themaWahl();
    const system = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dunkel = wahl === 'dunkel' || (wahl === 'auto' && system);
    document.documentElement.setAttribute('data-thema', dunkel ? 'dunkel' : 'hell');
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      m.setAttribute('content', dunkel ? '#080915' : '#E9ECF5');      // Farbe der Titelleiste
    });
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
      (dunkel ? 'Heller Modus' : 'Dunkler Modus') + '">' + (dunkel ? sonne : mond) + '</button>';
  }
  function themaNachpruefen() {
    if (themaWahl() !== 'auto') return;
    const vorher = document.documentElement.getAttribute('data-thema');
    themaAnwenden();
    if (document.documentElement.getAttribute('data-thema') !== vorher) render();
  }
  function themaSetzen(wahl) {
    try { localStorage.setItem('schulplaner.thema', wahl); } catch (e) { }
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
  function module() { return aktiv(daten.module); }
  function aufgaben() { return aktiv(daten.aufgaben); }
  function modulVon(id) {
    const m = daten.module.filter(function (x) { return x.id === id; })[0];
    return m && !m.geloescht ? m : null;
  }
  function modulName(id) { const m = modulVon(id); return m ? m.name : 'Ohne Modul'; }
  function modulFarbe(id) { const m = modulVon(id); return m ? m.farbe : '#9A9AA2'; }
  function aufgabeVon(id) { return daten.aufgaben.filter(function (t) { return t.id === id; })[0]; }
  function aufgabenAn(iso) { return aufgaben().filter(function (t) { return t.deadline === iso; }); }

  function speichereAufgabe(obj) {
    obj.geaendert = jetztISO();
    const vorhanden = aufgabeVon(obj.id);
    if (vorhanden) Object.assign(vorhanden, obj);
    else daten.aufgaben.push(Object.assign({ geloescht: false }, obj));
    geaendert();
  }
  function loescheAufgabe(id) {
    const t = aufgabeVon(id);
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
    return farbe ? '<span class="auswahl-punkt" style="background:' + farbe + '"></span>' : '';
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
    let knopf = '<button class="status-knopf" data-status="' + t.id + '" aria-label="Status ändern"></button>';
    if (fertig) knopf = '<button class="status-knopf fertig" data-status="' + t.id + '" aria-label="Wieder öffnen"></button>';
    else if (t.status === 'In Bearbeitung') knopf = '<button class="status-knopf arbeit" data-status="' + t.id + '"></button>';

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
          return '<div class="sub' + (s.erledigt ? ' ok' : '') + '" data-sub-karte="' + t.id + '|' + i + '">' +
            '<span class="sub-kreis"></span><span>' + esc(s.titel) + '</span></div>';
        }).join('') +
        ((t.unteraufgaben || []).length > 4 ? '<div style="color:var(--muted)">+ ' + ((t.unteraufgaben.length) - 4) + ' weitere</div>' : '') +
        '</div>';
    }
    return '<div class="karte' + (fertig ? ' fertig' : '') + '" data-karte="' + t.id + '">' +
      '<div class="karte-oben">' + knopf +
      '<div class="karte-titel">' + esc(t.titel) + '</div>' +
      '<span class="chip" style="color:' + PRIO_FARBE[t.prioritaet] + ';border-color:' + PRIO_FARBE[t.prioritaet] + '">' + esc(t.prioritaet) + '</span>' +
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
    else c.innerHTML = htmlEinstellungen();
    if (ansicht === 'alle') {
      const s = $('#suchfeld');
      if (s) { s.value = filter.suche; }
    }
    auswahlAufbereiten(c);
  }

  function htmlHeute() {
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
    h += heuteListe.length ? listeHTML(heuteListe, { datum: false })
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
            return '<span class="eintrag' + (istFertig(t) ? ' ok' : '') + '" title="' + esc(t.titel) + '">' +
              '<span class="mod-punkt" style="background:' + farbe + '"></span>' +
              '<span class="txt">' + esc(t.titel) + '</span></span>';
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
      h += '<button class="modul-karte" data-modul="' + m.id + '">' +
        '<div class="strich" style="background:' + m.farbe + '"></div><div class="inhalt">' +
        '<h3>' + esc(m.name) + '</h3>' +
        '<p>' + offen.length + ' offen · ' + fertig.length + ' erledigt</p>' +
        (ueber.length ? '<p class="warn">' + ueber.length + ' überfällig</p>' : '') +
        '<div class="balken" style="margin-left:0"><i style="width:' + anteil + '%;background:' + m.farbe + '"></i></div>' +
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
    const farbe = ohneModul ? '#9A9AA2' : m.farbe;
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
      (ohneModul ? '' : '<button class="btn" data-modul-bearbeiten="' + m.id + '">Bearbeiten</button>') +
      '<button class="btn btn-primary" data-neu="modul">' + ICON_PLUS + '<span>Neue Aufgabe</span></button></div></div>';
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
      '<div class="kopf-rechts">' + themaKnopf() + '<button class="btn btn-primary" data-neu="leer">' + ICON_PLUS + '<span>Neue Aufgabe</span></button></div></div>';
    h += '<div class="filter">' +
      '<input id="suchfeld" type="search" placeholder="Suche in Titel, Notizen, Unteraufgaben">' +
      '<select id="fltModul"><option value="">Alle Module</option>' +
      module().map(function (m) {
        return '<option value="' + m.id + '"' + (filter.modul === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>';
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
    h += '<div class="box"><h3>Erscheinungsbild</h3>' +
      '<p>„Automatisch" folgt dem Hell- oder Dunkelmodus deines Geräts.</p><div class="thema-wahl">' +
      [['auto', 'Automatisch'], ['hell', 'Hell'], ['dunkel', 'Dunkel']].map(function (o) {
        return '<button class="btn' + (wahl === o[0] ? ' aktiv' : '') + '" data-thema-wahl="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div></div>';

    h += '<div class="box"><h3>Daten</h3><p>Aktuell ' + anzahl + (anzahl === 1 ? ' Aufgabe' : ' Aufgaben') +
      ' und ' + module().length + ' Module auf diesem Gerät.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn" data-export="1">Als Datei sichern</button>' +
      '<button class="btn" data-import="1">Datei einlesen (auch daten.json)</button></div>' +
      '<input type="file" id="importDatei" accept=".json,application/json" style="display:none"></div>';

    h += '<div class="box"><h3>Hinweis</h3><p>Alles wird sofort auf dem Gerät gespeichert und funktioniert auch ohne Internet. ' +
      'Sobald wieder Verbindung besteht, wird automatisch abgeglichen. Wird dieselbe Aufgabe auf beiden Geräten geändert, ' +
      'gewinnt die zuletzt gespeicherte Version.</p></div>';
    return h + '</div>';
  }

  /* ---------- Navigation ---------- */
  const NAV = [
    { id: 'heute', text: 'Tagesansicht', kurz: 'Heute', icon: 'M4 4h16v16H4z M4 9h16 M9 4v16' },
    { id: 'kalender', text: 'Kalenderansicht', kurz: 'Kalender', icon: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4' },
    { id: 'module', text: 'Modulansicht', kurz: 'Module', icon: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z' },
    { id: 'alle', text: 'Alle Aufgaben', kurz: 'Alle', icon: 'M4 6h16 M4 12h16 M4 18h16' },
    { id: 'einstellungen', text: 'Einstellungen', kurz: 'Sync', icon: 'M12 8a4 4 0 100 8 4 4 0 000-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3' }
  ];
  function zeichneNav() {
    $('#nav').innerHTML = NAV.map(function (n) {
      const svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
        n.icon.split(' M').map(function (p, i) { return '<path d="' + (i ? 'M' + p : p) + '"/>'; }).join('') + '</svg>';
      return '<button class="nav-item' + (ansicht === n.id ? ' aktiv' : '') + '" data-ansicht="' + n.id + '">' +
        svg + '<span class="lang">' + n.text + '</span><span class="kurz">' + n.kurz + '</span></button>';
    }).join('');
  }
  function zeichneSeitenModule() {
    const ziel = $('#seitenModule');
    if (!ziel) return;
    ziel.innerHTML = module().map(function (m) {
      return '<button class="seiten-modul" data-seite-modul="' + m.id + '">' +
        '<span class="mod-punkt" style="background:' + m.farbe + '"></span>' + esc(m.name) + '</button>';
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
      if ((el = ziel('data-thema-wahl'))) { themaSetzen(el.getAttribute('data-thema-wahl')); return; }
      if (ziel('data-thema-umschalten')) { themaSetzen(istDunkel() ? 'hell' : 'dunkel'); return; }
      if (ziel('data-sync-jetzt')) { synchronisiere(true); return; }
      if (ziel('data-export')) { exportiere(); return; }
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
    $('#neuBtnSeite').addEventListener('click', function () { oeffneAufgabe(null, { datum: ansicht === 'kalender' ? kalGewaehlt : heute }); });
    $('#fabNeu').addEventListener('click', function () { oeffneAufgabe(null, { datum: ansicht === 'kalender' ? kalGewaehlt : heute }); });

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); oeffneAufgabe(null, { datum: heute }); }
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

  /* ---------- Start ---------- */
  themaAnwenden();
  ladeLokal();
  verdrahte();
  render();
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
