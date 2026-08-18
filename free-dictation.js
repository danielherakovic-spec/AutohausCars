(() => {
  'use strict';

  const form = document.getElementById('vehicle-form');
  const panel = document.getElementById('voice-assistant');
  if (!form || !panel) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = Boolean(SpeechRecognition) && (window.isSecureContext || location.hostname === 'localhost');
  const speech = window.speechSynthesis;
  const currentYear = new Date().getFullYear() + 1;
  const state = { active: false, phase: 'idle', listening: false, shouldListen: false, speechToken: 0, restartTimer: 0, last: '' };
  const el = {
    start: document.getElementById('voice-start'), repeat: document.getElementById('voice-repeat'),
    next: document.getElementById('voice-skip'), finish: document.getElementById('voice-finish'),
    cancel: document.getElementById('voice-cancel'), question: document.getElementById('voice-question'),
    transcript: document.getElementById('voice-transcript'), label: document.getElementById('voice-progress-label'),
    count: document.getElementById('voice-progress-count'), bar: document.getElementById('voice-progress-bar'),
    fallback: document.getElementById('voice-fallback'), progress: panel.querySelector('[role="progressbar"]'),
  };

  const numberWords = { null: 0, zero: 0, eins: 1, ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwoelf: 12, dreizehn: 13, vierzehn: 14, fuenfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20, dreissig: 30, vierzig: 40, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };
  const ones = { ein: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
  const tens = { zwanzig: 20, dreissig: 30, vierzig: 40, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };
  Object.entries(tens).forEach(([ten, tenValue]) => Object.entries(ones).forEach(([one, oneValue]) => { numberWords[one + 'und' + ten] = tenValue + oneValue; }));
  const tracked = ['brand', 'model', 'series', 'generation', 'registration', 'year', 'mileage', 'ps', 'kw', 'fuel', 'gearbox', 'drive', 'color', 'owners', 'location', 'askingPrice', 'purchasePrice', 'desiredSalePrice', 'status', 'notes'];
  const normalize = value => String(value || '').toLocaleLowerCase('de-DE').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();
  const keyText = value => String(value || '').toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim();
  const months = { januar: '01', februar: '02', märz: '03', maerz: '03', marz: '03', april: '04', mai: '05', juni: '06', juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12' };

  function title(value) {
    return String(value || '').trim().split(/\s+/).map(word => {
      if (/^(?:bmw|vw|dsg|cvt|ps|kw|mk|gti|gtd|tdi|tsi|tfsi|amg|rs|suv|ev|phev|cng|lpg|awd|fwd|rwd)$/i.test(word)) return word.toUpperCase();
      return word ? word.charAt(0).toLocaleUpperCase('de-DE') + word.slice(1) : '';
    }).join(' ');
  }

  function numberFromDigits(value) {
    const found = String(value || '').match(/-?\d[\d\s.,]*/);
    if (!found) return null;
    let text = found[0].trim().replace(/\s/g, '');
    if (text.includes('.') && text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
    else if (text.includes('.')) text = /\.\d{3}(?:\.|$)/.test(text) ? text.replace(/\./g, '') : text;
    else if (text.includes(',')) text = /,\d{3}(?:,|$)/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function numberFromWords(value) {
    const source = normalize(value);
    const direct = numberFromDigits(source);
    if (direct !== null) return direct;
    const pieces = source.split(/\bkomma\b/, 2);
    const prepared = pieces[0].replace(/-/g, ' ').replace(/tausend/g, ' tausend ').replace(/hundert/g, ' hundert ').replace(/\s+/g, ' ').trim();
    let total = 0;
    let part = 0;
    let seen = false;
    prepared.split(' ').forEach(word => {
      if (Object.prototype.hasOwnProperty.call(numberWords, word)) { part += numberWords[word]; seen = true; }
      else if (word === 'hundert') { part = (part || 1) * 100; seen = true; }
      else if (word === 'tausend') { total += (part || 1) * 1000; part = 0; seen = true; }
    });
    if (!seen) return null;
    let result = total + part;
    if (pieces[1]) {
      const decimal = numberFromWords(pieces[1]);
      if (decimal !== null) result += Number('0.' + Math.trunc(decimal));
    }
    return Number.isFinite(result) ? result : null;
  }

  function numberValue(value, min, max, decimal) {
    const number = numberFromWords(value);
    if (number === null || number < min || number > max) return null;
    return decimal ? Math.round(number * 100) / 100 : Math.round(number);
  }

  function clean(value) {
    return String(value || '').replace(/^[\s,.:;–—-]+/, '').replace(/^(?:(?:ist|lautet|heißt|heisst|beträgt|betragt|zu|von|bei)\s+)+/i, '').replace(/\s+/g, ' ').trim();
  }

  function textValue(value) {
    const cleaned = clean(value);
    return cleaned ? title(cleaned) : null;
  }

  function identifier(value) {
    const cleaned = clean(value);
    const number = numberFromWords(cleaned);
    if (!cleaned) return null;
    if (number !== null && (/^\d[\d\s.,]*$/.test(cleaned) || /(?:tausend|hundert)/.test(normalize(cleaned)))) return String(Math.round(number));
    const map = { null: '0', zero: '0', eins: '1', ein: '1', zwei: '2', drei: '3', vier: '4', fuenf: '5', sechs: '6', sieben: '7', acht: '8', neun: '9', zehn: '10', elf: '11', zwoelf: '12', dreizehn: '13', vierzehn: '14', fuenfzehn: '15', sechzehn: '16', siebzehn: '17', achtzehn: '18', neunzehn: '19', zwanzig: '20' };
    return title(cleaned).replace(/\b(null|zero|eins|ein|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwoelf|dreizehn|vierzehn|fünfzehn|fuenfzehn|sechzehn|siebzehn|achtzehn|neunzehn|zwanzig)\b/gi, word => map[normalize(word)] || word);
  }

  function registration(value) {
    const raw = String(value || '');
    const digits = raw.match(/\b(0?[1-9]|1[0-2])\s*(?:[./-]|\s)\s*((?:19|20)\d{2})\b/);
    if (digits) return { month: digits[2] + '-' + digits[1].padStart(2, '0'), year: Number(digits[2]) };
    const normalized = normalize(raw);
    const monthName = Object.keys(months).find(name => new RegExp('\\b' + name + '\\b').test(normalized));
    const yearMatch = normalized.match(/\b(?:19|20)\d{2}\b/);
    const year = yearMatch ? Number(yearMatch[0]) : numberValue(normalized, 1900, currentYear, false);
    if (!year) return null;
    return { month: monthName ? String(year) + '-' + months[monthName] : '', year };
  }

  function fuel(value) {
    const text = normalize(value);
    if (/plug.*hybrid|plugin/.test(text)) return 'Plug-in-Hybrid';
    if (/hybrid/.test(text)) return 'Hybrid';
    if (/elektro|elektrisch|strom|electric/.test(text)) return 'Elektro';
    if (/diesel/.test(text)) return 'Diesel';
    if (/benzin|super|otto/.test(text)) return 'Benzin';
    if (/erdgas|cng/.test(text)) return 'Erdgas';
    if (/gas|lpg|autogas/.test(text)) return 'Autogas';
    return textValue(value);
  }

  function gearbox(value) {
    const text = normalize(value);
    if (/dsg/.test(text)) return 'DSG';
    if (/cvt/.test(text)) return 'CVT';
    if (/automatik|automatic/.test(text)) return 'Automatik';
    if (/handschalt|manuell|schaltgetriebe/.test(text)) return 'Handschaltung';
    if (/sonstig|ander/.test(text)) return 'Sonstiges';
    return null;
  }

  function drive(value) {
    const text = normalize(value);
    if (/allrad|4matic|quattro|xdrive|4x4/.test(text)) return 'Allrad';
    if (/front/.test(text)) return 'Frontantrieb';
    if (/heck/.test(text)) return 'Heckantrieb';
    return textValue(value);
  }

  function power(value) {
    const number = numberValue(value, 1, 2500, false);
    if (number === null) return null;
    return /\b(?:kw|kilowatt)\b/i.test(value) ? { ps: Math.round(number * 1.35962), kw: number } : { ps: number, kw: Math.round(number / 1.35962) };
  }

  function status(value) {
    const text = normalize(value);
    if (/besichtigung/.test(text)) return 'Besichtigung geplant';
    if (/reserv/.test(text)) return 'Reserviert';
    if (/aufbereit/.test(text)) return 'In Aufbereitung';
    if (/inser/.test(text)) return 'Inseriert';
    if (/verkauft/.test(text)) return 'Verkauft';
    if (/archiv/.test(text)) return 'Archiviert';
    if (/gekauft/.test(text)) return 'Gekauft';
    if (/entwurf|neu/.test(text)) return 'Entwurf';
    return null;
  }

  const definitions = [
    ['brand', 'Marke', ['marke', 'hersteller', 'fabrikat'], textValue],
    ['model', 'Modell', ['modell', 'model'], textValue],
    ['series', 'Baureihe', ['baureihe', 'serie'], identifier],
    ['generation', 'Generation', ['generation'], identifier],
    ['registration', 'Erstzulassung', ['erstzulassung', 'erst zulassung', 'erstanmeldung', 'erst anmeldung', 'ez'], registration],
    ['year', 'Baujahr', ['baujahr', 'jahrgang'], value => numberValue(value, 1900, currentYear, false)],
    ['mileage', 'Kilometer', ['kilometerstand', 'kilometer', 'km stand', 'km'], value => numberValue(value, 0, 2000000, false)],
    ['power', 'Leistung', ['leistung in ps', 'leistung ps', 'leistung in kw', 'leistung kw', 'pferdestärken', 'pferdestaerken', 'kilowatt', 'leistung', 'ps', 'kw'], power],
    ['fuel', 'Kraftstoff', ['kraftstoff', 'treibstoff', 'motorart'], fuel],
    ['gearbox', 'Getriebe', ['getriebe', 'schaltung'], gearbox],
    ['drive', 'Antrieb', ['antrieb'], drive],
    ['color', 'Farbe', ['farbe', 'lackierung', 'lack'], textValue],
    ['owners', 'Halter', ['anzahl halter', 'vorhalter', 'halter'], value => numberValue(value, 0, 99, false)],
    ['location', 'Ort', ['standort', 'ort'], textValue],
    ['askingPrice', 'Angebotspreis', ['angebotspreis', 'angebots preis', 'inseratspreis', 'listenpreis'], value => numberValue(value, 0, 10000000, true)],
    ['purchasePrice', 'Einkaufspreis', ['einkaufspreis', 'einkaufs preis', 'ankaufspreis', 'gekauft für', 'gekauft fuer'], value => numberValue(value, 0, 10000000, true)],
    ['desiredSalePrice', 'Verkaufspreis', ['gewünschter verkaufspreis', 'gewuenschter verkaufspreis', 'verkaufspreis', 'verkaufs preis', 'zielpreis', 'ziel preis'], value => numberValue(value, 0, 10000000, true)],
    ['status', 'Status', ['status', 'fahrzeugstatus'], status],
    ['notes', 'Notiz', ['notizen', 'notiz', 'bemerkung', 'anmerkung'], value => { const text = clean(value); return text ? text.charAt(0).toLocaleUpperCase('de-DE') + text.slice(1) : null; }],
  ].map(([key, label, aliases, parse]) => ({ key, label, aliases, parse }));
  const byKey = new Map(definitions.map(definition => [definition.key, definition]));
  const labels = definitions.flatMap(definition => definition.aliases.map(alias => ({ key: definition.key, alias: keyText(alias) }))).sort((a, b) => b.alias.length - a.alias.length);
  const labelMap = new Map(labels.map(label => [label.alias, label.key]));
  const labelPattern = labels.map(label => label.alias.replace(/\s+/g, '\\s+')).join('|');
  const labelMatcher = new RegExp('(^|\\s)(' + labelPattern + ')(?=\\s|$)', 'gi');

  function matchesFor(value) {
    const source = String(value || '').replace(/[,:;]+/g, ' ').replace(/\s+/g, ' ').trim();
    const matches = [];
    labelMatcher.lastIndex = 0;
    let match;
    while ((match = labelMatcher.exec(source))) {
      const key = labelMap.get(keyText(match[2]));
      if (key) matches.push({ key, start: match.index + (match[1] || '').length, end: labelMatcher.lastIndex });
    }
    return { source, matches };
  }

  function pairsFor(value, final) {
    const found = matchesFor(value);
    const usable = final ? found.matches : found.matches.slice(0, -1);
    return usable.map((match, index) => {
      const next = found.matches[index + 1];
      return { definition: byKey.get(match.key), value: clean(found.source.slice(match.end, next ? next.start : found.source.length)) };
    }).filter(pair => pair.definition && pair.value);
  }

  function progress() {
    const completed = tracked.filter(key => String(form.elements[key]?.value || '').trim()).length;
    const percentage = Math.round(completed / tracked.length * 100);
    el.count.textContent = completed + ' von ' + tracked.length + ' Feldern';
    el.bar.style.width = percentage + '%';
    el.progress.setAttribute('aria-valuenow', String(completed));
    el.progress.setAttribute('aria-valuemax', String(tracked.length));
  }

  function show(label, question) {
    el.label.textContent = label;
    if (question) el.question.textContent = question;
    progress();
  }

  function setFallback(message) {
    el.fallback.textContent = message;
    el.fallback.classList.toggle('show', Boolean(message));
  }

  function controls() {
    el.start.disabled = !supported || state.active;
    el.repeat.disabled = !state.active;
    el.next.disabled = !state.active;
    el.finish.disabled = !state.active;
    el.cancel.disabled = !state.active;
    el.start.textContent = state.active ? 'Diktat läuft' : '▶ Start';
  }

  function clearHighlight() {
    form.querySelectorAll('.voice-field-active').forEach(field => field.classList.remove('voice-field-active'));
  }

  function highlight(keys) {
    clearHighlight();
    keys.forEach(key => form.elements[key]?.classList?.add('voice-field-active'));
  }

  function setField(key, value) {
    const field = form.elements[key];
    if (!field) return false;
    if (field.tagName === 'SELECT' && ![...field.options].some(option => option.value === String(value))) return false;
    field.value = value ?? '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function apply(definition, value) {
    if (definition.key === 'registration') return [value.month && setField('registration', value.month) ? 'registration' : '', value.year && setField('year', value.year) ? 'year' : ''].filter(Boolean);
    if (definition.key === 'power') return [setField('ps', value.ps) ? 'ps' : '', setField('kw', value.kw) ? 'kw' : ''].filter(Boolean);
    return setField(definition.key, value) ? [definition.key] : [];
  }

  function displayName(key) {
    return key === 'ps' || key === 'kw' ? 'Leistung' : (byKey.get(key)?.label || key);
  }

  function applyPairs(pairs) {
    const changed = [];
    pairs.forEach(pair => {
      const value = pair.definition.parse(pair.value);
      if (value === null || value === '') return;
      apply(pair.definition, value).forEach(key => { if (!changed.includes(key)) changed.push(key); });
    });
    if (changed.length) highlight(changed);
    return changed;
  }

  function report(changed, interim) {
    if (!changed.length) return;
    const names = [...new Set(changed.map(displayName))];
    el.transcript.textContent = 'Übernommen: ' + names.join(', ') + (interim ? ' …' : '.');
    show('Freie Diktation aktiv', (names.length === 1 ? names[0] + ' übernommen.' : names.length + ' Felder übernommen.') + ' Ich höre weiter zu.');
  }

  function resolveField(value) {
    const target = normalize(value);
    const label = labels.find(entry => target.split(' ').includes(normalize(entry.alias)));
    return label?.key || '';
  }

  function deleteCommand(value) {
    const match = String(value || '').match(/\b(?:lösche|loesche|entferne|leere)\s+(?:bitte\s+)?(?:das|den|die|der)?\s*([^,.;]+)/i);
    const key = match ? resolveField(match[1]) : '';
    if (!key) return false;
    const changed = key === 'power' ? ['ps', 'kw'].filter(field => setField(field, '')) : (setField(key, '') ? [key] : []);
    if (changed.length) {
      highlight(changed);
      show('Freie Diktation aktiv', displayName(changed[0]) + ' gelöscht. Ich höre weiter zu.');
      el.transcript.textContent = displayName(changed[0]) + ' wurde gelöscht.';
    }
    return true;
  }

  function stopListening() {
    state.shouldListen = false;
    state.listening = false;
    window.clearTimeout(state.restartTimer);
    if (recognition) { try { recognition.abort(); } catch { /* Already stopped. */ } }
    panel.classList.remove('is-listening');
  }

  function stopSpeaking() {
    state.speechToken += 1;
    if (speech) speech.cancel();
    panel.classList.remove('is-speaking');
  }

  function speakThen(text, done) {
    stopSpeaking();
    const token = ++state.speechToken;
    panel.classList.add('is-speaking');
    const complete = () => {
      if (token !== state.speechToken) return;
      panel.classList.remove('is-speaking');
      if (done) done();
    };
    if (!speech || !('SpeechSynthesisUtterance' in window)) { window.setTimeout(complete, 80); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 1;
    utterance.onend = complete;
    utterance.onerror = complete;
    speech.speak(utterance);
  }

  function listen() {
    if (!state.active || !recognition || state.listening) return;
    state.shouldListen = true;
    try { recognition.start(); } catch (error) {
      if (error.name !== 'InvalidStateError') pause('Die Spracherkennung konnte nicht gestartet werden. Prüfe das Mikrofon oder erfasse die Daten manuell.');
    }
  }

  function restart() {
    if (!state.active || !state.shouldListen) return;
    window.clearTimeout(state.restartTimer);
    state.restartTimer = window.setTimeout(listen, 180);
  }

  let recognition = null;
  if (supported) {
    recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      state.listening = true;
      panel.classList.remove('is-speaking', 'is-error');
      panel.classList.add('is-listening');
      show(state.phase === 'confirm' ? 'Ich höre deine Bestätigung …' : 'Ich höre zu …', state.phase === 'confirm' ? 'Bist du fertig? Sage „Ja“ zum Beenden oder „Nein“ zum Weiterdiktieren.' : 'Nenne weitere Feldpaare. Du kannst ohne Pause weitersprechen.');
    };
    recognition.onresult = event => {
      let interim = '';
      let final = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) final += ' ' + text;
        else interim += ' ' + text;
      }
      if (interim.trim()) {
        el.transcript.textContent = 'Ich höre: „' + interim.trim() + '“';
        if (state.phase === 'dictation') report(applyPairs(pairsFor(interim.trim(), false)), true);
      }
      if (final.trim()) handle(final.trim());
    };
    recognition.onerror = event => {
      state.listening = false;
      if (!state.active || !state.shouldListen || event.error === 'aborted') return;
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'security'].includes(event.error)) unavailable('Der Mikrofonzugriff wurde nicht freigegeben oder ist nicht verfügbar. Das Formular bleibt vollständig manuell nutzbar.');
      else if (event.error === 'network') pause('Die Web-Spracherkennung ist gerade nicht erreichbar. Prüfe die Internetverbindung oder erfasse das Fahrzeug manuell.');
    };
    recognition.onend = () => {
      state.listening = false;
      panel.classList.remove('is-listening');
      restart();
    };
  }

  function command(value) {
    const text = normalize(value);
    if (/\b(fertig|beenden|abschliessen|abschließen)\s*$/.test(text)) return 'finish';
    if (/^(?:bitte\s+)?(?:abbrechen|stopp|stop)\s*$/.test(text)) return 'cancel';
    if (/^(?:bitte\s+)?(?:weiter|fortsetzen|nächste|naechste)\s*$/.test(text)) return 'next';
    if (/^(?:bitte\s+)?(?:wiederholen|nochmal|noch einmal)\s*$/.test(text)) return 'repeat';
    return '';
  }

  function handleConfirmation(value) {
    const text = normalize(value);
    if (/\b(?:ja|jawohl|jep|yes|richtig|korrekt|genau)\b/.test(text)) return finish();
    if (/\b(?:nein|nee|nicht|weiter|fortsetzen)\b/.test(text)) {
      state.phase = 'dictation';
      show('Freie Diktation aktiv', 'Alles klar. Ich höre weiter zu.');
      return speakThen('Alles klar. Ich höre weiter zu.', listen);
    }
    if (/\b(?:abbrechen|stopp|stop)\b/.test(text)) return cancel();
    show('Bestätigung offen', 'Bitte sage „Ja“ zum Beenden oder „Nein“ zum Weiterdiktieren.');
    speakThen('Bist du fertig? Sage Ja oder Nein.', listen);
  }

  function handle(value) {
    if (state.phase === 'confirm') return handleConfirmation(value);
    const action = command(value);
    if (action === 'cancel') return cancel();
    if (action === 'repeat') return repeat();
    if (action === 'next') { show('Freie Diktation aktiv', 'Ich höre weiter zu.'); return; }
    state.last = value;
    const input = action === 'finish' ? value.replace(/\b(?:fertig|beenden|abschliessen|abschließen)\s*[.!?]*\s*$/i, '').trim() : value;
    const removed = deleteCommand(input);
    const changed = applyPairs(pairsFor(input, true));
    report(changed, false);
    if (action === 'finish') return askFinish();
    if (!removed && !changed.length && !matchesFor(input).matches.length) {
      el.transcript.textContent = 'Nicht zugeordnet: „' + value + '“';
      show('Freie Diktation aktiv', 'Ich habe keine Feldbezeichnung erkannt. Sage zum Beispiel „Marke Ford“ oder „Kilometer hundertzwanzigtausend“.');
    }
  }

  async function start() {
    if (!supported) return unavailable('Diese Browserumgebung unterstützt keine Web-Spracherkennung. Du kannst das vorhandene Formular weiterhin vollständig manuell ausfüllen.');
    try {
      if (navigator.permissions?.query && (await navigator.permissions.query({ name: 'microphone' })).state === 'denied') return unavailable('Der Mikrofonzugriff ist im Browser blockiert. Erlaube ihn in den Website-Einstellungen und starte danach erneut.');
    } catch { /* The browser will ask for permission when listening starts. */ }
    stopSpeaking();
    stopListening();
    state.active = true;
    state.phase = 'dictation';
    state.last = '';
    clearHighlight();
    setFallback('');
    el.transcript.textContent = '';
    show('Freie Diktation aktiv', 'Ich höre zu. Nenne Feldpaare ohne Pause, zum Beispiel: „Marke Ford, Modell Fiesta, Generation zweitausendzwei“.');
    controls();
    listen();
  }

  function askFinish() {
    if (!state.active) return;
    state.phase = 'confirm';
    stopListening();
    show('Bestätigung nötig', 'Bist du fertig? Sage „Ja“ zum Beenden oder „Nein“ zum Weiterdiktieren.');
    el.transcript.textContent = 'Keine automatische Speicherung – die Daten bleiben zur Prüfung im Formular.';
    controls();
    speakThen('Bist du fertig?', listen);
  }

  function repeat() {
    if (!state.active) return;
    stopListening();
    const message = state.last ? 'Zuletzt verstanden: ' + state.last + '.' : 'Nenne Feldpaare wie Marke, Modell, Baujahr, Kilometer oder Preis.';
    show('Wiederholung', message);
    speakThen(message, listen);
  }

  function continueDictation() {
    if (!state.active) return;
    state.phase = 'dictation';
    show('Freie Diktation aktiv', 'Ich höre weiter zu.');
    listen();
  }

  function finish() {
    stopSpeaking();
    stopListening();
    state.active = false;
    state.phase = 'review';
    clearHighlight();
    panel.classList.remove('is-listening', 'is-speaking', 'is-error');
    el.transcript.textContent = 'Keine automatische Speicherung – die Angaben bleiben zur Prüfung im Formular.';
    show('Zur Prüfung bereit', 'Die Diktation ist beendet. Prüfe die Werte und speichere nur mit „Fahrzeug speichern“, wenn alles stimmt.');
    controls();
  }

  function cancel() {
    stopSpeaking();
    stopListening();
    state.active = false;
    state.phase = 'cancelled';
    clearHighlight();
    panel.classList.remove('is-listening', 'is-speaking');
    el.transcript.textContent = 'Bereits übernommene Angaben bleiben im Formular.';
    show('Diktat abgebrochen', 'Du kannst vorhandene Werte prüfen, manuell ergänzen oder die Diktation erneut starten.');
    controls();
  }

  function pause(message) {
    stopSpeaking();
    stopListening();
    state.active = false;
    state.phase = 'paused';
    clearHighlight();
    panel.classList.add('is-error');
    show('Spracherfassung pausiert', message);
    controls();
  }

  function unavailable(message) {
    pause(message);
    setFallback(message);
  }

  function reset() {
    stopSpeaking();
    stopListening();
    state.active = false;
    state.phase = 'idle';
    state.last = '';
    clearHighlight();
    panel.classList.remove('is-listening', 'is-speaking', 'is-error');
    el.transcript.textContent = '';
    show('Bereit zum Start', 'Starte die freie Diktation und nenne Feldpaare in deinem Tempo.');
    setFallback(supported ? '' : 'Dein Browser unterstützt keine Web-Spracherkennung. Alle Formularfelder können weiterhin manuell ausgefüllt werden.');
    controls();
  }

  function intercept(event) {
    const target = event.target.closest?.('#voice-start, #voice-repeat, #voice-skip, #voice-finish, #voice-cancel');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (target.id === 'voice-start') start();
    else if (target.id === 'voice-repeat') repeat();
    else if (target.id === 'voice-skip') continueDictation();
    else if (target.id === 'voice-finish') askFinish();
    else if (target.id === 'voice-cancel') cancel();
  }

  document.addEventListener('click', intercept, true);
  document.addEventListener('autovalue:form-filled', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.active) pause('Die Spracherfassung wurde pausiert, weil die App nicht im Vordergrund ist.'); });
  reset();
})();
