/**
 * Interrupt a running turn.
 *
 * Calls `session.interrupt()` 3 seconds into a turn, the way a host app does
 * when the user clicks Stop. Unlike abort-session-stream.ts, this stops the
 * turn server-side and leaves the session usable for another prompt, which
 * the example then sends.
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
let interruptRequested = false;
let result: DroidResultMessage | undefined;

const timer = setTimeout(() => {
  interruptRequested = true;
  session.interrupt().catch((error: unknown) => {
    console.error('interrupt() failed:', error);
  });
}, 3000);

try {
  for await (const msg of session.stream('Write a long history of computing.', {
    includePartialMessages: true,
  })) {
    if (msg.type === DroidMessageType.AssistantTextDelta) {
      process.stdout.write(msg.text);
    }
    if (msg.type === DroidMessageType.Result) {
      result = msg;
      if (!msg.success && !msg.interrupted) {
        throw new Error(msg.error?.message ?? `Turn ended: ${msg.subtype}`);
      }
    }
  }
  clearTimeout(timer);

  if (!result) {
    throw new Error('The stream ended without a result.');
  }
  if (!result.interrupted) {
    throw new Error(
      interruptRequested
        ? 'The turn completed before the interrupt took effect.'
        : 'The turn completed before an interrupt was requested.'
    );
  }
  console.log('\nTurn was interrupted.');

  // The interrupted session still accepts prompts.
  let reply = '';
  for await (const msg of session.stream('Reply with exactly: ready')) {
    if (msg.type === DroidMessageType.Assistant) reply += msg.text;
    if (msg.type === DroidMessageType.Result && !msg.success) {
      throw new Error(msg.error?.message ?? `Turn ended: ${msg.subtype}`);
    }
  }
  if (!/ready/i.test(reply)) {
    throw new Error(`Unexpected reply after the interrupt: ${reply}`);
  }
  console.log(`next turn: ${reply.trim()}`);
} finally {
  clearTimeout(timer);
  await session.close();
}
