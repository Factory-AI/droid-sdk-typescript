import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { childEnv } from './harness-utils.mjs';
import {
  EXAMPLES,
  markdown,
  parseArgs,
  planChains,
  pool,
  retryChain,
  runChain,
  runProcess,
  summarize,
} from './run-examples.mjs';

test('numeric flags reject empty, non-integer, and out-of-range values', () => {
  for (const flag of ['--runs', '--concurrency', '--retries']) {
    for (const value of [
      '',
      ' ',
      'wat',
      '-1',
      '1.5',
      'Infinity',
      '9007199254740992',
    ]) {
      assert.throws(() => parseArgs([flag, value]), /must be an integer/);
    }
    assert.throws(() => parseArgs([flag]), /needs a value/);
  }
  assert.throws(() => parseArgs(['--runs', '0']));
  assert.throws(() => parseArgs(['--concurrency', '0']));
  assert.equal(parseArgs(['--retries', '0']).retries, 0);
  assert.equal(parseArgs(['--runs', '2']).runs, 2);
});

test('the CLI exits nonzero for invalid numeric arguments before authentication', () => {
  for (const args of [
    ['--concurrency', '0'],
    ['--runs', 'wat'],
  ]) {
    const result = spawnSync(
      process.execPath,
      [new URL('./run-examples.mjs', import.meta.url).pathname, ...args],
      { encoding: 'utf8', env: { PATH: process.env.PATH } }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be an integer/);
    assert.doesNotMatch(result.stderr, /Set FACTORY_API_KEY/);
  }
});

test('example names must be own keys of the plan', () => {
  for (const name of ['constructor', '__proto__', 'unknown']) {
    assert.throws(() => parseArgs(['--only', name]), /Unknown example/);
  }
});

test('dependencies cannot silently override --skip', () => {
  assert.throws(
    () => planChains(parseArgs(['--skip', 'result-metadata'])),
    /resume-session requires result-metadata/
  );
  const [chain] = planChains(parseArgs(['--only', 'resume-session']));
  assert.deepEqual(chain.steps, ['result-metadata', 'resume-session']);
  assert.deepEqual(chain.reported, ['resume-session']);
  assert.deepEqual(
    planChains(
      parseArgs(['--only', 'result-metadata', '--skip', 'resume-session'])
    )[0].steps,
    ['result-metadata']
  );
});

test('an empty selection cannot pass', () => {
  assert.throws(
    () => planChains(parseArgs(['--skip', Object.keys(EXAMPLES).join(',')])),
    /No examples selected/
  );
  assert.throws(
    () => planChains(parseArgs(['--only', 'run', '--skip', 'run'])),
    /No examples selected/
  );
});

test('the worker pool executes every item and rejects zero concurrency', async () => {
  const results = await pool([1, 2, 3], 2, async (n) => [n * 2]);
  assert.deepEqual(results.sort(), [2, 4, 6]);
  await assert.rejects(
    pool([1], 0, async (n) => [n]),
    /positive integer/
  );
});

test('both harnesses isolate Factory state while preserving credentials', () => {
  const inherited = {
    HOME: '/real-home',
    FACTORY_HOME_OVERRIDE: '/real-home',
    FACTORY_API_KEY: 'synthetic-credential',
    FACTORY_API_URL: 'https://example.invalid',
    DROID_SESSION_CWD: '/real-project',
    PATH: '/bin',
  };
  const env = childEnv({ HOME: '/scratch' }, {}, inherited);
  assert.deepEqual(env, {
    HOME: '/scratch',
    FACTORY_API_KEY: 'synthetic-credential',
    PATH: '/bin',
  });
  assert.equal(
    childEnv({ HOME: '/scratch' }, { keepEnv: true }, inherited)
      .FACTORY_HOME_OVERRIDE,
    '/real-home'
  );
});

test('arithmetic checks do not accept metadata as the answer', () => {
  const check = EXAMPLES.run.checks.find((c) => c.name === 'answers 2 + 2 = 4');
  for (const answer of ['The answer is 5.', '14', 'fourteen', 'before', '']) {
    assert.equal(
      check.test({ stdout: `${answer}\n\nmessages: 4\ntokens: 4 in, 4 out` })
        .ok,
      false
    );
  }
  for (const answer of ['4', 'The answer is four.', '**4**', 'FOUR!']) {
    assert.equal(check.test({ stdout: `${answer}\n\nmessages: 2` }).ok, true);
  }
});

test('compaction checks accept words or digits, but not missing numbers', () => {
  const check = EXAMPLES['compact-session'].checks.find((c) =>
    c.name.startsWith('compacted session recalls')
  );
  for (const answer of [
    'one, two, three',
    '1, 2, 3',
    'One, 2, THREE',
    '"one"; **2**; (three).',
  ]) {
    assert.equal(check.test({ stdout: `continued: ${answer}` }).ok, true);
  }
  for (const answer of ['1, 2', 'someone, two, three', '11, 12, 13']) {
    assert.equal(check.test({ stdout: `continued: ${answer}` }).ok, false);
  }
  assert.equal(
    check.test({ stdout: 'one two three\ncontinued: nothing' }).ok,
    false
  );
});

function result(example, ok, credits, durationMs, reported = true) {
  return {
    example,
    ok,
    exitOk: ok,
    credits,
    durationMs,
    reported,
    run: 1,
    checks: [{ name: 'example result', ok }],
    logs: `${example}-${credits}`,
  };
}

test('retries preserve costs, durations, logs, and successful prerequisites', async () => {
  const attempts = [
    [result('setup', true, 10, 1000), result('dependent', false, 20, 2000)],
    [result('setup', true, 30, 3000), result('dependent', true, 40, 4000)],
  ];
  let calls = 0;
  const results = await retryChain(async () => attempts[calls++], 1);
  assert.equal(calls, 2);
  const setup = results.find((r) => r.example === 'setup');
  assert.equal(setup.attempts, 2);
  assert.equal(setup.credits, 30);
  assert.equal(setup.totalCredits, 40);
  assert.equal(setup.totalDurationMs, 4000);
  assert.deepEqual(
    setup.attemptResults,
    attempts.map((a) => a[0])
  );
  const dependent = results.find((r) => r.example === 'dependent');
  assert.equal(dependent.totalCredits, 60);
  assert.equal(dependent.attemptResults[0].ok, false);
  assert.equal(dependent.attemptResults[0].logs, 'dependent-20');
  const rows = summarize(results);
  assert.equal(rows.find((r) => r.example === 'setup').retried, 1);
  assert.equal(
    rows.find((r) => r.example === 'dependent').meanTotalCredits,
    60
  );
  assert.match(
    markdown(rows, { totalCredits: 100 }),
    /all attempts and prerequisites\): 100/
  );
});

test('a failed prerequisite triggers retries even when it is not reported', async () => {
  let calls = 0;
  const results = await retryChain(async () => {
    calls++;
    return [
      result('setup', calls === 2, 10, 1000, false),
      result('dependent', true, 20, 2000),
    ];
  }, 1);
  assert.equal(calls, 2);
  assert.equal(results[0].attempts, 2);
  assert.deepEqual(
    summarize(results).map((r) => r.example),
    ['dependent']
  );
});

test('retries stop on success or exhaustion and reject empty results', async () => {
  let calls = 0;
  await retryChain(async () => {
    calls++;
    return [result('run', true, 1, 1)];
  }, 3);
  assert.equal(calls, 1);
  calls = 0;
  const [failed] = await retryChain(async () => {
    calls++;
    return [result('run', false, 1, 1)];
  }, 1);
  assert.equal(calls, 2);
  assert.equal(failed.ok, false);
  assert.equal(failed.totalCredits, 2);
  await assert.rejects(
    retryChain(async () => [], 1),
    /no results/
  );
});

test('missing child executables produce failure results and logs', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'sdk-process-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const proc = await runProcess(join(dir, 'missing'), [], {
    cwd: dir,
    env: {},
    timeoutSec: 2,
    logPrefix: join(dir, 'run'),
  });
  assert.notEqual(proc.exitCode, 0);
  assert.match(proc.stderr, /ENOENT/);
  assert.match(await readFile(join(dir, 'run.stderr.log'), 'utf8'), /ENOENT/);
});

test('daemon startup failures enter the report and retry path', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'sdk-startup-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const [chain] = planChains(parseArgs(['--only', 'daemon-session']));
  const opts = parseArgs(['--droid', join(dir, 'missing-droid')]);
  const [failed] = await retryChain(() => runChain(chain, 1, opts, dir), 1);
  assert.equal(failed.ok, false);
  assert.equal(failed.attempts, 2);
  assert.equal(failed.attemptResults.length, 2);
  assert.equal(new Set(failed.attemptResults.map((r) => r.logs)).size, 2);
  for (const attempt of failed.attemptResults) {
    assert.match(attempt.checks[0].detail, /ENOENT/);
    assert.match(
      await readFile(join(dir, `${attempt.logs}.error.log`), 'utf8'),
      /ENOENT/
    );
  }
  assert.equal(summarize([failed])[0].passed, 0);
});
