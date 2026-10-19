/**
 * Enter spec mode on a live session.
 *
 * The other spec-mode examples start the session in spec mode. This one starts
 * in Auto mode and switches mid-session with `enterSpecMode()`, which is what a
 * host app does when the user toggles spec mode on an open conversation.
 *
 * The permission handler prints the proposed plan (`ExitSpecMode`), approves
 * it, and lets implementation run in the same session.
 *
 * Usage:
 *   npx tsx examples/node/enter-spec-mode.ts
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type ClientPermissionHandler,
  DroidInteractionMode,
  DroidMessageType,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  createSession,
} from '@factory/droid-sdk/node';

const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-enter-spec-'));
const outputPath = join(tempDir, 'hello.txt');

const handlePermissionRequest: ClientPermissionHandler = ({
  toolUses,
  options,
}) => {
  for (const toolUse of toolUses) {
    if (toolUse.details.type === ToolConfirmationType.ExitSpecMode) {
      console.log(toolUse.details.plan);
    }
  }

  // This example approves every call to keep the focus on spec mode. See
  // permission-handler.ts for a handler that approves only expected calls.
  const outcome = ToolConfirmationOutcome.ProceedOnce;
  if (!options.some((option) => option.value === outcome)) {
    throw new Error(`Outcome not offered: ${outcome}`);
  }
  return outcome;
};

try {
  const session = await createSession({
    cwd: tempDir,
    interactionMode: DroidInteractionMode.Auto,
    permissionHandler: handlePermissionRequest,
  });

  try {
    await session.enterSpecMode();

    for await (const message of session.stream(
      `Create ${outputPath} containing "hello".`
    )) {
      if (message.type === DroidMessageType.Result && !message.success) {
        throw new Error(
          message.error?.message ?? `Turn ended: ${message.subtype}`
        );
      }
    }
  } finally {
    await session.close();
  }

  console.log(await readFile(outputPath, 'utf8'));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
