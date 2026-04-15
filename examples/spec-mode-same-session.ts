/**
 * Spec mode: approve and implement in the same session.
 *
 * The agent drafts a plan in spec mode, then implements it
 * in the same query stream after approval.
 *
 * Usage:
 *   npx tsx examples/spec-mode-same-session.ts
 */

import {
  query,
  DroidInteractionMode,
  ReasoningEffort,
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from '../src/index.js';

const PROMPT =
  'Make a simple plan. It can be anything. Nothing fancy. It should be to add some kind of random comment to the code.';

async function main(): Promise<void> {
  console.log('=== Spec Mode: Same Session ===\n');

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
        console.log('\n--- Plan received, approving in same session ---');
        if (details.plan) {
          console.log(details.plan);
        }
        console.log('---\n');
        return ToolConfirmationOutcome.ProceedOnce;
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
