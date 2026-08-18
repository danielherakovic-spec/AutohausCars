(() => {
  'use strict';

  const form = document.getElementById('vehicle-form');
  const panel = document.getElementById('voice-assistant');
  if (!form || !panel) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canRecognize = Boolean(SpeechRecognition) && (window.isSecureContext || location.hostname === 'localhost');
  const speech = window.speechSynthesis;
  const currentYear = new Date().getFullYear() + 1;
  const state = {
    active: false,
    phase: 'idle',
    index: 0,
    retries: 0,
    recognitionActive: false,
    shouldListen: false,
    handledResult: false,
    speechToken: 0,
    skipped: new Set(),
  };

  const els = {
    start: document.getElementById('voice-start'),
    repeat: document.getElementById('voice-repeat'),
    skip: document.getElementById('voice-skip'),
    finish: document.getElementById('voice-finish'),
    cancel: document.getElementById('voice-cancel'),
    question: document.getElementById('voice-question'),
    transcript: document.getElementById('voice-transcript'),
    label: document.getElementById('voice-progress-label'),
    count: document.getElementById('voice-progress-count'),
    bar: document.getElementById('voice-progress-bar'),
    fallback: document.getElementById('voice-fallback'),
    progress: panel.querySelector('[role="progressbar"]'),
  };

  const monthNames = {
    januar: '01', february: '02', februar: '02', maerz: '03', marz: '03',
    april: '04', mai: '05', juni: '06', juli: '07', august: '08', september: '09',
    oktober: '10', november: '11', dezember: '12',
  };
  const numberWords = {
    null: 0, zero: 0, eins: 1, ein: 1, eine: 1, einen: 1, einem: 1, einer: 1,
    zwei: 2, zwo: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
    zehn: 10, elf: 11, zwoelf: 12, dreizehn: 13, vierzehn: 14, fuenfzehn: 15,
    sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20,
    dreissig: 30, vierzig: 40, fuenfzig: 50, sechzig: 60, siebzig: 70,
    achtzig: 80, neunzig: 90,
  };
  const compoundOnes = { ein: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
  const tens = { zwanzig: 20, dreissig: 30, vierzig: 40, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };
  Object.entries(tens).forEach(([ten, tenValue]) => Object.entries(compoundOnes).forEach(([one, oneValue]) => {
    numberWords[`${one}und${ten}`] = tenValue + oneValue;
  }));

  const normalize = value => String(value || '')
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9,.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const titleCase = value => String(value || '').trim().split(/\s+/).map(part => {
    if (/^(?:bmw|dsg|cvt|co2|ps|kw|gmbh)$/i.test(part)) return part.toUpperCase();
    return part ? part.charAt(0).toLocaleUpperCase('de-DE') + part.slice(1) : '';
  }).join(' ');

  function directNumber(text) {
    const match = String(text).match(/\d[\d\s.,]*/);
    if (!match) return null;
    let value = match[0].trim().replace(/\s/g, '');
    if (/\.\d{3}(?:\.|$)/.test(value)) value = value.replace(/\./g, '');
    if (/,\d{3}(?:,|$)/.test(value) && !value.includes('.')) value = value.replace(/,/g, '');
    else value = value.replace(',', '.');
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function wordsNumber(raw) {
    const source = normalize(raw);
    if (!source) return null;
    const direct = directNumber(source);
    if (direct !== null) return direct;
    const [integerPart, decimalPart] = source.split(/\bkomma\b/, 2);
    const prepared = integerPart
      .replace(/-/g, ' ')
      .replace(/([a-z]+?)(tausend|hundert)/g, '$1 $2 ')
      .replace(/\s+/g, ' ')
      .trim();
    let total = 0;
    let current = 0;
    let seen = false;
    prepared.split(' ').forEach(token => {
      if (Object.prototype.hasOwnProperty.call(numberWords, token)) {
        current += numberWords[token];
        seen = true;
      } else if (token === 'hundert') {
        current = (current || 1) * 100;
        seen = true;
      } else if (token === 'tausend') {
        total += (current || 1) * 1000;
        current = 0;
        seen = true;
      }
    });
    if (!seen) return null;
    let result = total + current;
    if (decimalPart) {
      const decimal = wordsNumber(decimalPart);
      if (decimal !== null) {
        const digits = String(Math.trunc(decimal));
        result += Number(`0.${digits}`);
      }
    }
    return Number.isFinite(result) ? result : null;
  }

  function requiredNumber(answer, options = {}) {
    const number = wordsNumber(answer);
    if (number === null || number < (options.min ?? 0) || number > (options.max ?? Number.MAX_SAFE_INTEGER)) return null;
    return options.integer === false ? Math.round(number * 100) / 100 : Math.round(number);
  }

  function cleanFreeText(answer, labels = []) {
    let text = String(answer || '').trim().replace(/\s+/g, ' ');
    const labelPattern = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    if (labelPattern) text = text.replace(new RegExp(`^(?:die|der|das)?\\s*(?:${labelPattern})\\s*(?:ist|lautet|heisst)?\\s*`, 'i'), '');
    text = text.replace(/^(?:es ist|das ist|ein|eine)\s+/i, '');
    return titleCase(text);
  }

  function parseMonthYear(answer) {
    const normalized = normalize(answer);
    let month = Object.entries(monthNames).find(([name]) => new RegExp(`\\b${name}\\b`).test(normalized))?.[1] || '';
    const yearMatch = normalized.match(/\b(?:19|20)\d{2}\b/);
    const year = yearMatch ? Number(yearMatch[0]) : requiredNumber(normalized, { min: 1900, max: currentYear });
    if (!year || year < 1900 || year > currentYear) return null;
    if (!month) return { year, registration: '' };
    return { year, registration: `${year}-${month}` };
  }

  function parseFuel(answer) {
    const text = normalize(answer);
    if (/plug.*hybrid|plugin/.test(text)) return 'Plug-in-Hybrid';
    if (/hybrid/.test(text)) return 'Hybrid';
    if (/elektro|elektrisch|strom|electric/.test(text)) return 'Elektro';
    if (/diesel/.test(text)) return 'Diesel';
    if (/benzin|super|otto/.test(text)) return 'Benzin';
    if (/erdgas|cng/.test(text)) return 'Erdgas';
    if (/gas|lpg|autogas/.test(text)) return 'Autogas';
    return cleanFreeText(answer, ['kraftstoff', 'antrieb']);
  }

  function parseGearbox(answer) {
    const text = normalize(answer);
    if (/dsg/.test(text)) return 'DSG';
    if (/cvt/.test(text)) return 'CVT';
    if (/automatik|automatic/.test(text)) return 'Automatik';
    if (/handschalt|manuell|schaltgetriebe/.test(text)) return 'Handschaltung';
    if (/sonstig|ander/.test(text)) return 'Sonstiges';
    return null;
  }

  function parseDrive(answer) {
    const text = normalize(answer);
    if (/allrad|4matic|quattro|xdrive|4x4/.test(text)) return 'Allrad';
    if (/front/.test(text)) return 'Frontantrieb';
    if (/heck/.test(text)) return 'Heckantrieb';
    return cleanFreeText(answer, ['antrieb']);
  }

  function parseStatus(answer) {
    const text = normalize(answer);
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

  const questions = [
    { field: 'brand', label: 'Marke', prompt: 'Welche Marke hat das Fahrzeug? Zum Beispiel Ford.', hint: 'zum Beispiel Ford', parse: answer => cleanFreeText(answer, ['marke']) },
    { field: 'model', label: 'Modell', prompt: 'Wie lautet das Modell?', hint: 'zum Beispiel Fiesta', parse: answer => cleanFreeText(answer, ['modell']) },
    { field: 'series', label: 'Baureihe', prompt: 'Welche Baureihe hat das Fahrzeug?', hint: 'zum Beispiel Golf sieben', parse: answer => cleanFreeText(answer, ['baureihe']) },
    { field: 'generation', label: 'Generation', prompt: 'Welche Generation ist es?', hint: 'zum Beispiel acht V', parse: answer => cleanFreeText(answer, ['generation']) },
    { field: 'color', label: 'Farbe', prompt: 'Welche Farbe hat das Fahrzeug?', hint: 'zum Beispiel Schwarz', parse: answer => cleanFreeText(answer, ['farbe']) },
    { field: 'registration', label: 'Erstzulassung', prompt: 'Wann war die Erstzulassung? Nenne Monat und Jahr, zum Beispiel März zweitausend achtzehn.', hint: 'Monat und Jahr', parse: parseMonthYear, apply: value => {
      if (value.registration) setField('registration', value.registration);
      if (value.year) setField('year', value.year);
      return value.registration ? `Erstzulassung ${formatMonth(value.registration)}` : `Baujahr ${value.year}; Monat bitte prüfen`;
    } },
    { field: 'year', label: 'Baujahr', prompt: 'Welches Baujahr hat das Fahrzeug?', hint: 'zum Beispiel zweitausend achtzehn', parse: answer => requiredNumber(answer, { min: 1900, max: currentYear }) },
    { field: 'mileage', label: 'Kilometerstand', prompt: 'Wie viele Kilometer hat das Fahrzeug? Du kannst zum Beispiel hundertzwanzigtausend sagen.', hint: 'zum Beispiel 120.000 Kilometer', parse: answer => requiredNumber(answer, { min: 0, max: 2000000 }) },
    { field: 'fuel', label: 'Kraftstoff', prompt: 'Welchen Kraftstoff hat das Fahrzeug?', hint: 'Benzin, Diesel, Elektro oder Hybrid', parse: parseFuel },
    { field: 'gearbox', label: 'Getriebe', prompt: 'Welches Getriebe hat das Fahrzeug?', hint: 'Automatik, Handschaltung, DSG oder CVT', parse: parseGearbox },
    { field: 'drive', label: 'Antrieb', prompt: 'Welchen Antrieb hat das Fahrzeug?', hint: 'Front, Heck oder Allrad', parse: parseDrive },
    { field: 'ps', label: 'Leistung', prompt: 'Wie viel Leistung hat das Fahrzeug in PS?', hint: 'zum Beispiel einhundertfünfzig PS', parse: answer => {
      const value = requiredNumber(answer, { min: 1, max: 2500 });
      if (value === null) return null;
      const isKw = /\b(?:kw|kilowatt)\b/i.test(answer);
      return isKw ? { ps: Math.round(value * 1.35962), kw: value } : { ps: value, kw: Math.round(value / 1.35962) };
    }, apply: value => { setField('ps', value.ps); setField('kw', value.kw); return `${value.ps} PS`; } },
    { field: 'askingPrice', label: 'Angebotspreis', prompt: 'Wie hoch ist der aktuelle Angebotspreis in Euro?', hint: 'zum Beispiel neuntausendfünfhundert Euro', parse: answer => requiredNumber(answer, { min: 0, max: 10000000, integer: false }) },
    { field: 'purchasePrice', label: 'Einkaufspreis', prompt: 'Für welchen Preis wurde das Fahrzeug gekauft?', hint: 'zum Beispiel siebentausend Euro', parse: answer => requiredNumber(answer, { min: 0, max: 10000000, integer: false }) },
    { field: 'desiredSalePrice', label: 'Verkaufspreis', prompt: 'Welchen Verkaufspreis möchtest du ansetzen?', hint: 'zum Beispiel neuntausendvierhundert Euro', parse: answer => requiredNumber(answer, { min: 0, max: 10000000, integer: false }) },
    { field: 'owners', label: 'Anzahl Halter', prompt: 'Wie viele Vorhalter hatte das Fahrzeug?', hint: 'zum Beispiel zwei', parse: answer => requiredNumber(answer, { min: 0, max: 99 }) },
    { field: 'location', label: 'Ort', prompt: 'An welchem Ort steht das Fahrzeug?', hint: 'zum Beispiel Bremen', parse: answer => cleanFreeText(answer, ['ort', 'standort']) },
    { field: 'status', label: 'Status', prompt: 'Welchen Status soll das Fahrzeug erhalten?', hint: 'Entwurf, gekauft, in Aufbereitung oder inseriert', parse: parseStatus },
    { field: 'notes', label: 'Notizen', prompt: 'Möchtest du eine kurze Notiz hinterlegen?', hint: 'oder sage überspringen', parse: answer => String(answer || '').trim() },
  ];

  let recognition = null;
  if (canRecognize) {
    recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      state.recognitionActive = true;
      state.phase = 'listening';
      setStatus('Ich höre zu …', 'Sage deine Antwort oder einen Befehl.');
      panel.classList.remove('is-speaking');
      panel.classList.add('is-listening');
    };
    recognition.onresult = event => {
      let interim = '';
      let finalTranscript = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) finalTranscript += text;
        else interim += text;
      }
      if (interim) els.transcript.textContent = `Ich höre: „${interim.trim()}“`;
      if (finalTranscript.trim()) {
        state.handledResult = true;
        state.shouldListen = false;
        handleAnswer(finalTranscript.trim());
      }
    };
    recognition.onerror = event => {
      state.recognitionActive = false;
      if (!state.active || !state.shouldListen) return;
      state.shouldListen = false;
      if (event.error === 'aborted') return;
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'security'].includes(event.error)) {
        microphoneUnavailable('Der Mikrofonzugriff wurde nicht freigegeben oder ist nicht verfügbar. Du kannst das Formular weiterhin manuell ausfüllen.');
        return;
      }
      if (event.error === 'network') {
        pauseWithMessage('Die Spracherkennung ist gerade nicht erreichbar. Prüfe die Internetverbindung oder erfasse das Fahrzeug manuell.');
        return;
      }
      retryQuestion('Ich konnte dich nicht verstehen. Bitte wiederhole deine Antwort oder sage überspringen.');
    };
    recognition.onend = () => {
      const shouldRetry = state.active && state.shouldListen && !state.handledResult;
      state.recognitionActive = false;
      panel.classList.remove('is-listening');
      if (shouldRetry) {
        state.shouldListen = false;
        retryQuestion('Ich habe nichts gehört. Bitte sage die Antwort noch einmal oder sage überspringen.');
      }
    };
  }

  function formatMonth(value) {
    const [year, month] = String(value).split('-');
    const name = Object.entries(monthNames).find(([, number]) => number === month)?.[0] || month;
    return `${titleCase(name)} ${year}`;
  }

  function setFallback(message) {
    els.fallback.textContent = message;
    els.fallback.classList.toggle('show', Boolean(message));
  }

  function setStatus(label, question) {
    els.label.textContent = label;
    if (question) els.question.textContent = question;
    updateProgress();
  }

  function updateProgress() {
    const completed = Math.min(state.index, questions.length);
    const percent = Math.round((completed / questions.length) * 100);
    els.count.textContent = `${completed} von ${questions.length}`;
    els.bar.style.width = `${percent}%`;
    els.progress.setAttribute('aria-valuenow', String(completed));
  }

  function setControlState() {
    els.start.disabled = !canRecognize || state.active;
    els.repeat.disabled = !canRecognize || !state.active;
    els.skip.disabled = !state.active;
    els.finish.disabled = !state.active;
    els.cancel.disabled = !state.active;
    els.start.textContent = state.active ? 'Erfassung läuft' : '▶ Start';
  }

  function activeQuestion() {
    return questions[state.index];
  }

  function clearHighlight() {
    form.querySelectorAll('.voice-field-active').forEach(element => element.classList.remove('voice-field-active'));
  }

  function highlightQuestion(question) {
    clearHighlight();
    if (!question) return;
    const field = form.elements[question.field];
    if (field && field.classList) field.classList.add('voice-field-active');
  }

  function setField(name, value) {
    const field = form.elements[name];
    if (!field) return;
    field.value = value ?? '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function stopRecognition() {
    state.shouldListen = false;
    state.recognitionActive = false;
    if (recognition) {
      try { recognition.abort(); } catch { /* Nothing is listening. */ }
    }
    panel.classList.remove('is-listening');
  }

  function stopSpeaking() {
    state.speechToken += 1;
    if (speech) speech.cancel();
    panel.classList.remove('is-speaking');
  }

  function speakThenListen(text) {
    if (!state.active) return;
    stopRecognition();
    const token = ++state.speechToken;
    state.phase = 'speaking';
    panel.classList.remove('is-error', 'is-listening');
    panel.classList.add('is-speaking');
    setStatus('Ich spreche …', text);
    if (!speech || !('SpeechSynthesisUtterance' in window)) {
      window.setTimeout(() => {
        if (state.active && token === state.speechToken) beginListening();
      }, 300);
      return;
    }
    speech.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.96;
    utterance.pitch = 1;
    utterance.onend = () => {
      if (state.active && token === state.speechToken) window.setTimeout(beginListening, 350);
    };
    utterance.onerror = () => {
      if (state.active && token === state.speechToken) window.setTimeout(beginListening, 150);
    };
    speech.speak(utterance);
  }

  async function microphonePermissionIsDenied() {
    if (!navigator.permissions?.query) return false;
    try {
      const status = await navigator.permissions.query({ name: 'microphone' });
      return status.state === 'denied';
    } catch {
      return false;
    }
  }

  async function startInterview() {
    if (!canRecognize) {
      microphoneUnavailable('Diese Browserumgebung unterstützt die Web-Spracherkennung nicht. Nutze bitte die normale Formulareingabe; dafür ist kein zusätzlicher Dienst nötig.');
      return;
    }
    if (await microphonePermissionIsDenied()) {
      microphoneUnavailable('Der Mikrofonzugriff ist im Browser blockiert. Erlaube ihn in den Website-Einstellungen und starte danach erneut.');
      return;
    }
    stopSpeaking();
    stopRecognition();
    state.active = true;
    state.phase = 'speaking';
    state.retries = 0;
    state.skipped.clear();
    state.index = firstUnansweredQuestion();
    els.transcript.textContent = '';
    setFallback('');
    setControlState();
    askCurrentQuestion();
  }

  function firstUnansweredQuestion() {
    const index = questions.findIndex(question => {
      const field = form.elements[question.field];
      return !field || !String(field.value || '').trim();
    });
    return index === -1 ? 0 : index;
  }

  function askCurrentQuestion(prefix = '') {
    const question = activeQuestion();
    if (!question) {
      finishInterview();
      return;
    }
    state.retries = 0;
    highlightQuestion(question);
    els.transcript.textContent = '';
    const speechText = prefix ? `${prefix} ${question.prompt}` : question.prompt;
    speakThenListen(speechText);
  }

  function beginListening() {
    if (!state.active || !recognition) return;
    state.handledResult = false;
    state.shouldListen = true;
    try {
      recognition.start();
    } catch (error) {
      if (error.name !== 'InvalidStateError') pauseWithMessage('Die Spracherkennung konnte nicht gestartet werden. Bitte starte die Erfassung erneut oder nutze das Formular.');
    }
  }

  function commandFor(answer) {
    const text = normalize(answer);
    if (/\b(fertig|beenden|abschliessen|abschließen)\b/.test(text)) return 'finish';
    if (/\b(abbrechen|stopp|stop)\b/.test(text)) return 'cancel';
    if (/\b(ueberspringen|weiter|naechste|nächste)\b/.test(text)) return 'skip';
    if (/\b(wiederholen|nochmal|noch einmal)\b/.test(text)) return 'repeat';
    return '';
  }

  function handleAnswer(answer) {
    stopRecognition();
    const command = commandFor(answer);
    if (command === 'finish') return finishInterview();
    if (command === 'cancel') return cancelInterview();
    if (command === 'skip') return skipQuestion();
    if (command === 'repeat') return repeatQuestion();

    const question = activeQuestion();
    if (!question) return finishInterview();
    const value = question.parse(answer);
    if (value === null || value === '') {
      retryQuestion(`Ich konnte die Angabe für ${question.label} nicht sicher übernehmen. ${question.hint ? `Bitte nenne ${question.hint}.` : 'Bitte wiederhole die Antwort.'}`);
      return;
    }
    els.transcript.textContent = `Übernommen: „${answer}“`;
    const summary = question.apply ? question.apply(value) : (setField(question.field, value), formatValue(question, value));
    advanceQuestion(`${question.label} übernommen: ${summary}.`);
  }

  function formatValue(question, value) {
    if (['askingPrice', 'purchasePrice', 'desiredSalePrice'].includes(question.field)) {
      return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value));
    }
    if (question.field === 'mileage') return `${Number(value).toLocaleString('de-DE')} km`;
    return String(value);
  }

  function advanceQuestion(confirmation) {
    state.index += 1;
    state.retries = 0;
    updateProgress();
    if (state.index >= questions.length) {
      finishInterview('Die wichtigsten Fahrzeugdaten sind übernommen.');
      return;
    }
    const next = activeQuestion();
    highlightQuestion(next);
    speakThenListen(`${confirmation} ${next.prompt}`);
  }

  function skipQuestion() {
    if (!state.active) return;
    stopSpeaking();
    stopRecognition();
    const question = activeQuestion();
    if (question) state.skipped.add(question.field);
    state.index += 1;
    state.retries = 0;
    updateProgress();
    if (state.index >= questions.length) {
      finishInterview('Die Fragerunde ist abgeschlossen.');
      return;
    }
    const next = activeQuestion();
    highlightQuestion(next);
    speakThenListen(`${question?.label || 'Die Frage'} übersprungen. ${next.prompt}`);
  }

  function repeatQuestion() {
    if (!state.active) return;
    stopSpeaking();
    stopRecognition();
    const question = activeQuestion();
    if (!question) return finishInterview();
    askCurrentQuestion(`Ich wiederhole die Frage zu ${question.label}.`);
  }

  function retryQuestion(message) {
    if (!state.active) return;
    stopRecognition();
    state.retries += 1;
    if (state.retries > 2) {
      pauseWithMessage('Ich höre dich gerade nicht zuverlässig. Klicke „Wiederholen“, überspringe die Frage oder prüfe die Eingabe manuell.');
      return;
    }
    speakThenListen(message);
  }

  function finishInterview(message = 'Die Spracherfassung ist beendet.') {
    stopSpeaking();
    stopRecognition();
    state.active = false;
    state.phase = 'review';
    clearHighlight();
    panel.classList.remove('is-listening', 'is-speaking', 'is-error');
    const missing = [...form.querySelectorAll('[required]')].filter(field => !String(field.value || '').trim()).map(field => field.closest('label')?.childNodes[0]?.textContent?.trim()).filter(Boolean);
    const reviewMessage = missing.length
      ? `${message} Bitte prüfe besonders: ${missing.join(', ')}. Anschließend speicherst du mit „Fahrzeug speichern“.`
      : `${message} Bitte prüfe jetzt die Formularwerte und speichere erst danach mit „Fahrzeug speichern“.`;
    els.transcript.textContent = 'Keine automatische Speicherung – die Daten bleiben im geöffneten Formular.';
    setStatus('Zur Prüfung bereit', reviewMessage);
    setControlState();
  }

  function cancelInterview() {
    stopSpeaking();
    stopRecognition();
    state.active = false;
    state.phase = 'cancelled';
    clearHighlight();
    panel.classList.remove('is-listening', 'is-speaking');
    els.transcript.textContent = 'Bisher übernommene Antworten bleiben im Formular erhalten.';
    setStatus('Erfassung abgebrochen', 'Du kannst die vorhandenen Eingaben prüfen, manuell ergänzen oder die Spracherfassung erneut starten.');
    setControlState();
  }

  function pauseWithMessage(message) {
    stopSpeaking();
    stopRecognition();
    state.active = false;
    state.phase = 'paused';
    panel.classList.add('is-error');
    setStatus('Spracherfassung pausiert', message);
    setControlState();
  }

  function microphoneUnavailable(message) {
    pauseWithMessage(message);
    setFallback(message);
  }

  function resetAssistant() {
    stopSpeaking();
    stopRecognition();
    state.active = false;
    state.phase = 'idle';
    state.index = 0;
    state.retries = 0;
    state.skipped.clear();
    clearHighlight();
    panel.classList.remove('is-listening', 'is-speaking', 'is-error');
    els.transcript.textContent = '';
    setStatus('Bereit zum Start', 'Starte die Erfassung, wenn du bereit bist.');
    setFallback(canRecognize ? '' : 'Dein Browser unterstützt die Web-Spracherkennung nicht. Du kannst alle Felder weiterhin wie gewohnt manuell erfassen.');
    setControlState();
  }

  els.start.addEventListener('click', startInterview);
  els.repeat.addEventListener('click', repeatQuestion);
  els.skip.addEventListener('click', skipQuestion);
  els.finish.addEventListener('click', () => finishInterview('Die Spracherfassung wurde beendet.'));
  els.cancel.addEventListener('click', cancelInterview);
  document.addEventListener('autovalue:form-filled', resetAssistant);
  document.addEventListener('autovalue:view-changed', event => {
    if (event.detail?.view !== 'form' && state.active) cancelInterview();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.active) pauseWithMessage('Die Spracherfassung wurde pausiert, weil die App nicht im Vordergrund ist.');
  });

  resetAssistant();
})();
