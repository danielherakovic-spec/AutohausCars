/* Shared display and identity rules. Model fields are never changed for display. */
(function(scope) {
  const clean = value => String(value ?? '').trim();
  function name(v = {}, showrooms = []) {
    const location = clean(v.location) || clean(showrooms.find(s => s.id === v.showroomId)?.name);
    return [clean([v.brand, v.model, v.year].filter(Boolean).join(' ')) || 'Fahrzeug', location || 'Standort offen'].join(' · ');
  }
  function unique(items = []) {
    const map = new Map();
    for (const item of items) {
      if (!item?.id) continue;
      const old = map.get(item.id);
      const time=v=>Date.parse(v?.deletedAt||v?.updatedAt||v?.createdAt||'1970-01-01')||0;
      if (!old || time(item) >= time(old)) map.set(item.id, item);
    }
    return [...map.values()];
  }
  const archived = v => v.status === 'Archiviert';
  function duplicate(vehicles, candidate) {
    const key = value => clean(value).replace(/\s/g, '').toUpperCase();
    const vin = key(candidate.vin || candidate.fin);
    const number = key(candidate.vehicleNumber);
    return vehicles.find(v => !v.deletedAt && v.id !== candidate.id &&
      ((vin && vin === key(v.vin || v.fin)) || (number && number === key(v.vehicleNumber))));
  }
  function migratePins(state) {
    state.tasks = unique(state.tasks);
    for (const pin of state.operations?.homePins || []) {
      const id = 'pinned-task-' + pin.id;
      if (!state.tasks.some(t => t.id === id)) state.tasks.push({id, title:pin.text || 'Angeheftete Aufgabe', date:'', pinned:true, done:false, updatedAt:pin.createdAt || '2026-01-01T00:00:00.000Z'});
    }
    return state;
  }
  const api = {name, unique, archived, duplicate, migratePins};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.CarsInventory = api;
})(globalThis);
