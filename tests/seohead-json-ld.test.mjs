/**
 * An array of schemas becomes a @graph, not an object with numeric keys.
 * The World Hub homepage shipped {"0":{...},"1":{...}} for months because the
 * old code spread an array into an object. Fixed in the World Hub's vendored
 * copy on 2026-09-16; this is the same fix upstream, pinned.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'src/components/seo/SEOHead.js'), 'utf8');

test('toJsonLdDocument wraps an array in a @graph and leaves an object alone', () => {
  const start = src.indexOf('export function toJsonLdDocument');
  const end = src.indexOf('\n}\n', start) + 3;
  const fn = new Function(`${src.slice(start, end).replace('export function', 'function')}; return toJsonLdDocument;`)();
  assert.deepEqual(fn([{ '@type': 'Organization' }, { '@type': 'WebSite' }]), {
    '@context': 'https://schema.org',
    '@graph': [{ '@type': 'Organization' }, { '@type': 'WebSite' }],
  });
  assert.deepEqual(fn({ '@type': 'WebSite' }), { '@context': 'https://schema.org', '@type': 'WebSite' });
});

test('SEOHead renders through toJsonLdDocument and the spread is gone', () => {
  assert.match(src, /toJsonLdDocument\(jsonLd\)/);
  assert.ok(!/'@context': 'https:\/\/schema\.org',\s*\.\.\.jsonLd,/.test(src));
});
