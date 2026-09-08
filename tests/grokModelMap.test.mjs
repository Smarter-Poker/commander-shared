/**
 * THE MODEL MAP SENDS NAMES THAT EXIST
 *
 * Measured against api.x.ai on 2026-09-08: grok-beta, grok-2-latest,
 * grok-2-vision(-latest|-1212) and grok-vision-beta answer "Model not found".
 * Two World Hub routes posted one of those raw and failed every call; four
 * more only worked because this map turned every unknown name into grok-3,
 * which also turned grok-3-mini into grok-3 for anyone who asked for it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapModelToGrok } from '../src/lib/grokModels.js';

const DEAD = ['grok-beta', 'grok-2-latest', 'grok-2-vision', 'grok-2-vision-latest', 'grok-2-vision-1212', 'grok-vision-beta'];
const LIVE = ['grok-3', 'grok-3-mini', 'grok-3-latest', 'grok-4', 'grok-4-fast', 'grok-imagine-image'];

test('a retired Grok name degrades to one that exists', () => {
    for (const d of DEAD) assert.ok(!DEAD.includes(mapModelToGrok(d)), `${d} -> ${mapModelToGrok(d)}`);
    assert.equal(mapModelToGrok('grok-2-vision-latest'), 'grok-3');
    assert.equal(mapModelToGrok('grok-2-image'), 'grok-imagine-image');
});

test('a real Grok name passes through unchanged', () => {
    for (const l of LIVE) assert.equal(mapModelToGrok(l), l);
});

test('an OpenAI-era alias is translated, and nothing else becomes a dead name', () => {
    assert.equal(mapModelToGrok('gpt-4o'), 'grok-3');
    assert.equal(mapModelToGrok('gpt-4o-mini'), 'grok-3-mini');
    assert.equal(mapModelToGrok('gpt-4-vision-preview'), 'grok-3', 'grok-vision-beta does not exist');
    assert.equal(mapModelToGrok('dall-e-3'), 'grok-imagine-image');
    assert.equal(mapModelToGrok('something-nobody-has'), 'grok-3');
    assert.equal(mapModelToGrok(undefined), 'grok-3');
});
