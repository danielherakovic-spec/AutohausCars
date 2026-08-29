import { buildVehicleExport, datasetSignature, exportCsv, vehicleLabel } from './supabase/functions/_shared/vehicle-export.mjs?v=15';
import { validateAnalysis, MAX_BODY_BYTES, MAX_VEHICLES } from './supabase/functions/_shared/analysis-contract.mjs?v=15';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const priority = { priorisiert_kontaktieren: 'Zuerst kontaktieren', erst_klaeren: 'Zuerst offene Fragen klären', nicht_priorisieren: 'Nicht priorisieren', nicht_ankaufbar: 'Nur Vergleichsreferenz' };
const money = value => value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) || Number(value) === 0 ? 'Nicht erfasst' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value));

export function renderAnalysisResult(result, dataset) {
  const byKey = new Map(dataset.vehicles.map(item => [item.key, item]));
  return `<article class="card form-card"><h2>KI-Kontaktpriorisierung</h2><p>${esc(result.analysis.summary)}</p><p class="muted">${esc(result.model)} · ${esc(result.generatedAt)} · ${dataset.vehicles.length} Akten bewertet</p><ul>${result.analysis.limitations.map(text => `<li>${esc(text)}</li>`).join('')}</ul></article>` + result.analysis.vehicles.map(item => {
    const vehicle = byKey.get(item.vehicleKey); const v = { ...vehicle.record, askingPrice: vehicle.record.askingPrice ?? vehicle.record.price };
    return `<article class="card form-card analysis-vehicle"><div class="analysis-title"><h2>Rang ${item.rank} · ${esc(vehicleLabel(vehicle))}</h2><span class="analysis-stars" aria-label="${item.stars} von 5 Sternen">${'★'.repeat(item.stars)}${'☆'.repeat(5 - item.stars)}</span></div><p><b>${esc(priority[item.contactPriority])}</b> · Datensicherheit: ${esc(item.confidence)}</p><p class="muted">${esc(vehicle.collection)} · ${esc(v.status || 'Status nicht erfasst')} · ${esc(item.vehicleKey)}</p><dl class="analysis-prices"><div><dt>Angebotspreis</dt><dd>${money(v.askingPrice)}</dd></div><div><dt>Einkauf</dt><dd>${money(v.purchasePrice)}</dd></div><div><dt>Verkaufsziel</dt><dd>${money(v.desiredSalePrice)}</dd></div></dl><ul class="analysis-factors">${item.factors.map(factor => `<li><b>${esc(factor.label)} (${esc(factor.impact)})</b><br>${esc(factor.evidence)}</li>`).join('')}</ul><h3>Warum dieser Rang?</h3><p class="analysis-rationale">${esc(item.rationale)}</p>${item.questions.length ? `<h3>Fragen für den Erstkontakt</h3><ul>${item.questions.map(question => `<li>${esc(question)}</li>`).join('')}</ul>` : ''}${vehicle.collection === 'vehicles' ? `<button class="secondary" data-detail="${esc(v.id)}">Fahrzeug öffnen</button>` : ''}</article>`;
  }).join('');
}

// Framework-independent request lifecycle, also exercised by the regression tests.
export function createAnalysisController({ transport, onChange, timeoutMs = 120000 }) {
  let sequence = 0; let aborter; let timer;
  let state = { phase: 'empty', dataset: null, result: null, error: '' };
  const publish = next => { state = { ...state, ...next }; onChange(state); };
  const cancel = () => { sequence++; aborter?.abort(); clearTimeout(timer); };
  return {
    getState: () => state,
    reset(dataset) { cancel(); publish({ phase: dataset?.vehicles.length ? 'ready' : 'empty', dataset, result: null, error: '' }); },
    clear() { cancel(); publish({ phase: 'empty', dataset: null, result: null, error: '' }); },
    invalidate() { if (!state.dataset) return; cancel(); publish({ phase: 'stale', result: null, error: 'Der Bestand wurde geändert. Bitte neu exportieren, bevor Sie ihn analysieren.' }); },
    cancel() { if (state.phase !== 'loading') return; cancel(); publish({ phase: 'ready', error: 'Warten abgebrochen. Eine bereits gestartete Serveranfrage kann noch Kosten verursachen.' }); },
    async run(consent) {
      if (state.phase === 'loading' || state.phase === 'stale' || !state.dataset?.vehicles.length) return;
      if (!consent) { publish({ error: 'Bitte zuerst die Übertragung an OpenAI bestätigen.' }); return; }
      const dataset = state.dataset;
      if (dataset.vehicles.length > MAX_VEHICLES || new TextEncoder().encode(JSON.stringify({ dataset, consent: true })).length > MAX_BODY_BYTES) { publish({ phase: 'error', error: `Der vollständige Export bleibt verfügbar. Die KI-Analyse ist auf ${MAX_VEHICLES} Akten und 1 MiB begrenzt; es werden keine Daten weggelassen.` }); return; }
      cancel(); const requestId = sequence; aborter = new AbortController();
      const signal = aborter.signal;
      publish({ phase: 'loading', error: '', result: null });
      timer = setTimeout(() => { if (requestId === sequence) { cancel(); publish({ phase: 'error', error: 'Zeitlimit erreicht. Bitte später erneut versuchen; die Serveranfrage kann noch laufen.' }); } }, timeoutMs);
      try {
        const result = await transport(dataset, signal);
        if (sequence !== requestId) return;
        if (!result || result.schemaVersion !== 1 || result.exportedAt !== dataset.exportedAt || result.vehicleCount !== dataset.vehicles.length || typeof result.model !== 'string' || !result.model || !Number.isFinite(Date.parse(result.generatedAt))) throw new Error('Die Analyseantwort passt nicht zu diesem Export.');
        const analysis = validateAnalysis(result.analysis, dataset);
        publish({ phase: 'success', result: { ...result, analysis } });
      } catch (error) {
        if (sequence === requestId) publish({ phase: 'error', error: error.name === 'AbortError' ? 'Anfrage abgebrochen. Bitte erneut versuchen.' : (error.message || 'Analyse fehlgeschlagen.') });
      } finally { if (sequence === requestId) clearTimeout(timer); }
    },
  };
}

export function installVehicleExport({ api, transport }) {
  const view = document.createElement('section');
  view.id = 'vehicle-ranking-view'; view.className = 'view';
  view.innerHTML = `<div class="hero"><div><span class="hero-kicker">KI-Entscheidungshilfe</span><h1>KI-Fahrzeugranking</h1><p class="subtitle">Alle aktuellen Fahrzeugakten gemeinsam auswerten und die sinnvollsten Erstkontakte priorisieren.</p></div><button class="secondary" data-go="home">Zurück</button></div><article class="card form-card"><div class="section-heading"><div><h2>Vollständiger Analysedatenstand</h2><p class="muted">Der aktuelle Bestand wird beim Öffnen automatisch vorbereitet. Ein vorheriger Export ist nicht erforderlich.</p></div><span class="ops-chip">Keine Teilauswahl</span></div><p id="vehicle-export-count"></p><p class="muted">Alle nicht gelöschten Fahrzeuge, Ankaufkandidaten und Importakten – unabhängig von Suche, Status und Favoriten. Enthält sämtliche gespeicherten Felder und zugeordnete Daten, einschließlich Preisen, Mängeln, Beschreibungen, Notizen und Dokumenteinträgen. Private Dateien bleiben als gespeicherte Referenzen enthalten; externe Dateien werden nicht heruntergeladen.</p><div class="form-actions"><button class="secondary" id="vehicle-export-json">Vollständiges JSON</button><button class="secondary" id="vehicle-export-csv">Vollständiges CSV</button><button class="secondary" id="vehicle-export-refresh">CSV neu exportieren</button></div><p class="muted">JSON ist das verlustfreie Datenformat (kein Workspace-Backup). CSV enthält Listen und verknüpfte Daten als JSON-Zellen; Tabellenprogramme können sehr lange Zellen begrenzen.</p></article><article class="card form-card section"><h2>Welche Anbieter zuerst kontaktieren?</h2><p>Die serverseitige KI vergleicht den gesamten Datenstand und zeigt Rang, Sterne, konkrete Faktoren und eine ausführliche Begründung pro Akte. Keine automatische Kontaktaufnahme oder Kaufentscheidung.</p><label class="analysis-consent"><input type="checkbox" id="vehicle-analysis-consent"><span>Ich darf diese Daten weitergeben und bestätige, dass der vollständige Export einschließlich interner Freitexte und zugeordneter Dokumentdaten über Supabase an OpenAI übertragen wird. Nicht benötigte personenbezogene Angaben habe ich vorher entfernt.</span></label><p class="muted">Chat und allgemeine Teamnotizen ohne Fahrzeugbezug, Integrationszugänge und Passwörter werden nicht exportiert. Die Analyse ruft keine Inserat-Links auf und prüft keine Bilder. Ohne aktuelle externe Marktdaten ist sie nur eine Entscheidungshilfe.</p><div class="form-actions"><button class="primary" id="vehicle-analysis-run" disabled>Fahrzeuge jetzt ranken</button><button class="secondary" id="vehicle-analysis-cancel" hidden>Warten abbrechen</button><button class="secondary" id="vehicle-analysis-download" hidden>Analyse als JSON</button></div><p id="vehicle-analysis-status" role="status" aria-live="polite"></p></article><div id="vehicle-analysis-results" class="analysis-results" aria-busy="false"></div>`;
  document.querySelector('main').append(view);
  const find = id => view.querySelector('#' + id);
  const download = (text, extension, prefix = 'carsautohaus-vollstaendig') => {
    const url = URL.createObjectURL(new Blob([text], { type: extension === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.${extension}`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const render = state => {
    const count = state.dataset?.vehicles.length || 0;
    find('vehicle-export-count').textContent = `${count} Fahrzeugakten · ${state.dataset?.exportedAt || 'Noch kein Datenstand'} · KI-Fahrzeugranking v16`;
    const blocked = !count || ['loading', 'stale'].includes(state.phase);
    find('vehicle-analysis-run').disabled = blocked || !find('vehicle-analysis-consent').checked;
    find('vehicle-analysis-consent').disabled = state.phase === 'loading';
    find('vehicle-analysis-run').textContent = state.phase === 'error' ? 'Analyse erneut versuchen' : 'Fahrzeuge jetzt ranken';
    find('vehicle-analysis-cancel').hidden = state.phase !== 'loading';
    find('vehicle-analysis-download').hidden = state.phase !== 'success';
    find('vehicle-export-json').disabled = !state.dataset;
    find('vehicle-export-csv').disabled = !state.dataset;
    find('vehicle-analysis-status').textContent = state.error || ({ empty: 'Keine Fahrzeugakten vorhanden. Fügen Sie zuerst ein Fahrzeug hinzu.', ready: 'Aktueller Datenstand bereit. Die KI startet nur nach Ihrer Bestätigung.', loading: `Alle ${count} Akten werden gemeinsam analysiert. Bitte warten …`, success: 'Ranking vollständig. Alle aktuellen Akten sind enthalten.' }[state.phase] || '');
    const results = find('vehicle-analysis-results'); results.setAttribute('aria-busy', String(state.phase === 'loading'));
    results.innerHTML = state.result ? renderAnalysisResult(state.result, state.dataset) : '';
  };
  const controller = createAnalysisController({ transport, onChange: render });
  const prepareRanking = (force = false) => {
    const dataset = buildVehicleExport(api.getState());
    const saved = controller.getState();
    if (force || !saved.dataset || saved.phase === 'stale' || datasetSignature(saved.dataset) !== datasetSignature(dataset)) {
      find('vehicle-analysis-consent').checked = false;
      controller.reset(dataset);
    }
    return controller.getState().dataset;
  };
  const exportSnapshot = () => {
    try {
      const dataset = prepareRanking(true);
      api.go('vehicle-ranking'); download(exportCsv(dataset), 'csv');
      api.notify(`${dataset.vehicles.length} Fahrzeugakten vollständig als CSV exportiert.`);
    } catch (error) { api.notify(error.message); }
  };
  const openRanking = () => {
    try { prepareRanking(); api.go('vehicle-ranking'); }
    catch (error) { api.notify(error.message); }
  };
  find('vehicle-analysis-consent').addEventListener('change', () => render(controller.getState()));
  find('vehicle-analysis-run').addEventListener('click', () => controller.run(find('vehicle-analysis-consent').checked));
  find('vehicle-analysis-cancel').addEventListener('click', () => controller.cancel());
  find('vehicle-export-refresh').addEventListener('click', exportSnapshot);
  find('vehicle-export-json').addEventListener('click', () => download(JSON.stringify(controller.getState().dataset, null, 2), 'json'));
  find('vehicle-export-csv').addEventListener('click', () => download(exportCsv(controller.getState().dataset), 'csv'));
  find('vehicle-analysis-download').addEventListener('click', () => download(JSON.stringify(controller.getState().result, null, 2), 'json', 'carsautohaus-ki-analyse'));
  const checkFreshness = () => {
    const saved = controller.getState();
    if (!saved.dataset || saved.phase === 'stale') return;
    try { if (datasetSignature(saved.dataset) !== datasetSignature(buildVehicleExport(api.getState()))) controller.invalidate(); }
    catch { controller.invalidate(); }
  };
  document.addEventListener('carsautohaus:operations-updated', checkFreshness);
  document.addEventListener('autovalue:view-changed', event => {
    if (event.detail?.view === 'vehicle-ranking') {
      try { prepareRanking(); } catch (error) { api.notify(error.message); }
    } else checkFreshness();
  });
  render(controller.getState());
  return { open: exportSnapshot, openRanking, clear: () => { find('vehicle-analysis-consent').checked = false; controller.clear(); } };
}
