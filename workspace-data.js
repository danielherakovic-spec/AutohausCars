/* Shared calendar/garage entity storage. Only confirmed server writes change local records. */
(function(scope) {
  'use strict';
  const clone = value => value == null ? value : structuredClone(value);
  const allowed = new Set(['calendar', 'garage']);
  function readableError(problem) {
    const error = new Error(problem?.message || 'Verbindung fehlgeschlagen. Nicht gespeichert.');
    error.code = problem?.code || 'NETWORK';
    if (['PGRST202','42883','42P01'].includes(error.code)) error.message = 'Supabase-Einrichtung fehlt: calendar-garage-migration.sql im SQL Editor ausführen.';
    else if (error.code === '40001') error.message = 'Zwischenzeitlich geändert. Dein Entwurf bleibt erhalten. Bitte den aktuellen Stand laden und erneut bearbeiten.';
    else if (error.code === 'NETWORK' || /fetch|network|Failed/i.test(error.message)) error.message = 'Keine Verbindung. Deine Änderung wurde nicht gespeichert. Bitte erneut versuchen.';
    return error;
  }
  function createStore(transport, name, options = {}) {
    let records = new Map(), message = 'Lädt …', loading, disposed = false, saving = 0;
    const listeners = new Set();
    const emit = () => { for (const listener of listeners) { try { listener(); } catch(error) { console.error('Workspace listener:', error); } } };
    function assertAccess() { if (disposed || options.isCurrent && !options.isCurrent()) throw new Error('Der gemeinsame Bereich wurde gewechselt. Bitte neu öffnen.'); }
    function setStatus(value) { message = value; emit(); }
    function accept(entity) {
      if (!entity || typeof entity.id !== 'string' || !Number.isSafeInteger(Number(entity._revision)) || Number(entity._revision) < 1) throw new Error('Ungültige Antwort des Speicherdienstes.');
      const current = records.get(entity.id);
      if (!current || Number(entity._revision) >= Number(current._revision)) records.set(entity.id, clone(entity));
    }
    async function refresh() {
      assertAccess(); if (loading) return loading;
      loading = (async () => {
        try { const rows = await transport.read(name); assertAccess(); if (!Array.isArray(rows)) throw new Error('Ungültige Antwort des Speicherdienstes.'); rows.forEach(accept); setStatus(saving ? 'Speichert …' : 'Gemeinsam synchronisiert'); }
        catch (problem) { const error = readableError(problem); if (!disposed) setStatus(error.message); throw error; }
      })();
      try { await loading; } finally { loading = null; }
    }
    const unsubscribe = transport.subscribe(name, row => {
      if (disposed || options.isCurrent && !options.isCurrent()) return;
      try {
        if (row.scope && row.scope !== name) return;
        const entity = row._revision != null ? row : { ...row.data, id:row.id, _revision:Number(row.revision), _deleted:Boolean(row.deleted), _updatedAt:row.updated_at };
        accept(entity); setStatus(saving ? 'Speichert …' : 'Gemeinsam synchronisiert');
      } catch { void refresh().catch(() => {}); }
    });
    const timer = setInterval(() => { if (!disposed && (!options.isCurrent || options.isCurrent())) void refresh().catch(() => {}); }, options.interval || 8000);
    timer.unref?.();
    const store = {
      ready: null,
      list: () => [...records.values()].filter(item => !item._deleted).map(clone),
      // Returning a tombstone preserves its revision for intentional restoration of stable part IDs.
      get: id => clone(records.get(id)),
      status: () => message,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      refresh,
      async put(entity) {
        assertAccess();
        if (!entity || typeof entity.id !== 'string') throw new Error('Eintrags-ID fehlt.');
        const expected = Number(entity._revision || 0);
        const payload = clone(entity); delete payload._deleted; delete payload._updatedAt;
        saving++; setStatus('Speichert …');
        try {
          const response = await transport.write(name,payload,expected); assertAccess(); accept(response); saving--; setStatus(saving ? 'Speichert …' : 'Gemeinsam synchronisiert'); return clone(response);
        } catch (problem) {
          saving--; const error = readableError(problem);
          if (error.code === '40001') await refresh().catch(() => {});
          if (!disposed) setStatus(error.message); throw error;
        }
      },
      async remove(id, expectedRevision) {
        assertAccess();
        const entity = records.get(id); const revision = expectedRevision ?? entity?._revision;
        if (!revision) throw new Error('Eintrag nicht gefunden.');
        saving++; setStatus('Speichert …');
        try {
          const response = await transport.remove(name,id,Number(revision)); assertAccess(); accept(response); saving--; setStatus(saving ? 'Speichert …' : 'Gemeinsam synchronisiert'); return clone(response);
        } catch (problem) {
          saving--; const error = readableError(problem); if (error.code === '40001') await refresh().catch(() => {});
          if (!disposed) setStatus(error.message); throw error;
        }
      },
      close() { disposed = true; clearInterval(timer); unsubscribe?.(); listeners.clear(); records.clear(); }
    };
    store.ready = refresh(); store.ready.catch(() => {});
    return store;
  }
  const cache = new Map();
  function open(name) {
    if (!allowed.has(name)) throw new Error('Unbekannter Bereich.');
    const api = scope.CarsAutoHaus, workspace = api?.workspaceKey();
    if (!workspace || !api.workspaceData) throw new Error('Bitte zuerst am gemeinsamen Bestand anmelden.');
    for (const [key, store] of cache) if (!key.startsWith(workspace + '|')) { store.close(); cache.delete(key); }
    const key = workspace + '|' + name;
    if (!cache.has(key)) cache.set(key,createStore(api.workspaceData,name,{ isCurrent: () => api.workspaceKey() === workspace }));
    return cache.get(key);
  }
  const exported = { open, createStore, readableError };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else scope.CarsWorkspaceData = exported;
})(globalThis);
