/**
 * Runs the browser examples in headless Chromium against a local droid daemon.
 *
 * Starts `droid daemon` with a fresh HOME, serves the examples with
 * scripts/serve-browser-example.mjs, fills in the launcher page, clicks each
 * example, and checks the page output. Playwright is not a dependency of this
 * repository; install it before you run this script:
 *
 *   npm install --no-save playwright@1
 *   npx playwright install chromium
 *   FACTORY_API_KEY=... node scripts/run-browser-examples.mjs [--out <dir>]
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { childEnv, freePort, killTree, waitForPort } from './harness-utils.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** Checks run against the text of the page's #output element. */
const EXAMPLES = [
  {
    name: 'daemon-session',
    expect: [
      /Approved the echo command\./,
      /hello from the browser example/,
      /Turn completed\./,
    ],
  },
  {
    name: 'daemon-multi-session',
    expect: [/Both sessions were created successfully\./],
  },
  {
    name: 'daemon-lifecycle',
    expect: [
      /forked session/,
      /compacted session/,
      /rewound session/,
      /Lifecycle operations completed\./,
    ],
  },
  {
    name: 'list-sessions',
    // Runs last, so it sees the sessions that the other examples created.
    expect: [/sessions found\n[1-9]\d*/],
  },
];

const apiKey = process.env.FACTORY_API_KEY;
if (!apiKey) throw new Error('Set FACTORY_API_KEY.');

const outIndex = process.argv.indexOf('--out');
const outDir =
  outIndex === -1
    ? await mkdtemp(join(tmpdir(), 'droid-sdk-browser-runs-'))
    : process.argv[outIndex + 1];
await mkdir(outDir, { recursive: true });
const out = await realpath(outDir);

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  throw new Error(
    'Install Playwright first: npm install --no-save playwright@1 && npx playwright install chromium'
  );
}

const scratch = await realpath(await mkdtemp(join(out, 'scratch-')));
const home = join(scratch, 'home');
const project = join(scratch, 'project');
await mkdir(home, { recursive: true });
await mkdir(project, { recursive: true });
await writeFile(
  join(project, 'README.md'),
  '# todo-cli\n\nA tiny command-line todo list.\n'
);
spawnSync('git', ['init', '-q'], { cwd: project });

const env = childEnv({ HOME: home });
const daemonPort = await freePort();
const webPort = await freePort();
const children = [
  spawn(
    process.env.DROID_PATH ?? 'droid',
    ['daemon', '--port', String(daemonPort)],
    {
      cwd: project,
      env,
      detached: true,
      stdio: 'ignore',
    }
  ),
  spawn(
    process.execPath,
    [join(repoRoot, 'scripts', 'serve-browser-example.mjs')],
    {
      cwd: repoRoot,
      env: { ...env, PORT: String(webPort) },
      detached: true,
      stdio: 'ignore',
    }
  ),
];

const results = [];
try {
  await Promise.all([
    waitForPort(daemonPort, 30_000, children[0]),
    waitForPort(webPort, 30_000, children[1]),
  ]);
  const browser = await chromium.launch();
  try {
    for (const example of EXAMPLES) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(String(error)));
      await page.goto(`http://127.0.0.1:${webPort}/`);
      await page.fill('#daemon-url', `ws://127.0.0.1:${daemonPort}`);
      await page.fill('#api-key', apiKey);
      await page.fill('#cwd', project);

      const started = Date.now();
      const selector = `button[data-example="${example.name}"]`;
      // The page disables the buttons inside the click handler and enables
      // them again when the example settles.
      await page.click(selector);
      let timedOut = false;
      await page
        .waitForFunction(
          (sel) => !document.querySelector(sel).disabled,
          selector,
          {
            timeout: 300_000,
            polling: 500,
          }
        )
        .catch(() => {
          timedOut = true;
        });
      await page.screenshot({
        path: join(out, `${example.name}.png`),
        fullPage: true,
      });

      const output = await page.locator('#output').innerText();
      const error = (await page.locator('#error').innerText()).trim();
      const failed = [
        ...(timedOut ? ['timed out'] : []),
        ...(error ? [`page error: ${error.split('\n')[0]}`] : []),
        ...example.expect
          .filter((re) => !re.test(output))
          .map((re) => `output lacks ${re}`),
      ];
      results.push({
        example: example.name,
        ok: failed.length === 0,
        seconds: (Date.now() - started) / 1000,
        failed,
        pageErrors,
      });
      await writeFile(
        join(out, `${example.name}.output.txt`),
        `${output}\n\n${error}`
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  for (const child of children) killTree(child);
}

const lines = [
  '| Browser example | Result | Time (s) | Failed checks |',
  '| --- | --- | --- | --- |',
];
for (const r of results) {
  lines.push(
    `| ${r.example} | ${r.ok ? 'pass' : 'FAIL'} | ${r.seconds.toFixed(1)} | ${r.failed.join('; ')} |`
  );
}
const report = `${lines.join('\n')}\n`;
await writeFile(join(out, 'browser-report.md'), report);
await writeFile(
  join(out, 'browser-results.json'),
  JSON.stringify(results, null, 2)
);
console.log(`Logs: ${out}\n\n${report}`);
process.exitCode =
  results.length === EXAMPLES.length && results.every((r) => r.ok) ? 0 : 1;
