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

import {
  query,
  DroidInteractionMode,
  ReasoningEffort,
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from '../src/index.js';

const PROMPT =
  'Plan how to create a small hello-from-droid.txt file in the current directory containing the text "Hello from Droid". Keep the plan short and concrete.';

async function main(): Promise<void> {
  console.log('=== Spec Mode: New Session Handoff ===\n');

  const stream = query({
    prompt: PROMPT,
    cwd: process.cwd(),
    interactionMode: DroidInteractionMode.Spec,
    specModeReasoningEffort: ReasoningEffort.High,
    permissionHandler(params) {
      const exitSpec = params.toolUses.find(
        (t) => t.confirmationType === ToolConfirmationType.ExitSpecMode
      );

      if (exitSpec) {
        const details = exitSpec.details as { plan?: string };
        console.log(
          '\n--- Plan received, approving with new session handoff ---'
        );
        if (details.plan) {
          console.log(details.plan);
        }
        console.log('---\n');

        // The server creates a fresh session and implements the plan.
        // Results continue streaming through this same query.
        return ToolConfirmationOutcome.ProceedNewSessionHigh;
      }

      return ToolConfirmationOutcome.ProceedOnce;
    },
  });

  for await (const msg of stream) {
    switch (msg.type) {
      case 'assistant_text_delta':
        process.stdout.write(msg.text);
        break;
      case 'tool_use':
        console.log(`\n[Tool] ${msg.toolName}`);
        break;
      case 'tool_result':
        console.log(`[Tool Result] ${msg.isError ? 'Error' : 'OK'}`);
        break;
      case 'turn_complete':
        console.log('\n\n--- Turn complete ---');
        if (msg.tokenUsage) {
          console.log(
            `Tokens — input: ${msg.tokenUsage.inputTokens}, output: ${msg.tokenUsage.outputTokens}`
          );
        }
        break;
    }
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
