/**
 * Enter spec mode on a live session.
 *
 * The other spec-mode examples start the session in spec mode. This one starts
 * in the default mode and switches mid-session with `enterSpecMode()`, which is
 * what a host app does when the user toggles spec mode on an open conversation.
 *
 * The switch is observable in the confirmations Droid asks for: it proposes a
 * plan (`ExitSpecMode`) before touching the filesystem, instead of going
 * straight to `Create`.
 *
 * Usage:
 *   npx tsx examples/node/enter-spec-mode.ts
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ToolConfirmationOutcome,
  ToolConfirmationType,
  createSession,
} from '@factory/droid-sdk/node';

const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-enter-spec-'));
const outputPath = join(tempDir, 'hello.txt');

try {
  const session = await createSession({
    permissionHandler(params) {
      for (const toolUse of params.toolUses) {
        const label =
          toolUse.details.type === ToolConfirmationType.ExitSpecMode
            ? 'plan proposed'
            : 'implementing';
        console.log(`[${label}] ${toolUse.details.type}`);
      }
      // Approving ExitSpecMode accepts the plan and lets implementation run.
      return ToolConfirmationOutcome.ProceedOnce;
    },
  });

  try {
    console.log(
      `mode at creation: ${String(session.settings.interactionMode)}`
    );

    await session.enterSpecMode();
    console.log('switched to spec mode\n');

    for await (const _msg of session.stream(
      `Create ${outputPath} containing "hello".`
    )) {
      // Consume the stream until the plan is approved and implemented.
    }
  } finally {
    await session.close();
  }

  console.log(
    `\nfile contents: ${JSON.stringify(await readFile(outputPath, 'utf8'))}`
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
