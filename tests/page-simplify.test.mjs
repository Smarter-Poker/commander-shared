// Dan, 2026-10-17: "PAGES DON'T NEED TITLES LIKE THIS... REMOVE ALL
// DESCRIPTIONS THAT EXIST LIKE THIS ON ANY AND ALL PAGES. ADD A ? MARK ICON
// INSTEAD IN THE UPPER RIGHT CORNER OF THE PAGES". The shared components that
// printed a page-style title plus a describing sentence must not print them
// again; the explanation lives behind the consuming page's "?".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('ArenaLedger prints no page title or description and pins the page help', () => {
  const src = read('src/components/commander/admin/ArenaLedger.jsx');
  assert.doesNotMatch(src, /LIVE ARENA LEDGER/);
  assert.doesNotMatch(src, /Immutable absolute accounting record/i);
  assert.match(src, /export default function ArenaLedger\(\{ clubId, help = null \}\)/);
  assert.match(src, /\{help \? <div className="flex-none">\{help\}<\/div> : null\}/);
  assert.doesNotMatch(src, /—/, 'no em dashes');
});

test('ExportManager keeps its section heading but drops the describing sentence', () => {
  const src = read('src/components/commander/admin/ExportManager.jsx');
  assert.match(src, />Data Exports<\/h2>/);
  assert.doesNotMatch(src, /Export Your Data For Analysis Or Reporting/);
});
