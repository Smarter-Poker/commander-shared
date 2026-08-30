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

test('Commander global header uses the approved row with wired controls and live avatar', () => {
  const layout = readFileSync(join(root, 'src/components/commander/shared/CommanderLayout.jsx'), 'utf8');
  assert.match(layout, /global-header-desktop\.png/);
  assert.match(layout, /aspect-ratio: 1648 \/ 168/);
  assert.match(layout, /cmd-approved-header__avatar-slot/);
  assert.match(layout, /cmd-approved-header__avatar/);
  assert.match(layout, /src=\{profileAvatar\}/);
  assert.match(layout, /contain: layout paint/);
  assert.match(layout, /width: 58%/);
  assert.match(layout, /aspect-ratio: \.78/);
  assert.match(layout, /profile-updated/);
  assert.match(layout, /smarter_poker_avatar_sync/);

  for (const label of [
    'Open Menu',
    'Go back',
    'Go to the Hub',
    'My Profile',
    'Diamond Wallet',
    'VIP',
    'Messages',
    'Notifications',
  ]) {
    assert.match(layout, new RegExp(`aria-label="${label}"`));
  }
  assert.ok((layout.match(/cmd-approved-header__button[^\n]*onClick/g) || []).length >= 8);
});
