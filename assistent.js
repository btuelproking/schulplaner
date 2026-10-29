/* SchulPlaner – KI-Assistent (Google Gemini)
   Der API-Schlüssel bleibt nur auf diesem Gerät (localStorage) und wird nie mit abgeglichen. */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  const CFG_KEY = 'schulplaner.ki', VERLAUF_KEY = 'schulplaner.ki.verlauf';
  const MODELLE = [
    ['gemini-3.8-flash', 'Gemini 3.8 Flash (empfohlen)'],
    ['gemini-3.6-flash', 'Gemini 3.6 Flash'],
    ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite (schnell, sparsam)']
  ];
  const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const WT = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const VORSCHLAEGE = ['Was steht diese Woche an?', 'Was ist überfällig?', 'Hilf mir, das Referat zu planen', 'Trag ein: Mathe HÜ S. 84 Nr. 3–7 bis Donnerstag'];

  let K = null, offen = false, laeuft = false, abbrechen = null;
  let el = null;
  let anhaenge = [];                            // Bilder, die mit der nächsten Nachricht mitgehen
  const MAX_BILDER = 4;
  let verlauf = { inhalte: [], anzeige: [] };   // inhalte: Gemini-Format, anzeige: was im Chat steht

  /* ---------- Hilfen ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function lesen(k, std) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : std; } catch (e) { return std; } }
  function schreiben(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function cfg() { return lesen(CFG_KEY, {}); }
  function cfgSetzen(c) { schreiben(CFG_KEY, c); }
  function modell() { const m = cfg().modell; return MODELLE.some(function (x) { return x[0] === m; }) ? m : MODELLE[0][0]; }
  function zahl2(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + zahl2(d.getMonth() + 1) + '-' + zahl2(d.getDate()); }
  function vonIso(s) { const t = String(s).split('-'); return new Date(Number(t[0]), Number(t[1]) - 1, Number(t[2])); }
  function schoenDatum(s) {
    if (!s) return 'ohne Datum';
    const d = vonIso(s);
    return WT[d.getDay()].slice(0, 2) + ', ' + zahl2(d.getDate()) + '.' + zahl2(d.getMonth() + 1) + '.';
  }
  function gueltigesDatum(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
    const d = vonIso(s);
    return !isNaN(d) && iso(d) === s;
  }
  function uid() { return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function verlaufLaden() {
    const v = lesen(VERLAUF_KEY, null);
    if (v && Array.isArray(v.inhalte) && Array.isArray(v.anzeige)) verlauf = v;
  }
  function verlaufSpeichern() {
    // nur an Grenzen zwischen Fragen kürzen, damit Funktionsaufruf und Antwort zusammenbleiben
    let i = verlauf.inhalte;
    while (i.length > 40) {
      let schnitt = -1;
      for (let k = 1; k < i.length; k++) if (i[k].role === 'user' && i[k].parts && i[k].parts.some(function (p) { return p.text; })) { schnitt = k; break; }
      if (schnitt < 0) break;
      i = i.slice(schnitt);
    }
    verlauf.inhalte = i;
    if (verlauf.anzeige.length > 60) verlauf.anzeige = verlauf.anzeige.slice(-60);
    // Bilder bleiben nur bis zum Neuladen im Gespräch, gespeichert wird ein Platzhalter
    schreiben(VERLAUF_KEY, {
      inhalte: i.map(function (c) {
        if (!c.parts || !c.parts.some(function (p) { return p.inlineData; })) return c;
        return { role: c.role, parts: c.parts.map(function (p) { return p.inlineData ? { text: '[Bild – nicht mehr verfügbar]' } : p; }) };
      }),
      anzeige: verlauf.anzeige
    });
  }

  /* ---------- Was der Assistent über die App weiß ---------- */
  function modulName(id) { const m = id ? K.modulVon(id) : null; return m ? m.name : 'Ohne Modul'; }
  function modulFinden(name) {
    if (!name) return { id: null };
    const n = String(name).trim().toLowerCase();
    if (!n || n === 'ohne modul' || n === 'keins' || n === 'kein') return { id: null };
    const ms = K.module();
    let m = ms.find(function (x) { return x.name.toLowerCase() === n; }) ||
      ms.find(function (x) { return x.name.toLowerCase().indexOf(n) === 0 || n.indexOf(x.name.toLowerCase()) === 0; });
    if (!m && n.length >= 3) m = ms.find(function (x) { return x.name.toLowerCase().indexOf(n) >= 0; });
    if (m) return { id: m.id };
    return { fehler: 'Modul „' + name + '“ gibt es nicht. Vorhandene Module: ' + ms.map(function (x) { return x.name; }).join(', ') + '. Frag nach, ob es angelegt werden soll, oder nimm ein vorhandenes.' };
  }
  function kurz(t) {
    const o = { id: t.id, titel: t.titel, modul: modulName(t.modul_id), deadline: t.deadline || null, status: t.status, prioritaet: t.prioritaet };
    if (t.notizen) o.notizen = t.notizen.length > 300 ? t.notizen.slice(0, 300) + '…' : t.notizen;
    if (t.unteraufgaben && t.unteraufgaben.length) o.unteraufgaben = t.unteraufgaben.map(function (s) { return (s.erledigt ? '[x] ' : '[ ] ') + s.titel; });
    return o;
  }
  function systemText() {
    const h = new Date(), heute = iso(h);
    const tage = [];
    for (let i = 0; i < 21; i++) { const d = new Date(h.getFullYear(), h.getMonth(), h.getDate() + i); tage.push(WT[d.getDay()] + ' ' + iso(d) + (i === 0 ? ' (heute)' : i === 1 ? ' (morgen)' : '')); }
    const ms = K.module().map(function (m) { return m.name; });
    return [
      'Du bist der persönliche Assistent im „SchulPlaner“ eines Schülers (österreichische HTL). Antworte auf Deutsch, freundlich, kurz und konkret, duze den Schüler.',
      'Heute ist ' + WT[h.getDay()] + ', ' + heute + ', ' + zahl2(h.getHours()) + ':' + zahl2(h.getMinutes()) + ' Uhr.',
      'Kalender der nächsten Tage (nutze ihn für „morgen“, „Donnerstag“, „nächste Woche“ usw., rechne nie selbst Wochentage aus): ' + tage.join('; ') + '.',
      '„Nächsten Freitag“ heißt der Freitag der kommenden Woche, wenn heute schon Freitag oder später ist, sonst der nächste Freitag.',
      'Module: ' + (ms.length ? ms.join(', ') : '(keine)') + '. Status-Werte: Noch nicht angefangen, In Bearbeitung, Abgeschlossen. Prioritäten: Hoch, Mittel, Niedrig.',
      'Regeln:',
      '- Nutze die Werkzeuge, um Aufgaben zu lesen, anzulegen und zu ändern. Erfinde keine Aufgaben oder IDs; hol sie dir mit aufgaben_auflisten.',
      '- Wenn der Schüler etwas einträgt („HÜ“, „Test“, „Referat“ …), lege es direkt an, ohne nachzufragen, sofern Titel klar ist. Ordne das passende Modul zu (Mathe, Deutsch, Englisch …). Fehlt ein Datum, lege ohne Datum an.',
      '- Mehrere Dinge in einer Nachricht = mehrere Aufgaben. Prüfe vorher mit aufgaben_auflisten, ob es die Aufgabe schon gibt, und lege nichts doppelt an.',
      '- Titel kurz und klar (z. B. „HÜ S. 84 Nr. 3–7“), Details in notizen. Für Tests/Schularbeiten Priorität Hoch.',
      '- Beim Strukturieren großer Aufgaben: sinnvolle Unteraufgaben anlegen.',
      '- Löschen nur, wenn der Schüler es ausdrücklich will.',
      '- Fasse nach Änderungen in einem Satz zusammen, was du getan hast. Die App zeigt die Änderungen zusätzlich an.',
      '- Schickt der Schüler ein Bild (z. B. Screenshot einer Aufgabe aus Moodle oder Teams, Foto vom Heft oder der Tafel), lies es genau: Fach, was zu tun ist (Seiten, Nummern, Thema) und Abgabedatum. Trag jede Aufgabe darauf mit aufgabe_anlegen ins passende Modul ein (vorher mit aufgaben_auflisten auf Duplikate prüfen), wichtige Details in notizen. Steht beim Datum kein Jahr, nimm das nächste passende Datum. Ist auf dem Bild keine Aufgabe, beantworte einfach die Frage dazu.',
      '- Bei Stofffragen (Mathe, Deutsch …) erkläre verständlich mit Beispiel. Bei Hausübungen: hilf beim Verstehen, statt nur die Lösung hinzuschreiben.',
      '- Formatierung: nur einfacher Text, **fett** und Listen mit „- “. Keine Tabellen.'
    ].join('\n');
  }

  /* ---------- Werkzeuge ---------- */
  const WERKZEUGE = [
    {
      name: 'aufgaben_auflisten',
      description: 'Listet Aufgaben aus dem SchulPlaner. Ohne Filter: alle offenen Aufgaben.',
      parameters: {
        type: 'object', properties: {
          filter: { type: 'string', enum: ['offen', 'ueberfaellig', 'erledigt', 'alle'], description: 'Welche Aufgaben. Standard: offen' },
          modul: { type: 'string', description: 'Nur dieses Modul (Name)' },
          von: { type: 'string', description: 'Fällig ab Datum YYYY-MM-DD' },
          bis: { type: 'string', description: 'Fällig bis Datum YYYY-MM-DD' },
          suche: { type: 'string', description: 'Suchbegriff in Titel und Notizen' }
        }
      }
    },
    {
      name: 'aufgabe_anlegen',
      description: 'Legt eine neue Aufgabe an.',
      parameters: {
        type: 'object', properties: {
          titel: { type: 'string', description: 'Kurzer Titel' },
          modul: { type: 'string', description: 'Name des Moduls, z. B. Mathe. Leer = ohne Modul' },
          deadline: { type: 'string', description: 'Fälligkeit YYYY-MM-DD, leer wenn unbekannt' },
          prioritaet: { type: 'string', enum: ['Hoch', 'Mittel', 'Niedrig'] },
          notizen: { type: 'string' },
          unteraufgaben: { type: 'array', items: { type: 'string' }, description: 'Teilschritte' }
        }, required: ['titel']
      }
    },
    {
      name: 'aufgabe_aendern',
      description: 'Ändert eine vorhandene Aufgabe. Nur angegebene Felder werden geändert.',
      parameters: {
        type: 'object', properties: {
          id: { type: 'string' },
          titel: { type: 'string' },
          modul: { type: 'string' },
          deadline: { type: 'string', description: 'YYYY-MM-DD, oder "keins" zum Entfernen' },
          prioritaet: { type: 'string', enum: ['Hoch', 'Mittel', 'Niedrig'] },
          status: { type: 'string', enum: ['Noch nicht angefangen', 'In Bearbeitung', 'Abgeschlossen'] },
          notizen: { type: 'string', description: 'Ersetzt die Notizen' },
          unteraufgaben_hinzufuegen: { type: 'array', items: { type: 'string' } },
          unteraufgaben_erledigt: { type: 'array', items: { type: 'string' }, description: 'Titel von Unteraufgaben, die abgehakt werden' }
        }, required: ['id']
      }
    },
    {
      name: 'aufgabe_loeschen',
      description: 'Löscht eine Aufgabe. Nur auf ausdrücklichen Wunsch. Der Schüler muss in der App bestätigen.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
    },
    {
      name: 'modul_anlegen',
      description: 'Legt ein neues Modul (Fach) an.',
      parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
    },
    {
      name: 'notizen_durchsuchen',
      description: 'Durchsucht die Mitschriften (Handschrift, sofern schon von der KI gelesen, Textfelder, PDF-Text) nach einem Begriff. Liefert Notizbuch, Seite und Textauszug.',
      parameters: { type: 'object', properties: { suche: { type: 'string' } }, required: ['suche'] }
    },
    {
      name: 'notizbuecher_auflisten',
      description: 'Listet die Notizbücher (Mitschriften) auf diesem Gerät mit Modul und Seitenzahl.',
      parameters: { type: 'object', properties: {} }
    }
  ];

  function aufgabenFiltern(a) {
    a = a || {};
    const heute = iso(new Date());
    let liste = K.aufgaben();
    const f = a.filter || 'offen';
    if (f === 'offen') liste = liste.filter(function (t) { return t.status !== 'Abgeschlossen'; });
    else if (f === 'erledigt') liste = liste.filter(function (t) { return t.status === 'Abgeschlossen'; });
    else if (f === 'ueberfaellig') liste = liste.filter(function (t) { return t.status !== 'Abgeschlossen' && t.deadline && t.deadline < heute; });
    if (a.modul) { const m = modulFinden(a.modul); if (m.fehler) return { fehler: m.fehler }; liste = liste.filter(function (t) { return (t.modul_id || null) === m.id; }); }
    if (a.von) liste = liste.filter(function (t) { return t.deadline && t.deadline >= a.von; });
    if (a.bis) liste = liste.filter(function (t) { return t.deadline && t.deadline <= a.bis; });
    if (a.suche) { const q = String(a.suche).toLowerCase(); liste = liste.filter(function (t) { return (t.titel + ' ' + (t.notizen || '')).toLowerCase().indexOf(q) >= 0; }); }
    liste = liste.slice().sort(function (x, y) { return (x.deadline || '9999') < (y.deadline || '9999') ? -1 : (x.deadline || '9999') > (y.deadline || '9999') ? 1 : 0; });
    return { anzahl: liste.length, aufgaben: liste.slice(0, 80).map(kurz), gekuerzt: liste.length > 80 };
  }
  function kopie(o) { return JSON.parse(JSON.stringify(o)); }

  async function werkzeugAusfuehren(name, a, aktionen) {
    a = a || {};
    if (name === 'aufgaben_auflisten') return aufgabenFiltern(a);
    if (name === 'notizen_durchsuchen') {
      if (!window.Notizen || !window.Notizen.suchen) return { fehler: 'Notizbücher nicht verfügbar' };
      const t = await window.Notizen.suchen(String(a.suche || ''), 15);
      return { treffer: t.treffer.map(function (x) { return { notizbuch: x.titel, seite: x.seite + 1, auszug: x.auszug }; }), noch_nicht_gelesene_seiten: t.ungelesen,
        hinweis: t.ungelesen ? 'Manche handschriftlichen Seiten sind noch nicht von der KI gelesen. Der Schüler kann in der Notizbuch-Ansicht bei der Suche „Handschrift lesen lassen“ tippen.' : undefined };
    }
    if (name === 'notizbuecher_auflisten') {
      const b = window.Notizen && window.Notizen._intern ? window.Notizen._intern.buecher : [];
      return { notizbuecher: b.map(function (x) { return { titel: x.titel, modul: modulName(x.modul_id), seiten: x.anzahl || 1 }; }) };
    }
    if (name === 'modul_anlegen') {
      const n = String(a.name || '').trim();
      if (!n) return { fehler: 'Name fehlt' };
      const da = K.module().find(function (m) { return m.name.toLowerCase() === n.toLowerCase(); });
      if (da) return { ok: true, hinweis: 'Modul gibt es schon', name: da.name };
      const m = K.modulAnlegen(n);
      aktionen.push({ art: 'modul', text: 'Modul angelegt: ' + m.name });
      return { ok: true, name: m.name };
    }
    if (name === 'aufgabe_anlegen') {
      const titel = String(a.titel || '').trim();
      if (!titel) return { fehler: 'Titel fehlt' };
      const m = modulFinden(a.modul);
      if (m.fehler) return { fehler: m.fehler };
      let deadline = a.deadline ? String(a.deadline).trim() : '';
      if (deadline && !gueltigesDatum(deadline)) return { fehler: 'Datum muss YYYY-MM-DD sein' };
      const doppelt = K.aufgaben().find(function (t) { return t.titel.toLowerCase() === titel.toLowerCase() && (t.modul_id || null) === m.id && (t.deadline || '') === deadline && t.status !== 'Abgeschlossen'; });
      if (doppelt) return { ok: true, hinweis: 'Diese Aufgabe gibt es schon – nicht doppelt angelegt.', id: doppelt.id };
      const t = {
        id: K.uid(), titel: titel, modul_id: m.id, prioritaet: ['Hoch', 'Mittel', 'Niedrig'].indexOf(a.prioritaet) >= 0 ? a.prioritaet : 'Mittel',
        status: 'Noch nicht angefangen', deadline: deadline || null, notizen: String(a.notizen || '').trim(),
        unteraufgaben: (Array.isArray(a.unteraufgaben) ? a.unteraufgaben : []).map(function (s) { return String(s).trim(); }).filter(Boolean)
          .map(function (s) { return { id: K.uid(), titel: s, erledigt: false }; })
      };
      K.speichereAufgabe(t);
      aktionen.push({ art: 'neu', id: t.id, text: 'Neu: ' + t.titel + ' · ' + modulName(t.modul_id) + ' · ' + schoenDatum(t.deadline) });
      return { ok: true, id: t.id };
    }
    if (name === 'aufgabe_aendern') {
      const t = K.aufgabeVon(a.id);
      if (!t || t.geloescht) return { fehler: 'Aufgabe mit dieser ID nicht gefunden. Erst aufgaben_auflisten aufrufen.' };
      const vorher = kopie(t), neu = kopie(t);
      if (a.titel) neu.titel = String(a.titel).trim() || neu.titel;
      if (a.modul !== undefined && a.modul !== null && a.modul !== '') { const m = modulFinden(a.modul); if (m.fehler) return { fehler: m.fehler }; neu.modul_id = m.id; }
      if (a.deadline !== undefined && a.deadline !== null && a.deadline !== '') {
        const d = String(a.deadline).trim();
        if (/^(keins|kein|none|null|-)$/i.test(d)) neu.deadline = null;
        else if (!gueltigesDatum(d)) return { fehler: 'Datum muss YYYY-MM-DD sein' };
        else neu.deadline = d;
      }
      if (['Hoch', 'Mittel', 'Niedrig'].indexOf(a.prioritaet) >= 0) neu.prioritaet = a.prioritaet;
      if (['Noch nicht angefangen', 'In Bearbeitung', 'Abgeschlossen'].indexOf(a.status) >= 0) {
        if (a.status === 'Abgeschlossen' && neu.status !== 'Abgeschlossen') neu.status_vorher = neu.status;
        neu.status = a.status;
      }
      if (typeof a.notizen === 'string') neu.notizen = a.notizen.trim();
      neu.unteraufgaben = (neu.unteraufgaben || []).slice();
      (Array.isArray(a.unteraufgaben_hinzufuegen) ? a.unteraufgaben_hinzufuegen : []).forEach(function (s) {
        s = String(s).trim();
        if (s && !neu.unteraufgaben.some(function (x) { return x.titel.toLowerCase() === s.toLowerCase(); })) neu.unteraufgaben.push({ id: K.uid(), titel: s, erledigt: false });
      });
      (Array.isArray(a.unteraufgaben_erledigt) ? a.unteraufgaben_erledigt : []).forEach(function (s) {
        const x = neu.unteraufgaben.find(function (u) { return u.titel.toLowerCase() === String(s).trim().toLowerCase(); });
        if (x) x.erledigt = true;
      });
      K.speichereAufgabe(neu);
      aktionen.push({ art: 'geaendert', id: t.id, vorher: vorher, text: 'Geändert: ' + neu.titel + ' · ' + schoenDatum(neu.deadline) + (neu.status === 'Abgeschlossen' ? ' · erledigt' : '') });
      return { ok: true };
    }
    if (name === 'aufgabe_loeschen') {
      const t = K.aufgabeVon(a.id);
      if (!t || t.geloescht) return { fehler: 'Aufgabe nicht gefunden' };
      const ok = await bestaetigen('„' + t.titel + '“ (' + modulName(t.modul_id) + ', ' + schoenDatum(t.deadline) + ') löschen?');
      if (!ok) return { abgelehnt: true, hinweis: 'Der Schüler hat das Löschen abgelehnt.' };
      const vorher = kopie(t);
      K.loescheAufgabe(t.id);
      aktionen.push({ art: 'geloescht', id: t.id, vorher: vorher, text: 'Gelöscht: ' + t.titel });
      return { ok: true };
    }
    return { fehler: 'Unbekanntes Werkzeug ' + name };
  }
  function bestaetigen(text) {
    return new Promise(function (ok) {
      const box = document.createElement('div');
      box.className = 'ki-frage';
      box.innerHTML = '<div>' + esc(text) + '</div><div class="ki-frage-knoepfe"><button class="btn btn-klein btn-danger" data-j="1">Löschen</button><button class="btn btn-klein" data-j="0">Behalten</button></div>';
      el.liste.appendChild(box);
      runter();
      box.addEventListener('click', function (e) {
        const b = e.target.closest('[data-j]');
        if (!b) return;
        box.remove();
        ok(b.getAttribute('data-j') === '1');
      });
    });
  }
  function rueckgaengig(aktion) {
    if (aktion.art === 'neu') K.loescheAufgabe(aktion.id);
    else if (aktion.art === 'geaendert' || aktion.art === 'geloescht') { const v = kopie(aktion.vorher); v.geloescht = false; K.speichereAufgabe(v); }
  }

  /* ---------- Gemini ---------- */
  async function anfrage(inhalte, signal) {
    return rohAnfrage({
      systemInstruction: { parts: [{ text: systemText() }] },
      contents: inhalte,
      tools: [{ functionDeclarations: WERKZEUGE }]
    }, signal);
  }
  async function rohAnfrage(body, signal) {
    const c = cfg();
    if (!c.schluessel) throw new Error('Für KI-Funktionen bitte zuerst unter Einstellungen → KI-Assistent deinen Gemini-Schlüssel eintragen.');
    let r;
    try {
      r = await fetch(API + encodeURIComponent(modell()) + ':generateContent', {
        method: 'POST', signal: signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.schluessel },
        body: JSON.stringify(body)
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new Error('Keine Verbindung zu Gemini. Bist du online?');
    }
    let j = null;
    try { j = await r.json(); } catch (e) { }
    if (!r.ok) {
      const m = j && j.error && j.error.message ? j.error.message : '';
      if (r.status === 400 && /api key|API_KEY/i.test(m)) throw new Error('Der API-Schlüssel ist ungültig. Prüfe ihn in den Einstellungen → KI-Assistent.');
      if (r.status === 403) throw new Error('Zugriff verweigert (403). Ist der Schlüssel für die „Generative Language API“ / Gemini freigeschaltet und für diese Website erlaubt?' + (m ? ' Google sagt: ' + m : ''));
      if (r.status === 404) throw new Error('Das Modell „' + modell() + '“ ist für deinen Schlüssel nicht verfügbar. Wähle in den Einstellungen ein anderes Modell.');
      if (r.status === 429) { const e = new Error('Zu viele Anfragen – das Limit deines Schlüssels ist gerade erreicht. Warte kurz und versuch es nochmal.'); e.status = 429; throw e; }
      if (r.status === 402) throw new Error('Dein Gemini-Guthaben ist aufgebraucht (402). Nimm einen Schlüssel aus einem Projekt ohne Zahlungskonto (Gratis-Tarif) oder lade Guthaben auf.');
      throw new Error('Gemini meldet einen Fehler (' + r.status + ')' + (m ? ': ' + m : ''));
    }
    const kand = j && j.candidates && j.candidates[0];
    if (!kand || !kand.content || !kand.content.parts) {
      if (j && j.promptFeedback && j.promptFeedback.blockReason) throw new Error('Die Anfrage wurde von Google blockiert (' + j.promptFeedback.blockReason + ').');
      if (kand && kand.finishReason) throw new Error('Keine Antwort erhalten (' + kand.finishReason + ').');
      throw new Error('Keine Antwort erhalten.');
    }
    if (!kand.content.role) kand.content.role = 'model';
    return kand.content;
  }

  async function senden(text, bilder) {
    text = String(text || '').trim();
    bilder = bilder || [];
    if ((!text && !bilder.length) || laeuft) return;
    if (!cfg().schluessel) { hinweisOhneSchluessel(); return; }
    laeuft = true;
    knoepfe();
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    abbrechen = ctrl;
    const frage = text || (bilder.length > 1 ? 'Trag die Aufgaben von diesen Bildern ein.' : 'Trag die Aufgabe von diesem Bild ein.');
    verlauf.anzeige.push(bilder.length ? { wer: 'ich', text: text, bilder: bilder.map(function (b) { return b.vorschau; }) } : { wer: 'ich', text: text });
    const startLaenge = verlauf.inhalte.length;
    verlauf.inhalte.push({ role: 'user', parts: bilder.map(function (b) { return { inlineData: { mimeType: 'image/jpeg', data: b.daten } }; }).concat([{ text: frage }]) });
    zeichnen(true);
    const aktionen = [];
    try {
      for (let runde = 0; runde < 8; runde++) {
        const inhalt = await anfrage(verlauf.inhalte, ctrl && ctrl.signal);
        verlauf.inhalte.push(inhalt);
        const aufrufe = inhalt.parts.filter(function (p) { return p.functionCall; });
        if (!aufrufe.length) {
          const antwort = inhalt.parts.filter(function (p) { return p.text && !p.thought; }).map(function (p) { return p.text; }).join('').trim();
          verlauf.anzeige.push({ wer: 'ki', text: antwort || (aktionen.length ? 'Erledigt.' : '…'), aktionen: aktionen });
          break;
        }
        const antworten = [];
        for (const p of aufrufe) {
          let erg;
          try { erg = await werkzeugAusfuehren(p.functionCall.name, p.functionCall.args, aktionen); }
          catch (e) { erg = { fehler: e.message || String(e) }; }
          const teil = { functionResponse: { name: p.functionCall.name, response: erg } };
          if (p.functionCall.id) teil.functionResponse.id = p.functionCall.id;
          antworten.push(teil);
        }
        verlauf.inhalte.push({ role: 'user', parts: antworten });
        if (runde === 7) verlauf.anzeige.push({ wer: 'ki', text: 'Ich habe abgebrochen, weil es zu viele Schritte wurden.', aktionen: aktionen });
      }
    } catch (e) {
      if (e && e.name === 'AbortError') {
        verlauf.anzeige.push({ wer: 'fehler', text: 'Abgebrochen.' });
      } else {
        verlauf.anzeige.push({ wer: 'fehler', text: e && e.message ? e.message : String(e) });
      }
      if (aktionen.length) verlauf.anzeige.push({ wer: 'ki', text: 'Bis dahin erledigt:', aktionen: aktionen });
      // unvollständige Runde aus dem Verlauf nehmen, damit der nächste Versuch sauber startet
      verlauf.inhalte = verlauf.inhalte.slice(0, startLaenge);
      if (bilder.length && !anhaenge.length) { anhaenge = bilder; anhaengeZeichnen(); }   // Bilder zum erneuten Senden zurücklegen
      verlauf.inhalte.push({ role: 'user', parts: [{ text: frage + (bilder.length ? ' [Bild]' : '') }] }, { role: 'model', parts: [{ text: aktionen.length
        ? '(Dabei trat ein Fehler auf. Schon erledigt: ' + aktionen.map(function (a) { return a.text; }).join('; ') + ')' : '(Fehler, keine Antwort)' }] });
    } finally {
      laeuft = false; abbrechen = null;
      verlaufSpeichern();
      zeichnen(true);
      knoepfe();
    }
  }

  /* Allgemeiner Aufruf für andere Teile der App (Notizbücher): Text oder JSON zurück */
  async function geminiAufruf(o) {
    const body = { contents: [{ role: 'user', parts: o.teile }] };
    if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
    if (o.schema) body.generationConfig = { responseMimeType: 'application/json', responseSchema: o.schema };
    let versuch = 0;
    for (;;) {
      try {
        const inhalt = await rohAnfrage(body, o.signal);
        const text = inhalt.parts.filter(function (p) { return p.text && !p.thought; }).map(function (p) { return p.text; }).join('').trim();
        if (!o.schema) return text;
        try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
        catch (e) { throw new Error('Die KI-Antwort war nicht lesbar. Bitte nochmal versuchen.'); }
      } catch (e) {
        if (e && e.status === 429 && versuch < 3) {
          versuch++;
          if (o.warten) o.warten(versuch);
          await new Promise(function (ok) { setTimeout(ok, 12000 * versuch); });
          continue;
        }
        throw e;
      }
    }
  }

  /* ---------- Darstellung ---------- */
  function formatieren(text) {
    const zeilen = esc(text).split('\n');
    let html = '', liste = false;
    zeilen.forEach(function (z) {
      const m = z.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (m) { if (!liste) { html += '<ul>'; liste = true; } html += '<li>' + m[1] + '</li>'; return; }
      if (liste) { html += '</ul>'; liste = false; }
      html += z.trim() ? '<p>' + z + '</p>' : '';
    });
    if (liste) html += '</ul>';
    return html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  function zeichnen(nachUnten) {
    if (!el) return;
    let h = '';
    if (!verlauf.anzeige.length) {
      h = '<div class="ki-leer"><div class="ki-logo">' + FUNKE + '</div><b>Hallo! Wie kann ich helfen?</b>' +
        '<span>Ich kann Aufgaben eintragen, ändern, planen und Fragen zum Stoff beantworten. Schick mir auch einen Screenshot einer Aufgabe – ich trag sie ein.</span>' +
        '<div class="ki-vorschlaege">' + VORSCHLAEGE.map(function (v) { return '<button data-ki-vorschlag="' + esc(v) + '">' + esc(v) + '</button>'; }).join('') + '</div></div>';
    }
    verlauf.anzeige.forEach(function (m, i) {
      if (m.wer === 'ich') {
        if (m.bilder && m.bilder.length) h += '<div class="ki-bilder">' + m.bilder.map(function (b) { return '<img src="' + esc(b) + '" alt="Bild">'; }).join('') + '</div>';
        if (m.text) h += '<div class="ki-msg ki-ich">' + esc(m.text).replace(/\n/g, '<br>') + '</div>';
      }
      else if (m.wer === 'fehler') h += '<div class="ki-msg ki-fehler">' + esc(m.text) + '</div>';
      else {
        h += '<div class="ki-msg ki-ki">' + formatieren(m.text);
        if (m.aktionen && m.aktionen.length) {
          h += '<div class="ki-aktionen">' + m.aktionen.map(function (a, k) {
            return '<div class="ki-aktion' + (a.rueck ? ' ki-zurueck' : '') + '">' +
              '<span class="ki-aktion-text"' + (a.id && a.art !== 'geloescht' && !a.rueck ? ' data-ki-oeffnen="' + esc(a.id) + '"' : '') + '>' + esc(a.text) + '</span>' +
              (a.art !== 'modul' && !a.rueck ? '<button data-ki-rueck="' + i + ':' + k + '">Rückgängig</button>' : (a.rueck ? '<em>rückgängig gemacht</em>' : '')) + '</div>';
          }).join('') + '</div>';
        }
        h += '</div>';
      }
    });
    if (laeuft) h += '<div class="ki-msg ki-ki ki-tippt"><span></span><span></span><span></span></div>';
    el.liste.innerHTML = h;
    if (nachUnten) runter();
  }
  function runter() { if (el) el.liste.scrollTop = el.liste.scrollHeight; }

  /* ---------- Bilder (Screenshots von Aufgaben) ---------- */
  function bildVerkleinern(datei, max, qualitaet) {
    return new Promise(function (ok, fehler) {
      const url = URL.createObjectURL(datei), img = new Image();
      img.onload = function () {
        const f = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * f)); c.height = Math.max(1, Math.round(img.naturalHeight * f));
        const x = c.getContext('2d');
        x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height);         // durchsichtige Screenshots auf Weiß
        x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', qualitaet));
      };
      img.onerror = function () { URL.revokeObjectURL(url); fehler(new Error('Das Bild konnte nicht geöffnet werden.')); };
      img.src = url;
    });
  }
  async function bilderDazu(dateien) {
    const liste = Array.prototype.filter.call(dateien || [], function (d) { return d && /^image\//.test(d.type); });
    if (!liste.length) return;
    let zuViele = false;
    for (const d of liste) {
      if (anhaenge.length >= MAX_BILDER) { zuViele = true; break; }
      try {
        const gross = await bildVerkleinern(d, 1600, 0.85), klein = await bildVerkleinern(d, 240, 0.7);
        anhaenge.push({ daten: gross.slice(gross.indexOf(',') + 1), vorschau: klein });
      } catch (e) { verlauf.anzeige.push({ wer: 'fehler', text: e.message }); zeichnen(true); }
    }
    if (zuViele) { verlauf.anzeige.push({ wer: 'fehler', text: 'Höchstens ' + MAX_BILDER + ' Bilder pro Nachricht.' }); zeichnen(true); }
    anhaengeZeichnen();
  }
  function anhaengeZeichnen() {
    if (!el) return;
    el.anhaenge.hidden = !anhaenge.length;
    el.anhaenge.innerHTML = anhaenge.map(function (a, i) {
      return '<div class="ki-anhang"><img src="' + esc(a.vorschau) + '" alt="Bild ' + (i + 1) + '">' +
        '<button type="button" data-ki-anhang-weg="' + i + '" aria-label="Bild entfernen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg></button></div>';
    }).join('');
    el.eingabe.placeholder = anhaenge.length ? 'Nachricht dazu (optional)' : 'Frag mich oder trag etwas ein …';
  }
  function knoepfe() {
    if (!el) return;
    el.senden.hidden = laeuft; el.stopp.hidden = !laeuft;
    el.eingabe.disabled = false;
  }
  function hinweisOhneSchluessel() {
    verlauf.anzeige.push({ wer: 'fehler', text: 'Es ist noch kein API-Schlüssel eingetragen. Öffne Einstellungen → KI-Assistent und füge deinen Gemini-Schlüssel ein.' });
    zeichnen(true);
  }

  const FUNKE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.5 3.9 1.6 6.2 3 7.6 1.4 1.4 3.7 2.5 7.5 2.9-3.8.5-6.1 1.6-7.5 3-1.4 1.4-2.5 3.7-3 7.5-.5-3.8-1.6-6.1-3-7.5-1.4-1.4-3.7-2.5-7.5-3 3.8-.4 6.1-1.5 7.5-2.9 1.4-1.4 2.5-3.7 3-7.6z"/><path d="M19 2.2c.2 1.4.6 2.2 1.1 2.7.5.5 1.3.9 2.7 1.1-1.4.2-2.2.6-2.7 1.1-.5.5-.9 1.3-1.1 2.7-.2-1.4-.6-2.2-1.1-2.7-.5-.5-1.3-.9-2.7-1.1 1.4-.2 2.2-.6 2.7-1.1.5-.5.9-1.3 1.1-2.7z" opacity=".55"/></svg>';

  function bauen() {
    const knopf = document.createElement('button');
    knopf.id = 'kiKnopf';
    knopf.setAttribute('aria-label', 'KI-Assistent');
    knopf.title = 'KI-Assistent';
    knopf.innerHTML = FUNKE;
    document.body.appendChild(knopf);
    const p = document.createElement('div');
    p.id = 'kiPanel';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'KI-Assistent');
    p.innerHTML = '<div class="ki-kopf"><div class="ki-titel"><span class="ki-logo-klein">' + FUNKE + '</span><div><b>Assistent</b><small></small></div></div>' +
      '<button class="ki-kopfknopf" data-ki-neu title="Neuer Chat" aria-label="Neuer Chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>' +
      '<button class="ki-kopfknopf" data-ki-zu title="Schließen" aria-label="Schließen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="ki-liste"></div>' +
      '<div class="ki-anhaenge" hidden></div>' +
      '<form class="ki-form"><button type="button" class="ki-bildknopf" data-ki-bild title="Bild oder Screenshot anhängen" aria-label="Bild anhängen">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="3"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 15.5l-5-5-9 9"/></svg></button>' +
      '<input type="file" accept="image/*" multiple hidden data-ki-datei>' +
      '<textarea rows="1" placeholder="Frag mich oder trag etwas ein …" aria-label="Nachricht"></textarea>' +
      '<button type="submit" class="ki-senden" aria-label="Senden"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg></button>' +
      '<button type="button" class="ki-stopp" hidden aria-label="Stopp"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg></button></form>' +
      '<div class="ki-fuss">KI kann Fehler machen – prüfe wichtige Termine.</div>';
    document.body.appendChild(p);
    el = { knopf: knopf, panel: p, liste: p.querySelector('.ki-liste'), eingabe: p.querySelector('textarea'), anhaenge: p.querySelector('.ki-anhaenge'), senden: p.querySelector('.ki-senden'), stopp: p.querySelector('.ki-stopp'), modell: p.querySelector('.ki-titel small') };
    knopf.addEventListener('click', function () { umschalten(); });
    p.querySelector('[data-ki-zu]').addEventListener('click', function () { umschalten(false); });
    p.querySelector('[data-ki-neu]').addEventListener('click', function () {
      if (laeuft) return;
      verlauf = { inhalte: [], anzeige: [] }; verlaufSpeichern(); zeichnen(true); el.eingabe.focus();
    });
    p.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      const t = el.eingabe.value;
      if ((!t.trim() && !anhaenge.length) || laeuft) return;
      const bilder = anhaenge;
      anhaenge = []; anhaengeZeichnen();
      el.eingabe.value = ''; hoehe();
      senden(t, bilder);
    });
    const datei = p.querySelector('[data-ki-datei]');
    p.querySelector('[data-ki-bild]').addEventListener('click', function () { datei.click(); });
    datei.addEventListener('change', function () { bilderDazu(datei.files); datei.value = ''; });
    el.anhaenge.addEventListener('click', function (e) {
      const b = e.target.closest('[data-ki-anhang-weg]');
      if (b) { anhaenge.splice(Number(b.getAttribute('data-ki-anhang-weg')), 1); anhaengeZeichnen(); }
    });
    // Screenshot einfügen (Strg+V / Cmd+V) oder ins Fenster ziehen
    el.eingabe.addEventListener('paste', function (e) {
      const d = e.clipboardData && e.clipboardData.files;
      if (d && Array.prototype.some.call(d, function (x) { return /^image\//.test(x.type); })) { e.preventDefault(); bilderDazu(d); }
    });
    p.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); });
    p.addEventListener('drop', function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      e.preventDefault(); bilderDazu(e.dataTransfer.files);
    });
    el.stopp.addEventListener('click', function () { if (abbrechen) abbrechen.abort(); });
    el.eingabe.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); p.querySelector('form').requestSubmit ? p.querySelector('form').requestSubmit() : p.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); }
      if (e.key === 'Escape') umschalten(false);
      e.stopPropagation();
    });
    el.eingabe.addEventListener('input', hoehe);
    el.liste.addEventListener('click', function (e) {
      const v = e.target.closest('[data-ki-vorschlag]');
      if (v) { senden(v.getAttribute('data-ki-vorschlag')); return; }
      const r = e.target.closest('[data-ki-rueck]');
      if (r) {
        const t = r.getAttribute('data-ki-rueck').split(':'), m = verlauf.anzeige[Number(t[0])], a = m && m.aktionen && m.aktionen[Number(t[1])];
        if (a && !a.rueck) { rueckgaengig(a); a.rueck = true; verlaufSpeichern(); zeichnen(false); }
        return;
      }
      const o = e.target.closest('[data-ki-oeffnen]');
      if (o && K.oeffneAufgabe) { const t = K.aufgabeVon(o.getAttribute('data-ki-oeffnen')); if (t && !t.geloescht) K.oeffneAufgabe(t.id); }
    });
  }
  function hoehe() { el.eingabe.style.height = 'auto'; el.eingabe.style.height = Math.min(140, el.eingabe.scrollHeight) + 'px'; }
  function umschalten(an) {
    offen = an === undefined ? !offen : an;
    document.documentElement.classList.toggle('ki-offen', offen);
    if (offen) {
      el.modell.textContent = cfg().schluessel ? MODELLE.find(function (m) { return m[0] === modell(); })[1].replace(' (empfohlen)', '') : 'kein Schlüssel eingetragen';
      zeichnen(true);
      if (window.matchMedia && window.matchMedia('(pointer:fine)').matches) setTimeout(function () { el.eingabe.focus(); }, 60);
    }
  }

  /* ---------- Einstellungen ---------- */
  function einstellungenZeichnen(ziel) {
    const c = cfg();
    ziel.innerHTML = '<div class="box"><h3>KI-Assistent</h3>' +
      '<p>Der Assistent nutzt Google Gemini. Trag deinen API-Schlüssel ein – er wird <b>nur auf diesem Gerät</b> gespeichert, nicht abgeglichen und nie weitergegeben. Auf jedem Gerät einmal eintragen.</p>' +
      '<div class="feld"><label for="kiSchluessel">Gemini-API-Schlüssel</label>' +
      '<div class="ki-schluesselzeile"><input id="kiSchluessel" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…" value="' + esc(c.schluessel || '') + '">' +
      '<button class="btn btn-klein" type="button" data-ki-zeigen>Zeigen</button></div></div>' +
      '<div class="feld"><label for="kiModell">Modell</label><select id="kiModell">' +
      MODELLE.map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === modell() ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" type="button" data-ki-speichern>Speichern &amp; testen</button>' +
      (c.schluessel ? '<button class="btn" type="button" data-ki-entfernen>Schlüssel entfernen</button>' : '') + '</div>' +
      '<div class="hinweis ok" data-ki-status style="margin-top:12px">' + (c.schluessel ? 'Schlüssel ist eingetragen.' : 'Noch kein Schlüssel eingetragen.') + '</div>' +
      '<p style="margin-top:12px;font-size:13px">Öffnen: Knopf mit dem Funken – am Laptop rechts unten, auf iPad und iPhone oben neben dem Mond' + (window.matchMedia && window.matchMedia('(pointer:fine)').matches ? ' oder Strg + K' : '') + '.</p>' +
      '<p style="margin-top:6px;font-size:13px">Hinweis: Im kostenlosen Gemini-Tarif darf Google deine Anfragen zur Verbesserung seiner Produkte verwenden. Schreib dem Assistenten also nichts Privates.</p></div>';
    if (K.auswahlAufbereiten) K.auswahlAufbereiten(ziel);
    const inp = ziel.querySelector('#kiSchluessel'), status = ziel.querySelector('[data-ki-status]');
    ziel.querySelector('[data-ki-zeigen]').addEventListener('click', function () {
      inp.type = inp.type === 'password' ? 'text' : 'password';
      this.textContent = inp.type === 'password' ? 'Zeigen' : 'Verbergen';
    });
    ziel.querySelector('[data-ki-speichern]').addEventListener('click', async function () {
      const s = inp.value.trim();
      const c2 = cfg();
      c2.schluessel = s; c2.modell = ziel.querySelector('#kiModell').value;
      cfgSetzen(c2);
      if (!s) { status.className = 'hinweis fehler'; status.textContent = 'Bitte einen Schlüssel eintragen.'; return; }
      status.className = 'hinweis ok'; status.textContent = 'Teste Verbindung …';
      try {
        const r = await fetch(API + encodeURIComponent(c2.modell) + ':generateContent', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Antworte nur mit: OK' }] }] })
        });
        let j = null; try { j = await r.json(); } catch (e) { }
        if (r.ok) { status.className = 'hinweis ok'; status.textContent = 'Verbunden – der Assistent ist bereit.'; }
        else {
          status.className = 'hinweis fehler';
          const m = j && j.error && j.error.message ? j.error.message : '';
          status.textContent = (r.status === 400 ? 'Schlüssel ungültig. ' : r.status === 404 ? 'Modell nicht verfügbar – wähle ein anderes. ' : r.status === 429 ? 'Limit erreicht – später nochmal testen. ' : 'Fehler ' + r.status + '. ') + m;
        }
      } catch (e) { status.className = 'hinweis fehler'; status.textContent = 'Keine Verbindung: ' + e.message; }
    });
    const weg = ziel.querySelector('[data-ki-entfernen]');
    if (weg) weg.addEventListener('click', function () {
      const c2 = cfg(); delete c2.schluessel; cfgSetzen(c2);
      if (K) K.neuZeichnen();
    });
  }

  const CSS = `
#kiKnopf{position:fixed;right:28px;bottom:28px;z-index:40;width:56px;height:56px;border-radius:50%;border:1px solid rgba(255,255,255,.5);padding:14px;color:#fff;cursor:pointer;
  background:linear-gradient(140deg,#8E6BFF,#3E7BFF 55%,#22B8E8);box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 10px 26px rgba(80,90,230,.42);transition:transform .15s ease}
#kiKnopf:hover{transform:scale(1.05)} #kiKnopf:active{transform:scale(.95)}
#kiKnopf svg{width:100%;height:100%;display:block}
html.ki-offen #kiKnopf{opacity:0;pointer-events:none}
#kiPanel{position:fixed;right:20px;bottom:20px;top:20px;z-index:45;width:min(430px,calc(100vw - 40px));display:flex;flex-direction:column;border-radius:26px;overflow:hidden;
  border:1px solid var(--kante);background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,0) 30%),rgba(246,247,253,.86);
  -webkit-backdrop-filter:blur(40px) saturate(180%);backdrop-filter:blur(40px) saturate(180%);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 30px 80px rgba(20,25,60,.30);
  transform:translateX(calc(100% + 40px));opacity:0;pointer-events:none;transition:transform .28s cubic-bezier(.2,.8,.2,1),opacity .2s ease;color:var(--text)}
html.ki-offen #kiPanel{transform:none;opacity:1;pointer-events:auto}
:root[data-thema="dunkel"] #kiPanel{background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,0) 30%),rgba(26,28,46,.92)}
.ki-kopf{display:flex;align-items:center;gap:4px;padding:14px 12px 12px 16px;border-bottom:1px solid var(--kante)}
.ki-titel{display:flex;align-items:center;gap:10px;margin-right:auto;min-width:0}
.ki-titel b{display:block;font-size:16px}
.ki-titel small{display:block;font-size:12px;color:var(--muted)}
.ki-logo-klein{width:34px;height:34px;border-radius:11px;padding:7px;color:#fff;background:linear-gradient(140deg,#8E6BFF,#3E7BFF 55%,#22B8E8);flex:0 0 34px}
.ki-logo-klein svg{width:100%;height:100%;display:block}
.ki-kopfknopf{width:36px;height:36px;border-radius:11px;border:0;background:transparent;color:var(--text);padding:8px;cursor:pointer}
.ki-kopfknopf:hover{background:rgba(127,127,140,.14)}
.ki-kopfknopf svg{width:100%;height:100%;display:block}
.ki-liste{flex:1;overflow-y:auto;padding:16px 14px 8px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.ki-msg{max-width:88%;padding:10px 14px;border-radius:18px;font-size:14.5px;line-height:1.45;word-wrap:break-word;overflow-wrap:break-word}
.ki-msg p{margin:0 0 6px} .ki-msg p:last-child{margin-bottom:0}
.ki-msg ul{margin:4px 0 6px;padding-left:20px} .ki-msg li{margin:2px 0}
.ki-msg code{font-size:13px;background:rgba(127,127,140,.15);padding:1px 5px;border-radius:5px}
.ki-ich{align-self:flex-end;color:#fff;background:linear-gradient(180deg,#3E94FF,#0A7AFF);border-bottom-right-radius:6px}
.ki-ki{align-self:flex-start;background:rgba(255,255,255,.75);border:1px solid var(--kante);border-bottom-left-radius:6px}
:root[data-thema="dunkel"] .ki-ki{background:rgba(255,255,255,.07)}
.ki-fehler{align-self:stretch;max-width:none;font-size:13.5px;background:rgba(255,59,48,.12);color:#A3221B}
:root[data-thema="dunkel"] .ki-fehler{color:#FF8A80}
.ki-aktionen{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.ki-aktion{display:flex;align-items:center;gap:8px;font-size:13px;padding:7px 8px 7px 10px;border-radius:12px;background:rgba(52,199,89,.12);border:1px solid rgba(52,199,89,.25)}
.ki-aktion-text{flex:1;min-width:0}
.ki-aktion-text[data-ki-oeffnen]{cursor:pointer;text-decoration:underline;text-decoration-color:rgba(127,127,140,.4);text-underline-offset:2px}
.ki-aktion button{border:0;background:rgba(127,127,140,.15);color:var(--text);border-radius:8px;padding:4px 8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
.ki-aktion em{font-size:12px;color:var(--muted);white-space:nowrap}
.ki-zurueck{opacity:.6;background:rgba(127,127,140,.08);border-color:var(--kante)} .ki-zurueck .ki-aktion-text{text-decoration:line-through}
.ki-frage{align-self:stretch;padding:12px 14px;border-radius:16px;background:rgba(255,149,0,.12);border:1px solid rgba(255,149,0,.3);font-size:14px}
.ki-frage-knoepfe{display:flex;gap:8px;margin-top:10px}
.ki-tippt{display:flex;gap:5px;padding:14px 16px}
.ki-tippt span{width:7px;height:7px;border-radius:50%;background:var(--muted2);animation:ki-hupf 1.1s infinite ease-in-out}
.ki-tippt span:nth-child(2){animation-delay:.15s} .ki-tippt span:nth-child(3){animation-delay:.3s}
@keyframes ki-hupf{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-5px);opacity:1}}
.ki-leer{margin:auto 0;display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:20px 8px;color:var(--muted)}
.ki-leer b{color:var(--text);font-size:17px}
.ki-logo{width:56px;height:56px;border-radius:18px;padding:13px;color:#fff;background:linear-gradient(140deg,#8E6BFF,#3E7BFF 55%,#22B8E8);margin-bottom:6px;box-shadow:0 10px 24px rgba(80,90,230,.3)}
.ki-logo svg{width:100%;height:100%;display:block}
.ki-vorschlaege{display:flex;flex-direction:column;gap:7px;margin-top:12px;width:100%}
.ki-vorschlaege button{border:1px solid var(--kante);background:rgba(255,255,255,.6);color:var(--text);border-radius:14px;padding:10px 12px;font-size:13.5px;text-align:left;cursor:pointer}
:root[data-thema="dunkel"] .ki-vorschlaege button{background:rgba(255,255,255,.06)}
.ki-vorschlaege button:hover{border-color:var(--accent)}
.ki-bilder{align-self:flex-end;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;max-width:88%}
.ki-bilder img{width:96px;height:96px;object-fit:cover;border-radius:14px;border:1px solid var(--kante);display:block}
.ki-anhaenge{display:flex;gap:8px;margin:6px 12px 0;overflow-x:auto;padding-top:6px}
.ki-anhaenge[hidden]{display:none}
.ki-anhang{position:relative;width:60px;height:60px;flex:0 0 60px}
.ki-anhang img{width:100%;height:100%;object-fit:cover;border-radius:12px;border:1px solid var(--kante);display:block}
.ki-anhang button{position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;border:2px solid var(--bg,#fff);background:#55555E;color:#fff;padding:3px;cursor:pointer}
.ki-anhang button svg{width:100%;height:100%;display:block}
.ki-bildknopf{width:36px;height:36px;flex:0 0 36px;border-radius:50%;border:0;background:transparent;color:var(--muted);padding:7px;cursor:pointer}
.ki-bildknopf:hover{background:rgba(127,127,140,.14);color:var(--text)}
.ki-bildknopf svg{width:100%;height:100%;display:block}
.ki-form{display:flex;align-items:flex-end;gap:6px;margin:6px 12px 0;padding:6px;border-radius:22px;border:1px solid var(--kante);background:rgba(255,255,255,.8)}
:root[data-thema="dunkel"] .ki-form{background:rgba(255,255,255,.07)}
.ki-form textarea{flex:1;border:0;outline:none;resize:none;background:transparent;color:var(--text);font:inherit;font-size:16px;line-height:1.4;padding:7px 0;max-height:140px}
.ki-senden,.ki-stopp{width:36px;height:36px;flex:0 0 36px;border-radius:50%;border:0;color:#fff;background:linear-gradient(180deg,#3E94FF,#0A7AFF);padding:8px;cursor:pointer}
.ki-stopp{background:#55555E}
.ki-senden svg,.ki-stopp svg{width:100%;height:100%;display:block}
.ki-fuss{font-size:11.5px;color:var(--muted2);text-align:center;padding:6px 12px calc(10px + env(safe-area-inset-bottom))}
.ki-schluesselzeile{display:flex;gap:8px;align-items:center}
.ki-schluesselzeile input{flex:1;min-width:0}
html.nb-offen #kiKnopf,html.nb-offen #kiPanel{display:none}
.btn.ki-kopf-start{display:none;width:40px;height:40px;flex:0 0 40px;padding:10px;color:#fff;border-color:rgba(255,255,255,.45);
  background:linear-gradient(140deg,#8E6BFF,#3E7BFF 55%,#22B8E8);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 6px 16px rgba(80,90,230,.32)}
.btn.ki-kopf-start svg{width:100%;height:100%;display:block}
@media (max-width:880px){
  #kiKnopf{display:none}
  .btn.ki-kopf-start{display:inline-flex;align-items:center;justify-content:center}
  #kiPanel{left:0;right:0;top:0;bottom:0;width:auto;border-radius:0;border:0;transform:translateY(100%)}
  .ki-kopf{padding-top:calc(12px + env(safe-area-inset-top))}
}
@media (prefers-reduced-motion: reduce){#kiPanel{transition:none}.ki-tippt span{animation:none}}
`;

  window.Assistent = {
    init: function (k) {
      K = k;
      if (el) return;
      const st = document.createElement('style'); st.id = 'ki-stil'; st.textContent = CSS; document.head.appendChild(st);
      verlaufLaden();
      bauen();
      document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-ki-start]')) { e.preventDefault(); umschalten(true); }
      });
      document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          if (document.documentElement.classList.contains('nb-offen') || document.querySelector('dialog[open]')) return;
          e.preventDefault(); umschalten();
        }
      });
    },
    nachRender: function (container) {
      const z = container.querySelector('[data-ki-einstellungen]');
      if (z) einstellungenZeichnen(z);
    },
    oeffnen: function () { umschalten(true); },
    verfuegbar: function () { return !!cfg().schluessel; },
    gemini: geminiAufruf,
    kopfKnopf: function () { return '<button class="btn ki-kopf-start" data-ki-start="1" title="KI-Assistent" aria-label="KI-Assistent öffnen">' + FUNKE + '</button>'; },
    _intern: { senden: senden, werkzeugAusfuehren: werkzeugAusfuehren, get verlauf() { return verlauf; }, systemText: function () { return systemText(); } }
  };
})();
