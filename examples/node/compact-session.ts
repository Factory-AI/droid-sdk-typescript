/**
 * Compact session example.
 *
 * Builds up history over a few turns, then calls `compact()` to
 * summarize it into a new session.
 *
 * Usage:
 *   npx tsx examples/node/compact-session.ts
 */

import { createSession, DroidMessageType } from '@factory/droid-sdk/node';

async function streamText(
  activeSession: Awaited<ReturnType<typeof createSession>>,
  prompt: string
): Promise<string> {
  let text = '';
  for await (const msg of activeSession.stream(prompt)) {
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
  for (const prompt of [
    'Say "one" and nothing else',
    'Say "two" and nothing else',
    'Say "three" and nothing else',
  ]) {
    console.log(await streamText(session, prompt));
  }

  const { session: compacted, removedCount } = await session.compact();

  try {
    // `session` is now a retired wrapper. Its persisted ID can still be passed
    // to resumeSession() later if the uncompacted history is needed again.
    console.log(`\noriginal session: ${session.id}`);
    console.log(`compacted into:   ${compacted.id}`);
    console.log(`messages removed: ${removedCount}`);

    const continued = await streamText(
      compacted,
      'Which numbers did I ask you to say?'
    );
    console.log(`continued:        ${continued}`);
  } finally {
    await compacted.close();
  }
} finally {
  // Closes the active source, or does nothing if it was retired.
  await session.close();
}
