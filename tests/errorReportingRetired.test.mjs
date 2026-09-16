import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
test('published shared source cannot load or call the retired monitoring provider', () => {
  const offending = walk(root).filter(file => /@sentry(?:\/|-)|\bSENTRY_[A-Z_]+|NEXT_PUBLIC_SENTRY|sentry\.io|\bSentry\.|sentryWrap|withSentryRoute/i.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offending, []);
});
