/**
 * Manual smoke test for `session.send(..., { onMessage })`.
 *
 * Streams assistant text live through `onMessage`, then verifies the final
 * aggregated `DroidResult.text` matches the streamed text.
 *
 * Usage:
 *   npx tsx examples/send-on-message.ts
 *   npx tsx examples/send-on-message.ts "Summarize this repository"
 */

import { createSession, DroidMessageType } from '../src/index.js';

async function main(): Promise<void> {
  const prompt =
    process.argv.slice(2).join(' ') ||
    'Reply with exactly: send onMessage smoke test passed';

  const session = await createSession({ cwd: process.cwd() });
  const streamedTextParts: string[] = [];
  const messageTypes: string[] = [];

  try {
    console.log(`Session created: ${session.sessionId}`);
    console.log(`Prompt: ${prompt}\n`);
    console.log('=== Live stream ===');

    const result = await session.send(prompt, {
      onMessage(message) {
        messageTypes.push(message.type);

        if (message.type === DroidMessageType.AssistantTextDelta) {
          streamedTextParts.push(message.text);
          process.stdout.write(message.text);
        }
      },
    });

    const streamedText = streamedTextParts.join('');

    console.log('\n\n=== Final result ===');
    console.log(result.text);
    console.log(`Messages received: ${result.messages.length}`);
    console.log(`Message types: ${messageTypes.join(', ')}`);

    if (result.tokenUsage) {
      console.log(
        `Tokens — input: ${result.tokenUsage.inputTokens}, ` +
          `output: ${result.tokenUsage.outputTokens}`
      );
    }

    if (streamedText !== result.text) {
      throw new Error(
        `Streamed text did not match result.text.\n` +
          `Streamed: ${JSON.stringify(streamedText)}\n` +
          `Result: ${JSON.stringify(result.text)}`
      );
    }

    console.log('\nSmoke test passed: streamed text matches result.text.');
  } finally {
    await session.close();
    console.log('Session closed.');
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
