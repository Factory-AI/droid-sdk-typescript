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
  query,
} from '@factory/droid-sdk';

const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-spec-'));
const outputPath = join(tempDir, 'hello.txt');

try {
  const stream = query({
    prompt: `Plan then create ${outputPath} containing "Hello from Droid".`,
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

  for await (const _msg of stream) {
    // Consume the stream until the handoff implementation finishes.
  }

  console.log(await readFile(outputPath, 'utf8'));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
