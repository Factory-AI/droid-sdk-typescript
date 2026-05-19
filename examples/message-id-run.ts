/**
 * Manual smoke test for `run(prompt, { messageId })`.
 *
 * Usage:
 *   npx tsx examples/message-id-run.ts
 *   npx tsx examples/message-id-run.ts "Reply with exactly: RUN_OK"
 */

import { randomUUID } from 'node:crypto';

import { DroidMessageType, run } from '../src/index.js';

async function main(): Promise<void> {
  const prompt =
    process.argv.slice(2).join(' ') || 'Reply with exactly: RUN_OK';
  const messageId = `sdk-run-${randomUUID()}`;

  const result = await run(prompt, {
    cwd: process.cwd(),
    messageId,
  });
  const userMessage = result.messages.find(
    (msg) => msg.type === DroidMessageType.User
  );
  const observedUserMessageId = userMessage?.message.id;

  if (observedUserMessageId !== messageId) {
    throw new Error(
      `Expected user messageId ${messageId}, got ${observedUserMessageId ?? 'none'}`
    );
  }

  console.log(
    JSON.stringify({
      api: 'run',
      sessionId: result.sessionId,
      messageId,
      observedUserMessageId,
      text: result.text,
    })
  );
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
