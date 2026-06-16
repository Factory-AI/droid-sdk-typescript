/**
 * Interrupt a running turn.
 *
 * Demonstrates `session.interrupt()`: requests the interrupt after the
 * fifth streamed text delta. Because the interrupt is asynchronous, a
 * few more deltas may arrive before the turn actually stops.
 *
 * Usage:
 *   npx tsx examples/interrupt-session.ts
 *
 * Requirements: droid CLI installed and logged in. FACTORY_API_KEY is
 * optional; stored CLI credentials are used when it is unset.
 */

import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});
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
      // Asynchronous: the stream may deliver a few more deltas before
      // the interrupt takes effect.
      await session.interrupt();
    }
  }

  console.log('\nInterrupted turn.');
} finally {
  await session.close();
}
