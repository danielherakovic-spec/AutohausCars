const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculate } = require('../pinboard-calculator.js');
const { diff, apply, create, empty } = require('../pinboard-sync.js');
test('calculator: precedence, decimal comma, negatives, parentheses and percentages', () => {
  assert.equal(calculate('19900 + 850 - 300'), 20450);
  assert.equal(calculate('100 × 19%'), 19);
  assert.equal(calculate('(100 + 20) ÷ 3'), 40);
  assert.equal(calculate('-2,5*4'), -10);
  assert.equal(calculate('0,1 + 0,2'), .3);
  for (const input of ['1/0', 'alert(1)', '1+','(2+3','2**3']) assert.throws(() => calculate(input));
});
test('independent fields merge; stale edits do not resurrect deletions', () => {
  const base = { ...empty(), cards: [{ id: 'a', type: 'note', text: '', x: 0 }] };
  const a = { ...empty(), cards: [{ ...base.cards[0], text: 'Hallo' }] };
  const b = { ...empty(), cards: [{ ...base.cards[0], x: 20 }] };
  const merged = apply(a, diff(base, b)); assert.equal(merged.cards[0].text, 'Hallo'); assert.equal(merged.cards[0].x, 20);
  assert.deepEqual(apply(empty(), diff(base, a)), empty());
});
test('offline change stays queued and retries with the same request ID', async () => {
  let remote = { revision: 0, state: empty() }, offline = true, cached, message, calls = [];
  const sync = create({ read: async () => remote, write: async (patch, id) => { calls.push(id); if (offline) throw new Error('offline'); remote = { revision: remote.revision + 1, state: apply(remote.state, patch) }; return remote; },
    subscribe: () => () => {}, onChange() {}, onStatus: value => message = value, persist: value => cached = structuredClone(value) });
  try {
    await sync.start();
    sync.submit(empty(), { ...empty(), cards: [{ id: 'a', type: 'note', text: 'Offline' }] });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cached.pending.length, 1); assert.match(message, /Nicht synchronisiert/);
    offline = false; await sync.refresh();
    assert.equal(cached.pending.length, 0); assert.equal(remote.state.cards[0].text, 'Offline'); assert.equal(calls[0], calls[1]);
  } finally { sync.close(); }
});
