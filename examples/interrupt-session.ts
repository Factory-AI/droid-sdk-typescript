/**
 * Interrupt session example.
 *
 * Demonstrates using `session.interrupt()` to stop the agent mid-turn.
 * Starts a streaming turn with a long-running prompt, waits for a few
 * `AssistantTextDelta` messages, then sends an interrupt and continues
 * consuming the stream until `TurnComplete`.
 *
 * Usage:
 *   npx tsx examples/interrupt-session.ts
 */

import { createSession } from '../src/index.js';

async function main(): Promise<void> {
  // Create a new session
  const session = await createSession({ cwd: process.cwd() });
  console.log(`Session created: ${session.sessionId}\n`);

  // Start a streaming turn with a long-running prompt
  const prompt =
    'Write a detailed essay about the history of computing, from the ' +
    'earliest mechanical calculators to modern quantum computers.';
  console.log(`Prompt: "${prompt}"\n`);

  let deltaCount = 0;
  let interrupted = false;

  for await (const msg of session.stream(prompt)) {
    switch (msg.type) {
      case 'assistant_text_delta':
        deltaCount++;
        process.stdout.write(msg.text);

        // After receiving 5 text deltas, send an interrupt
        if (deltaCount === 5 && !interrupted) {
          interrupted = true;
          console.log('\n\n>>> Sending interrupt after 5 text deltas...\n');
          await session.interrupt();
        }
        break;

      case 'turn_complete':
        console.log('\n\n--- Turn complete ---');
        console.log(`Total text deltas received: ${deltaCount}`);
        console.log(
          interrupted
            ? 'Session was interrupted successfully.'
            : 'Session completed without interruption.'
        );
        if (msg.tokenUsage) {
          console.log(
            `Tokens — input: ${msg.tokenUsage.inputTokens}, ` +
              `output: ${msg.tokenUsage.outputTokens}`
          );
        }
        break;
    }
  }

  // Cleanup
  await session.close();
  console.log('\nSession closed.');
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
