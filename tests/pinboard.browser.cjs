// Browser integration test with a local PostgreSQL database and mocked Supabase transport.
// Requires Playwright and Microsoft Edge: NODE_PATH=<node_modules> node tests/pinboard.browser.cjs
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { setup } = require('./pinboard.database.cjs');
let backend;
const streams = new Set();
const root = path.resolve(__dirname, '..');
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="340"><rect width="600" height="340" fill="#dce3dc"/><path d="M110 220v-45l70-18 45-60h140l60 65 64 19v39Z" fill="#798e81"/><path d="m239 109-35 47h180l-32-47Z" fill="#e5efee"/><circle cx="191" cy="216" r="31" fill="#334a40"/><circle cx="414" cy="216" r="31" fill="#334a40"/></svg>');
// SVG is a test fixture only. Real vehicle image URLs are HTTPS.
const vehicles = [
  { id: 'test-a', brand: 'Volkswagen', model: 'Golf', year: 2020, mileage: 48000, fuel: 'Benzin', gearbox: 'Automatik', askingPrice: 19900, purchasePrice: 17000, status: 'Inseriert', equipment: [], photo: 'https://test.invalid/car.png' },
  { id: 'test-b', brand: 'Audi', model: 'A3 Sportback', year: 2019, mileage: 62000, fuel: 'Diesel', gearbox: 'Automatik', askingPrice: 18400, purchasePrice: 16000, status: 'Inseriert', equipment: [] },
  { id: 'test-c', brand: 'BMW', model: '118i', year: 2021, mileage: 42000, askingPrice: 23500, status: 'Inseriert', equipment: [] }
];
const mockModule = `export function createClient(){
 const state=${JSON.stringify({ version: 1, vehicles, tasks: [] })};
 const user={id:'test-user',is_anonymous:true};
 return {auth:{getSession:async()=>({data:{session:{user}}}),onAuthStateChange(){}},
 from(table){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:{workspace_id:'test-workspace',display_name:'Test'}}),single:async()=>({data:{state}})}},
 channel(){return {on(event,filter,callback){this.filter=filter;this.callback=callback;return this},subscribe(){if(this.filter.table==='av_pinboards'){this.stream=new EventSource('/__events');this.stream.onmessage=e=>this.callback({new:JSON.parse(e.data)})}return this}}},removeChannel(channel){channel.stream?.close()},storage:{from(){return {createSignedUrl:async()=>({data:{signedUrl:'https://test.invalid/car.png'}})}}},
 rpc:async(name,params)=>name.includes('pinboard')?fetch('/__rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:window.__testUser||'a',name,params})}).then(r=>r.json()):({data:state})}; }
`;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/__events') {
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache'}); res.write(': ready\n\n'); streams.add(res); req.on('close', () => streams.delete(res)); return;
  }
  if (pathname === '/__rpc') {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const request = JSON.parse(Buffer.concat(chunks).toString());
      const data = await backend.rpc(request.user, request.name, request.params);
      res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({data}));
      if (request.name === 'av_patch_pinboard') for (const stream of streams) stream.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch(error) { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({error:{message:error.message,code:error.code}})); }
    return;
  }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain'); res.end(readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
async function drag(page, locator, dx, dy) {
  const r = await locator.boundingBox(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up();
}
(async () => {
  backend = await setup();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, hasTouch: true, serviceWorkers: 'block' });
    const routeRequest = route => {
      const url = route.request().url();
      if (url.startsWith('https://esm.sh/')) return route.fulfill({ contentType: 'text/javascript', body: mockModule });
      if (url.startsWith('https://test.invalid/')) return route.fulfill({ contentType: 'image/svg+xml', body: decodeURIComponent(image.split(',')[1]) });
      if (url.startsWith('http://127.0.0.1:')) return route.continue();
      return route.abort();
    };
    await context.route('**/*', routeRequest);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(url); await page.waitForFunction(() => !document.body.classList.contains('locked'));
    await page.locator('.nav-button[data-go="pinboard"]').click();
    await page.locator('#pinboard-view.active').waitFor();
    await page.waitForFunction(() => document.getElementById('pb-status').textContent === 'Für alle synchronisiert');
    assert.equal(await page.locator('.pb-card').count(), 0, 'initial board is empty');
    await page.screenshot({ path: path.resolve(root, '../pinboard-empty.png') });
    await page.locator('#pb-add-note').click();
    await page.locator('.pb-note-title').fill('Probefahrt planen');
    await page.locator('.pb-note-text').fill('Serviceheft prüfen\nProbefahrt am Freitag\nBudget: 20.000 €\n<script>alert("x")</script>');
    await drag(page, page.locator('.pb-handle'), 330, -100);
    const notePosition = await page.locator('.pb-card').evaluate(el => [el.style.left, el.style.top]);
    await page.locator('input[type=color]').evaluate(el => { el.value = '#e8eddf'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('input[type=color]').evaluate(el => el.offsetHeight), 18);
    assert.equal(await page.locator('.pb-card').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(232, 237, 223)');
    assert.equal(await page.locator('.pb-note-text').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    async function addCar(search) {
      await page.locator('#pb-add-car').click(); await page.locator('#pb-picker input').fill(search); await page.locator('.pb-result').first().click();
    }
    await addCar('Volkswagen'); await drag(page, page.locator('.pb-handle').last(), -340, -100);
    await addCar('Audi'); await drag(page, page.locator('.pb-handle').last(), 0, 110);
    assert.equal(await page.locator('.pb-card').count(), 3);
    // Click-to-connect, then duplicate prevention.
    await page.locator('.pb-port').nth(0).click(); await page.locator('.pb-port').nth(1).click();
    assert.equal(await page.locator('.pb-edge').count(), 1);
    await page.locator('.pb-port').nth(1).click(); await page.locator('.pb-port').nth(0).click();
    assert.equal(await page.locator('.pb-edge').count(), 1);
    // Drag a thread to a second car.
    const a = await page.locator('.pb-port').nth(1).boundingBox(), b = await page.locator('.pb-port').nth(2).boundingBox();
    await page.mouse.move(a.x + 12, a.y + 12); await page.mouse.down(); await page.mouse.move(b.x + 12, b.y + 12, { steps: 14 }); await page.mouse.up();
    assert.equal(await page.locator('.pb-edge').count(), 2);
    await page.locator('[data-pb-select]').nth(0).check(); await page.locator('[data-pb-select]').nth(1).check();
    await page.screenshot({ path: path.resolve(root, '../pinboard-preview.png') });
    await page.locator('#pb-compare').click();
    await page.locator('#compare-pro-view.active').waitFor();
    assert.equal(await page.locator('#compare-pro-left').inputValue(), 'test-a');
    assert.equal(await page.locator('#compare-pro-right').inputValue(), 'test-b');
    await page.locator('.nav-button[data-go="pinboard"]').click();
    await page.waitForFunction(() => document.getElementById('pb-status').textContent === 'Für alle synchronisiert');
    await page.reload(); await page.waitForFunction(() => !document.body.classList.contains('locked'));
    await page.locator('.nav-button[data-go="pinboard"]').click();
    assert.equal(await page.locator('.pb-card').count(), 3);
    assert.equal(await page.locator('.pb-edge').count(), 2);
    assert.equal(await page.locator('.pb-note-title').inputValue(), 'Probefahrt planen');
    assert.equal(await page.locator('.pb-note-text').inputValue(), 'Serviceheft prüfen\nProbefahrt am Freitag\nBudget: 20.000 €\n<script>alert("x")</script>');
    assert.deepEqual(await page.locator('.pb-card').first().evaluate(el => [el.style.left, el.style.top]), notePosition);
    // Removing a card cleans up its threads; undo restores both.
    await page.locator('[data-pb-delete]').nth(1).click();
    assert.equal(await page.locator('.pb-card').count(), 2); assert.equal(await page.locator('.pb-edge').count(), 0);
    await page.locator('#pb-undo').click(); assert.equal(await page.locator('.pb-edge').count(), 2);
    // Keyboard move and keyboard thread removal.
    await page.locator('.pb-handle').first().focus(); await page.keyboard.press('ArrowRight');
    await page.locator('.pb-edge').first().focus(); await page.keyboard.press('Delete'); assert.equal(await page.locator('.pb-edge').count(), 1);
    await page.locator('#pb-undo').click();
    // Export/import roundtrip without writing to a real workspace.
    const downloadPromise = page.waitForEvent('download'); await page.locator('#pb-export').click();
    const download = await downloadPromise, exported = readFileSync(await download.path());
    const parsed = JSON.parse(exported); assert.equal(parsed.cards.length, 3);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#pb-file').setInputFiles({ name: 'board.json', mimeType: 'application/json', buffer: exported });
    await page.waitForFunction(() => document.querySelectorAll('.pb-card').length === 3);
    // Calculator and two independent users using the real SQL migration locally.
    await page.locator('#pb-add-calculator').click();
    await page.locator('.pb-calc-expression').fill('(19900 + 850) × 1,19');
    await page.locator('.pb-calc-expression').press('Enter');
    assert.equal(await page.locator('.pb-calc-result').textContent(), '24.692,5');
    await page.locator('#pb-status').click();
    const otherContext = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' });
    await otherContext.addInitScript(() => { window.__testUser = 'b'; });
    await otherContext.route('**/*', routeRequest);
    const other = await otherContext.newPage(); other.on('pageerror', error => errors.push(error.message));
    await other.goto(url); await other.waitForFunction(() => !document.body.classList.contains('locked'));
    await other.locator('.nav-button[data-go="pinboard"]').click();
    await other.waitForFunction(() => document.querySelectorAll('.pb-card').length === 4);
    assert.equal(await other.locator('.pb-calc-result').textContent(), '24.692,5');
    await page.screenshot({ path: path.resolve(root, '../pinboard-v18-rechner.png') });
    await other.locator('.pb-calc-expression').fill('100 × 19%'); await other.locator('.pb-calc-expression').press('Enter');
    await other.locator('#pb-status').click();
    await page.waitForFunction(() => document.querySelector('.pb-calc-result').textContent === '19');
    await other.locator('.pb-note-title').fill('Notiz von Benutzer B'); await other.locator('#pb-status').click();
    await page.waitForFunction(() => document.querySelector('.pb-note-title').value === 'Notiz von Benutzer B');
    await other.locator('.pb-card').filter({ has: other.locator('.pb-calc-expression') }).locator('[data-pb-delete]').click();
    await page.waitForFunction(() => document.querySelectorAll('.pb-calc-expression').length === 0);
    await otherContext.close();
    // Small touch-screen layout and card dragging.
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#pb-fit').click();
    await page.locator('#pb-add-note').click(); await page.locator('.pb-note-title').last().fill('Mobile Notiz');
    await drag(page, page.locator('.pb-handle').last(), 24, 30);
    const mobileCard = page.locator('.pb-card').last();
    const beforeTouch = await mobileCard.evaluate(el => parseFloat(el.style.left));
    const handle = await page.locator('.pb-handle').last().boundingBox();
    const cdp = await context.newCDPSession(page);
    const touch = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touch.x + 25, y: touch.y + 15 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(await mobileCard.evaluate(el => parseFloat(el.style.left)) > beforeTouch, 'touch dragging moves a card');
    assert.equal(await page.locator('#pb-add-note').isVisible(), true);
    assert.equal(await page.locator('#pb-compare').isVisible(), true);
    await page.screenshot({ path: path.resolve(root, '../pinboard-mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#pb-add-car').click(); await page.locator('#pb-picker input').fill('BMW');
    assert.equal(await page.locator('.pb-result').count(), 1); await page.locator('[data-pb-close]').click();
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('PASS: previous pinboard features, calculator, two separate users share edits/results/deletions through SQL, mobile/touch, no JS errors.');
    await context.close();
  } finally { await browser.close(); for(const stream of streams)stream.end(); server.close(); await backend.db.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
