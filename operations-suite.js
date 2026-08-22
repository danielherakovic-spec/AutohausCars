(() => {
  'use strict';

  let api;
  const now = () => new Date().toISOString();
  const number = value => Number(value || 0);
  const money = value => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(number(value));
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const vehicleName = vehicle => [vehicle?.brand, vehicle?.model].filter(Boolean).join(' ') || 'Unbekanntes Fahrzeug';
  const id = prefix => prefix + '-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));

  function emptyOperations() {
    return {
      integrations: {
        mobileDe: { status: 'Nicht verbunden' },
        autoScout: { status: 'Nicht verbunden' },
        datev: { status: 'Nicht verbunden' },
      },
      candidates: [],
      imports: [],
      cashbook: [],
      invoices: [],
      showrooms: [],
      documents: [],
      receiptDraft: null,
      mobile: { pairingCode: '', generatedAt: '' },
    };
  }

  function operations(state) {
    if (!state.operations || typeof state.operations !== 'object') state.operations = emptyOperations();
    const base = emptyOperations();
    Object.keys(base).forEach(key => { if (state.operations[key] === undefined) state.operations[key] = base[key]; });
    return state.operations;
  }

  function read() {
    const state = api.getState();
    return operations(state);
  }

  function mutate(change) {
    api.update(state => change(operations(state), state));
  }

  function byId(items, itemId) {
    return (items || []).find(item => item.id === itemId);
  }

  function analyze(candidate) {
    const vehicles = api.vehicles();
    const comparable = vehicles.filter(vehicle =>
      String(vehicle.brand || '').toLowerCase() === String(candidate.brand || '').toLowerCase() &&
      String(vehicle.model || '').toLowerCase() === String(candidate.model || '').toLowerCase()
    );
    const referenceValues = comparable.map(vehicle => number(vehicle.askingPrice) || number(vehicle.desiredSalePrice) || number(vehicle.purchasePrice)).filter(Boolean);
    const reference = referenceValues.length ? referenceValues.reduce((sum, value) => sum + value, 0) / referenceValues.length : 0;
    const defects = String(candidate.defects || '').split(/\n|,|;/).map(value => value.trim()).filter(Boolean);
    const repairReserve = defects.length * 600;
    const yearRisk = candidate.year && candidate.year < new Date().getFullYear() - 12 ? 500 : 0;
    const mileageRisk = candidate.mileage > 180000 ? 700 : candidate.mileage > 130000 ? 350 : 0;
    const safeTarget = reference ? Math.max(0, Math.round(reference - repairReserve - yearRisk - mileageRisk)) : Math.round(number(candidate.price) * 1.12 - repairReserve);
    const maximumPurchase = Math.max(0, Math.round(safeTarget * 0.78));
    let score = 52;
    if (reference) score += Math.max(-24, Math.min(24, Math.round((reference - number(candidate.price)) / reference * 100)));
    score -= defects.length * 7;
    if (candidate.mileage > 180000) score -= 9;
    else if (candidate.mileage > 130000) score -= 4;
    if (candidate.year && candidate.year < new Date().getFullYear() - 16) score -= 5;
    score = Math.max(0, Math.min(100, score));
    const recommendation = score >= 72 ? 'Interessant – technische Prüfung und Unterlagencheck einplanen.' : score >= 48 ? 'Nur mit Preisverhandlung und klarer Mängelkalkulation weiterverfolgen.' : 'Aktuell nicht priorisieren; Markt- und Reparaturrisiko überwiegen.';
    return { score, reference, repairReserve, safeTarget, maximumPurchase, defects, recommendation, createdAt: now() };
  }

  function parseListing(text) {
    const raw = String(text || '');
    const pick = labels => {
      const match = raw.match(new RegExp('(?:' + labels.join('|') + ')\\s*[:\\-]?\\s*([^\\n,;]+)', 'i'));
      return match ? match[1].trim() : '';
    };
    const numeric = labels => {
      const value = pick(labels).replace(/[.\\s]/g, '').replace(',', '.').match(/\\d+(?:\\.\\d+)?/);
      return value ? Number(value[0]) : 0;
    };
    const brand = pick(['Marke', 'Hersteller']);
    const model = pick(['Modell', 'Model']);
    const year = numeric(['Baujahr', 'Erstzulassung', 'EZ']);
    const mileage = numeric(['Kilometerstand', 'Kilometer', 'KM']);
    const price = numeric(['Preis', 'Angebotspreis', 'Kaufpreis']);
    return { brand, model, year, mileage, price, raw };
  }

  function vehiclesOptions(selected) {
    const options = api.vehicles().map(vehicle => '<option value="' + esc(vehicle.id) + '"' + (vehicle.id === selected ? ' selected' : '') + '>' + esc(vehicleName(vehicle)) + ' · ' + esc(vehicle.year || '–') + '</option>').join('');
    return '<option value="">Kein Fahrzeug zuordnen</option>' + options;
  }

  function screen(view) {
    api.go(view);
    render(view);
  }

  function integrationCard(key, label, description, status) {
    return '<article class="card ops-card integration-card"><div><span class="ops-eyebrow">' + esc(label) + '</span><h3>' + esc(status) + '</h3><p class="muted">' + esc(description) + '</p></div><button class="secondary" data-ops-action="connect" data-provider="' + esc(key) + '">Vorbereiten</button></article>';
  }

  function inject() {
    const style = document.createElement('style');
    style.textContent = [
      '.ops-section{margin-top:24px}.ops-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.ops-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.ops-card{padding:18px}.ops-card h3{margin:4px 0 8px}.ops-eyebrow{color:#86c7ff;font-size:.73rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.ops-kpi{padding:17px}.ops-kpi span{display:block;color:var(--muted);font-size:.78rem}.ops-kpi b{display:block;margin-top:7px;font-size:1.42rem}.ops-alert{padding:13px 14px;border:1px solid rgba(245,185,88,.35);border-radius:13px;background:rgba(245,185,88,.08);color:#f5d69b;line-height:1.45}.ops-list{display:grid;gap:10px}.ops-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px;border:1px solid var(--line);border-radius:13px;background:#0d151f}.ops-row h3{margin:0 0 4px;font-size:.96rem}.ops-row p{margin:0;color:var(--muted);font-size:.82rem}.ops-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px}.ops-score{display:inline-grid;place-items:center;min-width:46px;height:31px;border-radius:999px;background:#163a62;color:#d9efff;font-size:.8rem;font-weight:800}.ops-score.good{background:rgba(47,203,137,.18);color:#a7f2cb}.ops-score.bad{background:rgba(240,99,114,.17);color:#ffc7cf}.ops-note{margin-top:11px;padding:11px 12px;border-left:3px solid #4db9ff;background:rgba(37,134,247,.08);color:#cce5fa;font-size:.84rem;line-height:1.45}.ops-toolbar{display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin-top:14px}.ops-table{width:100%;border-collapse:collapse;font-size:.86rem}.ops-table th,.ops-table td{padding:11px 8px;border-bottom:1px solid var(--line);text-align:left}.ops-table th{color:var(--muted);font-weight:700}.ops-empty{padding:26px 10px;color:var(--muted);text-align:center}.ops-chip{display:inline-flex;align-items:center;min-height:26px;padding:0 9px;border:1px solid var(--line);border-radius:999px;color:#b8d3e9;font-size:.74rem}.ops-warn{color:#f5d69b}.ops-success{color:#a7f2cb}.ops-doc{white-space:pre-wrap;min-height:220px;padding:16px;border:1px solid var(--line);border-radius:14px;background:#0a111a;color:#dce8f5;line-height:1.55}@media(max-width:920px){.ops-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.ops-grid,.ops-grid.two{grid-template-columns:1fr}.ops-row{align-items:flex-start;flex-direction:column}.ops-actions{justify-content:flex-start}.ops-table{font-size:.78rem}.ops-table th:nth-child(4),.ops-table td:nth-child(4){display:none}}'
    ].join('');
    document.head.append(style);

    const home = document.getElementById('home-view');
    home.insertAdjacentHTML('beforeend', '<section class="section ops-section"><div class="section-heading"><div><h2>Betriebszentrale</h2><p class="muted">Ankauf, Bestand, Buchhaltung und Standorte in einem Arbeitsbereich.</p></div></div><div id="ops-dashboard" class="ops-grid"></div></section>');
    document.querySelector('.app').insertAdjacentHTML('beforeend', [
      '<section id="procurement-view" class="view"><div class="hero"><div><h1>Ankauf & Marktprüfung</h1><p class="subtitle">Kandidaten strukturiert prüfen, vergleichen und bewusst entscheiden.</p></div><button class="secondary" data-ops-go="imports">Import-Hub</button></div><div id="procurement-content"></div></section>',
      '<section id="imports-view" class="view"><div class="hero"><div><h1>Import-Hub</h1><p class="subtitle">Inserate kontrolliert übernehmen – ohne ungesichertes Scraping.</p></div><button class="secondary" data-ops-go="procurement">Ankauf öffnen</button></div><div id="imports-content"></div></section>',
      '<section id="inventory-view" class="view"><div class="hero"><div><h1>Bestand & Nachbereitung</h1><p class="subtitle">Aktive Fahrzeuge, Beobachtungen und nächste Arbeitsschritte.</p></div><button class="secondary" data-go="autos">Fahrzeugdatenbank</button></div><div id="inventory-content"></div></section>',
      '<section id="accounting-view" class="view"><div class="hero"><div><h1>Buchhaltung</h1><p class="subtitle">Rechnungen, Kassenbuch, Belege und DATEV-Vorbereitung.</p></div><button class="secondary" data-ops-go="documents">Dokumente</button></div><div id="accounting-content"></div></section>',
      '<section id="showrooms-view" class="view"><div class="hero"><div><h1>Showrooms</h1><p class="subtitle">Standorte, Kapazitäten und Fahrzeugzuordnung verwalten.</p></div><button class="secondary" data-ops-go="inventory">Bestand öffnen</button></div><div id="showrooms-content"></div></section>',
      '<section id="documents-view" class="view"><div class="hero"><div><h1>Dokumente & Vorlagen</h1><p class="subtitle">Bearbeitbare Entwürfe für die tägliche Fahrzeugabwicklung.</p></div><button class="secondary" data-ops-go="accounting">Buchhaltung öffnen</button></div><div id="documents-content"></div></section>',
      '<section id="integrations-view" class="view"><div class="hero"><div><h1>Mobile & Integrationen</h1><p class="subtitle">Zugänge sicher vorbereiten und den mobilen Arbeitsablauf organisieren.</p></div><button class="secondary" data-ops-go="home">Übersicht</button></div><div id="integrations-content"></div></section>'
    ].join(''));
  }

  function renderDashboard() {
    const ops = read();
    const vehicles = api.vehicles();
    const cash = ops.cashbook.reduce((sum, entry) => sum + (entry.type === 'Einnahme' ? number(entry.amount) : -number(entry.amount)), 0);
    const openCandidates = ops.candidates.filter(candidate => !['Abgelehnt', 'Übernommen'].includes(candidate.status)).length;
    const watched = ops.candidates.filter(candidate => candidate.status === 'Beobachtung').length;
    const showrooms = ops.showrooms.length;
    document.getElementById('ops-dashboard').innerHTML = [
      ['Ankauf prüfen', openCandidates, 'procurement', 'Kandidaten & transparente Ankaufanalyse'],
      ['Beobachtung', watched, 'inventory', 'Preis- und Mängelrisiken nachhalten'],
      ['Kassenstand', money(cash), 'accounting', 'Einnahmen, Ausgaben und Belege'],
      ['Showrooms', showrooms, 'showrooms', vehicles.length + ' Fahrzeuge im Bestand'],
      ['Integrationen', 'Öffnen', 'integrations', 'mobile.de, AutoScout24 und DATEV vorbereiten'],
      ['Dokumente', ops.documents.length, 'documents', 'Vorlagen und Druckansichten'],
    ].map(item => '<button class="card ops-kpi" data-ops-go="' + item[2] + '"><span>' + esc(item[0]) + '</span><b>' + esc(item[1]) + '</b><small class="muted">' + esc(item[3]) + '</small></button>').join('');
  }

  function renderProcurement() {
    const ops = read();
    const candidates = ops.candidates.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const rows = candidates.length ? candidates.map(candidate => {
      const analysis = candidate.analysis || analyze(candidate);
      const scoreClass = analysis.score >= 72 ? 'good' : analysis.score < 48 ? 'bad' : '';
      return '<article class="ops-row"><div><h3>' + esc(candidate.brand + ' ' + candidate.model) + ' <span class="ops-score ' + scoreClass + '">' + analysis.score + '/100</span></h3><p>' + esc(candidate.source) + ' · ' + esc(candidate.year || '–') + ' · ' + number(candidate.mileage).toLocaleString('de-DE') + ' km · ' + money(candidate.price) + '</p><p class="ops-note">' + esc(analysis.recommendation) + '<br>Interne Referenz: ' + (analysis.reference ? money(analysis.reference) : 'noch keine Vergleichsdaten') + ' · Einkaufslimit: ' + money(analysis.maximumPurchase) + ' · Mängelreserve: ' + money(analysis.repairReserve) + '</p></div><div class="ops-actions"><span class="ops-chip">' + esc(candidate.status) + '</span><button class="secondary" data-ops-action="observe" data-id="' + esc(candidate.id) + '">Beobachten</button><button class="secondary" data-ops-action="reject-candidate" data-id="' + esc(candidate.id) + '">Ablehnen</button><button class="primary" data-ops-action="accept-candidate" data-id="' + esc(candidate.id) + '">In Bestand übernehmen</button></div></article>';
    }).join('') : '<div class="ops-empty">Noch keine Ankaufkandidaten. Erstelle einen Kandidaten oder importiere ein Inserat zur Prüfung.</div>';
    document.getElementById('procurement-content').innerHTML = [
      '<div class="ops-grid two"><article class="card form-card"><div class="section-heading"><div><h2>Neuen Ankauf prüfen</h2><p class="muted">Die Analyse ist nachvollziehbar und dient als Vorentscheidung – sie ersetzt keine Probefahrt, Gutachten oder Marktprüfung.</p></div></div><div class="form-grid"><label>Quelle<select id="proc-source"><option>mobile.de</option><option>AutoScout24</option><option>Händlernetz</option><option>Manuell</option></select></label><label>Inserat-Link oder Referenz<input id="proc-url" placeholder="https://…" /></label><label>Marke<input id="proc-brand" placeholder="z. B. Ford" /></label><label>Modell<input id="proc-model" placeholder="z. B. Fiesta" /></label><label>Baujahr<input id="proc-year" type="number" placeholder="2018" /></label><label>Kilometer<input id="proc-mileage" type="number" placeholder="90000" /></label><label>Aufgerufener Preis (€)<input id="proc-price" type="number" placeholder="9500" /></label></div><label style="margin-top:13px">Mängel, Hinweise und offene Fragen<textarea id="proc-defects" placeholder="z. B. HU prüfen, Kratzer Stoßfänger, Serviceheft fehlt"></textarea></label><div class="form-actions"><button class="primary" data-ops-action="analyze-candidate">Analyse erstellen</button></div></article><article class="card ops-card"><span class="ops-eyebrow">Ankauflogik</span><h2>Erklärbare Entscheidungshilfe</h2><div class="ops-list"><p class="muted">Vergleicht den aufgerufenen Preis mit ähnlichen Fahrzeugen im eigenen Bestand, berechnet eine konservative Mängelreserve und zeigt ein Einkaufslimit.</p><p class="ops-note">Für externe Marktpreise, Historie, Schäden und Dokumente bleibt eine manuelle fachliche Prüfung erforderlich.</p><button class="secondary" data-ops-go="imports">Inserat aus Import-Hub prüfen</button></div></article></div><section class="section"><div class="section-heading"><div><h2>Kandidaten & Beobachtung</h2><p class="muted">Übernimm nur Kandidaten, die du bewusst geprüft hast.</p></div></div><div class="ops-list">' + rows + '</div></section>'
    ].join('');
  }

  function renderImports() {
    const ops = read();
    const list = ops.imports.length ? ops.imports.slice().reverse().map(item => '<article class="ops-row"><div><h3>' + esc(item.brand + ' ' + item.model || 'Unvollständiges Inserat') + '</h3><p>' + esc(item.source) + ' · ' + esc(item.year || 'Baujahr offen') + ' · ' + (item.mileage ? number(item.mileage).toLocaleString('de-DE') + ' km' : 'Kilometer offen') + ' · ' + (item.price ? money(item.price) : 'Preis offen') + '</p><p class="muted">Importiert am ' + esc(api.formatDate(item.createdAt)) + ' · vor Übernahme prüfen</p></div><div class="ops-actions"><button class="secondary" data-ops-action="send-to-procurement" data-id="' + esc(item.id) + '">Ankauf prüfen</button><button class="primary" data-ops-action="import-vehicle" data-id="' + esc(item.id) + '">In Bestand übernehmen</button></div></article>').join('') : '<div class="ops-empty">Noch keine Importvorschläge. Füge einen Inseratstext ein oder lade eine strukturierte Datei hoch.</div>';
    const mobile = ops.integrations.mobileDe.status;
    const autoScout = ops.integrations.autoScout.status;
    document.getElementById('imports-content').innerHTML = [
      '<div class="ops-grid two"><article class="card form-card"><div class="section-heading"><div><h2>Inserat kontrolliert übernehmen</h2><p class="muted">Füge die relevanten Inseratdaten ein. Erst nach Auswahl wird ein Fahrzeug in den Bestand geschrieben.</p></div></div><div class="form-grid"><label>Portal<select id="import-source"><option>mobile.de</option><option>AutoScout24</option><option>CSV / Händlerliste</option><option>Manuell</option></select></label><label>Inserat-URL<input id="import-url" placeholder="optional" /></label></div><label style="margin-top:13px">Inseratstext oder strukturierte Angaben<textarea id="import-text" placeholder="Marke: Ford&#10;Modell: Fiesta&#10;Baujahr: 2018&#10;Kilometer: 90000&#10;Preis: 9500"></textarea></label><label style="margin-top:13px">Strukturierte Datei (JSON oder CSV)<input id="import-file" type="file" accept=".json,.csv,text/csv,application/json" /></label><div class="form-actions"><button class="primary" data-ops-action="stage-import">Zur Prüfung hinzufügen</button></div></article><article class="card ops-card"><span class="ops-eyebrow">Partnerzugänge</span><h2>Portalimport sicher vorbereiten</h2><p class="muted">Aktueller Status: mobile.de ' + esc(mobile) + ' · AutoScout24 ' + esc(autoScout) + '.</p><p class="ops-note">Der Browser importiert keine fremden Kontodaten und umgeht keine Portalregeln. Eine echte Kontoverknüpfung wird erst über einen offiziellen Händler- oder Partnerzugang mit serverseitigem OAuth aktiviert.</p><div class="ops-toolbar"><button class="secondary" data-ops-go="integrations">Integrationen öffnen</button><button class="secondary" data-ops-action="sample-import">Beispiel laden</button></div></article></div><section class="section"><div class="section-heading"><div><h2>Importwarteschlange</h2><p class="muted">Jeder Eintrag bleibt bis zur bewussten Übernahme bearbeitbar.</p></div></div><div class="ops-list">' + list + '</div></section>'
    ].join('');
  }

  function renderInventory() {
    const ops = read();
    const candidates = ops.candidates.filter(candidate => candidate.status === 'Beobachtung');
    const vehicles = api.vehicles();
    const rows = vehicles.length ? vehicles.map(vehicle => {
      const showroom = byId(ops.showrooms, vehicle.showroomId);
      const next = vehicle.status === 'In Aufbereitung' ? 'Mängel und Kosten nachhalten' : vehicle.status === 'Besichtigung geplant' ? 'Unterlagen und Termin prüfen' : vehicle.status === 'Inseriert' ? 'Preis und Reaktion beobachten' : 'Fahrzeugakte prüfen';
      return '<tr><td><b>' + esc(vehicleName(vehicle)) + '</b><br><span class="muted">' + esc(vehicle.status) + '</span></td><td>' + esc(showroom?.name || vehicle.location || 'Nicht zugeordnet') + '</td><td>' + esc(next) + '</td><td><button class="secondary" data-go="autos">Öffnen</button></td></tr>';
    }).join('') : '<tr><td colspan="4" class="ops-empty">Noch keine Fahrzeuge im Bestand.</td></tr>';
    const watched = candidates.length ? candidates.map(candidate => '<article class="ops-row"><div><h3>' + esc(candidate.brand + ' ' + candidate.model) + '</h3><p>' + money(candidate.price) + ' · ' + esc(candidate.analysis?.recommendation || 'Noch einmal prüfen') + '</p></div><div class="ops-actions"><button class="secondary" data-ops-go="procurement">Öffnen</button></div></article>').join('') : '<div class="ops-empty">Keine Kandidaten in Beobachtung.</div>';
    document.getElementById('inventory-content').innerHTML = '<div class="ops-grid two"><article class="card ops-card"><span class="ops-eyebrow">Bestand</span><h2>' + vehicles.length + ' aktive Fahrzeugakten</h2><p class="muted">Nutze die Fahrzeugdatenbank für Details, Preise und Fotos. Hier siehst du den nächsten operativen Schritt.</p></article><article class="card ops-card"><span class="ops-eyebrow">Beobachtung</span><h2>' + candidates.length + ' Ankaufkandidaten</h2><p class="muted">Beobachtungen bleiben getrennt vom Fahrzeugbestand, bis du sie bewusst übernimmst.</p></article></div><section class="section"><div class="section-heading"><div><h2>Nachbereitung im Bestand</h2><p class="muted">Fokussiere zuerst offene Fahrzeugakten und laufende Aufbereitung.</p></div></div><div class="card form-card"><table class="ops-table"><thead><tr><th>Fahrzeug</th><th>Standort</th><th>Nächster Schritt</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></section><section class="section"><div class="section-heading"><div><h2>Beobachtungsliste</h2></div></div><div class="ops-list">' + watched + '</div></section>';
  }

  function renderAccounting() {
    const ops = read();
    const cash = ops.cashbook.reduce((sum, entry) => sum + (entry.type === 'Einnahme' ? number(entry.amount) : -number(entry.amount)), 0);
    const receipts = ops.cashbook.filter(entry => entry.receiptName).length;
    const entriesData = ops.cashbook.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const entries = entriesData.map(entry => '<tr><td>' + esc(api.formatDate(entry.date)) + '</td><td>' + esc(entry.type) + '</td><td>' + esc(entry.category) + '</td><td>' + esc(entry.vehicleName || '–') + '</td><td class="' + (entry.type === 'Einnahme' ? 'ops-success' : 'ops-warn') + '">' + money(entry.amount) + '</td><td>' + (entry.receiptData ? '<button class="secondary" data-ops-action="open-receipt" data-id="' + esc(entry.id) + '">' + esc(entry.receiptName) + '</button>' : esc(entry.receiptName || '–')) + '</td></tr>').join('') || '<tr><td colspan="6" class="ops-empty">Noch keine Kassenbucheinträge.</td></tr>';
    const invoices = ops.invoices.length ? ops.invoices.slice().reverse().map(invoice => '<article class="ops-row"><div><h3>Rechnung ' + esc(invoice.number) + '</h3><p>' + esc(invoice.customer) + ' · ' + esc(invoice.vehicleName || 'Allgemeine Rechnung') + ' · ' + money(invoice.amount) + '</p></div><div class="ops-actions"><span class="ops-chip">' + esc(invoice.status) + '</span><button class="secondary" data-ops-action="print-invoice" data-id="' + esc(invoice.id) + '">Druckansicht</button></div></article>').join('') : '<div class="ops-empty">Noch keine Rechnungsentwürfe.</div>';
    document.getElementById('accounting-content').innerHTML = [
      '<div class="ops-grid"><article class="card ops-kpi"><span>Kassenstand</span><b>' + money(cash) + '</b><small class="muted">aus ' + ops.cashbook.length + ' Buchungen</small></article><article class="card ops-kpi"><span>Rechnungsentwürfe</span><b>' + ops.invoices.length + '</b><small class="muted">vor Versand prüfen</small></article><article class="card ops-kpi"><span>Belege</span><b>' + receipts + '</b><small class="muted">lokal an Buchungen angehängt</small></article></div>',
      '<section class="section ops-grid two"><article class="card form-card"><div class="section-heading"><div><h2>Kassenbuch buchen</h2><p class="muted">Eintrag dokumentieren und optional einen Beleg bis 1 MB anhängen.</p></div></div><div class="form-grid"><label>Datum<input id="cash-date" type="date" value="' + new Date().toISOString().slice(0, 10) + '" /></label><label>Art<select id="cash-type"><option>Ausgabe</option><option>Einnahme</option></select></label><label>Kategorie<input id="cash-category" placeholder="z. B. Reinigung" /></label><label>Betrag (€)<input id="cash-amount" type="number" step="0.01" /></label><label>Fahrzeug<select id="cash-vehicle">' + vehiclesOptions() + '</select></label><label>Beleg<input id="receipt-file" type="file" accept="image/*,.pdf,application/pdf" /></label></div><label style="margin-top:13px">Notiz<textarea id="cash-note" placeholder="Interne Erläuterung"></textarea></label><div class="form-actions"><button class="primary" data-ops-action="book-cash">Buchen</button></div></article><article class="card form-card"><div class="section-heading"><div><h2>Rechnung erstellen</h2><p class="muted">Erstellt einen bearbeitbaren Entwurf – Zahlen, Steuer und Pflichtangaben vor Versand prüfen.</p></div></div><div class="form-grid"><label>Empfänger<input id="invoice-customer" placeholder="Name oder Firma" /></label><label>Fahrzeug<select id="invoice-vehicle">' + vehiclesOptions() + '</select></label><label>Rechnungsbetrag (€)<input id="invoice-amount" type="number" step="0.01" /></label><label>Leistung<input id="invoice-service" placeholder="Fahrzeugverkauf" /></label></div><div class="form-actions"><button class="primary" data-ops-action="create-invoice">Entwurf erstellen</button></div></article></section>',
      '<section class="section"><div class="section-heading"><div><h2>DATEV-Übergabe</h2><p class="muted">Buchungsdaten und Belege vorbereiten, ohne Zugangsdaten im Browser zu speichern.</p></div><button class="secondary" data-ops-action="connect" data-provider="datev">DATEV vorbereiten</button></div><div class="ops-alert">Die DATEV-Anbindung bleibt bis zu OAuth, Mandantenfreigabe und freigegebenem Partnerzugang im Vorbereitungsmodus. Der CSV-Export ist eine Arbeitsdatei und kein bestätigter DATEV-Import.</div><div class="ops-toolbar"><button class="secondary" data-ops-action="export-cashbook">Kassenbuch-CSV herunterladen</button><button class="secondary" data-ops-go="integrations">Integrationsstatus ansehen</button></div></section>',
      '<section class="section"><div class="section-heading"><div><h2>Kassenbuch</h2></div></div><div class="card form-card"><table class="ops-table"><thead><tr><th>Datum</th><th>Art</th><th>Kategorie</th><th>Fahrzeug</th><th>Betrag</th><th>Beleg</th></tr></thead><tbody>' + entries + '</tbody></table></div></section><section class="section"><div class="section-heading"><div><h2>Rechnungsentwürfe</h2></div></div><div class="ops-list">' + invoices + '</div></section>'
    ].join('');
  }

  function renderShowrooms() {
    const ops = read();
    const showrooms = ops.showrooms.length ? ops.showrooms.map(showroom => {
      const vehicles = api.vehicles().filter(vehicle => vehicle.showroomId === showroom.id);
      return '<article class="card ops-card"><span class="ops-eyebrow">Standort</span><h2>' + esc(showroom.name) + '</h2><p class="muted">' + esc(showroom.address || 'Adresse offen') + '</p><div class="ops-toolbar"><span class="ops-chip">' + vehicles.length + ' / ' + esc(showroom.capacity || '–') + ' Plätze</span><span class="ops-chip">' + esc(showroom.status || 'Aktiv') + '</span></div><p class="ops-note">' + (vehicles.length ? vehicles.map(vehicleName).map(esc).join(', ') : 'Noch keine Fahrzeuge zugeordnet.') + '</p></article>';
    }).join('') : '<div class="ops-empty">Lege deinen ersten Showroom oder Abstellplatz an.</div>';
    document.getElementById('showrooms-content').innerHTML = '<div class="ops-grid two"><article class="card form-card"><div class="section-heading"><div><h2>Showroom anlegen</h2><p class="muted">Verwalte Verkaufsfläche, Übergabeplatz oder Außenstandort.</p></div></div><div class="form-grid"><label>Name<input id="showroom-name" placeholder="z. B. Bremen Zentrum" /></label><label>Kapazität<input id="showroom-capacity" type="number" placeholder="12" /></label><label>Status<select id="showroom-status"><option>Aktiv</option><option>In Planung</option><option>Temporär geschlossen</option></select></label></div><label style="margin-top:13px">Adresse oder Hinweis<textarea id="showroom-address" placeholder="Straße, Ort, Übergabehinweis"></textarea></label><div class="form-actions"><button class="primary" data-ops-action="create-showroom">Standort speichern</button></div></article><article class="card form-card"><div class="section-heading"><div><h2>Fahrzeug zuordnen</h2><p class="muted">Die Zuordnung ergänzt die Fahrzeugakte und kann jederzeit geändert werden.</p></div></div><div class="form-grid"><label>Fahrzeug<select id="showroom-vehicle">' + vehiclesOptions() + '</select></label><label>Showroom<select id="showroom-select"><option value="">Keine Zuordnung</option>' + ops.showrooms.map(showroom => '<option value="' + esc(showroom.id) + '">' + esc(showroom.name) + '</option>').join('') + '</select></label></div><div class="form-actions"><button class="primary" data-ops-action="assign-showroom">Zuordnung speichern</button></div></article></div><section class="section"><div class="section-heading"><div><h2>Standortübersicht</h2></div></div><div class="ops-grid">' + showrooms + '</div></section>';
  }

  function documentText(template, vehicle, buyer) {
    const name = vehicleName(vehicle);
    const date = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(new Date());
    const price = money(number(vehicle?.soldPrice) || number(vehicle?.desiredSalePrice) || number(vehicle?.askingPrice));
    const body = {
      'Kaufvertrag-Entwurf': 'Entwurf eines Fahrzeugkaufvertrags\\n\\nFahrzeug: ' + name + '\\nBaujahr: ' + (vehicle?.year || 'offen') + '\\nKilometerstand: ' + number(vehicle?.mileage).toLocaleString('de-DE') + ' km\\nKaufpreis: ' + price + '\\nKäufer: ' + (buyer || 'offen') + '\\n\\nIndividuelle Vereinbarungen, Gewährleistung, Sachmängelhaftung, Eigentumsübergang und gesetzliche Pflichtangaben müssen vor Unterzeichnung fachkundig geprüft und ergänzt werden.',
      'Übergabeprotokoll': 'Übergabeprotokoll\\n\\nFahrzeug: ' + name + '\\nEmpfänger: ' + (buyer || 'offen') + '\\nDatum: ' + date + '\\n\\nÜbergeben wurden: Schlüssel, Zulassungsbescheinigung, Serviceunterlagen und Fahrzeug. Mängel, Zubehör, Kilometerstand und Vorbehalte bitte einzeln dokumentieren.',
      'Reservierungsvereinbarung': 'Reservierungsvereinbarung – Entwurf\\n\\nFahrzeug: ' + name + '\\nInteressent: ' + (buyer || 'offen') + '\\nDatum: ' + date + '\\n\\nReservierungsdauer, Bedingungen, Anzahlung, Rückabwicklung und gesetzliche Verbraucherinformationen müssen vor Verwendung geprüft und konkret vereinbart werden.',
      'Rechnungsentwurf': 'Rechnungsentwurf\\n\\nLeistung: Fahrzeugverkauf ' + name + '\\nEmpfänger: ' + (buyer || 'offen') + '\\nBetrag: ' + price + '\\nDatum: ' + date + '\\n\\nRechnungsnummer, Steuern, Anschrift, Leistungszeitpunkt und alle Pflichtangaben vor Versand prüfen.',
    };
    return body[template] || body['Kaufvertrag-Entwurf'];
  }

  function renderDocuments() {
    const ops = read();
    const documents = ops.documents.length ? ops.documents.slice().reverse().map(document => '<article class="ops-row"><div><h3>' + esc(document.template) + '</h3><p>' + esc(document.vehicleName) + ' · ' + esc(document.buyer || 'Empfänger offen') + ' · ' + esc(api.formatDate(document.createdAt)) + '</p></div><div class="ops-actions"><span class="ops-chip">Entwurf</span><button class="secondary" data-ops-action="print-document" data-id="' + esc(document.id) + '">Druckansicht</button></div></article>').join('') : '<div class="ops-empty">Noch keine Dokumententwürfe.</div>';
    document.getElementById('documents-content').innerHTML = '<div class="ops-alert">Die Vorlagen sind editierbare Arbeitsentwürfe. Sie sind nicht als rechtssichere Vorlagen zugesichert und müssen vor Nutzung für deinen Fall, die Rechtsform und den aktuellen Rechtsstand rechtlich geprüft werden.</div><section class="section ops-grid two"><article class="card form-card"><div class="section-heading"><div><h2>Vorlage erstellen</h2><p class="muted">Erstellt eine Druckansicht mit deinen Fahrzeugdaten.</p></div></div><div class="form-grid"><label>Vorlage<select id="document-template"><option>Kaufvertrag-Entwurf</option><option>Übergabeprotokoll</option><option>Reservierungsvereinbarung</option><option>Rechnungsentwurf</option></select></label><label>Fahrzeug<select id="document-vehicle">' + vehiclesOptions() + '</select></label><label>Käufer / Empfänger<input id="document-buyer" placeholder="Name oder Firma" /></label></div><div class="form-actions"><button class="primary" data-ops-action="create-document">Entwurf erzeugen</button></div></article><article class="card ops-card"><span class="ops-eyebrow">Sicher arbeiten</span><h2>Prüfung vor Verwendung</h2><p class="muted">Ergänze immer individuelle Vereinbarungen, Mängel, Zahlungsbedingungen und gesetzliche Angaben. Nutze rechtsverbindliche Dokumente erst nach Prüfung durch eine qualifizierte Stelle.</p></article></section><section class="section"><div class="section-heading"><div><h2>Gespeicherte Entwürfe</h2></div></div><div class="ops-list">' + documents + '</div></section>';
  }

  function renderIntegrations() {
    const ops = read();
    const code = ops.mobile.pairingCode;
    document.getElementById('integrations-content').innerHTML = '<div class="ops-grid"><article class="card ops-card"><span class="ops-eyebrow">Mobil arbeiten</span><h2>CarsAutoHaus auf dem Smartphone</h2><p class="muted">Die Website ist als installierbare Web-App für mobile Verwaltung ausgelegt. Nach Anmeldung am selben gemeinsamen Bestand arbeitest du auf allen berechtigten Geräten synchron.</p><div class="ops-toolbar"><button class="primary" data-ops-action="create-mobile-code">Gerätecode erzeugen</button>' + (code ? '<span class="ops-chip">Code vorbereitet: ' + esc(code) + '</span>' : '') + '</div><p class="ops-note">Ein echter Geräte-Pairing-Flow benötigt einen serverseitigen Bestätigungsendpunkt. Der angezeigte Code ist deshalb nur ein organisatorischer Einrichtungsnachweis und kein Login-Token.</p></article>' + integrationCard('mobileDe', 'mobile.de', 'Offiziellen Händler- oder Partnerzugang mit OAuth serverseitig verbinden.', ops.integrations.mobileDe.status) + integrationCard('autoScout', 'AutoScout24', 'Offiziellen Händler- oder Partnerzugang mit OAuth serverseitig verbinden.', ops.integrations.autoScout.status) + integrationCard('datev', 'DATEV', 'Buchungsdaten, Belege und Mandantenfreigabe über offizielle DATEV-Datenservices vorbereiten.', ops.integrations.datev.status) + '</div><section class="section"><div class="section-heading"><div><h2>Umsetzungsstatus</h2><p class="muted">Diese App speichert keine Portalpasswörter und keine API-Geheimnisse im Browser.</p></div></div><div class="card ops-card"><ol class="muted" style="padding-left:20px;line-height:1.7"><li>Partnervertrag und Entwicklerzugang beim jeweiligen Anbieter aktivieren.</li><li>Serverseitigen OAuth-Rückruf und verschlüsselte Tokenablage einrichten.</li><li>Importfelder sowie Vorschau gegen den Anbieter-Sandboxbestand testen.</li><li>Für DATEV Mandant, Berechtigungen, Datenservice und Freigabeprozess abstimmen.</li></ol></div></section>';
  }

  function render(view) {
    renderDashboard();
    if (view === 'procurement') renderProcurement();
    if (view === 'imports') renderImports();
    if (view === 'inventory') renderInventory();
    if (view === 'accounting') renderAccounting();
    if (view === 'showrooms') renderShowrooms();
    if (view === 'documents') renderDocuments();
    if (view === 'integrations') renderIntegrations();
  }

  function value(selector) {
    return document.querySelector(selector)?.value?.trim() || '';
  }

  function candidateFromImport(item) {
    return {
      id: id('candidate'), source: item.source, url: item.url || '', brand: item.brand, model: item.model,
      year: number(item.year), mileage: number(item.mileage), price: number(item.price), defects: '',
      status: 'Neu', createdAt: now(), analysis: analyze(item)
    };
  }

  function vehicleFrom(item) {
    return {
      id: id('car'), brand: item.brand || 'Unbekannt', model: item.model || '', year: number(item.year),
      mileage: number(item.mileage), askingPrice: number(item.price), purchasePrice: 0, desiredSalePrice: 0,
      status: 'Besichtigung geplant', sourceUrl: item.url || '', importedAt: now(), notes: 'Aus ' + item.source + ' zur Prüfung übernommen.',
      equipment: [], updatedAt: now(), createdBy: 'Import-Hub'
    };
  }

  function printPage(title, content) {
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) return api.notify('Druckansicht wurde vom Browser blockiert.');
    popup.document.write('<!doctype html><html lang="de"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>body{font-family:Arial,sans-serif;margin:40px;line-height:1.55;color:#111}h1{font-size:22px}pre{white-space:pre-wrap;font:inherit}</style></head><body><h1>' + esc(title) + '</h1><pre>' + esc(content) + '</pre><script>window.print()<\/script></body></html>');
    popup.document.close();
  }

  function download(name, text, type) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  async function readReceipt(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function handleAction(action, button) {
    if (action === 'analyze-candidate') {
      const candidate = {
        id: id('candidate'), source: value('#proc-source') || 'Manuell', url: value('#proc-url'), brand: value('#proc-brand'),
        model: value('#proc-model'), year: number(value('#proc-year')), mileage: number(value('#proc-mileage')),
        price: number(value('#proc-price')), defects: value('#proc-defects'), status: 'Neu', createdAt: now()
      };
      if (!candidate.brand || !candidate.model || !candidate.price) return api.notify('Bitte mindestens Marke, Modell und Preis angeben.');
      candidate.analysis = analyze(candidate);
      mutate(ops => { ops.candidates.unshift(candidate); });
      api.notify('Ankaufanalyse wurde gespeichert.');
      return renderProcurement();
    }
    if (action === 'observe' || action === 'reject-candidate') {
      mutate(ops => { const candidate = byId(ops.candidates, button.dataset.id); if (candidate) candidate.status = action === 'observe' ? 'Beobachtung' : 'Abgelehnt'; });
      return renderProcurement();
    }
    if (action === 'accept-candidate') {
      mutate((ops, state) => {
        const candidate = byId(ops.candidates, button.dataset.id);
        if (!candidate) return;
        state.vehicles.unshift(vehicleFrom(candidate));
        candidate.status = 'Übernommen';
      });
      api.notify('Kandidat wurde als Fahrzeugakte zur Prüfung in den Bestand übernommen.');
      return renderProcurement();
    }
    if (action === 'stage-import' || action === 'sample-import') {
      const sample = action === 'sample-import' ? 'Marke: Volkswagen\nModell: Polo\nBaujahr: 2019\nKilometer: 78000\nPreis: 10800' : value('#import-text');
      const parsed = parseListing(sample);
      const item = { id: id('import'), source: action === 'sample-import' ? 'Beispiel' : (value('#import-source') || 'Manuell'), url: value('#import-url'), brand: parsed.brand, model: parsed.model, year: parsed.year, mileage: parsed.mileage, price: parsed.price, raw: parsed.raw, createdAt: now() };
      if (!item.brand || !item.model) return api.notify('Der Text muss mindestens Marke und Modell enthalten.');
      mutate(ops => { ops.imports.push(item); });
      api.notify('Importvorschlag wurde zur Prüfung abgelegt.');
      return renderImports();
    }
    if (action === 'send-to-procurement') {
      mutate(ops => { const item = byId(ops.imports, button.dataset.id); if (item) ops.candidates.unshift(candidateFromImport(item)); });
      api.notify('Der Importvorschlag wurde als Ankaufkandidat angelegt.');
      return screen('procurement');
    }
    if (action === 'import-vehicle') {
      mutate((ops, state) => { const item = byId(ops.imports, button.dataset.id); if (item) { state.vehicles.unshift(vehicleFrom(item)); item.importedAt = now(); } });
      api.notify('Fahrzeug wurde als zu prüfende Akte in den Bestand übernommen.');
      return renderImports();
    }
    if (action === 'connect') {
      const provider = button.dataset.provider;
      mutate(ops => { if (ops.integrations[provider]) { ops.integrations[provider].status = 'Vorbereitung läuft'; ops.integrations[provider].requestedAt = now(); } });
      api.notify('Die sichere Integrationsvorbereitung wurde gespeichert. Für die Live-Verbindung werden offizielle Zugangsdaten und ein Server benötigt.');
      return renderIntegrations();
    }
    if (action === 'create-mobile-code') {
      mutate(ops => { ops.mobile.pairingCode = Math.random().toString(36).slice(2, 8).toUpperCase(); ops.mobile.generatedAt = now(); });
      return renderIntegrations();
    }
    if (action === 'book-cash') {
      const vehicle = byId(api.vehicles(), value('#cash-vehicle'));
      const file = document.querySelector('#receipt-file')?.files?.[0];
      const receipt = read().receiptDraft;
      const entry = { id: id('cash'), date: value('#cash-date') || new Date().toISOString().slice(0, 10), type: value('#cash-type') || 'Ausgabe', category: value('#cash-category') || 'Ohne Kategorie', amount: number(value('#cash-amount')), vehicleId: vehicle?.id || '', vehicleName: vehicleName(vehicle), note: value('#cash-note'), receiptName: receipt?.name || file?.name || '', receiptData: receipt?.data || '', createdAt: now() };
      if (!entry.amount) return api.notify('Bitte einen Betrag angeben.');
      if (file && file.size > 500 * 1024) return api.notify('Belege dürfen in diesem gemeinsamen Arbeitsbereich maximal 500 KB groß sein.');
      mutate(ops => { ops.cashbook.push(entry); ops.receiptDraft = null; });
      api.notify('Kassenbucheintrag wurde gespeichert.');
      return renderAccounting();
    }
    if (action === 'create-invoice') {
      const vehicle = byId(api.vehicles(), value('#invoice-vehicle'));
      const amount = number(value('#invoice-amount'));
      if (!value('#invoice-customer') || !amount) return api.notify('Bitte Empfänger und Betrag angeben.');
      mutate(ops => {
        const next = String(ops.invoices.length + 1).padStart(4, '0');
        ops.invoices.push({ id: id('invoice'), number: 'CAH-' + new Date().getFullYear() + '-' + next, customer: value('#invoice-customer'), vehicleId: vehicle?.id || '', vehicleName: vehicleName(vehicle), amount, service: value('#invoice-service') || 'Fahrzeugverkauf', status: 'Entwurf', createdAt: now() });
      });
      api.notify('Rechnungsentwurf wurde erstellt.');
      return renderAccounting();
    }
    if (action === 'print-invoice') {
      const invoice = byId(read().invoices, button.dataset.id);
      if (invoice) printPage('Rechnung ' + invoice.number, 'Rechnungsentwurf\n\nEmpfänger: ' + invoice.customer + '\nLeistung: ' + invoice.service + '\nFahrzeug: ' + invoice.vehicleName + '\nBetrag: ' + money(invoice.amount) + '\n\nPflichtangaben, Steuern, Anschrift und Leistungszeitpunkt vor Versand prüfen.');
      return;
    }
    if (action === 'export-cashbook') {
      const rows = read().cashbook.map(entry => [entry.date, entry.type, entry.category, entry.vehicleName, entry.amount, entry.note].map(value => '"' + String(value || '').replaceAll('"', '""') + '"').join(';'));
      return download('carsautohaus-kassenbuch.csv', ['Datum;Art;Kategorie;Fahrzeug;Betrag;Notiz'].concat(rows).join('\n'), 'text/csv;charset=utf-8');
    }
    if (action === 'open-receipt') {
      const entry = byId(read().cashbook, button.dataset.id);
      if (!entry?.receiptData) return api.notify('Für diesen Kassenbucheintrag ist nur die Belegbezeichnung gespeichert.');
      window.open(entry.receiptData, '_blank', 'noopener,noreferrer');
      return;
    }
    if (action === 'create-showroom') {
      const name = value('#showroom-name');
      if (!name) return api.notify('Bitte einen Standortnamen angeben.');
      mutate(ops => { ops.showrooms.push({ id: id('showroom'), name, capacity: number(value('#showroom-capacity')) || '', status: value('#showroom-status') || 'Aktiv', address: value('#showroom-address'), createdAt: now() }); });
      api.notify('Showroom wurde gespeichert.');
      return renderShowrooms();
    }
    if (action === 'assign-showroom') {
      const vehicleId = value('#showroom-vehicle');
      mutate((ops, state) => { const vehicle = byId(state.vehicles, vehicleId); if (vehicle) vehicle.showroomId = value('#showroom-select'); });
      api.notify('Fahrzeugzuordnung wurde gespeichert.');
      return renderShowrooms();
    }
    if (action === 'create-document') {
      const vehicle = byId(api.vehicles(), value('#document-vehicle'));
      if (!vehicle) return api.notify('Bitte zuerst ein Fahrzeug auswählen.');
      const template = value('#document-template');
      const buyer = value('#document-buyer');
      mutate(ops => { ops.documents.push({ id: id('document'), template, vehicleId: vehicle.id, vehicleName: vehicleName(vehicle), buyer, content: documentText(template, vehicle, buyer), createdAt: now() }); });
      api.notify('Dokumententwurf wurde gespeichert.');
      return renderDocuments();
    }
    if (action === 'print-document') {
      const document = byId(read().documents, button.dataset.id);
      if (document) printPage(document.template, document.content);
    }
  }

  function onFileChange(event) {
    if (event.target.id === 'receipt-file') {
      const receipt = event.target.files?.[0];
      if (!receipt) return;
      if (receipt.size > 500 * 1024) return api.notify('Belege dürfen in diesem gemeinsamen Arbeitsbereich maximal 500 KB groß sein.');
      readReceipt(receipt).then(data => {
        mutate(ops => { ops.receiptDraft = { name: receipt.name, type: receipt.type, data }; });
        api.notify('Beleg wurde für den nächsten Kassenbucheintrag angehängt.');
      }).catch(() => api.notify('Der Beleg konnte nicht gelesen werden.'));
      return;
    }
    if (event.target.id !== 'import-file') return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) return api.notify('Importdateien dürfen maximal 1 MB groß sein.');
    readFile(file).then(content => {
      let parsed = {};
      try {
        const json = JSON.parse(content);
        parsed = Array.isArray(json) ? json[0] || {} : json;
      } catch {
        parsed = parseListing(content.replace(/;/g, '\n'));
      }
      const lines = ['Marke: ' + (parsed.brand || parsed.Marke || ''), 'Modell: ' + (parsed.model || parsed.Modell || ''), 'Baujahr: ' + (parsed.year || parsed.Baujahr || ''), 'Kilometer: ' + (parsed.mileage || parsed.Kilometer || ''), 'Preis: ' + (parsed.price || parsed.Preis || '')].join('\n');
      const field = document.querySelector('#import-text');
      if (field) field.value = lines;
      api.notify('Datei wurde eingelesen. Prüfe die Angaben vor dem Hinzufügen.');
    }).catch(() => api.notify('Die Importdatei konnte nicht gelesen werden.'));
  }

  function bind() {
    document.addEventListener('click', event => {
      const nav = event.target.closest('[data-ops-go]');
      if (nav) { event.preventDefault(); screen(nav.dataset.opsGo); return; }
      const action = event.target.closest('[data-ops-action]');
      if (action) { event.preventDefault(); handleAction(action.dataset.opsAction, action); }
    });
    document.addEventListener('change', onFileChange);
    document.addEventListener('carsautohaus:operations-updated', () => {
      const active = document.querySelector('.view.active')?.id?.replace('-view', '');
      render(active);
    });
  }

  function start() {
    api = window.CarsAutoHaus;
    if (!api) return;
    inject();
    bind();
    renderDashboard();
  }

  if (window.CarsAutoHaus) start();
  else document.addEventListener('carsautohaus:ready', start, { once: true });
})();
