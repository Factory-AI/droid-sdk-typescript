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

const session = await createSession();

try {
  for (const prompt of [
    'Say "one" and nothing else',
    'Say "two" and nothing else',
    'Say "three" and nothing else',
  ]) {
    for await (const msg of session.stream(prompt)) {
      if (msg.type === DroidMessageType.Assistant) {
        console.log(msg.text);
      }
    }
  }

  const { session: compacted, removedCount } = await session.compact();

  // `session` is now a retired wrapper. Its persisted ID can still be passed
  // to resumeSession() later if the uncompacted history is needed again.
  console.log(`\noriginal session: ${session.id}`);
  console.log(`compacted into:   ${compacted.id}`);
  console.log(`messages removed: ${removedCount}`);

  for await (const msg of compacted.stream(
    'Which numbers did I ask you to say?'
  )) {
    if (msg.type === DroidMessageType.Assistant) {
      console.log(`continued:        ${msg.text}`);
    }
  }

  await compacted.close();
} finally {
  // Closes the active source, or does nothing if it was retired.
  await session.close();
}
