const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { diff, empty } = require('../pinboard-sync.js');
const USERS = { a: '00000000-0000-0000-0000-000000000001', b: '00000000-0000-0000-0000-000000000002', other: '00000000-0000-0000-0000-000000000003', outsider: '00000000-0000-0000-0000-000000000004' };
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create table public.av_workspaces(id uuid primary key);
    create table public.av_workspace_members(workspace_id uuid references public.av_workspaces(id),user_id uuid unique);
    insert into public.av_workspaces values('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
    insert into public.av_workspace_members values('10000000-0000-0000-0000-000000000001','${USERS.a}'),('10000000-0000-0000-0000-000000000001','${USERS.b}'),('10000000-0000-0000-0000-000000000002','${USERS.other}');
    alter table public.av_workspace_members enable row level security;
    create policy membership on public.av_workspace_members for select to authenticated using(user_id=auth.uid());
    grant select on public.av_workspace_members to authenticated;`);
  const sql = readFileSync(path.join(__dirname, '../supabase/pinboard-migration.sql'), 'utf8');
  await db.exec(sql); await db.exec(sql); // safe to run the migration twice
  async function query(user, sql, params = [], role = 'authenticated') {
    return db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [USERS[user] || '']);
      return tx.query(sql, params);
    });
  }
  async function rpc(user, name, params = {}) {
    const result = name === 'av_read_pinboard'
      ? await query(user, 'select public.av_read_pinboard() as data')
      : await query(user, 'select public.av_patch_pinboard($1::jsonb,$2::uuid) as data', [JSON.stringify(params.p_patch), params.p_request_id]);
    return result.rows[0].data;
  }
  return { db, query, rpc };
}
async function test() {
  const backend = await setup();
  const { rpc, query, db } = backend;
  const write = (user, before, after, id = crypto.randomUUID()) => rpc(user, 'av_patch_pinboard', { p_patch: diff(before, after), p_request_id: id });
  try {
    assert.deepEqual((await rpc('a', 'av_read_pinboard')).state, empty());
    const card = { id: 'note-1', type: 'note', title: 'Gemeinsam', text: '', x: 20, y: 30, color: '#ffffff' };
    const initial = { ...empty(), cards: [card] }; const request = crypto.randomUUID();
    await write('a', empty(), initial, request);
    assert.deepEqual((await rpc('b', 'av_read_pinboard')).state, initial);
    await write('a', initial, { ...initial, cards: [{ ...card, text: 'Text von A' }] });
    await write('b', initial, { ...initial, cards: [{ ...card, color: '#112233' }] });
    const merged = (await rpc('b', 'av_read_pinboard')).state;
    assert.equal(merged.cards[0].text, 'Text von A'); assert.equal(merged.cards[0].color, '#112233');
    const duplicate = await write('a', empty(), initial, request);
    assert.equal(duplicate.state.cards[0].text, 'Text von A'); assert.equal(duplicate.revision, 3);
    await write('b', merged, empty());
    await write('a', initial, { ...initial, cards: [{ ...card, x: 999 }] });
    assert.equal((await rpc('a', 'av_read_pinboard')).state.cards.length, 0, 'stale update cannot resurrect deleted card');
    assert.deepEqual((await rpc('other', 'av_read_pinboard')).state, empty());
    assert.equal((await query('other', 'select * from public.av_pinboards')).rows.length, 0, 'RLS hides other workspace');
    await assert.rejects(query('a', 'update public.av_pinboards set revision=100'), /permission denied/);
    await assert.rejects(rpc('outsider', 'av_read_pinboard'), /anmelden/);
    await assert.rejects(query(null, 'select public.av_read_pinboard()', [], 'anon'), /permission denied/);
    await assert.rejects(rpc('outsider', 'av_patch_pinboard', { p_patch: diff(empty(), initial), p_request_id: crypto.randomUUID() }), /anmelden/);
    const linked = { ...empty(), cards: [card, { ...card, id: 'calc', type: 'calculator', expression: '100*19%', result: '19' }], edges: [{ id: 'e', from: 'note-1', to: 'calc' }] };
    await write('a', empty(), linked);
    await write('a', linked, { ...linked, cards: [linked.cards[1]] });
    assert.equal((await rpc('b', 'av_read_pinboard')).state.edges.length, 0, 'deleting card removes edges');
    console.log('PASS: SQL migration, repeat migration, shared access, field merge, idempotent retry, no resurrection, RLS, denied nonmembers/anon/direct writes, calculator, edge cleanup.');
  } finally { await db.close(); }
}
module.exports = { setup };
if (require.main === module) test().catch(error => { console.error(error); process.exitCode = 1; });
