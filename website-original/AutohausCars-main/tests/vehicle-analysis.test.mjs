import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildVehicleExport, datasetSignature, exportCsv } from '../supabase/functions/_shared/vehicle-export.mjs';
import { validateAnalysis, MAX_BODY_BYTES } from '../supabase/functions/_shared/analysis-contract.mjs';
import { createHandler } from '../supabase/functions/analyze-vehicles/handler.mjs';
import { createAnalysisController, renderAnalysisResult } from '../vehicle-analysis.mjs';

const stamp = '2026-08-28T10:00:00.000Z';
function fixture() {
  return { vehicles: [
    { id: 'a', brand: 'Ford', model: 'Fiesta', askingPrice: 8900, purchasePrice: 0, desiredSalePrice: 10500, mileage: 49941, ps: 75, kw: 55, owners: 2, firstRegistration: '2021-01', fuel: 'Benzin', equipment: ['ABS', 'Klima'], accidentFree: false, status: 'Besichtigung geplant', description: 'Kleine Delle rechts', defects: 'Reifen erneuern', noteHistory: [{ text: 'HU-Bericht anfordern', createdAt: stamp }], customField: { a: false, b: [0, 'ÄÖÜ'] }, showroomId: 's', photo: 'storage://workspace/a/photo.jpg' },
    { id: 'sold', brand: 'VW', model: 'Polo', status: 'Verkauft', soldPrice: 10000 },
    { id: 'deleted', deletedAt: stamp, notes: 'Nicht exportieren' },
  ], tasks: [{ id: 't', vehicleId: 'a', title: 'Besichtigen' }, { id: 'private', title: 'Kein Fahrzeugbezug' }], operations: {
    candidates: [{ id: 'c', brand: 'Opel', model: 'Corsa', price: 5000, status: 'Neu' }],
    imports: [{ id: 'i', brand: 'Ford', model: 'Focus', price: 7000, status: 'Neu' }],
    cashbook: [{ id: 'cash', vehicleId: 'a', amount: 150, receiptData: 'data:application/pdf;base64,VEVTVA==' }],
    invoices: [{ id: 'bill', vehicleId: 'a', customer: 'Test', amount: 10500 }],
    documents: [{ id: 'doc', vehicleId: 'a', content: 'Vertragstext' }],
    showrooms: [{ id: 's', name: 'Halle A' }],
    generalNotes: [{ id: 'general', text: 'Vertrauliche Teamnotiz' }],
    chatMessages: [{ id: 'chat', text: 'Nicht übertragen' }],
    integrations: { secret: 'NEVER_EXPORT' }, mobile: { pairingCode: 'NEVER_EXPORT' },
  } };
}
const exportOf = state => buildVehicleExport(state, stamp);
function validAnalysis(dataset) {
  const entries = [...dataset.vehicles].sort((a, b) => (a.record.status === 'Verkauft') - (b.record.status === 'Verkauft'));
  return { summary: 'Ford und Opel zuerst anhand der dokumentierten Angaben prüfen.', limitations: ['Keine externen Marktpreise und keine technische Besichtigung.'], vehicles: entries.map((item, index) => ({
    vehicleKey: item.key, rank: index + 1, stars: item.record.status === 'Verkauft' ? 1 : 4,
    contactPriority: item.record.status === 'Verkauft' ? 'nicht_ankaufbar' : 'erst_klaeren', confidence: 'niedrig',
    factors: [{ label: 'Preis', impact: 'unklar', evidence: 'Angebot prüfen' }, { label: 'Zustand', impact: 'negativ', evidence: 'Reifen prüfen' }, { label: 'Historie', impact: 'unklar', evidence: 'HU-Bericht fehlt' }],
    rationale: 'Die erfassten Angaben erlauben nur eine vorläufige Priorisierung. Der Angebotspreis ist eine Anbieterforderung und kein belegter Marktwert. Reifen und HU sind anhand der Unterlagen zu prüfen. Fehlende Angaben zu Historie und Kosten reduzieren die Sicherheit der Einschätzung. Vor dem Erstkontakt sollten Verfügbarkeit, Reparaturbelege und die Abgrenzung zwischen dokumentierten Kosten und Schätzungen geklärt werden. Eine Besichtigung und ein technischer Zustandsbericht bleiben erforderlich; das Ranking ist keine Kaufempfehlung.',
    questions: ['Ist das Fahrzeug noch verfügbar?', 'Liegt der HU-Bericht vor?'],
  })) };
}
const envelope = dataset => ({ schemaVersion: 1, generatedAt: stamp, exportedAt: dataset.exportedAt, model: 'test-structured-model', vehicleCount: dataset.vehicles.length, analysis: validAnalysis(dataset) });

function backend(options = {}) {
  const state = options.state || fixture(); const calls = [];
  const variables = { SUPABASE_URL: 'https://test.supabase.invalid', SUPABASE_ANON_KEY: 'test-public-key', OPENAI_API_KEY: 'test-server-secret', OPENAI_MODEL: 'test-structured-model', ANALYSIS_ALLOWED_ORIGINS: 'https://cars.example', ...options.env };
  const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const handler = createHandler({ env: name => variables[name], now: () => stamp, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/auth/v1/user')) return response({ id: 'user-a' }, options.authStatus || 200);
    if (url.includes('/av_workspace_members')) return response(options.noMember ? [] : [{ workspace_id: 'workspace-a' }]);
    if (url.includes('/av_workspaces?')) return response(options.noWorkspace ? [] : [{ state }]);
    if (url.includes('/rpc/av_claim_vehicle_analysis')) return response(options.quota ?? true, options.quotaStatus || 200);
    if (url === 'https://api.openai.com/v1/responses') {
      if (options.throwProvider) throw new Error('secret provider detail test-server-secret');
      const analysis = options.analysis || validAnalysis(exportOf(state));
      return response(options.providerPayload || { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(analysis) }] }] }, options.providerStatus || 200);
    }
    throw new Error('Unexpected request ' + url);
  } });
  const request = (body = { dataset: exportOf(state), consent: true }, headers = {}, method = 'POST') => handler(new Request('https://test.supabase.invalid/functions/v1/analyze-vehicles', { method, headers: { origin: 'https://cars.example', Authorization: 'Bearer test-user-jwt', 'Content-Type': 'application/json', ...headers }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }));
  return { request, calls, state };
}

test('export includes every undeleted collection, raw fields, false/zero, full notes and associated records', () => {
  const state = fixture(); const data = exportOf(state);
  assert.equal(data.vehicles.length, 4);
  const ford = data.vehicles.find(item => item.key === 'vehicles:a');
  assert.deepEqual(ford.record, state.vehicles[0]);
  for (const key of ['tasks', 'cashbook', 'invoices', 'documents', 'showrooms']) assert.equal(ford.related[key].length, 1);
  const text = JSON.stringify(data);
  for (const forbidden of ['NEVER_EXPORT', 'Nicht übertragen', 'Vertrauliche Teamnotiz', 'Nicht exportieren', 'Kein Fahrzeugbezug']) assert.ok(!text.includes(forbidden));
  ford.record.customField.a = true;
  assert.equal(state.vehicles[0].customField.a, false);
});
test('export is independent of filters and includes sold/archived records', () => {
  const state = fixture(); state.search = 'nothing'; state.statusFilter = 'Neu'; state.vehicles[1].status = 'Archiviert';
  assert.equal(exportOf(state).vehicles.length, 4);
});
test('CSV contains prices and the union of all fields, escaped multiline content and formula protection', () => {
  const state = fixture(); state.vehicles[0].notes = '=HYPERLINK("bad")\nzweite Zeile';
  const csv = exportCsv(exportOf(state));
  for (const text of ['Feld.askingPrice', 'Feld.price', 'Feld.kw', 'Feld.customField', 'Feld.noteHistory', 'Verknuepft.cashbook', '8900', '49941', '"false"']) assert.ok(csv.includes(text), text);
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes('""bad""'));
});
test('JSON is lossless for nested fields and export rejects duplicate/missing IDs', () => {
  const state = fixture(); assert.deepEqual(JSON.parse(JSON.stringify(exportOf(state))).vehicles[0].record, state.vehicles[0]);
  state.vehicles.push(state.vehicles[0]); assert.throws(() => exportOf(state), /Doppelte/);
  assert.throws(() => exportOf({ vehicles: [{}] }), /ID/);
});
test('signature ignores export time and vehicle ordering, but not changed data', () => {
  const state = fixture(); const before = exportOf(state); state.vehicles.reverse();
  const after = buildVehicleExport(state, '2026-08-29T00:00:00Z');
  assert.equal(datasetSignature(before), datasetSignature(after));
  state.vehicles.find(v => v.id === 'a').askingPrice++;
  assert.notEqual(datasetSignature(before), datasetSignature(exportOf(state)));
});
test('schema validation requires complete, unique coverage and a detailed rationale', () => {
  const dataset = exportOf(fixture()); const good = validAnalysis(dataset);
  assert.equal(validateAnalysis(good, dataset).vehicles.length, 4);
  for (const mutate of [value => value.vehicles.pop(), value => value.vehicles[0].vehicleKey = 'foreign', value => value.vehicles[0].rank = 2, value => value.vehicles[0].stars = 6, value => value.vehicles[0].stars = 2.5, value => value.vehicles[0].rationale = 'Kurz', value => value.vehicles[0].extra = true, value => value.vehicles[0].factors = [], value => value.vehicles[0].stars = 1, value => value.vehicles[3].contactPriority = 'priorisiert_kontaktieren']) {
    const bad = structuredClone(good); mutate(bad); assert.throws(() => validateAnalysis(bad, dataset));
  }
});
test('authenticated member sends complete authoritative data and strict schema only server-side', async () => {
  const b = backend(); const res = await b.request(); const result = await res.json();
  assert.equal(res.status, 200); assert.equal(result.vehicleCount, 4);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const call = b.calls.find(item => item.url.includes('api.openai.com'));
  const sent = JSON.parse(call.init.body);
  assert.deepEqual(JSON.parse(sent.input), exportOf(b.state));
  assert.equal(sent.store, false); assert.equal(sent.text.format.strict, true);
  assert.equal(call.init.headers.Authorization, 'Bearer test-server-secret');
  assert.ok(!JSON.stringify(result).includes('test-server-secret'));
  assert.ok(!sent.input.includes('test-user-jwt'));
});
for (const [name, options, headers, status] of [
  ['missing bearer', {}, { Authorization: '' }, 401], ['invalid JWT', { authStatus: 401 }, {}, 401],
  ['anonymous auth without password membership', { noMember: true }, {}, 403], ['missing workspace', { noWorkspace: true }, {}, 403],
  ['unconfigured key', { env: { OPENAI_API_KEY: '' } }, {}, 503], ['unconfigured model', { env: { OPENAI_MODEL: '' } }, {}, 503],
  ['unapproved origin', {}, { origin: 'https://evil.invalid' }, 403], ['null origin', {}, { origin: 'null' }, 403],
  ['quota exceeded', { quota: false }, {}, 429], ['quota migration absent', { quotaStatus: 404 }, {}, 503],
]) test(name + ' never reaches OpenAI', async () => {
  const b = backend(options); const res = await b.request(undefined, headers);
  assert.equal(res.status, status); assert.ok(!b.calls.some(item => item.url.includes('api.openai.com')));
});
test('CORS preflight is explicit and does not authenticate or charge', async () => {
  const b = backend(); const res = await b.request(undefined, {}, 'OPTIONS');
  assert.equal(res.status, 204); assert.equal(res.headers.get('access-control-allow-origin'), 'https://cars.example'); assert.equal(b.calls.length, 0);
});
test('GET is rejected', async () => assert.equal((await backend().request(undefined, {}, 'GET')).status, 405));
test('new Supabase public-key environment works without a legacy anon key', async () => {
  const b = backend({ env: { SUPABASE_ANON_KEY: '', SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_test' }) } });
  assert.equal((await b.request()).status, 200);
  assert.equal(b.calls[0].init.headers.apikey, 'sb_publishable_test');
});
test('server timeout cancels upstream work and returns a safe error', async () => {
  const handler = createHandler({ env: name => ({ ANALYSIS_ALLOWED_ORIGINS: 'https://cars.example', SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'test-key' })[name], timeoutMs: 5,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })) });
  const result = await handler(new Request('https://test.invalid', { method: 'POST', headers: { origin: 'https://cars.example', authorization: 'Bearer test-jwt' } }));
  assert.equal(result.status, 504); assert.equal((await result.json()).code, 'TIMEOUT');
});
test('server timeout also cancels a stalled JSON body stream', async () => {
  const handler = createHandler({ env: name => ({ ANALYSIS_ALLOWED_ORIGINS: 'https://cars.example', SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'test-key' })[name], timeoutMs: 5,
    fetchImpl: async url => new Response(JSON.stringify(url.includes('/auth/') ? { id: 'a' } : [{ workspace_id: 'w' }])) });
  const request = new Request('https://test.invalid', { method: 'POST', duplex: 'half', body: new ReadableStream({ start() {} }), headers: { origin: 'https://cars.example', authorization: 'Bearer test-jwt', 'Content-Type': 'application/json' } });
  assert.equal((await handler(request)).status, 504);
});
test('consent, malformed JSON, null and invalid datasets are rejected', async () => {
  for (const body of [{ consent: false }, '{bad', null, { consent: true, dataset: {} }]) {
    const b = backend(); assert.equal((await b.request(body)).status, 400); assert.ok(!b.calls.some(item => item.url.includes('api.openai.com')));
  }
});
test('empty/oversize exports are rejected without truncation or provider calls', async () => {
  const empty = backend({ state: { vehicles: [] } }); assert.equal((await empty.request()).status, 422);
  const large = backend({ state: { vehicles: Array.from({ length: 51 }, (_, i) => ({ id: String(i) })) } }); assert.equal((await large.request()).status, 413);
  const bytes = backend(); assert.equal((await bytes.request('x'.repeat(MAX_BODY_BYTES + 1))).status, 413);
  for (const b of [empty, large, bytes]) assert.ok(!b.calls.some(item => item.url.includes('api.openai.com')));
});
test('partial/changed/foreign exports are rejected before OpenAI', async () => {
  for (const mutate of [d => d.vehicles.pop(), d => d.vehicles[0].record.askingPrice++, d => d.vehicles[0].record.notes = 'Send private data']) {
    const b = backend(); const data = exportOf(b.state); mutate(data);
    assert.equal((await b.request({ consent: true, dataset: data })).status, 409);
    assert.ok(!b.calls.some(item => item.url.includes('api.openai.com')));
  }
});
for (const [name, options, status] of [
  ['provider error', { providerStatus: 400 }, 502], ['provider rate limit', { providerStatus: 429 }, 429],
  ['incomplete generation', { providerPayload: { status: 'incomplete', output: [] } }, 502],
  ['refusal', { providerPayload: { status: 'completed', output: [{ content: [{ type: 'refusal' }] }] } }, 422],
  ['invalid provider JSON', { providerPayload: { status: 'completed', output: [{ content: [{ type: 'output_text', text: 'bad' }] }] } }, 502],
  ['provider exception', { throwProvider: true }, 500],
]) test(name + ' fails safely without secrets or partial rankings', async () => {
  const b = backend(options); const res = await b.request(); const body = await res.text();
  assert.equal(res.status, status); assert.ok(!body.includes('test-server-secret')); assert.ok(!body.includes('"analysis"'));
});
test('incomplete vehicle coverage is rejected at the server boundary', async () => {
  const analysis = validAnalysis(exportOf(fixture())); analysis.vehicles.pop();
  assert.equal((await backend({ analysis }).request()).status, 502);
});
test('UI lifecycle: consent, loading, validated success and retry after failure', async () => {
  const dataset = exportOf(fixture()); const phases = []; let calls = 0;
  const c = createAnalysisController({ onChange: state => phases.push(state.phase), transport: async () => { calls++; if (calls === 1) throw new Error('Server fehlt'); return envelope(dataset); } });
  c.reset(dataset); await c.run(false); assert.equal(calls, 0);
  await c.run(true); assert.equal(c.getState().phase, 'error'); assert.equal(c.getState().error, 'Server fehlt');
  await c.run(true); assert.equal(c.getState().phase, 'success'); assert.ok(phases.includes('loading'));
});
test('UI double-click, cancel and late responses cannot restore an obsolete ranking', async () => {
  const dataset = exportOf(fixture()); let resolve; let calls = 0;
  const c = createAnalysisController({ onChange() {}, transport: () => { calls++; return new Promise(done => resolve = done); } });
  c.reset(dataset); const pending = c.run(true); await c.run(true); assert.equal(calls, 1);
  c.cancel(); resolve(envelope(dataset)); await pending; assert.equal(c.getState().phase, 'ready'); assert.equal(c.getState().result, null);
});
test('changed data invalidates in-flight analysis; empty/oversize state never calls transport', async () => {
  const dataset = exportOf(fixture()); let resolve; let calls = 0;
  const c = createAnalysisController({ onChange() {}, transport: () => { calls++; return new Promise(done => resolve = done); } });
  c.reset(dataset); const pending = c.run(true); c.invalidate(); resolve(envelope(dataset)); await pending;
  assert.equal(c.getState().phase, 'stale'); await c.run(true); assert.equal(calls, 1);
  c.reset(exportOf({ vehicles: [] })); await c.run(true); assert.equal(calls, 1);
  c.reset(exportOf({ vehicles: Array.from({ length: 51 }, (_, i) => ({ id: String(i) })) })); await c.run(true); assert.equal(calls, 1); assert.equal(c.getState().phase, 'error');
  c.clear(); assert.equal(c.getState().dataset, null);
});
test('UI timeout prevents late success and explains the failure', async () => {
  const dataset = exportOf(fixture()); let resolve;
  const c = createAnalysisController({ onChange() {}, timeoutMs: 5, transport: () => new Promise(done => resolve = done) });
  c.reset(dataset); const pending = c.run(true); await new Promise(done => setTimeout(done, 15));
  assert.equal(c.getState().phase, 'error'); resolve(envelope(dataset)); await pending; assert.equal(c.getState().result, null);
});
test('UI independently rejects invalid response envelopes and missing vehicles', async () => {
  const dataset = exportOf(fixture()); const invalid = envelope(dataset); invalid.analysis.vehicles.pop();
  for (const result of [invalid, { ...envelope(dataset), exportedAt: 'wrong' }]) {
    const c = createAnalysisController({ onChange() {}, transport: async () => result }); c.reset(dataset); await c.run(true); assert.equal(c.getState().phase, 'error');
  }
});
test('rendering escapes vehicle and model-controlled text and shows full rationale', () => {
  const dataset = exportOf(fixture()); dataset.vehicles[0].record.brand = '<img src=x onerror=alert(1)>';
  const result = envelope(dataset); result.analysis.vehicles[0].rationale += '<script>alert(1)</script>';
  const html = renderAnalysisResult(result, dataset);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('Rang 1')); assert.ok(html.includes('von 5 Sternen')); assert.ok(html.includes('8.900'));
});
test('static integration: dedicated ranking navigation, unique DOM IDs, retained exports and no API cache', () => {
  const root = new URL('../', import.meta.url); const read = name => readFileSync(new URL(name, root), 'utf8');
  const html = read('index.html'); const app = read('app.js'); const ui = read('vehicle-analysis.mjs'); const sw = read('sw.js');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g), ...ui.matchAll(/\bid="([a-z][a-z0-9-]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['export-button', 'profile-export']) assert.ok(app.includes(`$('#${id}').addEventListener('click',exportCsv)`));
  for (const match of ui.matchAll(/find\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), match[1]);
  const labels = [...html.matchAll(/<button class="nav-button[^>]*>([\s\S]*?)<\/button>/g)].map(match => match[1].replace(/<span[^>]*>[\s\S]*?<\/span>/g, '').trim());
  assert.deepEqual(labels, ['Home', 'Autos', 'Autosuche', 'Vergleich', 'KI-Fahrzeugranking', 'Statistik', 'Profil']);
  assert.ok(html.includes('data-go="vehicle-ranking"'));
  assert.ok(ui.includes("view.id = 'vehicle-ranking-view'"));
  assert.ok(ui.includes('const openRanking = () =>'));
  assert.ok(ui.includes('return { open: exportSnapshot, openRanking,'));
  const directOpenStart = ui.indexOf('const openRanking = () =>');
  const directOpen = ui.slice(directOpenStart, ui.indexOf("find('vehicle-analysis-consent')", directOpenStart));
  assert.ok(directOpen.includes('prepareRanking();')); assert.ok(directOpen.includes("api.go('vehicle-ranking')")); assert.ok(!directOpen.includes('download('));
  const legacyExport = ui.slice(ui.indexOf('const exportSnapshot = () =>'), ui.indexOf('const openRanking = () =>'));
  assert.ok(legacyExport.includes("api.go('vehicle-ranking')")); assert.ok(legacyExport.includes("download(exportCsv(dataset), 'csv')"));
  assert.ok(html.includes('app.js?v=16')); assert.ok(html.includes('vehicle-analysis.css?v=16'));
  const rankingCss = read('vehicle-analysis.css');
  assert.ok(rankingCss.includes('.bottom-nav .nav-inner'));
  assert.ok(rankingCss.includes('width: min(900px, 100%)'));
  assert.ok(rankingCss.includes('font-size: .52rem'));
  assert.doesNotThrow(() => read('.nojekyll'));
  assert.ok(read('supabase/config.toml').includes('project_id = "carsautohaus"'));
  assert.ok(app.includes('Das ist ein Fahrzeugexport, kein Workspace-Backup'));
  assert.ok(sw.includes("method !== 'GET'")); assert.ok(sw.includes('url.origin !== self.location.origin')); assert.ok(sw.includes('!ASSETS.some'));
  const assetLiteral = sw.match(/const ASSETS = (\[[^;]+\]);/)[1];
  for (const path of JSON.parse(assetLiteral.replaceAll("'", '"'))) if (path !== './') assert.doesNotThrow(() => readFileSync(new URL(path.split('?')[0], root)));
  for (const name of readdirSync(root).filter(name => /\.(js|mjs|html)$/.test(name))) assert.ok(!/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/.test(read(name)), name);
});
