/**
 * Spec mode: approve and implement in the same session.
 *
 * Demonstrates starting a session in spec (planning) mode and answering
 * the ExitSpecMode confirmation with `ProceedOnce`, which implements
 * the plan in the same session. The permission handler approves any
 * tool call scoped to the temp directory and logs anything it cancels.
 *
 * Usage:
 *   npx tsx examples/spec-mode-same-session.ts
 *
 * Requirements: droid CLI installed and logged in. FACTORY_API_KEY is
 * optional; stored CLI credentials are used when it is unset.
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
  type ToolConfirmationDetails,
} from '@factory/droid-sdk';

const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-spec-'));
const outputPath = join(tempDir, 'hello.txt');

// Demo heuristic for keeping the example self-contained, not a
// security boundary.
function isScopedToTempDir(details: ToolConfirmationDetails): boolean {
  switch (details.type) {
    case ToolConfirmationType.ExitSpecMode:
      return true;
    case ToolConfirmationType.Create:
    case ToolConfirmationType.Edit:
    case ToolConfirmationType.ApplyPatch:
      return details.filePath.startsWith(tempDir);
    case ToolConfirmationType.Execute:
      return details.fullCommand.includes(tempDir);
    default:
      return false;
  }
}

try {
  const session = await createSession({
    apiKey: process.env.FACTORY_API_KEY!,
    cwd: process.cwd(),
    interactionMode: DroidInteractionMode.Spec,
    specModeReasoningEffort: ReasoningEffort.High,
    permissionHandler(params) {
      const rejected = params.toolUses.filter(
        (item) => !isScopedToTempDir(item.details)
      );

      if (rejected.length > 0) {
        for (const item of rejected) {
          console.log(
            `[Permission] Canceling unexpected tool request: ` +
              `${item.toolUse.name} (${item.details.type})`
          );
        }
        return ToolConfirmationOutcome.Cancel;
      }

      return ToolConfirmationOutcome.ProceedOnce;
    },
  });

  try {
    for await (const _msg of session.stream(
      `Plan then create ${outputPath} containing "Hello from Droid".`
    )) {
      // Consume the stream until implementation finishes.
    }
  } finally {
    await session.close();
  }

  try {
    console.log(await readFile(outputPath, 'utf8'));
  } catch {
    console.error(
      `Expected ${outputPath} to exist after the turn, but it was not ` +
        'created. Check the [Permission] log above for canceled tool calls.'
    );
    process.exitCode = 1;
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
