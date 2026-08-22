#!/usr/bin/env node
/**
 * commander-shared had no CI at all. `npm test` is
 * `echo 'no tests yet' && exit 0`, so requiring it as a merge gate would have
 * been theatre: a check that cannot go red gates nothing.
 *
 * This is a real gate, and it guards the failure classes this package has
 * actually produced downstream. All of them are silent here and only surface
 * in a consumer, which is exactly why nothing caught them:
 *
 *   A. CommonJS inside a `"type": "module"` package. `module.exports = {...}`
 *      exports NOTHING under ESM semantics; a named import lands `undefined`
 *      and the crash happens far from the cause. This is not hypothetical —
 *      smarter-poker-commander carries a whole vendor-drift guard because of
 *      it, its src/lib/parseBlindStructure.js is an interop shim written to
 *      survive it, and pages/api/tournaments/[id]/clock.js inlines its own
 *      copy of the function to avoid it. See ALLOWED_CJS below.
 *
 *   B. A relative import that resolves to nothing. Renames inside this package
 *      are invisible here because no code in this repo runs; the consumer's
 *      build is where it explodes. Resolution below is BUNDLER-shaped
 *      (extensionless and directory-index imports are fine) because every
 *      consumer is a Next.js app — this checks the file exists, not the
 *      spelling of the specifier.
 *
 *   C. A subpath in package.json `exports` that points at nothing. The package
 *      publishes clean and the import fails at the other end.
 *
 * Zero dependencies on purpose. This package has no lockfile and no
 * devDependencies; a gate that needs `npm ci` is a gate that fails the day the
 * registry hiccups, and a gate that fails for unrelated reasons is one people
 * learn to ignore.
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = process.cwd();
const failures = [];
const fail = (file, msg) => failures.push(`${file}: ${msg}`);

/**
 * PRE-EXISTING CommonJS, frozen as of 2026-08-22. This list may only SHRINK.
 *
 * These three predate the gate. Converting them changes what every consumer
 * receives at runtime — World Hub re-exports one with `export *`, Commander
 * wraps another in an interop shim — so they need their own change with those
 * consumers tested, not a drive-by fix inside a CI patch. The point of the
 * allowlist is that the number cannot GROW while that work is pending.
 */
const ALLOWED_CJS = new Set([
  'src/lib/parseBlindStructure.js',
  'src/lib/home-games/rpcBridge.js',
  'src/components/commander/shared/CommanderErrorBoundary.jsx',
]);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '_to_delete') continue;
      walk(p, out);
    } else if (/\.(js|jsx|mjs|ts|tsx)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const files = existsSync(join(root, 'src')) ? walk(join(root, 'src')) : [];
if (files.length === 0) {
  console.error('FAIL: no source files under src/ — this gate would pass vacuously');
  process.exit(1);
}

/* Matched on the STATEMENT, so a mention inside a comment or a string cannot
   trip it — a guard that fires on its own documentation gets disabled. */
const CJS = [
  [/^\s*module\.exports\s*=/m, 'module.exports — this package is "type": "module", so it exports NOTHING'],
  [/^\s*exports\.[A-Za-z_$][\w$]*\s*=/m, 'exports.<name> = — CommonJS export in an ESM package'],
  [/(?:^|[^.\w])require\s*\(\s*['"]/m, "require('...') — use import in an ESM package"],
];

const SPEC = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
const EXT = ['', '.js', '.jsx', '.mjs', '.ts', '.tsx'];
const resolves = (base) =>
  EXT.some((e) => existsSync(base + e) && statSync(base + e).isFile()) ||
  EXT.slice(1).some((e) => existsSync(join(base, 'index' + e)));

const cjsSeen = new Set();

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(root, file);

  for (const [re, why] of CJS) {
    if (!re.test(src)) continue;
    cjsSeen.add(rel);
    if (!ALLOWED_CJS.has(rel)) {
      fail(rel, `${why}. New CommonJS is not accepted here — see ALLOWED_CJS in this script.`);
    }
  }

  for (const m of src.matchAll(SPEC)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue; // bare specifiers are peer dependencies
    if (!resolves(resolve(dirname(file), spec))) {
      fail(rel, `import '${spec}' resolves to no file — a rename here breaks the consumer's build, not this repo`);
    }
  }
}

/* The allowlist may only shrink. If an entry is fixed, this makes the very
   next run tell you to delete the line, so the list can never drift into a
   list of files that no longer have the problem. */
for (const stale of ALLOWED_CJS) {
  if (!cjsSeen.has(stale)) {
    fail('scripts/ci/package-integrity.mjs', `ALLOWED_CJS lists ${stale}, which is now clean — remove the line`);
  }
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const checkTarget = (label, value) => {
  const target = resolve(root, value.replace(/\/\*$/, ''));
  if (!existsSync(target)) fail('package.json', `${label} -> ${value} does not exist`);
};
if (pkg.main) checkTarget('main', pkg.main);
for (const [sub, value] of Object.entries(pkg.exports ?? {})) {
  if (typeof value === 'string') checkTarget(`exports["${sub}"]`, value);
}

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} problem(s) that break a CONSUMER, not this repo:\n`);
  for (const f of failures) console.error('  ' + f);
  console.error('');
  process.exit(1);
}

console.log(
  `OK — ${files.length} source files checked: no new CommonJS under ESM ` +
    `(${ALLOWED_CJS.size} pre-existing, frozen), every relative import resolves, ` +
    `every published subpath exists.`
);
