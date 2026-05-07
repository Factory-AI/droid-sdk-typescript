/**
 * Spec mode: approve and implement in the same session.
 *
 * Usage:
 *   npx tsx examples/spec-mode-same-session.ts
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
      const onlyEditsTempFile = params.toolUses.every(
        (item) =>
          item.details.type === ToolConfirmationType.ApplyPatch &&
          item.details.filePath === outputPath
      );
      const onlyRunsTempCommand = params.toolUses.every(
        (item) =>
          item.details.type === ToolConfirmationType.Execute &&
          item.details.fullCommand.includes(outputPath) &&
          item.details.fullCommand.includes(tempDir)
      );

      return canExitSpec ||
        onlyCreatesFile ||
        onlyEditsTempFile ||
        onlyRunsTempCommand
        ? ToolConfirmationOutcome.ProceedOnce
        : ToolConfirmationOutcome.Cancel;
    },
  });

  for await (const _msg of stream) {
    // Consume the stream until implementation finishes.
  }

  console.log(await readFile(outputPath, 'utf8'));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
