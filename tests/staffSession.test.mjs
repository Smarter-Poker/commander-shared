/**
 * Client staff-session lifecycle (src/lib/commander/staffSession.js).
 * node:test, no dependencies - `npm test` runs it. Mirrors the consumer-side
 * suite in smarter-poker-commander/tests/unit/clientStaffSession.test.js so the
 * canonical copy of this module can never silently regress behind the vendored
 * one (the drift that let the 2026-09-03 login outage ship).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
let calls; let response; let events;
beforeEach(() => {
  globalThis.localStorage = fakeStorage();
  globalThis.sessionStorage = fakeStorage();
  globalThis.window = globalThis;
  globalThis.location = { origin: 'https://commander.smarter.poker', href: '', pathname: '/commander/dashboard' };
  globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
  events = []; globalThis.dispatchEvent = (e) => events.push(e);
  calls = [];
  response = () => ({ ok: true, status: 200, json: async () => ({ subscription: { venue_id: 77, venue: { name: 'Test Room' } }, staff_session: { user_id: 'u1', venue_id: 77, role: 'owner', session_ts: Date.now(), sig: 'server-sig' } }) });
  globalThis.fetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body), auth: opts.headers.Authorization }); return response(); };
});
const load = () => import(`../src/lib/commander/staffSession.js?t=${Date.now()}${Math.random()}`);
const hub = () => localStorage.setItem('smarter-poker-auth', JSON.stringify({ access_token: 'tok', user: { id: 'u1', email: 'a@b.c' } }));

test('unsigned / near-TTL sessions are unhealthy, signed fresh ones healthy, PIN sessions untouched', async () => {
  const m = await load();
  assert.equal(m.isStaffSessionHealthy(), false);
  localStorage.setItem('commander_staff', JSON.stringify({ user_id: 'u1', venue_id: 77, role: 'owner' }));
  assert.equal(m.isStaffSessionHealthy(), false);
  localStorage.setItem('commander_staff', JSON.stringify({ user_id: 'u1', venue_id: 77, role: 'owner', sig: 'x', session_ts: Date.now() - 6.6 * 86400e3 }));
  assert.equal(m.isStaffSessionHealthy(), false);
  localStorage.setItem('commander_staff', JSON.stringify({ user_id: 'u1', venue_id: 77, role: 'owner', sig: 'x', session_ts: Date.now() }));
  assert.equal(m.isStaffSessionHealthy(), true);
  localStorage.setItem('commander_staff', JSON.stringify({ id: 'row', venue_id: 77, role: 'floor', sig: 'x', session_ts: 1 }));
  assert.equal(m.isStaffSessionHealthy(), true);
});

test('refreshStaffSession re-mints once for concurrent callers and stores the server-signed session', async () => {
  const m = await load(); hub();
  localStorage.setItem('commander_staff', JSON.stringify({ user_id: 'u1', venue_id: 77, role: 'owner' }));
  const r = await Promise.all([m.refreshStaffSession(), m.refreshStaffSession(), m.refreshStaffSession()]);
  assert.deepEqual(r, [true, true, true]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/commander/check-subscription');
  assert.equal(calls[0].auth, 'Bearer tok');
  assert.equal(JSON.parse(localStorage.getItem('commander_staff')).sig, 'server-sig');
  assert.equal(events.length, 1);
  assert.equal(await m.refreshStaffSession(), false, 'cooldown');
  assert.equal(await m.refreshStaffSession({ force: true }), true);
});

test('refresh honours the venue the client is on, and never touches PIN sessions', async () => {
  const m = await load(); hub();
  localStorage.setItem('commander_staff', JSON.stringify({ user_id: 'u1', venue_id: 99, role: 'owner', sig: 'bad', session_ts: Date.now() }));
  await m.refreshStaffSession();
  assert.equal(calls[0].body.preferred_venue_id, 99);
  localStorage.setItem('commander_staff', JSON.stringify({ id: 'row', venue_id: 77, role: 'floor', sig: 'x', session_ts: 1 }));
  assert.equal(await m.refreshStaffSession({ force: true }), false);
  assert.equal(calls.length, 1);
});

test('completeCommanderLogin stores and navigates; surfaces server errors; refuses without a token', async () => {
  const m = await load();
  assert.equal(await m.completeCommanderLogin({ id: 'u1', email: 'a@b.c' }, 'tok'), true);
  assert.equal(location.href, '/commander/dashboard');
  assert.equal(JSON.parse(localStorage.getItem('commander_staff')).sig, 'server-sig');
  response = () => ({ ok: false, status: 404, json: async () => ({}) });
  const r = await m.completeCommanderLogin({ id: 'u1' }, 'tok');
  assert.equal(r.ok, false); assert.match(r.error, /No Active Club Commander Subscription/);
  const r2 = await m.completeCommanderLogin({ id: 'u1' }, '');
  assert.equal(r2.ok, false);
});

test('a registered access-token provider beats the cached token; failures fall back', async () => {
  const m = await load(); hub();
  localStorage.setItem('commander_staff', JSON.stringify({ user_id: 'u1', venue_id: 77, role: 'owner' }));
  m.setAccessTokenProvider(async () => 'fresh-tok');
  assert.equal(await m.currentAccessToken(), 'fresh-tok');
  assert.equal(await m.refreshStaffSession({ force: true }), true);
  assert.equal(calls[0].auth, 'Bearer fresh-tok');
  m.setAccessTokenProvider(async () => { throw new Error('sdk not ready'); });
  assert.equal(await m.currentAccessToken(), 'tok');
  m.setAccessTokenProvider(null);
  assert.equal(await m.currentAccessToken(), 'tok');
});
