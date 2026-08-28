import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const component = readFileSync(join(root, 'src/components/club-buttons/ClubButtons.jsx'), 'utf8');
const styles = readFileSync(join(root, 'src/components/club-buttons/club-buttons.css'), 'utf8');

test('shared controls retain native button semantics and loading state', () => {
  assert.match(component, /Element === 'button'/);
  assert.match(component, /disabled: disabled \|\| loading/);
  assert.match(component, /aria-busy=/);
  assert.match(component, /aria-label=\{label\}/);
});

test('modal provides escape, focus trapping, and focus restoration', () => {
  assert.match(component, /event\.key === 'Escape'/);
  assert.match(component, /event\.key !== 'Tab'/);
  assert.match(component, /previous\?\.focus/);
  assert.match(component, /aria-modal="true"/);
});

test('material system uses production shells and honors reduced motion', () => {
  assert.match(styles, /action-primary-shell\.webp/);
  assert.match(styles, /club-utility-shell\.webp/);
  assert.match(styles, /club-nav-shell\.webp/);
  assert.match(styles, /wallet-row-shell\.webp/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /font-variant-numeric: tabular-nums/);
});

test('Commander adoption preserves route and expired-session safeguards', () => {
  const layout = readFileSync(join(root, 'src/components/commander/shared/CommanderLayout.jsx'), 'utf8');
  assert.match(layout, /href: '\/commander\/print-station'/);
  assert.match(layout, /commander:unauthorized/);
  assert.match(layout, /canRoleAccessRoute\(staffRole, item\.href\)/);
  assert.match(layout, /handlePinSubmit/);
});
