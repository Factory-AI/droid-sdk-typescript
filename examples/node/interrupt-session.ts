/**
 * Interrupt a running turn.
 *
 * Calls `session.interrupt()` partway through streaming. Unlike
 * abort-session-stream.ts, this stops the turn server-side and leaves the
 * session usable for another prompt.
 *
 * Usage:
 *   npx tsx examples/node/interrupt-session.ts
 */

import { createSession, DroidMessageType } from '@factory/droid-sdk/node';

const session = await createSession();
let deltaCount = 0;

try {
  for await (const msg of session.stream('Write a long history of computing.', {
    includePartialMessages: true,
  })) {
    if (msg.type !== DroidMessageType.AssistantTextDelta) {
      continue;
    }

    process.stdout.write(msg.text);
    deltaCount++;

    if (deltaCount === 5) {
      await session.interrupt();
    }
  }

  console.log('\nInterrupted turn.');
} finally {
  await session.close();
}
