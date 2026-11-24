/* Calendar values are Europe/Berlin wall-clock strings; no browser-local date arithmetic. */
(function (scope) {
  'use strict';
  const ZONE = 'Europe/Berlin';
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const wall = value => new Date(String(value).slice(0, 19) + (String(value).length === 10 ? 'T00:00:00Z' : String(value).length === 16 ? ':00Z' : 'Z'));
  const stamp = d => `${dateKey(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  function addDays(value, count) { const d = wall(value); d.setUTCDate(d.getUTCDate() + count); return dateKey(d); }
  function today(now = new Date()) { return new Intl.DateTimeFormat('sv-SE', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  function fromInstant(value, zone = ZONE) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }
  function toInstant(value, zone = ZONE) {
    const desired = wall(value).getTime(); let guess = desired;
    for (let i = 0; i < 5; i++) { const observed = wall(fromInstant(guess, zone)).getTime(); const next = guess + desired - observed; if (next === guess) break; guess = next; }
    if (fromInstant(guess, zone) !== String(value).slice(0, 16)) throw new Error('Diese Uhrzeit existiert wegen der Zeitumstellung nicht. Bitte eine andere Zeit wählen.');
    return new Date(guess);
  }
  function validWall(value) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && Number.isFinite(wall(value).getTime()) && stamp(wall(value)) === value; }
  function validate(event) {
    if (!String(event.title || '').trim()) throw new Error('Bitte einen Titel eingeben.');
    if (!validWall(event.start) || !validWall(event.end) || event.end <= event.start) throw new Error('Das Ende muss nach dem Beginn liegen.');
    if (!event.allDay) { toInstant(event.start); toInstant(event.end); }
    if (event.until && event.until < event.start.slice(0, 10)) throw new Error('Das Serienende liegt vor dem ersten Termin.');
    if (!['none', 'daily', 'weekly', 'monthly', 'yearly'].includes(event.recurrence || 'none')) throw new Error('Unbekannte Wiederholung.');
    return event;
  }
  function occurrences(events, from, to) {
    const rangeStart = wall(from).getTime(), rangeEnd = wall(to).getTime();
    const result = [];
    for (const event of events.filter(e => e.type === 'event')) {
      if (!validWall(event.start) || !validWall(event.end)) continue;
      const base = wall(event.start), duration = wall(event.end) - base;
      if (duration <= 0) continue;
      const repeat = event.recurrence || 'none';
      // Jump directly into the requested range; historic series never need unbounded iteration.
      const target = new Date(Math.max(base.getTime(), rangeStart - duration));
      let index = 0;
      if (repeat === 'daily' || repeat === 'weekly') index = Math.max(0, Math.floor((target - base) / (86400000 * (repeat === 'weekly' ? 7 : 1))));
      if (repeat === 'monthly') index = Math.max(0, (target.getUTCFullYear() - base.getUTCFullYear()) * 12 + target.getUTCMonth() - base.getUTCMonth() - 1);
      if (repeat === 'yearly') index = Math.max(0, target.getUTCFullYear() - base.getUTCFullYear() - 1);
      for (let count = 0; count < 5000; count++, index++) {
        const start = new Date(base);
        if (repeat === 'daily') start.setUTCDate(base.getUTCDate() + index);
        else if (repeat === 'weekly') start.setUTCDate(base.getUTCDate() + index * 7);
        else if (repeat === 'monthly') { start.setUTCDate(1); start.setUTCMonth(base.getUTCMonth() + index); const month = start.getUTCMonth(); start.setUTCDate(base.getUTCDate()); if (start.getUTCMonth() !== month) continue; }
        else if (repeat === 'yearly') { start.setUTCFullYear(base.getUTCFullYear() + index); if (start.getUTCMonth() !== base.getUTCMonth()) continue; }
        else if (index > 0) break;
        const key = dateKey(start);
        if (start.getTime() >= rangeEnd || event.until && key > event.until) break;
        const end = new Date(start.getTime() + duration);
        if (end.getTime() > rangeStart && !(event.exceptions || []).includes(key)) result.push({ ...event, seriesId: event.id, occurrenceDate: key, start: stamp(start), end: stamp(end), occurrenceId: `${event.id}@${key}` });
        if (repeat === 'none') break;
      }
    }
    return result.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  }
  function shift(event, day) {
    const delta = wall(day) - wall(event.start.slice(0, 10));
    const result = { ...event, start: stamp(new Date(wall(event.start).getTime() + delta)), end: stamp(new Date(wall(event.end).getTime() + delta)) };
    if (event.until) result.until = dateKey(new Date(wall(event.until).getTime() + delta));
    result.exceptions = (event.exceptions || []).map(key => dateKey(new Date(wall(key).getTime() + delta)));
    return validate(result);
  }
  const escICS = value => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r/g, '');
  const unescICS = value => value.replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1');
  const compact = value => value.replace(/[-:]/g, '') + (value.length > 10 ? '00' : '');
  function fold(line) { const parts = []; let current = '', length = 0; for (const char of line) { const bytes = new TextEncoder().encode(char).length; if (length + bytes > 73) { parts.push(current); current = ' '; length = 1; } current += char; length += bytes; } parts.push(current); return parts.join('\r\n'); }
  function exportICS(events) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CarsAutoHaus//Kalender//DE', 'CALSCALE:GREGORIAN', 'X-WR-TIMEZONE:Europe/Berlin', 'BEGIN:VTIMEZONE', 'TZID:Europe/Berlin', 'BEGIN:DAYLIGHT', 'DTSTART:19960331T020000', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'DTSTART:19961027T030000', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
    for (const event of events.filter(e => e.type === 'event')) {
      validate(event);
      const parameter = event.allDay ? ';VALUE=DATE' : ';TZID=Europe/Berlin';
      lines.push('BEGIN:VEVENT', `UID:${escICS(event.id)}@carsautohaus`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`, `DTSTART${parameter}:${compact(event.allDay ? event.start.slice(0, 10) : event.start)}`, `DTEND${parameter}:${compact(event.allDay ? event.end.slice(0, 10) : event.end)}`, `SUMMARY:${escICS(event.title)}`, `DESCRIPTION:${escICS(event.description)}`, `LOCATION:${escICS(event.location)}`, `CATEGORIES:${escICS(event.category)}`);
      if (event.recurrence && event.recurrence !== 'none') {
        const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[event.recurrence];
        const until = event.until ? ';UNTIL=' + toInstant(event.until + 'T23:59').toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') : '';
        lines.push(`RRULE:FREQ=${freq}${until}`);
      }
      for (const day of event.exceptions || []) lines.push(`EXDATE${parameter}:${compact(event.allDay ? day : day + event.start.slice(10))}`);
      if (Number(event.reminder) > 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escICS(event.title)}`, `TRIGGER:-PT${Number(event.reminder)}M`, 'END:VALARM');
      lines.push('END:VEVENT');
    }
    return lines.map(fold).join('\r\n') + '\r\nEND:VCALENDAR\r\n';
  }
  function importICS(text) {
    if (String(text).length > 2000000 || !text.includes('BEGIN:VCALENDAR')) throw new Error('Bitte eine gültige ICS-Datei unter 2 MB wählen.');
    const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/), events = [], warnings = []; let fields = null, alarm = false;
    function parseDate(field) {
      if (!field) throw new Error('Termin ohne Beginn.');
      const value = field.value, match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?([Z])?)?$/);
      if (!match) throw new Error('Ungültiges Termin-Datum.');
      const output = `${match[1]}-${match[2]}-${match[3]}T${match[4] || '00'}:${match[5] || '00'}`;
      if (match[7]) return fromInstant(output + ':00Z');
      const zone = field.params.match(/TZID="?([^;"=]+)/)?.[1];
      return zone && zone !== ZONE ? fromInstant(toInstant(output, zone)) : output;
    }
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { fields = {}; continue; }
      if (line === 'BEGIN:VALARM') { alarm = true; continue; }
      if (line === 'END:VALARM') { alarm = false; continue; }
      if (line === 'END:VEVENT' && fields) {
        try {
          const start = parseDate(fields.DTSTART?.[0]), allDay = !fields.DTSTART[0].value.includes('T');
          const end = fields.DTEND ? parseDate(fields.DTEND[0]) : allDay ? addDays(start.slice(0, 10), 1) + 'T00:00' : stamp(new Date(wall(start).getTime() + 3600000));
          const rule = fields.RRULE?.[0].value || '', parts = Object.fromEntries(rule.split(';').filter(Boolean).map(part => part.split('=')));
          if (Object.keys(parts).some(key => !['FREQ', 'UNTIL', 'INTERVAL'].includes(key)) || parts.INTERVAL && parts.INTERVAL !== '1') throw new Error('Komplexe Wiederholungsregel wird nicht unterstützt.');
          const recurrence = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[parts.FREQ] || 'none';
          if (parts.FREQ && recurrence === 'none') throw new Error('Wiederholungsregel wird nicht unterstützt.');
          const event = { id: crypto.randomUUID(), type: 'event', title: unescICS(fields.SUMMARY?.[0].value || 'Importierter Termin'), description: unescICS(fields.DESCRIPTION?.[0].value || ''), location: unescICS(fields.LOCATION?.[0].value || ''), category: 'Sonstiges', color: '#8aa8bf', start, end, allDay, recurrence, until: parts.UNTIL ? parseDate({ value: parts.UNTIL, params: '' }).slice(0, 10) : '', exceptions: (fields.EXDATE || []).flatMap(field => field.value.split(',').map(value => parseDate({ ...field, value }).slice(0, 10))), vehicleIds: [], reminder: 0 };
          if (fields['RECURRENCE-ID']) throw new Error('Einzelne Serien-Ausnahme bitte manuell übernehmen.');
          validate(event); events.push(event);
        } catch (error) { warnings.push(`${unescICS(fields.SUMMARY?.[0].value || 'Termin')}: ${error.message}`); }
        fields = null; continue;
      }
      if (!fields || alarm) continue;
      const colon = line.indexOf(':'); if (colon < 0) continue;
      const key = line.slice(0, colon).split(';')[0], params = line.slice(key.length, colon), value = line.slice(colon + 1);
      (fields[key] ||= []).push({ value, params });
    }
    return { events, warnings };
  }
  const exported = { ZONE, wall, stamp, dateKey, today, addDays, validWall, validate, occurrences, shift, fromInstant, toInstant, exportICS, importICS };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported; else scope.CarsCalendarCore = exported;
})(globalThis);
