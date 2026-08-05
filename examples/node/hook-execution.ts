/**
 * Hook execution example.
 *
 * Registers a PreToolUse hook for the `Execute` tool and prints the hook
 * lifecycle messages that arrive in the session stream.
 *
 * The hook lives in a throwaway project directory (`<tempdir>/.factory/hooks.json`)
 * that is passed as the session `cwd` and deleted afterwards, so running this
 * example never writes to your own `~/.factory` configuration. It does not
 * isolate you from it: hook lists are concatenated across settings levels
 * rather than replaced, so your own user-level `PreToolUse` hooks are appended
 * to the one below and fire during this run whenever their matcher matches.
 *
 * `hooksDisabled` resolves first-defined-wins across settings levels, so the
 * config below sets it explicitly rather than leaving it absent. An absent
 * value would inherit a global `"hooksDisabled": true` from `~/.factory` and
 * the hook would never run.
 *
 * See https://docs.factory.ai/cli/configuration/hooks-guide for the `/hooks`
 * slash command, the other events, and security guidance.
 *
 * Usage:
 *   npx tsx examples/node/hook-execution.ts
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DroidMessageType,
  ToolConfirmationOutcome,
  createSession,
} from '@factory/droid-sdk/node';

const hookSettings = {
  hooksDisabled: false,
  PreToolUse: [
    {
      matcher: 'Execute',
      hooks: [{ type: 'command', command: 'echo hook-from-sdk-example' }],
    },
  ],
};

const projectDir = await mkdtemp(join(tmpdir(), 'droid-sdk-hook-project-'));

let hookCount = 0;

try {
  await mkdir(join(projectDir, '.factory'), { recursive: true });
  await writeFile(
    join(projectDir, '.factory', 'hooks.json'),
    JSON.stringify(hookSettings, null, 2)
  );

  const session = await createSession({
    cwd: projectDir,
    permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
  });

  try {
    for await (const msg of session.stream(
      'Run the shell command `echo hello` using the Execute tool.'
    )) {
      if (msg.type !== DroidMessageType.Hook) {
        continue;
      }

      hookCount++;
      if (msg.status === 'started') {
        console.log(`[hook started] ${msg.eventName}: ${msg.command}`);
      } else {
        console.log(
          `[hook ${msg.status}] exit code ${String(msg.exitCode)}: ${(msg.stdout ?? '').trim()}`
        );
      }
    }
  } finally {
    await session.close();
  }
} finally {
  await rm(projectDir, { recursive: true, force: true });
}

// A silent zero-hook run would look identical to a passing one, so fail loudly.
if (hookCount === 0) {
  throw new Error(
    'No hook messages arrived: the registered PreToolUse hook never ran. ' +
      'The most likely cause is that the droid answered this turn without ' +
      'calling the Execute tool, so the `Execute` matcher never fired. ' +
      'Re-run, or widen the matcher to the tool the droid actually used.'
  );
}
