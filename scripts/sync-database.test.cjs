const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'sync-database.cjs'), 'utf8');
function simulate({ failAt = -1, hasEnv = true } = {}) {
  const calls = [];
  let exitCode;
  function fakeRequire(name) {
    if (name === 'node:child_process') return { spawnSync: (_exe, args) => {
      calls.push(args);
      return { status: calls.length - 1 === failAt ? 7 : 0 };
    } };
    if (name === 'node:fs') return { existsSync: () => hasEnv };
    return require(name);
  }
  fakeRequire.resolve = (name) => '/installed/' + name;
  try {
    vm.runInNewContext(source, {
      require: fakeRequire, __dirname,
      console: { log() {}, error() {} },
      process: { versions: { node: '22.23.4' }, execPath: '/node22', exit(code) {
        exitCode = code; throw new Error('EXIT');
      } },
    });
  } catch (error) { if (error.message !== 'EXIT') throw error; }
  return { calls, exitCode };
}
test('validates, deploys, generates and checks status in order', () => {
  const result = simulate();
  assert.equal(result.exitCode, undefined);
  assert.deepEqual(result.calls.map((args) => Array.from(args).slice(6, -1)), [
    ['validate'], ['migrate', 'deploy'], ['generate'], ['migrate', 'status'],
  ]);
});
test('does not continue or hide failures from any stage', () => {
  for (let failAt = 0; failAt < 4; failAt++) {
    const result = simulate({ failAt });
    assert.equal(result.exitCode, 7);
    assert.equal(result.calls.length, failAt + 1);
  }
});
test('does not run database commands without root configuration', () => {
  const result = simulate({ hasEnv: false });
  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.length, 0);
});
