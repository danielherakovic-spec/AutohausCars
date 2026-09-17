/* Shared pinboard transport. Pure patch helpers are also used by the tests. */
(function (scope) {
  'use strict';
  const copy = value => structuredClone(value);
  const empty = () => ({ version: 1, cards: [], edges: [] });
  function diff(before, after) {
    const patch = {};
    for (const key of ['cards', 'edges']) {
      const old = new Map(before[key].map(item => [item.id, item]));
      const next = new Map(after[key].map(item => [item.id, item]));
      patch[key] = { add: [], update: [], remove: [] };
      for (const [id, item] of next) {
        if (!old.has(id)) { patch[key].add.push(copy(item)); continue; }
        const changes = {};
        for (const field of Object.keys(item)) if (field !== 'id' && JSON.stringify(item[field]) !== JSON.stringify(old.get(id)[field])) changes[field] = copy(item[field]);
        if (Object.keys(changes).length) patch[key].update.push({ id, changes });
      }
      for (const id of old.keys()) if (!next.has(id)) patch[key].remove.push(id);
    }
    return patch;
  }
  const hasChanges = patch => ['cards', 'edges'].some(key => ['add', 'update', 'remove'].some(kind => patch[key][kind].length));
  function apply(state, patch) {
    const result = copy(state);
    for (const key of ['cards', 'edges']) {
      const items = new Map(result[key].map(item => [item.id, item]));
      for (const id of patch[key].remove) items.delete(id);
      for (const item of patch[key].add) if (!items.has(item.id)) items.set(item.id, copy(item));
      // An update must never resurrect a card deleted on another device.
      for (const { id, changes } of patch[key].update) if (items.has(id)) items.set(id, { ...items.get(id), ...copy(changes), id });
      result[key] = [...items.values()];
    }
    const ids = new Set(result.cards.map(card => card.id));
    result.edges = result.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to));
    return result;
  }
  function create(options) {
    let remote = { revision: -1, state: empty() }, pending = [], sending = false, stopped = false, loaded = false;
    let unsubscribe, timer, refreshing;
    try {
      const cached = options.restore?.();
      if (cached?.remote?.state && Array.isArray(cached.pending)) { remote = cached.remote; pending = cached.pending; }
    } catch { /* A corrupt cache never replaces the server state. */ }
    const projected = () => pending.reduce((state, entry) => apply(state, entry.patch), copy(remote.state));
    function remember() { options.persist?.({ remote, pending }); }
    function emit() { if (!stopped) options.onChange(projected()); }
    function accept(record) {
      if (!record || !Number.isSafeInteger(Number(record.revision)) || !Array.isArray(record.state?.cards) || !Array.isArray(record.state?.edges)) throw new Error('Ungültige Antwort des Pinwand-Dienstes.');
      if (Number(record.revision) >= remote.revision) remote = copy(record);
      loaded = true; remember(); emit();
    }
    function status() { options.onStatus(pending.length ? 'Synchronisiert …' : 'Für alle synchronisiert'); }
    function failure(error) {
      const missing = ['PGRST202', '42P01', '42883'].includes(error?.code);
      options.onStatus(missing ? 'Supabase-Migration für die gemeinsame Pinwand fehlt.' : 'Nicht synchronisiert — Verbindung wird erneut versucht.');
    }
    async function flush() {
      if (sending || stopped || !loaded || !pending.length) return;
      sending = true;
      try {
        while (pending.length && !stopped) {
          status(); const entry = pending[0];
          const record = await options.write(entry.patch, entry.id);
          if (stopped) break;
          pending.shift(); accept(record);
        }
        if (!stopped) status();
      } catch (error) { if (!stopped) { remember(); failure(error); } }
      finally { sending = false; }
    }
    async function refresh() {
      if (stopped || refreshing) return refreshing;
      refreshing = (async () => {
        try { const record = await options.read(); if (!stopped) { accept(record); status(); await flush(); } }
        catch (error) { if (!stopped) failure(error); }
      })();
      try { await refreshing; } finally { refreshing = null; }
    }
    return {
      async start() {
        options.onStatus('Gemeinsame Pinwand wird geladen …');
        unsubscribe = options.subscribe(record => { if (!stopped) { try { accept(record); status(); } catch (error) { failure(error); } } });
        timer = setInterval(refresh, options.interval || 5000);
        await refresh();
      },
      submit(before, after) {
        const patch = diff(before, after); if (!hasChanges(patch)) return;
        pending.push({ id: crypto.randomUUID(), patch }); remember(); status(); void flush();
      },
      refresh,
      close() { stopped = true; clearInterval(timer); unsubscribe?.(); },
      snapshot: projected
    };
  }
  const exported = { create, diff, apply, hasChanges, empty };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else scope.CarsPinboardSync = exported;
})(globalThis);
