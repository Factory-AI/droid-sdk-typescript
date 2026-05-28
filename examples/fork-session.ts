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

import {
  DroidMessageType,
  createSession,
  resumeSession,
} from '@factory/droid-sdk';

async function streamText(
  session: Awaited<ReturnType<typeof createSession>>,
  prompt: string
): Promise<string> {
  let text = '';
  for await (const msg of session.stream(prompt, {
    includePartialMessages: true,
  })) {
    if (msg.type === DroidMessageType.AssistantTextDelta) {
      text += msg.text;
    }
  }
  return text;
}

async function main(): Promise<void> {
  const session = await createSession({
    apiKey: process.env.FACTORY_API_KEY!,
    cwd: process.cwd(),
  });
  let fork: Awaited<ReturnType<typeof resumeSession>> | null = null;

  try {
    console.log(`Original session: ${session.sessionId}\n`);
    await streamText(session, 'Remember this phrase exactly: mango sunrise');

    const { newSessionId } = await session.forkSession();
    console.log(`Forked session:   ${newSessionId}\n`);

    fork = await resumeSession(newSessionId, {
      apiKey: process.env.FACTORY_API_KEY!,
    });

    const result = await streamText(
      fork,
      'What phrase did I ask you to remember?'
    );
    console.log('Fork response:');
    console.log(result);
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
