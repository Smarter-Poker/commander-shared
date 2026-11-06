import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, chmodSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { inputFingerprint, reusableEvidence, readProviderEvidence, operationTransition, updateOperation,
  failureDisposition, summarizeMetrics, executionInventory, previewExecution } from '../src/lib/agentExecution.mjs';
const temporary = fn => { const p = mkdtempSync(join(tmpdir(), 'execution-')); try { fn(p); } finally { rmSync(p, { recursive: true }); } };
const spec = { inputs: ['fixture'], command: ['node', 'test.mjs'], runtime: 'node22', environment: 'isolated-pg17', schema: 'v1' };
test('reuse fingerprint binds nested dependencies, fixture additions, permissions and configuration', () => temporary(root => {
  mkdirSync(join(root, 'fixture'));
  writeFileSync(join(root, 'fixture/input.sql'), 'select 1;');
  const before = inputFingerprint(root, spec);
  chmodSync(join(root, 'fixture/input.sql'), 0o755);
  assert.notEqual(inputFingerprint(root, spec), before);
  chmodSync(join(root, 'fixture/input.sql'), 0o644);
  symlinkSync(join(root, 'fixture'), join(root, 'alias'));
  assert.throws(() => inputFingerprint(root, { ...spec, inputs: ['alias/input.sql'] }));
  for (const key of ['runtime', 'environment', 'schema'])
    assert.notEqual(inputFingerprint(root, { ...spec, [key]: 'changed' }), before);
  assert.notEqual(inputFingerprint(root, { ...spec, command: ['node', 'other.mjs'] }), before);
  writeFileSync(join(root, 'fixture/guard.sql'), 'raise exception;');
  assert.notEqual(inputFingerprint(root, spec), before);
  assert.throws(() => inputFingerprint(root, { ...spec, inputs: ['../outside'] }));
  assert.throws(() => inputFingerprint(root, { ...spec, inputs: ['missing'] }));
}));
test('failed cancelled unknown and untrusted evidence cannot suppress a check', () => {
  const expected = { fingerprint: 'f', check: 'accounting', authority: 'github', environment: 'pg17', repository: 'r', workflow: 'ci', check: 'accounting' };
  const receipt = { version: 1, ...expected, status: 'passed', exitCode: 0, runId: 1, head: 'sha', attempt: 1,
    startedAt: '2026-11-06T04:00:00Z', finishedAt: '2026-11-06T04:01:00Z' };
  const observation = { conclusion: 'success', runId: 1, head: 'sha', attempt: 1, repository: 'r', workflow: 'ci', check: 'accounting' };
  assert.equal(reusableEvidence(receipt, expected, observation).reusable, true);
  for (const status of ['failed', 'cancelled', 'unknown', 'pending'])
    assert.equal(reusableEvidence({ ...receipt, status }, expected, observation).reusable, false);
  assert.equal(reusableEvidence(receipt, expected).reusable, false);
  assert.equal(reusableEvidence(receipt, { ...expected, fingerprint: 'changed' }, observation).reusable, false);
  assert.equal(reusableEvidence(receipt, expected, { ...observation, attempt: 2 }).reusable, false);
});
test('operation owner and sequence prevent duplicate start and unknown retry', () => temporary(root => {
  const event = { owner: 'chat-a', id: 'client/sha', action: 'claim' };
  let op = updateOperation(root, event);
  assert.throws(() => updateOperation(root, { ...event, owner: 'chat-b', sequence: 0, action: 'start' }));
  op = updateOperation(root, { ...event, sequence: 0, action: 'start' });
  assert.throws(() => updateOperation(root, { ...event, sequence: 0, action: 'start' }));
  op = updateOperation(root, { ...event, sequence: 1, action: 'interrupted' });
  assert.throws(() => operationTransition(op, { ...event, sequence: 2, action: 'retry' }));
  assert.throws(() => operationTransition(op, { ...event, sequence: 2, action: 'observed_success' }));
  op = updateOperation(root, { ...event, sequence: 2, action: 'observed_success', source: 'provider/run/1' });
  assert.equal(op.status, 'succeeded');
  assert.equal(JSON.parse(readFileSync(join(root, 'operation.json'))).status, 'succeeded');
}));
test('unknown acknowledgement always requires readback; measurement remains unknown', () => {
  assert.equal(failureDisposition({ outcome: 'timeout', sideEffect: false, source: 'provider' }).retry, false);
  assert.equal(failureDisposition({ outcome: 'test_failure', source: 'test' }).retry, false);
  assert.equal(summarizeMetrics([{ type: 'build' }]).tokens, null);
});



test('hosted evidence is read from authenticated run and exact job, never supplied JSON', () => {
  const expected = { repository: 'org/repo', workflow: '.github/workflows/ci.yml', check: 'accounting (1)' };
  const receipt = { runId: 12, jobId: 34, attempt: 2, head: 'a'.repeat(40) };
  const run = { id: 12, head_sha: receipt.head, run_attempt: 2, repository: { full_name: 'org/repo' }, path: expected.workflow };
  const job = { id: 34, run_id: 12, head_sha: receipt.head, run_attempt: 2, name: expected.check, status: 'completed', conclusion: 'success' };
  const read = path => path.includes('/runs/') ? run : job;
  assert.equal(readProviderEvidence(expected, receipt, read).conclusion, 'success');
  assert.throws(() => readProviderEvidence({ ...expected, check: 'unrelated' }, receipt, read));
  assert.throws(() => readProviderEvidence(expected, { ...receipt, attempt: 3 }, read));
  assert.throws(() => readProviderEvidence(expected, receipt, () => { throw Error('403'); }));
});

const inventoryEntry = (id, inputs, risks, more = {}) => ({ id, inputs, risks,
  command: ['node', `${id}.mjs`], owner: '.github/workflows/ci.yml',
  invariant: id, runtime: 'node22', environment: 'isolated', always: false,
  durationSeconds: null, replaces: null, ...more });
test('explicit dependency preview does not turn unrelated SQL or documentation into a financial audit', () => {
  const inventory = executionInventory([
    inventoryEntry('policy', ['docs/'], ['documentation']),
    inventoryEntry('catalog', ['supabase/components/read-only-catalog.sql'], ['database']),
    inventoryEntry('accounting', ['supabase/components/payout.sql', 'server/src/money/'], ['financial']),
  ]);
  const sql = previewExecution(inventory, { paths: ['supabase/components/read-only-catalog.sql'], complete: true });
  assert.deepEqual(sql.checks.filter(c => c.selected).map(c => c.id), ['catalog']);
  assert.deepEqual(sql.risks, ['database']);
  assert.equal(sql.estimatedSeconds, null);
  for (const path of ['docs/change.md', 'supabase/components/payout.sql', 'server/src/money/fee.ts']) {
    const result = previewExecution(inventory, { paths: [path], complete: true });
    assert.equal(result.checks.find(c => c.id === 'accounting').selected, !path.startsWith('docs/'));
  }
  for (const input of [{paths:['unmapped.sql'],complete:true},{paths:[],complete:false}])
    assert.equal(previewExecution(inventory,input).checks.every(c=>c.selected),true);
  assert.equal(previewExecution(inventory,{paths:['docs/change.md'],complete:true,required:['accounting']}).checks.find(c=>c.id==='accounting').selected,true);
});
test('inventory rejects ambiguous ownership and unsafe closure and never retires overlap automatically', () => {
  const entry=inventoryEntry('one',['scripts/'],['tooling']);
  for (const changed of [{owner:''},{inputs:['../outside']},{inputs:['scripts/../../outside']},{risks:[]},{always:undefined},{durationSeconds:-1}])
    assert.throws(()=>executionInventory([{...entry,...changed}]));
  assert.throws(()=>executionInventory([entry,entry]));
  const inventory=executionInventory([entry,inventoryEntry('two',['scripts/'],['tooling'],{invariant:'one'})]);
  assert.equal(inventory.overlap.length,1);
  assert.equal(previewExecution(inventory,{paths:['scripts/check.mjs'],complete:true}).checks.filter(c=>c.selected).length,2);
  assert.throws(()=>previewExecution(inventory,{paths:[],complete:true,required:['missing']}));
});
