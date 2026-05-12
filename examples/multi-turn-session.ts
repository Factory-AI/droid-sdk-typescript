/**
 * Multi-turn session example.
 *
 * Usage:
 *   npx tsx examples/multi-turn-session.ts
 */

import { DroidMessageType, createSession } from '@factory/droid-sdk';

async function streamText(
  session: Awaited<ReturnType<typeof createSession>>,
  prompt: string
): Promise<string> {
  let text = '';
  for await (const msg of session.stream(prompt)) {
    if (msg.type === DroidMessageType.AssistantTextDelta) {
      text += msg.text;
    }
  }
  return text;
}

const session = await createSession({ cwd: process.cwd() });

try {
  console.log(`Session: ${session.sessionId}\n`);

  const first = await streamText(session, 'What is this project?');
  console.log(first);

  const second = await streamText(session, 'What should I test first?');
  console.log('\n', second);
} finally {
  await session.close();
}
