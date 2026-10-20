/**
 * Compact session example.
 *
 * Builds up history over a few turns, calls `compact()` to summarize it,
 * then asks about the earlier turns.
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
    // Current Droid compacts in place and keeps this handle active.
    // Use handoff() when you want a new session with a summary.
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
  } finally {
    await compacted.close();
  }
} finally {
  // Closes the active source, or does nothing if it was retired.
  await session.close();
}
