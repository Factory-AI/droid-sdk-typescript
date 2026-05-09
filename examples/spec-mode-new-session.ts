/**
 * Spec mode: approve and hand off implementation to a new session.
 *
 * Usage:
 *   npx tsx examples/spec-mode-new-session.ts
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DroidInteractionMode,
  ReasoningEffort,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  createSession,
} from '@factory/droid-sdk';

const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-spec-'));
const outputPath = join(tempDir, 'hello.txt');

try {
  const session = await createSession({
    cwd: process.cwd(),
    interactionMode: DroidInteractionMode.Spec,
    specModeReasoningEffort: ReasoningEffort.High,
    permissionHandler(params) {
      const canExitSpec = params.toolUses.some(
        (item) => item.details.type === ToolConfirmationType.ExitSpecMode
      );
      const onlyCreatesFile = params.toolUses.every(
        (item) =>
          item.details.type === ToolConfirmationType.Create &&
          item.details.filePath === outputPath
      );

      if (canExitSpec) {
        return ToolConfirmationOutcome.ProceedNewSessionHigh;
      }
      return onlyCreatesFile
        ? ToolConfirmationOutcome.ProceedOnce
        : ToolConfirmationOutcome.Cancel;
    },
  });

  try {
    for await (const _msg of (
      await session.send(
        `Plan then create ${outputPath} containing "Hello from Droid".`
      )
    ).stream()) {
      // Consume the stream until the handoff implementation finishes.
    }
  } finally {
    await session.close();
  }

  console.log(await readFile(outputPath, 'utf8'));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
