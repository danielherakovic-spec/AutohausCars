/* Shared, workspace-scoped pinboard. Vehicle records remain in the existing app. */
(() => {
  'use strict';
  const PREFIX = 'carsautohaus-pinboard-shared-v1:';
  const WIDTH = 240;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const fresh = () => ({ version: 1, cards: [], edges: [], selected: [], viewport: { x: 0, y: 0, scale: 1 } });
  const uid = () => crypto.randomUUID();
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const finite = (n, fallback = 0) => Number.isFinite(n) ? clamp(n, -1000000, 1000000) : fallback;
  let api, root, viewport, world, svg, picker, board = fresh(), storageKey, gesture, linkSource, linkPoint;
  let active = false, saveTimer, undoState, undoAfter, storageFault = false;
  let sync, lastShared = { version: 1, cards: [], edges: [] }, deferredShared, syncLabel = 'Gemeinsame Pinwand wird geladen …';
  const $ = selector => root.querySelector(selector);

  function normalize(value) {
    if (value?.version !== 1 || !Array.isArray(value.cards) || !Array.isArray(value.edges)) throw new Error('Keine gültige Pinwand-Sicherung.');
    if (value.cards.length > 3000 || value.edges.length > 10000) throw new Error('Die Sicherung ist zu groß.');
    const ids = new Set();
    const cards = value.cards.map(card => {
      if (!card || typeof card.id !== 'string' || ids.has(card.id) || !['note', 'car', 'calculator'].includes(card.type)) throw new Error('Ungültige Karte in der Sicherung.');
      ids.add(card.id);
      return { id: card.id, type: card.type, vehicleId: String(card.vehicleId || ''), title: String(card.title || ''), text: String(card.text || ''),
        expression: String(card.expression || ''), result: String(card.result || ''),
        x: finite(card.x), y: finite(card.y), z: finite(card.z), color: /^#[0-9a-f]{6}$/i.test(card.color) ? card.color : '#ffffff', height: clamp(finite(card.height, 150), 130, 1500) };
    });
    const pairs = new Set();
    const edges = value.edges.filter(edge => {
      if (!edge || !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) return false;
      const pair = JSON.stringify([edge.from, edge.to].sort());
      if (pairs.has(pair)) return false;
      pairs.add(pair); return true;
    }).map(edge => ({ id: typeof edge.id === 'string' ? edge.id : uid(), from: edge.from, to: edge.to }));
    return { version: 1, cards, edges, selected: [...new Set((Array.isArray(value.selected) ? value.selected : []).filter(id => typeof id === 'string'))].slice(0, 2),
      viewport: { x: finite(value.viewport?.x), y: finite(value.viewport?.y), scale: clamp(finite(value.viewport?.scale, 1), .3, 1.8) } };
  }

  function setStatus(message) { $('#pb-status').textContent = message; }
  const shared = () => ({ version: 1, cards: structuredClone(board.cards), edges: structuredClone(board.edges) });
  function editing() { return gesture || saveTimer || root.contains(document.activeElement) && document.activeElement.matches('.pb-note-title, .pb-note-text, .pb-calc-expression, input[type=color]'); }
  function receiveShared(value) {
    if (editing()) { deferredShared = value; return; }
    deferredShared = null;
    const incoming = normalize({ ...value, selected: board.selected, viewport: board.viewport });
    if (JSON.stringify({cards:incoming.cards,edges:incoming.edges}) === JSON.stringify({cards:board.cards,edges:board.edges})) return;
    board = incoming; lastShared = shared();
    if (active) render();
  }
  function save() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(board)); storageFault = false; }
    catch { storageFault = true; setStatus('Speichern fehlgeschlagen — bitte Sicherung exportieren'); }
    const next = shared(); sync?.submit(lastShared, next); lastShared = next;
    if (!storageFault) setStatus(syncLabel);
  }
  function scheduleSave() { clearTimeout(saveTimer); setStatus('Speichert …'); saveTimer = setTimeout(save, 250); }
  function load() {
    const key = PREFIX + (api.workspaceKey() || 'local');
    if (storageKey === key) { void sync?.refresh(); return; }
    if (storageKey) save();
    sync?.close();
    storageKey = key; undoState = null; board = fresh();
    try { const stored = localStorage.getItem(key); if (stored) board = normalize(JSON.parse(stored)); }
    catch { setStatus('Gespeicherte Pinwand konnte nicht gelesen werden.'); storageFault = true; }
    lastShared = shared();
    const currentKey = key;
    sync = window.CarsPinboardSync.create({
      read: () => api.pinboard.read(), write: (patch, requestId) => api.pinboard.write(patch, requestId),
      subscribe: receive => api.pinboard.subscribe(receive),
      restore: () => JSON.parse(localStorage.getItem(currentKey + ':pending') || 'null'),
      persist: value => { try { localStorage.setItem(currentKey + ':pending', JSON.stringify(value)); } catch { storageFault = true; } },
      onChange: receiveShared,
      onStatus: message => { syncLabel = message; setStatus(message); }
    });
    void sync.start();
  }
  function photo(vehicle) {
    const value = api.photoUrl(vehicle?.photo) || '';
    return /^(https?:|blob:|data:image\/(png|jpe?g|webp|gif);)/i.test(value) ? value : '';
  }
  function name(vehicle) { return [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Fahrzeug'; }
  function ink(color) {
    const rgb = color.slice(1).match(/../g).map(hex => parseInt(hex, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > .179 ? '#262c29' : '#ffffff';
  }
  function cardElement(id) { return [...world.querySelectorAll('.pb-card')].find(el => el.dataset.card === id); }
  function paintCard(element, card) { element.style.setProperty('--pb-card-bg', card.color); element.style.setProperty('--pb-card-ink', ink(card.color)); }
  function render() {
    const vehicles = api.vehicles();
    board.cards.sort((a,b) => (a.z || 0) - (b.z || 0) || a.id.localeCompare(b.id));
    board.selected = board.selected.filter(id => vehicles.some(v => v.id === id) && board.cards.some(c => c.vehicleId === id && c.type === 'car'));
    world.querySelectorAll('.pb-card').forEach(el => el.remove());
    const fragment = document.createDocumentFragment();
    for (const card of board.cards) {
      const vehicle = vehicles.find(v => v.id === card.vehicleId);
      const element = document.createElement('article');
      element.className = 'pb-card'; element.dataset.card = card.id;
      element.style.left = card.x + 'px'; element.style.top = card.y + 'px';
      paintCard(element, card);
      const title = card.type === 'calculator' ? 'Taschenrechner' : card.type === 'note' ? 'Notiz' : (vehicle ? name(vehicle) : 'Fahrzeug nicht verfügbar');
      element.setAttribute('aria-label', title);
      element.innerHTML = `<div class="pb-card-head"><button class="pb-handle" aria-label="${escape(title)} verschieben" title="Ziehen oder mit den Pfeiltasten verschieben">⠿ &nbsp; ${card.type === 'note' ? 'NOTIZ' : 'FAHRZEUG'}</button><label class="pb-color" title="Kartenfarbe"><input type="color" value="${card.color}" aria-label="Kartenfarbe" /></label><button data-pb-delete title="Karte löschen" aria-label="Karte löschen">×</button></div><div class="pb-card-content"></div><button class="pb-port" aria-label="Faden verbinden" title="Faden zur anderen Karte ziehen oder zwei Verbindungspunkte anklicken">•</button>`;
      const content = element.querySelector('.pb-card-content');
      if (card.type === 'calculator') {
        element.querySelector('.pb-handle').textContent = '⠿  RECHNER';
        content.innerHTML = '<div class="pb-card-body"><input class="pb-calc-expression" aria-label="Rechnung" placeholder="z. B. 19900 + 850" maxlength="250" inputmode="text" /><output class="pb-calc-result" aria-label="Ergebnis" aria-live="polite"></output><div class="pb-calc-keys"></div><small class="pb-calc-hint">% = geteilt durch 100 · Enter = Ergebnis</small></div>';
        content.querySelector('input').value = card.expression || '';
        content.querySelector('output').textContent = card.result || '0';
        for (const key of ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '(', '0', ',', ')', '=']) {
          const button = document.createElement('button'); button.dataset.pbCalc = key; button.textContent = key;
          button.setAttribute('aria-label', key === 'C' ? 'Rechnung löschen' : key === '⌫' ? 'Letztes Zeichen löschen' : key === '=' ? 'Ergebnis berechnen' : key);
          content.querySelector('.pb-calc-keys').append(button);
        }
      } else if (card.type === 'note') {
        content.innerHTML = '<div class="pb-card-body"><input class="pb-note-title" placeholder="Deine Notiz" aria-label="Notiztitel" /><textarea class="pb-note-text" placeholder="Gedanken, Fragen, nächste Schritte …" aria-label="Notiztext"></textarea></div>';
        content.querySelector('input').value = card.title;
        const text = content.querySelector('textarea'); text.value = card.text; text.style.height = card.height + 'px';
      } else if (vehicle) {
        const url = photo(vehicle);
        content.innerHTML = `<div class="pb-photo">${url ? `<img src="${escape(url)}" alt="${escape(name(vehicle))}" draggable="false" />` : 'Kein Fahrzeugfoto'}</div><div class="pb-card-body"><h2>${escape(name(vehicle))}</h2><strong class="pb-price">${api.euro(Number(vehicle.askingPrice) || Number(vehicle.purchasePrice) || 0)}</strong><div class="pb-specs"><span>${escape(vehicle.year || 'Baujahr offen')}</span><span>${vehicle.mileage == null ? 'km offen' : Number(vehicle.mileage).toLocaleString('de-DE') + ' km'}</span><span>${escape(vehicle.fuel || 'Kraftstoff offen')}</span><span>${escape(vehicle.gearbox || 'Getriebe offen')}</span></div><label class="pb-select"><input type="checkbox" data-pb-select ${board.selected.includes(vehicle.id) ? 'checked' : ''} /> Im Vergleich</label></div>`;
        content.querySelector('img')?.addEventListener('error', event => { event.target.parentElement.textContent = 'Foto nicht verfügbar'; });
      } else content.innerHTML = '<div class="pb-card-body"><h2>Fahrzeug nicht verfügbar</h2><p>Es wurde aus dem Bestand entfernt.</p></div>';
      fragment.append(element);
    }
    world.append(fragment); transform(); refreshSelection();
    $('#pb-empty').hidden = board.cards.length > 0;
    $('#pb-undo').hidden = !undoState;
    if (!storageFault) setStatus(syncLabel);
    drawEdges();
    requestAnimationFrame(drawEdges);
  }
  function refreshSelection() {
    world.querySelectorAll('.pb-card').forEach(el => {
      const card = board.cards.find(c => c.id === el.dataset.card);
      if (!card) return;
      const selected = card.type === 'car' && board.selected.includes(card.vehicleId);
      el.classList.toggle('pb-selected', selected);
      el.classList.toggle('pb-link-source', card.id === linkSource);
      const checkbox = el.querySelector('[data-pb-select]'); if (checkbox) checkbox.checked = selected;
    });
    $('#pb-compare').textContent = `Vergleichen (${board.selected.length}/2)`;
    $('#pb-compare').disabled = board.selected.length !== 2;
  }
  function transform() {
    const { x, y, scale } = board.viewport;
    world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    viewport.style.backgroundSize = `${Math.max(16, 24 * scale)}px ${Math.max(16, 24 * scale)}px`;
    viewport.style.backgroundPosition = `${x}px ${y}px`;
    $('#pb-zoom').textContent = Math.round(scale * 100) + '%';
  }
  function point(clientX, clientY) {
    const rect = viewport.getBoundingClientRect(), v = board.viewport;
    return { x: (clientX - rect.left - v.x) / v.scale, y: (clientY - rect.top - v.y) / v.scale };
  }
  function anchor(id) {
    const card = board.cards.find(c => c.id === id), el = cardElement(id);
    return card && el ? { x: card.x + WIDTH, y: card.y + el.offsetHeight / 2 } : null;
  }
  function path(a, b) { const curve = Math.max(45, Math.abs(b.x - a.x) * .4); return `M ${a.x} ${a.y} C ${a.x + curve} ${a.y}, ${b.x + curve} ${b.y}, ${b.x} ${b.y}`; }
  function drawEdges() {
    svg.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    for (const edge of board.edges) {
      const a = anchor(edge.from), b = anchor(edge.to); if (!a || !b) continue;
      const group = document.createElementNS(ns, 'g'); group.classList.add('pb-edge'); group.dataset.edge = edge.id;
      group.setAttribute('tabindex', '0'); group.setAttribute('role', 'button'); group.setAttribute('aria-label', 'Faden löschen');
      for (const cls of ['pb-thread-hit', 'pb-thread']) { const line = document.createElementNS(ns, 'path'); line.setAttribute('d', path(a, b)); line.setAttribute('class', cls); group.append(line); }
      svg.append(group);
    }
    if (linkSource && linkPoint) {
      const a = anchor(linkSource); if (!a) return;
      const line = document.createElementNS(ns, 'path'); line.setAttribute('d', path(a, linkPoint)); line.setAttribute('class', 'pb-thread'); line.setAttribute('stroke-dasharray', '5 5'); svg.append(line);
    }
  }
  function cancelLink() { linkSource = null; linkPoint = null; refreshSelection(); drawEdges(); }
  function connect(from, to) {
    if (from !== to && !board.edges.some(e => (e.from === from && e.to === to) || (e.from === to && e.to === from))) {
      board.edges.push({ id: uid(), from, to }); save();
    }
    cancelLink();
  }
  function addCard(type, vehicleId = '') {
    const rect = viewport.getBoundingClientRect();
    const center = point(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const offset = (board.cards.length % 5) * 18;
    const card = { id: uid(), type, vehicleId, title: '', text: '', expression: '', result: '', x: center.x - WIDTH / 2 + offset, y: center.y - 150 + offset, color: type === 'note' ? '#f2efdc' : '#ffffff', height: 150 };
    card.z = Math.max(0, ...board.cards.map(c => c.z || 0)) + 1;
    board.cards.push(card); save(); render();
    if (type === 'note') cardElement(card.id).querySelector('.pb-note-title').focus();
  }
  function deleteCard(id) {
    undoState = structuredClone(board);
    board.cards = board.cards.filter(c => c.id !== id); board.edges = board.edges.filter(e => e.from !== id && e.to !== id);
    undoAfter = shared();
    cancelLink(); render(); save();
  }
  function deleteEdge(id) { undoState = structuredClone(board); board.edges = board.edges.filter(e => e.id !== id); undoAfter = shared(); $('#pb-undo').hidden = false; drawEdges(); save(); }
  function zoom(factor, clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    const px = clientX ?? rect.left + rect.width / 2, py = clientY ?? rect.top + rect.height / 2;
    const focus = point(px, py), scale = clamp(board.viewport.scale * factor, .3, 1.8);
    board.viewport = { scale, x: px - rect.left - focus.x * scale, y: py - rect.top - focus.y * scale };
    transform(); scheduleSave();
  }
  function fit() {
    if (!board.cards.length) { board.viewport = { x: 0, y: 0, scale: 1 }; transform(); save(); return; }
    const left = Math.min(...board.cards.map(c => c.x)), top = Math.min(...board.cards.map(c => c.y));
    const right = Math.max(...board.cards.map(c => c.x + WIDTH + 30));
    const bottom = Math.max(...board.cards.map(c => c.y + (cardElement(c.id)?.offsetHeight || 300)));
    const scale = clamp(Math.min((viewport.clientWidth - 80) / (right - left), (viewport.clientHeight - 80) / (bottom - top)), .3, 1);
    board.viewport = { scale, x: (viewport.clientWidth - (right - left) * scale) / 2 - left * scale, y: (viewport.clientHeight - (bottom - top) * scale) / 2 - top * scale };
    transform(); save();
  }
  function renderPicker() {
    const query = picker.querySelector('input').value.trim().toLocaleLowerCase('de');
    const vehicles = api.vehicles().filter(v => `${name(v)} ${v.year || ''} ${v.vehicleNumber || ''}`.toLocaleLowerCase('de').includes(query));
    const results = picker.querySelector('.pb-results'); results.replaceChildren();
    if (!vehicles.length) { const p = document.createElement('p'); p.textContent = query ? 'Keine passenden Fahrzeuge.' : 'Noch keine Fahrzeuge im Bestand. Lege zuerst unter „Autos“ ein Fahrzeug an.'; results.append(p); }
    for (const vehicle of vehicles) {
      const button = document.createElement('button'); button.className = 'pb-result'; const url = photo(vehicle);
      button.innerHTML = `${url ? `<img src="${escape(url)}" alt="" />` : '<span class="pb-result-placeholder">—</span>'}<span><b>${escape(name(vehicle))}</b><small>${escape(vehicle.year || '—')} · ${api.euro(Number(vehicle.askingPrice) || Number(vehicle.purchasePrice) || 0)}</small></span><span aria-hidden="true">+</span>`;
      button.querySelector('img')?.addEventListener('error', e => { e.target.remove(); });
      button.addEventListener('click', () => { picker.close(); addCard('car', vehicle.id); }); results.append(button);
    }
  }
  function exportBoard() {
    save();
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `CarsAutoHaus-Pinnwand-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function calculateCard(element, key) {
    const card = board.cards.find(c => c.id === element.dataset.card);
    const input = element.querySelector('.pb-calc-expression');
    if (key === '=') {
      try { card.result = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 10 }).format(window.CarsPinboardCalculator.calculate(card.expression)); }
      catch (error) { card.result = error.message; }
    } else {
      card.expression = key === 'C' ? '' : key === '⌫' ? card.expression.slice(0, -1) : (card.expression + key).slice(0, 250);
      card.result = '';
    }
    input.value = card.expression; element.querySelector('output').textContent = card.result || '0'; save();
  }
  function bind() {
    $('#pb-add-car').onclick = () => { picker.querySelector('input').value = ''; renderPicker(); picker.showModal(); };
    $('#pb-add-note').onclick = () => addCard('note');
    $('#pb-add-calculator').onclick = () => addCard('calculator');
    $('#pb-compare').onclick = () => { if (api.openPinboardComparison) api.openPinboardComparison(board.selected); else setStatus('Vergleich ist noch nicht geladen.'); };
    $('#pb-back').onclick = () => api.go('home');
    $('#pb-help-toggle').onclick = () => { const help = $('#pb-help'); help.hidden = !help.hidden; $('#pb-help-toggle').setAttribute('aria-expanded', String(!help.hidden)); };
    $('#pb-zoom-in').onclick = () => zoom(1.2); $('#pb-zoom-out').onclick = () => zoom(1 / 1.2); $('#pb-fit').onclick = fit;
    $('#pb-export').onclick = exportBoard; $('#pb-import').onclick = () => $('#pb-file').click();
    $('#pb-undo').onclick = () => { if (!undoState || !undoAfter) return; const restored = window.CarsPinboardSync.apply(shared(), window.CarsPinboardSync.diff(undoAfter, undoState)); board = { ...board, ...restored }; undoState = null; undoAfter = null; render(); save(); };
    $('#pb-file').onchange = async event => {
      const file = event.target.files[0]; if (!file) return;
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error('Bitte eine Sicherung unter 10 MB wählen.');
        const incoming = normalize(JSON.parse(await file.text()));
        if (!confirm('Die gemeinsame Pinwand für alle Benutzer durch diese Sicherung ersetzen? Du kannst dies anschließend rückgängig machen.')) return;
        undoState = structuredClone(board); board = incoming; undoAfter = shared(); cancelLink(); render(); save();
      } catch (error) { setStatus(error.message || 'Import fehlgeschlagen.'); }
      finally { event.target.value = ''; }
    };
    picker.querySelector('[data-pb-close]').onclick = () => picker.close();
    picker.querySelector('input').oninput = renderPicker;
    picker.addEventListener('click', event => { if (event.target === picker) { const r = picker.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) picker.close(); } });
    root.addEventListener('click', event => {
      const el = event.target.closest('.pb-card');
      const key = event.target.closest('[data-pb-calc]');
      if (key && el) calculateCard(el, key.dataset.pbCalc);
      if (event.target.closest('[data-pb-delete]') && el) deleteCard(el.dataset.card);
      const edge = event.target.closest('[data-edge]'); if (edge) deleteEdge(edge.dataset.edge);
      // Pointer users are handled below; keyboard activation of a connection point lands here.
      if (event.detail === 0 && event.target.closest('.pb-port') && el) {
        if (linkSource && linkSource !== el.dataset.card) connect(linkSource, el.dataset.card);
        else { linkSource = el.dataset.card; refreshSelection(); setStatus('Verbindungspunkt einer zweiten Karte wählen. Escape bricht ab.'); }
      }
    });
    root.addEventListener('input', event => {
      const el = event.target.closest('.pb-card'); if (!el) return;
      const card = board.cards.find(c => c.id === el.dataset.card);
      if (event.target.matches('.pb-note-title')) card.title = event.target.value;
      else if (event.target.matches('.pb-calc-expression')) { card.expression = event.target.value; card.result = ''; el.querySelector('output').textContent = '0'; }
      else if (event.target.matches('.pb-note-text')) card.text = event.target.value;
      else if (event.target.matches('input[type=color]')) { card.color = event.target.value; paintCard(el, card); }
      else return;
      scheduleSave();
    });
    root.addEventListener('focusout', () => setTimeout(() => {
      if (saveTimer) save();
      if (!editing() && deferredShared) { deferredShared = null; receiveShared(sync.snapshot()); }
    }, 0));
    root.addEventListener('change', event => {
      if (!event.target.matches('[data-pb-select]')) return;
      const card = board.cards.find(c => c.id === event.target.closest('.pb-card').dataset.card);
      if (event.target.checked && !board.selected.includes(card.vehicleId)) {
        if (board.selected.length === 2) { event.target.checked = false; setStatus('Zwei Autos ausgewählt. Wähle zuerst eines davon ab.'); return; }
        board.selected.push(card.vehicleId);
      } else board.selected = board.selected.filter(id => id !== card.vehicleId);
      refreshSelection(); save();
    });
    root.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('.pb-calc-expression')) { event.preventDefault(); calculateCard(event.target.closest('.pb-card'), '='); }
      if (event.key === 'Escape') { cancelLink(); $('#pb-help').hidden = true; $('#pb-help-toggle').setAttribute('aria-expanded', 'false'); }
      const edge = event.target.closest('[data-edge]');
      if (edge && ['Enter', ' ', 'Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); deleteEdge(edge.dataset.edge); }
      if (!event.target.matches('.pb-handle')) return;
      const card = board.cards.find(c => c.id === event.target.closest('.pb-card').dataset.card);
      const step = event.shiftKey ? 40 : 10;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); card.x += event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        card.y += event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        const el = cardElement(card.id); el.style.left = card.x + 'px'; el.style.top = card.y + 'px'; drawEdges(); scheduleSave();
      }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteCard(card.id); }
    });
    viewport.addEventListener('pointerdown', event => {
      if (event.button !== 0 || gesture) return;
      const el = event.target.closest('.pb-card'), card = el && board.cards.find(c => c.id === el.dataset.card);
      if (event.target.closest('.pb-port')) {
        event.preventDefault();
        if (linkSource && linkSource !== card.id) { connect(linkSource, card.id); return; }
        linkSource = card.id; linkPoint = point(event.clientX, event.clientY); refreshSelection();
        gesture = { type: 'link', pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      } else if (event.target.closest('.pb-handle')) {
        event.preventDefault(); cancelLink();
        gesture = { type: 'card', pointer: event.pointerId, id: card.id, x: event.clientX, y: event.clientY, startX: card.x, startY: card.y };
        card.z = Math.max(0, ...board.cards.map(c => c.z || 0)) + 1;
        // Move the DOM node and array entry together to preserve front-to-back order after reload.
        board.cards = board.cards.filter(c => c.id !== card.id).concat(card); world.append(el); el.classList.add('pb-dragging');
      } else if (!el && !event.target.closest('[data-edge]')) {
        cancelLink(); gesture = { type: 'pan', pointer: event.pointerId, x: event.clientX, y: event.clientY, startX: board.viewport.x, startY: board.viewport.y };
      } else return;
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener('pointermove', event => {
      if (linkSource) { linkPoint = point(event.clientX, event.clientY); drawEdges(); }
      if (!gesture || event.pointerId !== gesture.pointer) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (gesture.type === 'link') { gesture.moved ||= Math.hypot(dx, dy) > 6; return; }
      if (gesture.type === 'pan') { board.viewport.x = gesture.startX + dx; board.viewport.y = gesture.startY + dy; transform(); }
      else {
        const card = board.cards.find(c => c.id === gesture.id), el = cardElement(card.id);
        card.x = gesture.startX + dx / board.viewport.scale; card.y = gesture.startY + dy / board.viewport.scale;
        el.style.left = card.x + 'px'; el.style.top = card.y + 'px'; drawEdges();
      }
    });
    const endGesture = event => {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      const current = gesture; gesture = null;
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      world.querySelectorAll('.pb-dragging').forEach(el => el.classList.remove('pb-dragging'));
      if (current.type === 'link') {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.pb-card');
        if (event.type === 'pointercancel') cancelLink();
        else if (target && target.dataset.card !== linkSource) connect(linkSource, target.dataset.card);
        else if (current.moved) cancelLink();
        else setStatus('Jetzt den Verbindungspunkt der zweiten Karte anklicken.');
      } else save();
    };
    viewport.addEventListener('pointerup', endGesture); viewport.addEventListener('pointercancel', endGesture);
    viewport.addEventListener('wheel', event => {
      if (event.target.closest('textarea')) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) zoom(Math.exp(-event.deltaY * .005), event.clientX, event.clientY);
      else { board.viewport.x -= event.deltaX; board.viewport.y -= event.deltaY; transform(); scheduleSave(); }
    }, { passive: false });
    // Textarea resize handles change connection geometry and are persisted too.
    viewport.addEventListener('pointerup', () => { for (const card of board.cards.filter(c => c.type === 'note')) { const el = cardElement(card.id)?.querySelector('textarea'); if (el && card.height !== el.offsetHeight) { card.height = el.offsetHeight; scheduleSave(); } } drawEdges(); });
    window.addEventListener('resize', drawEdges);
    window.addEventListener('pagehide', () => { if (storageKey) save(); });
    window.addEventListener('online', () => { void sync?.refresh(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && storageKey) save(); });
    document.addEventListener('autovalue:view-changed', event => {
      active = event.detail?.view === 'pinboard'; document.body.classList.toggle('pb-open', active);
      if (active) { load(); render(); }
      else { if (storageKey) save(); cancelLink(); picker.close(); }
    });
    document.addEventListener('carsautohaus:operations-updated', () => {
      if (active && !gesture && !root.contains(document.activeElement)) render();
    });
  }

  function start() {
    api = window.CarsAutoHaus;
    if (!api || document.getElementById('pinboard-view')) return;
    root = document.createElement('section'); root.id = 'pinboard-view'; root.className = 'view'; root.setAttribute('aria-label', 'Pinwand');
    root.innerHTML = `<header class="pb-top"><div class="pb-brand"><button id="pb-back" class="pb-icon" title="Zurück zur Website" aria-label="Zurück zur Website">←</button><div><h1>Pinwand</h1><small>Raum für deine Auswahl.</small></div></div><div class="pb-actions"><button id="pb-add-car">+ Auto</button><button id="pb-add-note">+ Notiz</button><button id="pb-compare" class="pb-primary" disabled>Vergleichen (0/2)</button><button id="pb-help-toggle" aria-label="Bedienung erklären" aria-expanded="false" aria-controls="pb-help">?</button></div></header><div class="pb-viewport" id="pb-viewport"><div class="pb-world"><svg class="pb-edges" aria-label="Verbindungen"></svg></div><div id="pb-empty" class="pb-empty"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="5" y="9" width="23" height="26" rx="4" stroke="currentColor"/><rect x="13" y="4" width="22" height="26" rx="4" fill="#f7f8f4" stroke="currentColor"/><path d="M19 13h10M19 18h7" stroke="currentColor" stroke-linecap="round"/></svg><h2>Alles beginnt mit einer Karte.</h2><p>Pinne ein Auto an oder halte einen Gedanken fest.</p></div></div><aside id="pb-help" class="pb-help" hidden><p><b>Dein Platz für Ideen.</b></p><p>Füge Autos aus deinem Bestand und eigene Notizen hinzu. Ziehe Karten an ihrer oberen Leiste an einen freien Platz.</p><p>Ziehe den Punkt rechts an einer Karte zu einer anderen Karte, um einen Faden zu spannen. Alternativ beide Punkte anklicken. Faden anklicken = entfernen.</p><p>Wähle zwei Autos über „Im Vergleich“ und öffne „Vergleichen“.</p><p>Am Farbpunkt wählst du jede beliebige Kartenfarbe. × entfernt nur die Karte, nie das Fahrzeug.</p><p>Leere Fläche ziehen = verschieben. + / − = zoomen. „Alle“ zeigt deine Karten. Tastatur: Kartenleiste fokussieren und Pfeiltasten verwenden.</p><p>Automatisch auf diesem Gerät gespeichert. Mit Export und Import kannst du deine Pinwand sichern oder übertragen. Fahrzeugfotos und Fahrzeugdaten stammen weiterhin aus deinem Bestand.</p></aside><footer class="pb-bottom"><span id="pb-status" class="pb-status" role="status" aria-live="polite">Auf diesem Gerät gespeichert</span><div class="pb-controls"><button id="pb-undo" hidden>Rückgängig</button><button id="pb-export" title="Pinwand als Datei sichern">Export</button><button id="pb-import" title="Pinwand-Sicherung laden">Import</button><button id="pb-zoom-out" aria-label="Verkleinern">−</button><span class="pb-zoom" id="pb-zoom">100%</span><button id="pb-zoom-in" aria-label="Vergrößern">+</button><button id="pb-fit" title="Alle Karten anzeigen">Alle</button></div><input type="file" id="pb-file" accept="application/json,.json" hidden /></footer>`;
    root.querySelector('#pb-help-toggle').insertAdjacentHTML('beforebegin', '<button id="pb-add-calculator">+ Rechner</button>');
    root.querySelector('#pb-status').textContent = syncLabel;
    root.querySelector('#pb-help p:last-child').textContent = 'Karten, Notizen, Rechnungen, Farben und Fäden werden für alle Benutzer dieses gemeinsamen Bestands synchronisiert. Zoom und Vergleichsauswahl bleiben persönlich. Export sichert die Pinwand; Import ersetzt sie für alle.';
    document.querySelector('.app').append(root);
    viewport = $('#pb-viewport'); world = $('.pb-world'); svg = $('.pb-edges');
    picker = document.createElement('dialog'); picker.id = 'pb-picker'; picker.setAttribute('aria-labelledby', 'pb-picker-title');
    picker.innerHTML = '<div class="pb-picker-head"><h2 id="pb-picker-title">Auto anpinnen</h2><button data-pb-close aria-label="Schließen">×</button></div><p>Wähle ein Fahrzeug aus deinem Bestand.</p><input type="search" aria-label="Fahrzeuge suchen" placeholder="Marke, Modell oder Baujahr suchen …" /><div class="pb-results"></div>';
    document.body.append(picker);
    const nav = document.querySelector('.nav-inner');
    const button = document.createElement('button'); button.className = 'nav-button'; button.dataset.go = 'pinboard';
    button.innerHTML = '<span class="nav-icon">▧</span>Pinwand'; nav?.append(button);
    const home = document.querySelector('#home-view .hero');
    if (home) { const shortcut = document.createElement('button'); shortcut.className = 'secondary'; shortcut.dataset.go = 'pinboard'; shortcut.textContent = 'Pinwand öffnen ↗'; home.append(shortcut); }
    bind();
  }
  if (window.CarsAutoHaus) start(); else document.addEventListener('carsautohaus:ready', start, { once: true });
})();
