/**
 * Compact session example.
 *
 * Builds up history over a few turns, calls `compact()` to summarize it,
 * then checks that the compacted session still knows the earlier turns.
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
    // Droid can compact in place. Then compact() returns the same handle and
    // `session` stays active. Otherwise `session` is a retired wrapper, and
    // resumeSession(session.id) still loads the uncompacted history.
    const inPlace = compacted === session;
    console.log(`\noriginal session: ${session.id}`);
    console.log(
      `compacted into:   ${compacted.id}${inPlace ? ' (in place)' : ''}`
    );
    console.log(`messages removed: ${removedCount}`);

    const continued = await streamText(
      compacted,
      'Which numbers did I ask you to say?'
    );
    console.log(`continued:        ${continued}`);
    const missing = ['one', 'two', 'three'].filter(
      (word) => !continued.toLowerCase().includes(word)
    );
    if (missing.length > 0) {
      throw new Error(`The compacted session forgot: ${missing.join(', ')}`);
    }
  } finally {
    await compacted.close();
  }
} finally {
  // Closes the active source, or does nothing if it was retired.
  await session.close();
}
