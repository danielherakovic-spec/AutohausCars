(() => {
  'use strict';
  const C = window.CarsCalendarCore;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const categories = ['Probefahrt', 'Werkstatt', 'Abholung', 'Verkauf', 'Besichtigung', 'Sonstiges'];
  const colors = ['#7cbece', '#dba972', '#a69bda', '#77b99c', '#dd9393', '#8aa8bf'];
  const labelDate = (day, options = {}) => new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', day: 'numeric', month: 'long', ...options }).format(C.wall(day));
  const vehicleName = v => api.vehicleName(v);
  let api, root, dialog, vehicleDialog, store, workspace, anchor = C.today(), view = 'month', query = '', category = '', selected = C.today(), draft, occurrence, vehicleMode, chosenVehicles = [], reminderTimer;
  const reminded = new Set();
  const $ = selector => root.querySelector(selector);
  const D = selector => dialog.querySelector(selector);
  const events = () => (store?.list() || []).filter(e => e.type === 'event');
  const pins = () => (store?.list() || []).filter(e => e.type === 'vehicle-pin');
  const status = message => { $('#cal-status').textContent = message; };
  function safePhoto(vehicle) { const url = api.photoUrl?.(vehicle.photo) || ''; return /^(https?:|blob:|data:image\/(png|jpe?g|webp|gif);)/i.test(url) ? url : ''; }
  function range() {
    if (view === 'month') { const first = anchor.slice(0, 7) + '-01', offset = (C.wall(first).getUTCDay() + 6) % 7; const start = C.addDays(first, -offset); return [start, C.addDays(start, 42)]; }
    if (view === 'week') { const start = C.addDays(anchor, -((C.wall(anchor).getUTCDay() + 6) % 7)); return [start, C.addDays(start, 7)]; }
    return [anchor, C.addDays(anchor, view === 'agenda' ? 45 : 1)];
  }
  function matching() {
    const vehicles = api.vehicles();
    return events().filter(event => (!category || event.category === category) && (!query || [event.title, event.description, event.location, ...(event.vehicleIds || []).map(id => vehicleName(vehicles.find(v => v.id === id) || {}))].join(' ').toLocaleLowerCase('de').includes(query)));
  }
  function dayItems(items, day) { return items.filter(event => event.start < C.addDays(day, 1) + 'T00:00' && event.end > day + 'T00:00'); }
  function eventButton(event, extra = '') {
    const vehicle = api.vehicles().find(v => (event.vehicleIds || []).includes(v.id));
    return `<button type="button" class="cal-event" style="--event-color:${/^#[0-9a-f]{6}$/i.test(event.color) ? event.color : '#8aa8bf'}" draggable="true" data-cal-event="${esc(event.seriesId)}" data-cal-occurrence="${event.occurrenceDate}" ${extra} title="${esc(event.title)}${vehicle ? ' · ' + esc(vehicleName(vehicle)) : ''}"><span class="cal-event-time">${event.allDay ? 'Ganztägig' : event.start.slice(11)}</span><span class="cal-event-title">${esc(event.title)}</span>${(event.vehicleIds || []).length ? '<span class="cal-car-count" aria-label="Fahrzeug angeheftet">▱</span>' : ''}</button>`;
  }
  function month(items, start) {
    let html = '<div class="cal-weekdays">' + ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(s => `<span>${s}</span>`).join('') + '</div><div class="cal-month">';
    for (let i = 0; i < 42; i++) {
      const day = C.addDays(start, i), onDay = dayItems(items, day);
      html += `<div class="cal-day ${day.slice(0, 7) !== anchor.slice(0, 7) ? 'cal-outside' : ''} ${day === C.today() ? 'cal-today' : ''} ${day === selected ? 'cal-chosen' : ''}" data-cal-drop="${day}"><div class="cal-day-top"><button data-cal-day="${day}" aria-label="${labelDate(day, { weekday: 'long', year: 'numeric' })}">${Number(day.slice(8))}</button><button class="cal-day-add" data-cal-new="${day}" aria-label="Termin am ${labelDate(day)} hinzufügen">+</button></div><div class="cal-day-events">${onDay.slice(0, 3).map(e => eventButton(e)).join('')}${onDay.length > 3 ? `<button class="cal-more" data-cal-showday="${day}">+ ${onDay.length - 3} weitere</button>` : ''}</div></div>`;
    }
    return html + '</div>';
  }
  function timeline(items, start, days) {
    let html = '<div class="cal-time-shell"><div class="cal-time-head" style="--days:' + days + '"><span>Berlin</span>';
    for (let i = 0; i < days; i++) { const day = C.addDays(start, i); html += `<button data-cal-showday="${day}" class="${day === C.today() ? 'cal-current-day' : ''}">${labelDate(day, { weekday: 'short', month: 'short' })}</button>`; }
    html += '</div><div class="cal-all-day" style="--days:' + days + '"><span>Ganztägig</span>';
    for (let i = 0; i < days; i++) { const day = C.addDays(start, i); html += `<div data-cal-drop="${day}">${dayItems(items, day).filter(e => e.allDay).map(e => eventButton(e)).join('')}</div>`; }
    html += '</div><div class="cal-time-scroll"><div class="cal-time-grid" style="--days:' + days + '"><div class="cal-hours">';
    for (let hour = 0; hour < 24; hour++) html += `<span>${String(hour).padStart(2, '0')}:00</span>`;
    html += '</div>';
    for (let i = 0; i < days; i++) {
      const day = C.addDays(start, i), timed = dayItems(items, day).filter(e => !e.allDay);
      html += `<div class="cal-time-day" data-cal-drop="${day}">`;
      for (let hour = 0; hour < 24; hour++) html += `<button class="cal-hour-slot" data-cal-new="${day}" data-cal-hour="${hour}" aria-label="Termin am ${labelDate(day)} um ${hour} Uhr hinzufügen"></button>`;
      // Overlapping appointments retain individual click targets in adjacent lanes.
      const lanes = [];
      for (const event of timed) {
        const startMinutes = event.start.slice(0, 10) < day ? 0 : Number(event.start.slice(11, 13)) * 60 + Number(event.start.slice(14, 16));
        const endMinutes = event.end.slice(0, 10) > day ? 1440 : Number(event.end.slice(11, 13)) * 60 + Number(event.end.slice(14, 16));
        let lane = lanes.findIndex(end => end <= startMinutes); if (lane < 0) lane = lanes.length; lanes[lane] = endMinutes;
        const width = 100 / Math.max(1, timed.filter(other => other.start < event.end && other.end > event.start).length);
        html += `<div class="cal-positioned" style="top:${startMinutes / 60 * 48}px;height:${Math.max(30, (endMinutes - startMinutes) / 60 * 48)}px;left:${Math.min(lane * width, 75)}%;width:${Math.min(width, 100 - Math.min(lane * width, 75))}%">${eventButton(event)}</div>`;
      }
      html += '</div>';
    }
    return html + '</div></div></div>';
  }
  function agenda(items) {
    if (!items.length) return '<div class="cal-empty"><b>Freiraum für neue Pläne.</b><p>In diesem Zeitraum gibt es keine passenden Termine.</p><button class="cal-primary" data-cal-new="' + anchor + '">Termin anlegen</button></div>';
    return '<div class="cal-agenda">' + items.map(event => `<article><div class="cal-agenda-date"><strong>${Number(event.start.slice(8, 10))}</strong><span>${labelDate(event.start.slice(0, 10), { month: 'short', weekday: 'short' })}</span></div><div>${eventButton(event)}<p>${esc(event.location || event.category || '')}${event.recurrence !== 'none' && event.recurrence ? ' · Wiederholt sich' : ''}</p></div><span class="cal-agenda-end">${event.allDay ? 'Ganztägig' : `${event.start.slice(11)} – ${event.end.slice(11)}`}</span></article>`).join('') + '</div>';
  }
  function renderSidebar() {
    const all = C.occurrences(events(), selected, C.addDays(selected, 1));
    $('#cal-selected-label').textContent = labelDate(selected, { weekday: 'long' });
    $('#cal-selected-events').innerHTML = all.length ? all.map(eventButton).join('') : '<p class="cal-muted">Noch nichts geplant.</p>';
    const vehicles = api.vehicles();
    $('#cal-pinned-cars').innerHTML = pins().map(pin => {
      const vehicle = vehicles.find(v => v.id === pin.vehicleId), url = vehicle && safePhoto(vehicle);
      return `<article class="cal-car-pin" draggable="true" data-cal-vehicle="${esc(pin.vehicleId)}">${url ? `<img src="${esc(url)}" alt="" />` : '<span class="cal-car-placeholder">▱</span>'}<div><b>${esc(vehicle ? vehicleName(vehicle) : 'Fahrzeug entfernt')}</b><small>${vehicle ? api.euro(vehicle.askingPrice || vehicle.purchasePrice) : 'Nicht mehr im Bestand'}</small><button data-cal-car-new="${esc(pin.vehicleId)}">Termin planen</button></div><button class="cal-remove-pin" data-cal-remove-pin="${esc(pin.id)}" aria-label="Fahrzeug lösen">×</button></article>`;
    }).join('') || '<p class="cal-muted">Fahrzeuge hier anheften und direkt für Termine verwenden.</p>';
    $('#cal-pinned-cars').querySelectorAll('img').forEach(img => img.onerror = () => img.remove());
  }
  function render() {
    if (!root) return;
    const [from, to] = range(), items = C.occurrences(matching(), from, to);
    $('#cal-title').textContent = view === 'month' ? labelDate(anchor, { month: 'long', year: 'numeric', day: undefined }) : view === 'day' ? labelDate(anchor, { weekday: 'long' }) : `${labelDate(from, { month: 'short' })} – ${labelDate(C.addDays(to, -1), { month: 'short', year: 'numeric' })}`;
    $('#cal-count').textContent = `${items.length} ${items.length === 1 ? 'Termin' : 'Termine'} im Zeitraum`;
    root.querySelectorAll('[data-cal-view]').forEach(button => { button.classList.toggle('is-selected', button.dataset.calView === view); button.setAttribute('aria-pressed', String(button.dataset.calView === view)); });
    $('#cal-content').innerHTML = view === 'month' ? month(items, from) : view === 'agenda' ? agenda(items) : timeline(items, from, view === 'week' ? 7 : 1);
    if (view === 'week' || view === 'day') $('#cal-content .cal-time-scroll').scrollTop = 7 * 48;
    renderSidebar(); status(store?.status() || 'Kalender wird geladen …');
  }
  async function connect() {
    const key = api.workspaceKey(); if (!key) return;
    if (workspace === key && store) { void store.refresh?.(); return; }
    workspace = key; store = window.CarsWorkspaceData.open('calendar');
    store.subscribe(() => { if (root.classList.contains('active')) render(); });
    try { await store.ready; render(); } catch (error) { status(error.message); }
  }
  function navigate(direction) {
    if (view === 'month') { const d = C.wall(anchor.slice(0, 7) + '-01'); d.setUTCMonth(d.getUTCMonth() + direction); anchor = C.dateKey(d); }
    else anchor = C.addDays(anchor, direction * (view === 'week' ? 7 : view === 'agenda' ? 45 : 1));
    render();
  }
  function drawAttached() {
    const vehicles = api.vehicles();
    D('#cal-event-cars').innerHTML = chosenVehicles.map(id => { const vehicle = vehicles.find(v => v.id === id); return `<span class="cal-attached">${esc(vehicle ? vehicleName(vehicle) : 'Fahrzeug nicht verfügbar')}<button type="button" data-cal-detach="${esc(id)}" aria-label="Fahrzeug vom Termin lösen">×</button></span>`; }).join('') || '<span class="cal-muted">Noch kein Fahrzeug angeheftet.</span>';
  }
  function openEditor(id, day = selected, hour = 9, occ = '') {
    occurrence = occ;
    draft = id ? structuredClone(store.get(id)) : { id: crypto.randomUUID(), type: 'event', title: '', start: day + `T${String(hour).padStart(2, '0')}:00`, end: hour === 23 ? C.addDays(day, 1) + 'T00:00' : day + `T${String(hour + 1).padStart(2, '0')}:00`, allDay: false, color: colors[0], category: categories[0], recurrence: 'none', until: '', reminder: 30, exceptions: [], vehicleIds: [] };
    if (!draft) return;
    const form = D('form'); form.reset();
    D('#cal-editor-heading').textContent = id ? draft.recurrence !== 'none' ? 'Terminserie bearbeiten' : 'Termin bearbeiten' : 'Neuer Termin';
    D('#cal-edit-title').value = draft.title;
    D('#cal-edit-start').value = draft.start.slice(0, 10); D('#cal-edit-end').value = draft.allDay ? C.addDays(draft.end.slice(0, 10), -1) : draft.end.slice(0, 10);
    D('#cal-edit-start-time').value = draft.start.slice(11, 16); D('#cal-edit-end-time').value = draft.end.slice(11, 16);
    D('#cal-edit-all-day').checked = Boolean(draft.allDay); D('#cal-edit-category').value = categories.includes(draft.category) ? draft.category : 'Sonstiges';
    D('#cal-edit-color').value = /^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : colors[0];
    D('#cal-edit-location').value = draft.location || ''; D('#cal-edit-description').value = draft.description || '';
    D('#cal-edit-repeat').value = draft.recurrence || 'none'; D('#cal-edit-until').value = draft.until || ''; D('#cal-edit-reminder').value = String(draft.reminder || 0);
    D('#cal-delete-event').hidden = !id; D('#cal-skip-event').hidden = !id || !occ || !draft.recurrence || draft.recurrence === 'none';
    D('#cal-editor-error').textContent = ''; chosenVehicles = [...(draft.vehicleIds || [])]; drawAttached(); toggleTimes(); dialog.showModal();
  }
  function toggleTimes() { const allDay = D('#cal-edit-all-day').checked; D('#cal-edit-start-time').disabled = allDay; D('#cal-edit-end-time').disabled = allDay; D('#cal-edit-until').disabled = D('#cal-edit-repeat').value === 'none'; }
  async function saveEditor(event) {
    event.preventDefault(); const button = D('#cal-save-event'); button.disabled = true; D('#cal-editor-error').textContent = '';
    try {
      const allDay = D('#cal-edit-all-day').checked;
      const updated = { ...draft, type: 'event', title: D('#cal-edit-title').value.trim(), allDay,
        start: D('#cal-edit-start').value + 'T' + (allDay ? '00:00' : D('#cal-edit-start-time').value),
        end: (allDay ? C.addDays(D('#cal-edit-end').value, 1) : D('#cal-edit-end').value) + 'T' + (allDay ? '00:00' : D('#cal-edit-end-time').value),
        category: D('#cal-edit-category').value, color: D('#cal-edit-color').value, location: D('#cal-edit-location').value.trim(), description: D('#cal-edit-description').value,
        recurrence: D('#cal-edit-repeat').value, until: D('#cal-edit-repeat').value === 'none' ? '' : D('#cal-edit-until').value, reminder: Number(D('#cal-edit-reminder').value), vehicleIds: chosenVehicles };
      C.validate(updated); await store.put(updated); dialog.close(); render();
    } catch (error) { D('#cal-editor-error').textContent = error.message || 'Termin konnte nicht gespeichert werden.'; }
    finally { button.disabled = false; }
  }
  function openVehicles(mode) { vehicleMode = mode; vehicleDialog.querySelector('input').value = ''; renderVehicles(); vehicleDialog.showModal(); }
  function renderVehicles() {
    const q = vehicleDialog.querySelector('input').value.trim().toLowerCase();
    const vehicles = api.vehicles().filter(v => vehicleName(v).toLowerCase().includes(q));
    vehicleDialog.querySelector('.cal-vehicle-results').innerHTML = vehicles.map(v => {
      const photo = safePhoto(v), attached = vehicleMode === 'event' ? chosenVehicles.includes(v.id) : pins().some(p => p.vehicleId === v.id);
      return `<button class="cal-vehicle-result" data-cal-pick="${esc(v.id)}" ${attached ? 'disabled' : ''}>${photo ? `<img src="${esc(photo)}" alt="" />` : '<span class="cal-car-placeholder">▱</span>'}<span><b>${esc(vehicleName(v))}</b><small>${api.euro(v.askingPrice || v.purchasePrice)} · ${esc(v.status || '')}</small></span><span>${attached ? 'Angeheftet' : '+'}</span></button>`;
    }).join('') || '<p class="cal-muted">Keine passenden Fahrzeuge im Bestand.</p>';
    vehicleDialog.querySelectorAll('img').forEach(img => img.onerror = () => img.remove());
  }
  async function moveEvent(id, occurrenceDate, day) {
    const event = store.get(id); if (!event || occurrenceDate === day) return;
    if (event.recurrence !== 'none' && !confirm('Die gesamte Terminserie entsprechend verschieben?')) return;
    try { const delta = (C.wall(day) - C.wall(occurrenceDate || event.start.slice(0, 10))) / 86400000; await store.put(C.shift(event, C.addDays(event.start.slice(0, 10), delta))); render(); }
    catch (error) { status(error.message); }
  }
  function remind() {
    if (!store || !api.workspaceKey() || document.body.classList.contains('locked')) return;
    const now = Date.now(), day = C.today();
    for (const event of C.occurrences(events(), C.addDays(day, -1), C.addDays(day, 3))) {
      if (!event.reminder || event.allDay) continue;
      let start; try { start = C.toInstant(event.start).getTime(); } catch { continue; }
      const trigger = start - Number(event.reminder) * 60000, key = event.occurrenceId + ':' + event.start;
      if (now >= trigger && now < start && !reminded.has(key)) { reminded.add(key); api.notify(`Kalender: ${event.title} um ${event.start.slice(11)} Uhr`); }
    }
  }
  function bind() {
    $('#cal-prev').onclick = () => navigate(-1); $('#cal-next').onclick = () => navigate(1);
    $('#cal-today').onclick = () => { anchor = selected = C.today(); render(); };
    $('#cal-jump').onchange = event => { if (event.target.value) { anchor = selected = event.target.value; render(); } };
    $('#cal-search').oninput = event => { query = event.target.value.trim().toLocaleLowerCase('de'); render(); };
    $('#cal-filter').onchange = event => { category = event.target.value; render(); };
    $('#cal-pin-car').onclick = () => openVehicles('pin');
    root.addEventListener('click', async event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.calView) { view = button.dataset.calView; render(); }
      if (button.dataset.calDay) { selected = button.dataset.calDay; render(); }
      if (button.dataset.calShowday) { view = 'day'; anchor = selected = button.dataset.calShowday; render(); }
      if (button.hasAttribute('data-cal-new')) openEditor(null, button.dataset.calNew || selected, Number(button.dataset.calHour || 9));
      if (button.dataset.calEvent) openEditor(button.dataset.calEvent, undefined, undefined, button.dataset.calOccurrence);
      if (button.dataset.calCarNew) { openEditor(null); chosenVehicles = [button.dataset.calCarNew]; drawAttached(); }
      if (button.dataset.calRemovePin) { try { await store.remove(button.dataset.calRemovePin); renderSidebar(); } catch (error) { status(error.message); } }
    });
    root.addEventListener('dragstart', event => {
      const appointment = event.target.closest('[data-cal-event]'), vehicle = event.target.closest('[data-cal-vehicle]');
      if (appointment) event.dataTransfer.setData('application/x-cars-calendar', JSON.stringify({ id: appointment.dataset.calEvent, day: appointment.dataset.calOccurrence }));
      else if (vehicle) event.dataTransfer.setData('application/x-cars-vehicle', vehicle.dataset.calVehicle);
    });
    root.addEventListener('dragover', event => { if (event.target.closest('[data-cal-drop]')) event.preventDefault(); });
    root.addEventListener('drop', event => {
      const target = event.target.closest('[data-cal-drop]'); if (!target) return; event.preventDefault();
      const car = event.dataTransfer.getData('application/x-cars-vehicle');
      if (car && api.vehicles().some(v => v.id === car)) { openEditor(null, target.dataset.calDrop); chosenVehicles = [car]; drawAttached(); return; }
      try { const data = JSON.parse(event.dataTransfer.getData('application/x-cars-calendar')); if (data.id) void moveEvent(data.id, data.day, target.dataset.calDrop); } catch { /* Ignore unrelated drops. */ }
    });
    D('form').onsubmit = saveEditor; D('#cal-edit-all-day').onchange = toggleTimes; D('#cal-edit-repeat').onchange = toggleTimes;
    D('#cal-edit-category').onchange = event => { D('#cal-edit-color').value = colors[categories.indexOf(event.target.value)]; };
    D('#cal-attach-car').onclick = () => openVehicles('event');
    dialog.addEventListener('click', event => { const close = event.target.closest('[data-cal-close]'); if (close) dialog.close(); const detach = event.target.closest('[data-cal-detach]'); if (detach) { chosenVehicles = chosenVehicles.filter(id => id !== detach.dataset.calDetach); drawAttached(); } });
    D('#cal-delete-event').onclick = async () => { if (!confirm(draft.recurrence !== 'none' ? 'Diese gesamte Terminserie löschen?' : 'Diesen Termin löschen?')) return; try { await store.remove(draft.id); dialog.close(); render(); } catch (error) { D('#cal-editor-error').textContent = error.message; } };
    D('#cal-skip-event').onclick = async () => { try { await store.put({ ...draft, exceptions: [...new Set([...(draft.exceptions || []), occurrence])] }); dialog.close(); render(); } catch (error) { D('#cal-editor-error').textContent = error.message; } };
    vehicleDialog.querySelector('input').oninput = renderVehicles;
    vehicleDialog.addEventListener('click', async event => {
      if (event.target.closest('[data-cal-close]')) vehicleDialog.close();
      const pick = event.target.closest('[data-cal-pick]'); if (!pick) return;
      try {
        if (vehicleMode === 'event') { chosenVehicles.push(pick.dataset.calPick); drawAttached(); }
        else await store.put({ id: crypto.randomUUID(), type: 'vehicle-pin', vehicleId: pick.dataset.calPick });
        vehicleDialog.close(); renderSidebar();
      } catch (error) { vehicleDialog.querySelector('.cal-picker-error').textContent = error.message; }
    });
    $('#cal-export').onclick = () => { try { const blob = new Blob([C.exportICS(events())], { type: 'text/calendar;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'CarsAutoHaus-Kalender.ics'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (error) { status(error.message); } };
    $('#cal-import').onclick = () => $('#cal-file').click();
    $('#cal-file').onchange = async event => {
      const file = event.target.files[0]; if (!file) return;
      let saved = 0;
      try {
        if (file.size > 2000000) throw new Error('Bitte eine ICS-Datei unter 2 MB wählen.');
        const result = C.importICS(await file.text());
        if (result.events.length > 500) throw new Error('Bitte höchstens 500 Termine je Import auswählen.');
        if (!result.events.length) throw new Error(result.warnings.join('\n') || 'Keine Termine gefunden.');
        const summary = `${result.events.length} Termine in den gemeinsamen Kalender übernehmen?${result.warnings.length ? '\n' + result.warnings.length + ' Termine werden ausgelassen:\n' + result.warnings.slice(0, 5).join('\n') : ''}\nFahrzeugverknüpfungen werden nicht aus ICS übernommen.`;
        if (!confirm(summary)) return;
        for (const item of result.events) { await store.put(item); saved++; }
        render(); status(`${saved} Termine importiert.${result.warnings.length ? ' ' + result.warnings.length + ' ausgelassen.' : ''}`);
      } catch (error) { status(`${saved ? saved + ' Termine bereits importiert. ' : ''}${error.message}`); }
      finally { event.target.value = ''; }
    };
    document.addEventListener('autovalue:view-changed', event => { if (event.detail?.view === 'calendar') { void connect(); render(); } else { dialog.close(); vehicleDialog.close(); } });
    document.addEventListener('carsautohaus:operations-updated', () => { if (root.classList.contains('active')) renderSidebar(); if (vehicleDialog.open) renderVehicles(); });
    reminderTimer = setInterval(remind, 30000); window.addEventListener('pagehide', () => clearInterval(reminderTimer), { once: true });
  }
  function start() {
    api = window.CarsAutoHaus; if (!api || !C || document.getElementById('calendar-view')) return;
    root = document.createElement('section'); root.id = 'calendar-view'; root.className = 'view'; root.setAttribute('aria-label', 'Kalender');
    root.innerHTML = `<header class="cal-hero"><div><p class="cal-eyebrow">CARS AUTOHAUS / ORGANISATION</p><h1>Alles zur richtigen Zeit.</h1><p class="cal-subtitle">Termine, Fahrzeuge und Menschen. Ein gemeinsamer Kalender.</p></div><button class="cal-primary" data-cal-new="">+ Neuer Termin</button></header><div class="cal-layout"><aside class="cal-sidebar"><div class="cal-side-heading"><span>DEIN TAG</span><input id="cal-jump" type="date" aria-label="Datum auswählen" value="${anchor}" /></div><h2 id="cal-selected-label"></h2><div id="cal-selected-events"></div><button class="cal-plain" data-cal-new="">+ Termin hinzufügen</button><div class="cal-side-heading cal-pins-heading"><span>ANGEHEFTETE AUTOS</span><button id="cal-pin-car" aria-label="Fahrzeug anheften">+</button></div><div id="cal-pinned-cars"></div><p class="cal-help">Fahrzeug auf einen Kalendertag ziehen oder „Termin planen“ wählen.</p><div class="cal-transfer"><button id="cal-export">ICS exportieren</button><button id="cal-import">ICS importieren</button></div><p class="cal-help">Erinnerungen erscheinen in der geöffneten Website. Keine E-Mail- oder Hintergrundbenachrichtigungen.</p></aside><div class="cal-main"><div class="cal-toolbar"><div class="cal-period"><button id="cal-prev" aria-label="Vorheriger Zeitraum">‹</button><h2 id="cal-title"></h2><button id="cal-next" aria-label="Nächster Zeitraum">›</button><button id="cal-today">Heute</button></div><div class="cal-modes" aria-label="Kalenderansicht"><button data-cal-view="month">Monat</button><button data-cal-view="week">Woche</button><button data-cal-view="day">Tag</button><button data-cal-view="agenda">Agenda</button></div></div><div class="cal-filterbar"><input type="search" id="cal-search" placeholder="Termine oder Fahrzeuge suchen" aria-label="Termine durchsuchen" /><select id="cal-filter" aria-label="Terminkategorie"><option value="">Alle Kategorien</option>${categories.map(s => `<option>${s}</option>`).join('')}</select><span id="cal-count"></span></div><div id="cal-content"></div><footer class="cal-foot"><span id="cal-status" role="status">Kalender wird geladen …</span><span>Europe/Berlin · Montag bis Sonntag</span></footer></div></div><input type="file" id="cal-file" accept=".ics,text/calendar" hidden />`;
    document.querySelector('.app').append(root);
    dialog = document.createElement('dialog'); dialog.id = 'cal-editor'; dialog.className = 'cars-calendar-dialog'; dialog.setAttribute('aria-labelledby', 'cal-editor-heading');
    dialog.innerHTML = `<form><div class="cal-dialog-head"><div><p class="cal-eyebrow">GEMEINSAM PLANEN</p><h2 id="cal-editor-heading">Neuer Termin</h2></div><button type="button" data-cal-close aria-label="Schließen">×</button></div><label>Titel<input id="cal-edit-title" required maxlength="160" placeholder="Was steht an?" /></label><label class="cal-checkbox"><input id="cal-edit-all-day" type="checkbox" /> Ganztägig</label><div class="cal-form-grid"><label>Beginn<input id="cal-edit-start" type="date" required /></label><label>Uhrzeit<input id="cal-edit-start-time" type="time" required /></label><label>Ende (einschließlich bei ganztägig)<input id="cal-edit-end" type="date" required /></label><label>Uhrzeit<input id="cal-edit-end-time" type="time" required /></label></div><p class="cal-help">Zeitzone Europe/Berlin. Bei mehrdeutigen Uhrzeiten im Herbst wird die zweite Uhrzeit verwendet.</p><div class="cal-form-grid"><label>Kategorie<select id="cal-edit-category">${categories.map(s => `<option>${s}</option>`).join('')}</select></label><label>Farbe<input id="cal-edit-color" type="color" /></label><label>Wiederholung<select id="cal-edit-repeat"><option value="none">Einmalig</option><option value="daily">Täglich</option><option value="weekly">Wöchentlich</option><option value="monthly">Monatlich</option><option value="yearly">Jährlich</option></select></label><label>Serienende (optional)<input type="date" id="cal-edit-until" /></label></div><label>Erinnerung<select id="cal-edit-reminder"><option value="0">Keine Erinnerung</option><option value="5">5 Minuten vorher</option><option value="15">15 Minuten vorher</option><option value="30">30 Minuten vorher</option><option value="60">1 Stunde vorher</option><option value="1440">1 Tag vorher</option></select></label><p class="cal-help">Erinnerungen für Termine mit Uhrzeit, solange diese Website geöffnet ist.</p><label>Ort<input id="cal-edit-location" maxlength="300" placeholder="Werkstatt, Treffpunkt, Adresse" /></label><label>Notizen<textarea id="cal-edit-description" rows="3" placeholder="Alles, was wichtig ist …"></textarea></label><div class="cal-attachment-head"><b>Angeheftete Fahrzeuge</b><button type="button" id="cal-attach-car">+ Fahrzeug</button></div><div id="cal-event-cars"></div><p id="cal-editor-error" role="alert"></p><div class="cal-dialog-actions"><button type="button" id="cal-delete-event" class="cal-danger">Löschen</button><button type="button" id="cal-skip-event">Nur diesen Termin auslassen</button><button type="button" data-cal-close>Abbrechen</button><button type="submit" id="cal-save-event" class="cal-primary">Speichern</button></div></form>`;
    document.body.append(dialog);
    vehicleDialog = document.createElement('dialog'); vehicleDialog.id = 'cal-vehicle-picker'; vehicleDialog.className = 'cars-calendar-dialog'; vehicleDialog.setAttribute('aria-labelledby', 'cal-vehicle-title');
    vehicleDialog.innerHTML = '<div class="cal-dialog-head"><h2 id="cal-vehicle-title">Fahrzeug anheften</h2><button data-cal-close aria-label="Schließen">×</button></div><input type="search" aria-label="Fahrzeuge suchen" placeholder="Marke, Modell oder Baujahr" /><p class="cal-picker-error" role="alert"></p><div class="cal-vehicle-results"></div>';
    document.body.append(vehicleDialog);
    const nav = document.createElement('button'); nav.className = 'nav-button'; nav.dataset.go = 'calendar'; nav.innerHTML = '<span class="nav-icon">▦</span>Kalender'; document.querySelector('.nav-inner')?.append(nav);
    bind(); render();
  }
  if (window.CarsAutoHaus) start(); else document.addEventListener('carsautohaus:ready', start, { once: true });
})();
