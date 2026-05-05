/**
 * Spec mode: approve and hand off to a new session.
 *
 * The agent drafts a plan in spec mode. On approval with
 * ProceedNewSessionHigh, the server automatically creates a
 * fresh session and implements the plan. The results stream
 * back through the same query — no manual session creation needed.
 *
 * Usage:
 *   npx tsx examples/spec-mode-new-session.ts
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DroidMessageType,
  DroidInteractionMode,
  query,
  ReasoningEffort,
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from '../src/index.js';

const EXPECTED_CONTENT = 'Hello from Droid';

async function main(): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-spec-'));
  const outputPath = join(tempDir, 'hello-from-droid.txt');
  const prompt =
    `Plan how to create a small ${outputPath} file containing the text ` +
    '"Hello from Droid". Keep the plan short and concrete.';

  console.log('=== Spec Mode: New Session Handoff ===\n');

  try {
    let toolError: string | null = null;

    const stream = query({
      prompt,
      cwd: process.cwd(),
      interactionMode: DroidInteractionMode.Spec,
      specModeReasoningEffort: ReasoningEffort.High,
      permissionHandler(params) {
        const exitSpec = params.toolUses.find(
          (item) => item.details.type === ToolConfirmationType.ExitSpecMode
        );

        if (exitSpec?.details.type === ToolConfirmationType.ExitSpecMode) {
          console.log(
            '\n--- Plan received, approving with new session handoff ---'
          );
          console.log(exitSpec.details.plan);
          console.log('---\n');

          // The server creates a fresh session and implements the plan.
          // Results continue streaming through this same query.
          return ToolConfirmationOutcome.ProceedNewSessionHigh;
        }

        const onlyAllowedCreate = params.toolUses.every(
          (item) =>
            item.details.type === ToolConfirmationType.Create &&
            item.details.filePath === outputPath
        );

        return onlyAllowedCreate
          ? ToolConfirmationOutcome.ProceedOnce
          : ToolConfirmationOutcome.Cancel;
      },
    });

    for await (const msg of stream) {
      switch (msg.type) {
        case DroidMessageType.AssistantTextDelta:
          process.stdout.write(msg.text);
          break;
        case DroidMessageType.ToolUse:
          console.log(`\n[Tool] ${msg.toolName}`);
          break;
        case DroidMessageType.ToolResult:
          if (msg.isError) {
            toolError = JSON.stringify(msg.content);
          }
          console.log(`[Tool Result] ${msg.isError ? 'Error' : 'OK'}`);
          break;
        case DroidMessageType.TurnComplete:
          console.log('\n\n--- Turn complete ---');
          if (msg.tokenUsage) {
            console.log(
              `Tokens — input: ${msg.tokenUsage.inputTokens}, output: ${msg.tokenUsage.outputTokens}`
            );
          }
          break;
      }
    }

    if (toolError) {
      throw new Error(
        `Tool failed during spec-mode implementation: ${toolError}`
      );
    }

    const content = await readFile(outputPath, 'utf8');
    if (content.trim() !== EXPECTED_CONTENT) {
      throw new Error(
        `Expected ${outputPath} to contain ${JSON.stringify(EXPECTED_CONTENT)}, got ${JSON.stringify(content)}`
      );
    }

    console.log(`\nVerified ${outputPath}.`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
