/**
 * Fork session example.
 *
 * Demonstrates:
 * - creating a session and establishing some context
 * - calling `forkSession()` to get a new server-side session ID
 * - resuming the fork and continuing from the copied context
 *
 * Usage:
 *   npx tsx examples/fork-session.ts
 */

import { createSession, resumeSession } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const session = await createSession({ cwd: process.cwd() });
  let fork: Awaited<ReturnType<typeof resumeSession>> | null = null;

  try {
    console.log(`Original session: ${session.sessionId}\n`);

    await session.send('Remember this phrase exactly: mango sunrise');

    const { newSessionId } = await session.forkSession();
    console.log(`Forked session:   ${newSessionId}\n`);

    fork = await resumeSession(newSessionId, { cwd: process.cwd() });

    const result = await fork.send('What phrase did I ask you to remember?');
    console.log('Fork response:');
    console.log(result.text);
  } finally {
    await fork?.close();
    await session.close();
    console.log('\nBoth sessions closed.');
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
