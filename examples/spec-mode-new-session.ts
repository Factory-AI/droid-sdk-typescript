/**
 * Spec mode: approve and hand off implementation to a new session.
 *
 * Demonstrates starting a session in spec (planning) mode and answering
 * the ExitSpecMode confirmation with `ProceedNewSessionHigh`, which
 * implements the plan in a fresh session.
 *
 * Usage:
 *   npx tsx examples/spec-mode-new-session.ts
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
} from '@factory/droid-sdk';

const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-spec-'));
const outputPath = join(tempDir, 'hello.txt');

try {
  const session = await createSession({
    apiKey: process.env.FACTORY_API_KEY!,
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
    for await (const _msg of session.stream(
      `Plan then create ${outputPath} containing "Hello from Droid".`
    )) {
      // Consume the stream until the handoff implementation finishes.
    }
  } finally {
    await session.close();
  }

  try {
    console.log(await readFile(outputPath, 'utf8'));
  } catch {
    console.error(
      `Expected ${outputPath} to exist after the turn, but it was not ` +
        'created.'
    );
    process.exitCode = 1;
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
