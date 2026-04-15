/**
 * Fork session example.
 *
 * Demonstrates `session.forkSession()` to create a copy of an active
 * session. Creates a session, sends a message, forks, and verifies
 * that a new session ID is returned.
 *
 * Usage:
 *   npx tsx examples/test-fork.ts
 */

import { createSession } from '../src/index.js';

async function main(): Promise<void> {
  const session = await createSession({ cwd: process.cwd() });
  console.log(`Session created: ${session.sessionId}\n`);

  console.log('=== Sending message ===');
  console.log('Prompt: "Say hello and nothing else"\n');

  for await (const msg of session.stream('Say hello and nothing else')) {
    if (msg.type === 'assistant_text_delta') {
      process.stdout.write(msg.text);
    }
    if (msg.type === 'turn_complete') {
      console.log('\n');
    }
  }

  console.log('=== Forking session ===');
  const forkResult = await session.forkSession();
  console.log(`Original session: ${session.sessionId}`);
  console.log(`Forked session:   ${forkResult.newSessionId}`);

  if (
    forkResult.newSessionId &&
    forkResult.newSessionId !== session.sessionId
  ) {
    console.log('\nFork succeeded — new session ID returned.');
  } else {
    console.log('\nFork failed — unexpected result.');
  }

  await session.close();
  console.log('Session closed.');
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
