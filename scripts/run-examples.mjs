/**
 * Runs the Node examples against a real Droid CLI and checks what they did.
 *
 * Each example runs in a fresh scratch directory with its own HOME, TMPDIR,
 * and fixture project, so runs share no sessions or settings. Some examples run
 * in a chain inside one scratch directory because they need an earlier
 * example's output (for example, resume-session needs a saved session ID).
 *
 * Checks look at the exit code, stdout, and the session files that Droid
 * writes under `$HOME/.factory/sessions`. Credits are summed from
 * `tokenUsage.factoryCredits` in those session files.
 *
 * Usage:
 *   FACTORY_API_KEY=... node scripts/run-examples.mjs
 *   node scripts/run-examples.mjs --runs 5 --concurrency 4
 *   node scripts/run-examples.mjs --only run,fork-session --out /tmp/runs
 *   node scripts/run-examples.mjs --include mission
 *
 * Options:
 *   --runs <n>         Runs per example (default 1)
 *   --concurrency <n>  Chains to run at the same time (default 4)
 *   --only <a,b>       Run only these examples (and the chain steps they need)
 *   --skip <a,b>       Do not run these examples
 *   --include <a,b>    Add opt-in examples (mission)
 *   --out <dir>        Directory for logs and the report
 *   --droid <path>     Droid executable for the daemon (default: droid on PATH)
 *   --retries <n>      Run a failed chain again up to n times, each time in a
 *                      new scratch directory (default 0). The report counts
 *                      the retries, so flaky examples stay visible.
 *   --keep-env         Keep inherited FACTORY_* and DROID_* variables
 *   --list             Print the example plan and exit
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startMcpTestServer } from './mcp-test-server.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const examplesDir = join(repoRoot, 'examples', 'node');
const tsxCli = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// ---------------------------------------------------------------------------
// Check helpers. Each returns { name, ok, detail }.

const exitZero = () => ({
  name: 'exit code 0',
  test: (ctx) => ({
    ok: ctx.exitCode === 0 && !ctx.timedOut,
    detail: ctx.timedOut ? 'timed out' : `exit ${ctx.exitCode}`,
  }),
});

const stdoutMatches = (re, name = `stdout matches ${re}`) => ({
  name,
  test: (ctx) => ({ ok: re.test(ctx.stdout) }),
});

const stdoutLacks = (re, name = `stdout lacks ${re}`) => ({
  name,
  test: (ctx) => ({ ok: !re.test(ctx.stdout) }),
});

const sessionFilesContain = (needle, name) => ({
  name: name ?? `a session transcript contains ${needle}`,
  test: async (ctx) => {
    for (const file of ctx.sessionFiles.filter((f) => f.endsWith('.jsonl'))) {
      if ((await readFile(file, 'utf8')).includes(needle)) return { ok: true };
    }
    return { ok: false, detail: `${ctx.sessionFiles.length} session files` };
  },
});

const minSessions = (count) => ({
  name: `at least ${count} session(s) saved`,
  test: (ctx) => {
    const n = ctx.sessionFiles.filter((f) =>
      f.endsWith('.settings.json')
    ).length;
    return { ok: n >= count, detail: `${n} session(s)` };
  },
});

const segmentAfter = (marker, ctx) => {
  const index = ctx.stdout.indexOf(marker);
  return index === -1 ? '' : ctx.stdout.slice(index + marker.length);
};

const custom = (name, test) => ({ name, test });

// ---------------------------------------------------------------------------
// Example plan. A chain runs its steps in order in one scratch directory.

/** @type {Record<string, {args?: (state) => string[], env?: object, timeoutSec?: number, daemon?: boolean, mcp?: boolean, optIn?: boolean, checks: object[]}>} */
const EXAMPLES = {
  run: {
    checks: [
      exitZero(),
      stdoutMatches(/\b4\b|\bfour\b/i, 'answers 2 + 2 = 4'),
      stdoutMatches(/messages: \d+/),
    ],
  },
  'abort-session-stream': {
    checks: [
      exitZero(),
      stdoutMatches(
        /Stopped by AbortController/,
        'the abort signal stopped the stream'
      ),
    ],
  },
  'ask-user-elicitation': {
    checks: [
      exitZero(),
      stdoutMatches(/^\[asked\] .+/m, 'Droid asked a question'),
      stdoutMatches(/^\[options\] .+/m),
    ],
  },
  'compact-session': {
    checks: [
      exitZero(),
      stdoutMatches(
        /messages removed: [1-9]\d*/,
        'compaction removed messages'
      ),
      custom('compacted session recalls one, two, three', (ctx) => {
        const s = segmentAfter('continued:', ctx).toLowerCase();
        return { ok: ['one', 'two', 'three'].every((w) => s.includes(w)) };
      }),
      custom('reports a new ID or an in-place compaction', (ctx) => {
        const a = /original session: (\S+)/.exec(ctx.stdout)?.[1];
        const b = /compacted into:\s+(\S+)( \(in place\))?/.exec(ctx.stdout);
        const ok = Boolean(a && b && (b[2] ? a === b[1] : a !== b[1]));
        return { ok, detail: b?.[2] ? 'in place' : 'new session' };
      }),
    ],
  },
  'daemon-session': {
    daemon: true,
    checks: [
      exitZero(),
      stdoutMatches(/todo/i, 'summarizes the fixture project'),
      minSessions(1),
    ],
  },
  'document-input': {
    checks: [
      exitZero(),
      stdoutMatches(
        /2\.4\.0|document input|ready/i,
        'summary mentions the document'
      ),
    ],
  },
  'enter-spec-mode': {
    timeoutSec: 420,
    checks: [
      exitZero(),
      custom('file contains hello', (ctx) => ({
        ok: /^\s*"?hello"?\s*$/im.test(
          ctx.stdout.trim().split('\n').pop() ?? ''
        ),
      })),
      sessionFilesContain(
        'ExitSpecMode',
        'Droid proposed a spec (ExitSpecMode)'
      ),
    ],
  },
  'external-mcp': {
    mcp: true,
    checks: [
      exitZero(),
      stdoutMatches(/harness_echo/, 'lists harness_echo'),
      stdoutMatches(/harness_add/, 'lists harness_add'),
      custom('MCP server received the bearer token', (ctx) => ({
        ok:
          ctx.mcpStats.authorized > 0 &&
          ctx.mcpStats.methods.includes('tools/list'),
        detail: JSON.stringify({
          ...ctx.mcpStats,
          methods: [...new Set(ctx.mcpStats.methods)],
        }),
      })),
    ],
  },
  'fork-session': {
    checks: [
      exitZero(),
      custom('fork recalls mango sunrise', (ctx) => ({
        ok: /mango sunrise/i.test(segmentAfter('fork recalls:', ctx)),
      })),
      custom('fork has a new ID', (ctx) => {
        const a = /original session: (\S+)/.exec(ctx.stdout)?.[1];
        const b = /forked session:\s+(\S+)/.exec(ctx.stdout)?.[1];
        return { ok: Boolean(a && b && a !== b) };
      }),
    ],
  },
  'hook-execution': {
    timeoutSec: 300,
    checks: [
      exitZero(),
      stdoutMatches(/\[hook started\] PreToolUse: echo hook-from-sdk-example/),
      stdoutMatches(
        /\[hook \w+\] exit code 0: hook-from-sdk-example/,
        'hook completed with its output'
      ),
    ],
  },
  'image-attachment': {
    checks: [
      exitZero(),
      stdoutMatches(/purple|violet/i, 'names the color'),
      stdoutMatches(/square/i, 'names the shape'),
    ],
  },
  'init-metadata': {
    checks: [
      exitZero(),
      stdoutMatches(new RegExp(`session:\\s+${UUID}`)),
      stdoutMatches(/model:\s+(?!undefined)\S+/, 'reports a model'),
      custom('cwd is the project directory', (ctx) => ({
        ok: ctx.stdout.includes(`cwd:              ${ctx.project}`),
      })),
    ],
  },
  'interrupt-session': {
    checks: [
      exitZero(),
      stdoutMatches(/Turn was interrupted\./, 'the turn was interrupted'),
      stdoutMatches(/^next turn: .*ready/im, 'the session works after it'),
    ],
  },
  'model-discovery': {
    checks: [
      exitZero(),
      stdoutMatches(/status: available/, 'lists an available model'),
    ],
  },
  'model-selection': {
    args: (state) => [state.modelId ?? 'missing-model-id'],
    checks: [
      exitZero(),
      custom('uses the model from model-discovery', (ctx) => ({
        ok:
          Boolean(ctx.state.modelId) &&
          ctx.stdout.includes(`model: ${ctx.state.modelId}`),
        detail: ctx.state.modelId,
      })),
      custom('session settings record the model', async (ctx) => {
        for (const file of ctx.sessionFiles.filter((f) =>
          f.endsWith('.settings.json')
        )) {
          const settings = JSON.parse(await readFile(file, 'utf8'));
          if (settings.model === ctx.state.modelId) return { ok: true };
        }
        return { ok: false };
      }),
    ],
  },
  'multi-turn-session': {
    checks: [
      exitZero(),
      stdoutMatches(/todo/i, 'describes the fixture project'),
    ],
  },
  observability: {
    checks: [exitZero(), stdoutMatches(/^\[assistant\] \S/m)],
  },
  'partial-stream': {
    checks: [
      exitZero(),
      stdoutMatches(/\[result\] success/),
      stdoutMatches(/todo/i, 'explains the fixture project'),
    ],
  },
  'permission-handler': {
    checks: [
      exitZero(),
      stdoutMatches(/Hello, World!/, 'file has the expected text'),
    ],
  },
  'rename-session': {
    checks: [
      exitZero(),
      stdoutMatches(new RegExp(`renamed session: ${UUID}`)),
      stdoutMatches(/^saved title: +Quarterly report analysis$/m),
    ],
  },
  'list-sessions': {
    checks: [
      exitZero(),
      custom('lists the renamed session with its new title', (ctx) => ({
        ok:
          Boolean(ctx.state.renamedId) &&
          ctx.stdout.includes(
            `${ctx.state.renamedId}: Quarterly report analysis`
          ),
        detail: ctx.state.renamedId,
      })),
    ],
  },
  'result-metadata': {
    checks: [
      exitZero(),
      stdoutMatches(new RegExp(`session:  ${UUID}`)),
      stdoutMatches(/success:  true/),
      stdoutMatches(/turns:    [1-9]/),
    ],
  },
  'resume-session': {
    args: (state) => [state.savedId ?? 'missing-session-id'],
    checks: [
      exitZero(),
      custom('resumes in the original cwd', (ctx) => ({
        ok: ctx.stdout.includes(`cwd: ${ctx.project}`),
      })),
      custom('the saved transcript grew', async (ctx) => {
        const file = ctx.sessionFiles.find((f) =>
          f.endsWith(`${ctx.state.savedId}.jsonl`)
        );
        if (!file) return { ok: false, detail: 'transcript not found' };
        const lines = (await readFile(file, 'utf8'))
          .split('\n')
          .filter(Boolean).length;
        return {
          ok: lines > (ctx.state.savedLines ?? Infinity),
          detail: `${ctx.state.savedLines} -> ${lines} lines`,
        };
      }),
    ],
  },
  'rewind-session': {
    checks: [
      exitZero(),
      stdoutMatches(/rewind would restore \d+ file\(s\) and delete \d+/),
      custom(
        'the rewound session recalls mango sunrise, not cobalt harbor',
        (ctx) => {
          const s = segmentAfter('rewound into session:', ctx)
            .split('\n')
            .slice(1)
            .join('\n');
          return {
            ok: /mango sunrise/i.test(s) && !/cobalt harbor/i.test(s),
            detail: s.trim().slice(0, 160),
          };
        }
      ),
    ],
  },
  'sdk-mcp-tool': {
    checks: [
      exitZero(),
      stdoutMatches(/\[tool call\] .*favorite_number/),
      stdoutMatches(/\b42\b/, 'answer uses the tool result'),
    ],
  },
  'session-settings': {
    checks: [
      exitZero(),
      stdoutMatches(/created with: .+, auto, low$/m),
      stdoutMatches(/updated to {2}: .+, auto, high$/m),
      stdoutMatches(/entered Spec: .+, spec, /m),
      stdoutMatches(/exited Spec : .+, auto, /m),
    ],
  },
  'session-stream': {
    checks: [exitZero(), stdoutMatches(/\S/)],
  },
  skills: {
    checks: [
      exitZero(),
      stdoutMatches(
        /^release-notes \(project\): enabled$/m,
        'lists the project skill'
      ),
    ],
  },
  'spec-mode-new-session': {
    timeoutSec: 420,
    checks: [
      exitZero(),
      stdoutMatches(
        new RegExp(`implementing session:\\s+${UUID}`),
        'reports a new implementing session'
      ),
      stdoutMatches(/Hello from Droid/, 'file has the expected text'),
      minSessions(2),
    ],
  },
  'spec-mode-same-session': {
    timeoutSec: 420,
    checks: [
      exitZero(),
      stdoutMatches(/implementing session:\s+<same session>/),
      stdoutMatches(/Hello from Droid/, 'file has the expected text'),
      sessionFilesContain(
        'ExitSpecMode',
        'Droid proposed a spec (ExitSpecMode)'
      ),
    ],
  },
  'structured-output': {
    checks: [
      exitZero(),
      stdoutMatches(
        /^- line \d+ \[(low|medium|high)\] \S/m,
        'prints a validated finding'
      ),
    ],
  },
  'tool-controls': {
    checks: [
      exitZero(),
      stdoutMatches(/^Execute: false$/m, 'Execute is disabled'),
      stdoutMatches(/^Read: true$/m),
    ],
  },
  mission: {
    optIn: true,
    timeoutSec: 1800,
    checks: [
      exitZero(),
      stdoutMatches(/\[worker started\]/),
      stdoutMatches(/\[result\] success/),
      custom('CONTRIBUTING.md exists', (ctx) => ({
        ok: existsSync(join(ctx.project, 'CONTRIBUTING.md')),
      })),
    ],
  },
};

/** Steps whose output a later step needs. `after` runs after a step passes or fails. */
const CHAINS = [
  {
    steps: ['model-discovery', 'model-selection'],
    after: {
      'model-discovery': (ctx, state) => {
        const available = [
          ...ctx.stdout.matchAll(/\(([^()\s]+)\)\n {2}status: available/g),
        ].map((m) => m[1]);
        state.modelId =
          available.find((id) => /haiku|mini|flash/i.test(id)) ?? available[0];
      },
    },
  },
  {
    steps: ['rename-session', 'list-sessions'],
    after: {
      'rename-session': (ctx, state) => {
        state.renamedId = new RegExp(`renamed session: (${UUID})`).exec(
          ctx.stdout
        )?.[1];
      },
    },
  },
  {
    steps: ['result-metadata', 'resume-session'],
    after: {
      'result-metadata': async (ctx, state) => {
        state.savedId = new RegExp(`session:  (${UUID})`).exec(ctx.stdout)?.[1];
        const file = ctx.sessionFiles.find((f) =>
          f.endsWith(`${state.savedId}.jsonl`)
        );
        state.savedLines = file
          ? (await readFile(file, 'utf8')).split('\n').filter(Boolean).length
          : undefined;
      },
    },
  },
];

// ---------------------------------------------------------------------------
// CLI options

function parseArgs(argv) {
  const opts = {
    runs: 1,
    concurrency: 4,
    only: [],
    skip: [],
    include: [],
    out: undefined,
    droid: 'droid',
    keepEnv: false,
    list: false,
    retries: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    const list = () =>
      value()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (arg === '--runs') opts.runs = Number(value());
    else if (arg === '--concurrency') opts.concurrency = Number(value());
    else if (arg === '--only') opts.only = list();
    else if (arg === '--skip') opts.skip = list();
    else if (arg === '--include') opts.include = list();
    else if (arg === '--out') opts.out = value();
    else if (arg === '--droid') opts.droid = value();
    else if (arg === '--retries') opts.retries = Number(value());
    else if (arg === '--keep-env') opts.keepEnv = true;
    else if (arg === '--list') opts.list = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  for (const name of [...opts.only, ...opts.skip, ...opts.include]) {
    if (!EXAMPLES[name]) throw new Error(`Unknown example: ${name}`);
  }
  return opts;
}

function planChains(opts) {
  const wanted = (name) => {
    if (opts.skip.includes(name)) return false;
    if (opts.only.length > 0) return opts.only.includes(name);
    return !EXAMPLES[name].optIn || opts.include.includes(name);
  };
  const chains = [];
  const chained = new Set(CHAINS.flatMap((c) => c.steps));
  for (const chain of CHAINS) {
    const last = chain.steps.findLastIndex(wanted);
    if (last === -1) continue;
    // A wanted step also pulls in the earlier steps that it depends on.
    chains.push({
      steps: chain.steps.slice(0, last + 1),
      after: chain.after,
      reported: chain.steps.slice(0, last + 1).filter(wanted),
    });
  }
  for (const name of Object.keys(EXAMPLES)) {
    if (!chained.has(name) && wanted(name))
      chains.push({ steps: [name], after: {}, reported: [name] });
  }
  return chains;
}

// ---------------------------------------------------------------------------
// Runtime helpers

function childEnv(base, opts) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      !opts.keepEnv &&
      /^(FACTORY_|DROID_)/.test(key) &&
      key !== 'FACTORY_API_KEY'
    )
      continue;
    env[key] = value;
  }
  return { ...env, ...base };
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

async function sessionSnapshot(home) {
  const files = await walk(join(home, '.factory', 'sessions'));
  let credits = 0;
  for (const file of files.filter((f) => f.endsWith('.settings.json'))) {
    try {
      credits +=
        JSON.parse(await readFile(file, 'utf8')).tokenUsage?.factoryCredits ??
        0;
    } catch {
      // A session that is still being written can have a partial file.
    }
  }
  return { files, credits };
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await new Promise((resolve) => {
      const socket = connect(port, '127.0.0.1');
      socket.once('connect', () => (socket.destroy(), resolve(true)));
      socket.once('error', () => resolve(false));
    });
    if (open) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Port ${port} did not open in ${timeoutMs}ms`);
}

function killTree(child, signal = 'SIGTERM') {
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Already exited.
    }
  }
}

function runProcess(command, args, { cwd, env, timeoutSec, logPrefix }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child, 'SIGTERM');
      setTimeout(() => killTree(child, 'SIGKILL'), 5000).unref();
    }, timeoutSec * 1000);
    child.on('close', async (code, signal) => {
      clearTimeout(timer);
      // Examples leave no background work; remove anything left in the group.
      killTree(child, 'SIGKILL');
      await writeFile(`${logPrefix}.stdout.log`, stdout);
      await writeFile(`${logPrefix}.stderr.log`, stderr);
      resolve({
        exitCode: code,
        signal,
        timedOut,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      });
    });
  });
}

async function createFixtureProject(project) {
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(
    join(project, 'package.json'),
    JSON.stringify(
      {
        name: 'todo-cli',
        version: '1.0.0',
        type: 'module',
        scripts: { test: 'node --test' },
      },
      null,
      2
    ) + '\n'
  );
  await writeFile(
    join(project, 'README.md'),
    '# todo-cli\n\nA tiny command-line todo list that stores items in todos.json.\n'
  );
  await writeFile(
    join(project, 'src', 'todos.js'),
    [
      "import { readFileSync, writeFileSync } from 'node:fs';",
      '',
      "const FILE = 'todos.json';",
      '',
      'export function load() {',
      "  return JSON.parse(readFileSync(FILE, 'utf8'));",
      '}',
      '',
      'export function add(text) {',
      '  const todos = load();',
      '  todos.push({ text, done: false });',
      '  writeFileSync(FILE, JSON.stringify(todos));',
      '}',
      '',
    ].join('\n')
  );
  spawnSync('git', ['init', '-q'], { cwd: project });
  spawnSync('git', ['add', '.'], { cwd: project });
  spawnSync(
    'git',
    [
      '-c',
      'user.name=harness',
      '-c',
      'user.email=harness@example.com',
      'commit',
      '-qm',
      'init',
    ],
    { cwd: project }
  );
}

// ---------------------------------------------------------------------------
// Chain execution

async function runChain(chain, runIndex, opts, outDir) {
  const scratch = await realpath(
    await mkdtemp(join(outDir, `${chain.steps.join('+')}-${runIndex}-`))
  );
  const home = join(scratch, 'home');
  const project = join(scratch, 'project');
  await mkdir(home, { recursive: true });
  await createFixtureProject(project);

  const state = {};
  const results = [];
  for (const name of chain.steps) {
    const spec = EXAMPLES[name];
    // A short TMPDIR per step: tsx puts an IPC socket in TMPDIR, and a Unix
    // socket path longer than 104 bytes (macOS) fails with EADDRINUSE.
    const tmp = await realpath(await mkdtemp(join(tmpdir(), 'dse-')));
    const env = childEnv(
      { HOME: home, TMPDIR: tmp, ...(spec.env ?? {}) },
      opts
    );
    const helpers = [];
    let mcp;
    try {
      if (spec.daemon) {
        const port = await freePort();
        const daemon = spawn(opts.droid, ['daemon', '--port', String(port)], {
          cwd: project,
          env,
          detached: true,
          stdio: 'ignore',
        });
        helpers.push(() => killTree(daemon, 'SIGTERM'));
        await waitForPort(port, 30_000);
        env.DROID_DAEMON_URL = `ws://127.0.0.1:${port}`;
        env.DROID_SESSION_CWD = project;
      }
      if (spec.mcp) {
        const token = `harness-${Math.random().toString(36).slice(2)}`;
        mcp = await startMcpTestServer({ token });
        helpers.push(() => mcp.close());
        env.MCP_SERVER_URL = mcp.url;
        env.MCP_SERVER_TOKEN = token;
      }

      const before = await sessionSnapshot(home);
      const args = spec.args ? spec.args(state) : [];
      const proc = await runProcess(
        process.execPath,
        [tsxCli, join(examplesDir, `${name}.ts`), ...args],
        {
          cwd: project,
          env,
          timeoutSec: spec.timeoutSec ?? 240,
          logPrefix: join(scratch, name),
        }
      );
      const after = await sessionSnapshot(home);

      const ctx = {
        ...proc,
        project,
        home,
        state,
        sessionFiles: after.files,
        mcpStats: mcp?.stats,
      };
      const checks = [];
      for (const check of spec.checks) {
        try {
          const outcome = await check.test(ctx);
          checks.push({
            name: check.name,
            ok: Boolean(outcome.ok),
            detail: outcome.detail,
          });
        } catch (error) {
          checks.push({
            name: check.name,
            ok: false,
            detail: `check threw: ${error.message}`,
          });
        }
      }
      await chain.after[name]?.(ctx, state);

      results.push({
        example: name,
        run: runIndex,
        ok: checks.every((c) => c.ok),
        exitOk: checks[0]?.ok ?? false,
        durationMs: proc.durationMs,
        credits: after.credits - before.credits,
        sessions:
          after.files.filter((f) => f.endsWith('.settings.json')).length -
          before.files.filter((f) => f.endsWith('.settings.json')).length,
        checks,
        stderrTail: proc.stderr.trim().split('\n').slice(-5).join('\n'),
        logs: relative(outDir, join(scratch, name)),
        reported: chain.reported.includes(name),
      });
    } finally {
      for (const stop of helpers.reverse()) await stop();
      await rm(tmp, { recursive: true, force: true });
    }
  }
  return results;
}

async function pool(items, limit, worker) {
  const results = [];
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next++];
        results.push(...(await worker(item)));
      }
    }
  );
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------------------
// Report

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarize(results) {
  const byExample = new Map();
  for (const r of results.filter((x) => x.reported)) {
    if (!byExample.has(r.example)) byExample.set(r.example, []);
    byExample.get(r.example).push(r);
  }
  const rows = [];
  for (const [example, runs] of [...byExample].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const failed = runs.filter((r) => !r.ok);
    const failures = new Map();
    for (const r of failed) {
      for (const c of r.checks.filter((c) => !c.ok))
        failures.set(c.name, (failures.get(c.name) ?? 0) + 1);
    }
    rows.push({
      example,
      runs: runs.length,
      passed: runs.length - failed.length,
      exitOk: runs.filter((r) => r.exitOk).length,
      retried: runs.filter((r) => r.failedAttempts.length > 0).length,
      medianSec: median(runs.map((r) => r.durationMs)) / 1000,
      meanCredits: runs.reduce((s, r) => s + r.credits, 0) / runs.length,
      failures: [...failures].map(([name, n]) => `${name} (${n})`).join('; '),
    });
  }
  return rows;
}

function markdown(rows, meta) {
  const lines = [
    `# Example harness report`,
    '',
    `- Node: ${meta.node}`,
    `- Platform: ${meta.platform}`,
    `- Droid: ${meta.droidVersion}`,
    `- Runs per example: ${meta.runs}`,
    `- Retries per failed chain: ${meta.retries}`,
    `- Started: ${meta.startedAt}`,
    '',
    '| Example | Pass | Retried | Exit 0 | Median time (s) | Mean credits | Failed checks |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.example} | ${r.passed}/${r.runs} | ${r.retried} | ${r.exitOk}/${r.runs} | ${r.medianSec.toFixed(1)} | ${Math.round(r.meanCredits)} | ${r.failures || ''} |`
    );
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------

const opts = parseArgs(process.argv.slice(2));
const chains = planChains(opts);

if (opts.list) {
  for (const chain of chains) console.log(chain.steps.join(' -> '));
  process.exit(0);
}
if (!process.env.FACTORY_API_KEY) throw new Error('Set FACTORY_API_KEY.');
if (!existsSync(tsxCli)) throw new Error('Run npm ci first: tsx is missing.');

const startedAt = new Date().toISOString();
const outDir = await realpath(
  opts.out
    ? (await mkdir(opts.out, { recursive: true }), opts.out)
    : await mkdtemp(join(tmpdir(), 'droid-sdk-example-runs-'))
);
const droidVersion =
  spawnSync(opts.droid, ['--version'], { encoding: 'utf8' }).stdout?.trim() ||
  'unknown';

const work = [];
for (let i = 1; i <= opts.runs; i++)
  for (const chain of chains) work.push({ chain, i });

console.log(
  `Running ${work.length} chain(s) with concurrency ${opts.concurrency}. Logs: ${outDir}`
);
const results = await pool(work, opts.concurrency, async ({ chain, i }) => {
  let res = await runChain(chain, i, opts, outDir);
  const failedAttempts = [];
  // A retry repeats the whole chain in a new scratch directory, because later
  // steps and the session-file checks depend on the earlier steps.
  while (
    failedAttempts.length < opts.retries &&
    res.some((r) => r.reported && !r.ok)
  ) {
    failedAttempts.push(
      res
        .filter((r) => r.reported && !r.ok)
        .map((r) => ({
          example: r.example,
          failed: r.checks.filter((c) => !c.ok).map((c) => c.name),
          logs: r.logs,
        }))
    );
    console.log(`RETRY ${chain.steps.join(' -> ')} #${i}`);
    res = await runChain(chain, i, opts, outDir);
  }
  for (const r of res) {
    r.attempts = failedAttempts.length + 1;
    r.failedAttempts = failedAttempts
      .flat()
      .filter((a) => a.example === r.example);
  }
  for (const r of res) {
    const failed = r.checks
      .filter((c) => !c.ok)
      .map((c) => c.name + (c.detail ? ` [${c.detail}]` : ''));
    console.log(
      `${r.ok ? 'PASS' : 'FAIL'} ${r.example} #${r.run} ${(r.durationMs / 1000).toFixed(1)}s${r.failedAttempts.length ? ` (after ${r.failedAttempts.length} failed attempt(s))` : ''}${failed.length ? ` -> ${failed.join('; ')}` : ''}`
    );
  }
  return res;
});

const meta = {
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  droidVersion,
  runs: opts.runs,
  retries: opts.retries,
  startedAt,
};
const rows = summarize(results);
await writeFile(
  join(outDir, 'results.json'),
  JSON.stringify({ meta, rows, results }, null, 2)
);
const report = markdown(rows, meta);
await writeFile(join(outDir, 'report.md'), report);
console.log(`\n${report}`);

const allPassed = rows.every((r) => r.passed === r.runs);
process.exitCode = allPassed ? 0 : 1;
