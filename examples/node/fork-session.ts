/**
 * Fork session example.
 *
 * Establishes context in one session, forks it with `fork()`, then uses the
 * returned fork handle to show the copied context.
 *
 * Usage:
 *   npx tsx examples/node/fork-session.ts
 */

import { DroidMessageType, createSession } from '@factory/droid-sdk/node';

async function streamText(
  session: Awaited<ReturnType<typeof createSession>>,
  prompt: string
): Promise<string> {
  let text = '';
  for await (const msg of session.stream(prompt)) {
    if (msg.type === DroidMessageType.Assistant) {
      text += msg.text;
    }
    if (msg.type === DroidMessageType.Result && !msg.success) {
      throw new Error(msg.error?.message ?? `Turn ended: ${msg.subtype}`);
    }
  }
  if (!text.trim()) {
    throw new Error('The turn produced no assistant output.');
  }
  return text;
}

const session = await createSession();

try {
  await streamText(session, 'Remember this phrase exactly: mango sunrise');

  const fork = await session.fork();

  try {
    // `session` is now a retired wrapper. Its persisted ID can still be passed
    // to resumeSession() later if the original branch is needed again.
    console.log(`original session: ${session.id}`);
    console.log(`forked session:   ${fork.id}`);

    const recalled = await streamText(
      fork,
      'What phrase did I ask you to remember?'
    );
    console.log(`fork recalls:     ${recalled}`);
  } finally {
    await fork.close();
  }
} finally {
  // Closes the active source, or does nothing if it was retired.
  await session.close();
}
