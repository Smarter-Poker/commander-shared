import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const retiredProvider = ['sen', 'try'].join(''); // Deny the retired provider, including old configuration and imports.
const root = fileURLToPath(new URL('../src/', import.meta.url));
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
test('published shared source cannot load or call the retired monitoring provider', () => {
  const offending = walk(root).filter(file => new RegExp(String.raw`@${retiredProvider}(?:\/|-)|\b${retiredProvider}_[A-Z_]+|NEXT_PUBLIC_${retiredProvider}|${retiredProvider}\.io|\b${retiredProvider}\.|${retiredProvider}Wrap|with${retiredProvider}Route`, 'i').test(readFileSync(file, 'utf8')));
  assert.deepEqual(offending, []);
});
