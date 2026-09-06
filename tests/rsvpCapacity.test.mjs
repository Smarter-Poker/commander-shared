import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rsvpGuestCount,
  rsvpSeatCount,
} from '../src/components/commander/home-games/rsvpCapacity.mjs';

test('guest counts prefer the canonical DTO and retain the legacy alias', () => {
  assert.equal(rsvpGuestCount({ bringing_guests: 2, guest_count: 7 }), 2);
  assert.equal(rsvpGuestCount({ guest_count: '3' }), 3);
  assert.equal(rsvpGuestCount({ bringing_guests: 0, guest_count: 4 }), 0);
});

test('guest counts fail closed for invalid values and normalize seat units', () => {
  assert.equal(rsvpGuestCount(), 0);
  assert.equal(rsvpGuestCount({ bringing_guests: -2 }), 0);
  assert.equal(rsvpGuestCount({ bringing_guests: 2.9 }), 2);
  assert.equal(rsvpGuestCount({ bringing_guests: 'not-a-number' }), 0);
  assert.equal(rsvpGuestCount({ bringing_guests: Number.POSITIVE_INFINITY }), 0);
});

test('seat totals include each player and every normalized guest', () => {
  assert.equal(rsvpSeatCount([
    { bringing_guests: 2 },
    { guest_count: 1 },
    { bringing_guests: 0 },
  ]), 6);
  assert.equal(rsvpSeatCount([]), 0);
  assert.equal(rsvpSeatCount(null), 0);
});
