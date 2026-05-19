/**
 * Manual smoke test for `session.stream(prompt, { messageId })`.
 *
 * Usage:
 *   npx tsx examples/message-id-stream.ts
 *   npx tsx examples/message-id-stream.ts "Reply with exactly: STREAM_OK"
 */

import { randomUUID } from 'node:crypto';

import { DroidMessageType, createSession } from '../src/index.js';

async function main(): Promise<void> {
  const prompt =
    process.argv.slice(2).join(' ') || 'Reply with exactly: STREAM_OK';
  const messageId = `sdk-stream-${randomUUID()}`;
  const session = await createSession({ cwd: process.cwd() });

  try {
    let observedUserMessageId: string | undefined;
    let text = '';

    for await (const msg of session.stream(prompt, { messageId })) {
      if (msg.type === DroidMessageType.User) {
        observedUserMessageId = msg.message.id;
      } else if (msg.type === DroidMessageType.Assistant) {
        text += msg.text;
      } else if (msg.type === DroidMessageType.Result && text.length === 0) {
        text = msg.text;
      }
    }

    if (observedUserMessageId !== messageId) {
      throw new Error(
        `Expected user messageId ${messageId}, got ${observedUserMessageId ?? 'none'}`
      );
    }

    console.log(
      JSON.stringify({
        api: 'session.stream',
        sessionId: session.sessionId,
        messageId,
        observedUserMessageId,
        text,
      })
    );
  } finally {
    await session.close();
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
