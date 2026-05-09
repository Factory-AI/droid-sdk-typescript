/**
 * Compact session example.
 *
 * Demonstrates `session.compactSession()` to summarize and compact
 * session history. Creates a session, sends several messages to build
 * up conversation history, then compacts and verifies newSessionId
 * and removedCount.
 *
 * Usage:
 *   npx tsx examples/test-compact.ts
 */

import { createSession, DroidMessageType } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const session = await createSession({ cwd: process.cwd() });
  try {
    console.log(`Session created: ${session.sessionId}\n`);

    const prompts = [
      'Say "one" and nothing else',
      'Say "two" and nothing else',
      'Say "three" and nothing else',
    ];

    for (let i = 0; i < prompts.length; i++) {
      console.log(`=== Turn ${i + 1} ===`);
      console.log(`Prompt: "${prompts[i]}"\n`);

      for await (const msg of (await session.send(prompts[i])).stream()) {
        if (msg.type === DroidMessageType.AssistantTextDelta) {
          process.stdout.write(msg.text);
        }
        if (msg.type === DroidMessageType.TurnComplete) {
          console.log('\n');
        }
      }
    }

    console.log('=== Compacting session ===');
    const compactResult = await session.compactSession({});
    console.log(`Original session: ${session.sessionId}`);
    console.log(`New session:      ${compactResult.newSessionId}`);
    console.log(`Removed messages: ${compactResult.removedCount}`);

    if (compactResult.newSessionId && compactResult.removedCount > 0) {
      console.log('\nCompaction succeeded.');
    } else {
      console.log('\nCompaction returned unexpected results.');
    }
  } finally {
    await session.close();
    console.log('Session closed.');
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
