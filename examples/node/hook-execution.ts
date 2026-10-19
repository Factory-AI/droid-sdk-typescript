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
  ToolConfirmationType,
  createSession,
} from '@factory/droid-sdk/node';

const hookCommand = 'echo hook-from-sdk-example';
const hookSettings = {
  hooksDisabled: false,
  PreToolUse: [
    {
      matcher: 'Execute',
      hooks: [{ type: 'command', command: hookCommand }],
    },
  ],
};

const projectDir = await mkdtemp(join(tmpdir(), 'droid-sdk-hook-project-'));

let hookCompleted = false;
const expectedCommand = 'echo hello';

try {
  await mkdir(join(projectDir, '.factory'), { recursive: true });
  await writeFile(
    join(projectDir, '.factory', 'hooks.json'),
    JSON.stringify(hookSettings, null, 2)
  );

  const session = await createSession({
    cwd: projectDir,
    permissionHandler({ toolUses, options }) {
      const [toolUse] = toolUses;
      const approvesExpectedCommand =
        toolUses.length === 1 &&
        toolUse?.details.type === ToolConfirmationType.Execute &&
        toolUse.details.fullCommand === expectedCommand;
      const desired = approvesExpectedCommand
        ? ToolConfirmationOutcome.ProceedOnce
        : ToolConfirmationOutcome.Cancel;

      if (!options.some((option) => option.value === desired)) {
        throw new Error(`Outcome not offered: ${desired}`);
      }
      return desired;
    },
  });

  try {
    for await (const message of session.stream(
      `Run the shell command \`${expectedCommand}\` using the Execute tool.`
    )) {
      if (message.type === DroidMessageType.Result && !message.success) {
        throw new Error(
          message.error?.message ?? `Turn ended: ${message.subtype}`
        );
      }
      if (message.type === DroidMessageType.Hook) {
        if (message.command === hookCommand && message.status !== 'started') {
          if (message.exitCode !== 0) {
            throw new Error(`Example hook failed: ${String(message.exitCode)}`);
          }
          hookCompleted = true;
        }
        if (message.status === 'started') {
          console.log(
            `[hook started] ${message.eventName}: ${message.command}`
          );
        } else {
          console.log(
            `[hook ${message.status}] exit code ${String(message.exitCode)}: ${(message.stdout ?? '').trim()}`
          );
        }
      }
    }
  } finally {
    await session.close();
  }
} finally {
  await rm(projectDir, { recursive: true, force: true });
}

// User-level hooks do not prove that this example's hook ran.
if (!hookCompleted) {
  throw new Error(
    'The example PreToolUse hook did not complete successfully. ' +
      'Check that Droid called Execute and that the SDK supports the CLI protocol.'
  );
}
