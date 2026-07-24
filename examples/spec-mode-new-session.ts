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
import { join } from 'node:path';

import {
  DroidInteractionMode,
  ReasoningEffort,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  createSession,
} from '@factory/droid-sdk';

const tempDir = await mkdtemp(join(process.cwd(), '.droid-sdk-spec-'));
const outputPath = join(tempDir, 'hello.txt');

async function waitForFile(path: string, timeoutMs = 120_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        throw error;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Timed out waiting for ${path}`);
}

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

    console.log(await waitForFile(outputPath));
  } catch (error) {
    console.error(
      `Expected ${outputPath} to exist after the turn, but it was not ` +
        `created: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  } finally {
    await session.close();
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
