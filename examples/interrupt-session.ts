/**
 * Interrupt a running turn.
 *
 * Usage:
 *   npx tsx examples/interrupt-session.ts
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
      await session.interrupt();
    }
  }

  console.log('\nInterrupted turn.');
} finally {
  await session.close();
}
