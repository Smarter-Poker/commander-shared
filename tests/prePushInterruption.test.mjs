import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
test('an interrupted local precheck cannot emit a passed exit receipt', () => {
  const hook = readFileSync(new URL('../.husky/pre-push', import.meta.url), 'utf8');
  const traps = hook.match(/^trap 'exit (?:129|130|143)' (?:HUP|INT|TERM)$/gm);
  assert.equal(traps?.length, 3);
  assert.ok(hook.indexOf('rm -f -- "$POLICY_PRECHECK_RECEIPT"') < hook.indexOf('trap policy_precheck_result EXIT'));
  for (const [signal, code] of [['HUP', 129], ['INT', 130], ['TERM', 143]]) {
    try {
      execFileSync('sh', ['-c', `trap 'rc=$?; printf "%s" "$rc"' EXIT\n${traps.join('\n')}\nkill -${signal} $$`]);
      assert.fail('interruption passed');
    } catch (error) {
      assert.equal(error.status, code);
      assert.equal(error.stdout.toString(), String(code));
    }
  }
});
