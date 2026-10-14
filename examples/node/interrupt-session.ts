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

import {
  type DroidResultMessage,
  createSession,
  DroidMessageType,
} from '@factory/droid-sdk/node';

const session = await createSession();
let deltaCount = 0;
let result: DroidResultMessage | undefined;

try {
  for await (const msg of session.stream('Write a long history of computing.', {
    includePartialMessages: true,
  })) {
    if (msg.type === DroidMessageType.Result) {
      result = msg;
      if (!msg.success && !msg.interrupted) {
        throw new Error(msg.error?.message ?? `Turn ended: ${msg.subtype}`);
      }
    }

    if (msg.type === DroidMessageType.AssistantTextDelta) {
      process.stdout.write(msg.text);
      deltaCount++;

      if (deltaCount === 5) {
        await session.interrupt();
      }
    }
  }

  if (!result) {
    throw new Error('The stream ended without a result.');
  }
  if (result.interrupted) {
    console.log('\nTurn was interrupted.');
  } else if (deltaCount >= 5) {
    console.log('\nThe turn completed before the interrupt took effect.');
  } else {
    console.log('\nThe turn completed before an interrupt was requested.');
  }
} finally {
  await session.close();
}
