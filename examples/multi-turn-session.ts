/**
 * Multi-turn session example.
 *
 * Demonstrates `createSession()` for a persistent session, multiple
 * `stream()` calls for streaming turns, `send()` for a non-streaming
 * turn, and `close()` for cleanup.
 *
 * Usage:
 *   npx tsx examples/multi-turn-session.ts
 */

import { createSession, DroidMessageType } from '../src/index.js';

async function main(): Promise<void> {
  const session = await createSession({ cwd: process.cwd() });
  try {
    console.log(`Session created: ${session.sessionId}\n`);

    console.log('=== Turn 1 (streaming) ===');
    console.log('Prompt: "List the TypeScript files in this project"\n');

    for await (const msg of session.stream(
      'List the TypeScript files in this project'
    )) {
      if (msg.type === DroidMessageType.AssistantTextDelta) {
        process.stdout.write(msg.text);
      }
      if (msg.type === DroidMessageType.TurnComplete) {
        console.log('\n');
      }
    }

    console.log('=== Turn 2 (streaming) ===');
    console.log('Prompt: "How many lines of code total?"\n');

    for await (const msg of session.stream('How many lines of code total?')) {
      if (msg.type === DroidMessageType.AssistantTextDelta) {
        process.stdout.write(msg.text);
      }
      if (msg.type === DroidMessageType.TurnComplete) {
        console.log('\n');
      }
    }

    console.log('=== Turn 3 (non-streaming) ===');
    console.log('Prompt: "Summarize the project in one sentence"\n');

    const result = await session.send('Summarize the project in one sentence');

    console.log('Response:', result.text);
    console.log(`Messages received: ${result.messages.length}`);
    if (result.tokenUsage) {
      console.log(
        `Tokens — input: ${result.tokenUsage.inputTokens}, ` +
          `output: ${result.tokenUsage.outputTokens}`
      );
    }
  } finally {
    await session.close();
    console.log('\nSession closed.');
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
