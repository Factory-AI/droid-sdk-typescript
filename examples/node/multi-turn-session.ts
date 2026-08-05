/**
 * Multi-turn session example.
 *
 * Sends two prompts over one session so the second turn can build on the
 * context established by the first.
 *
 * Usage:
 *   npx tsx examples/node/multi-turn-session.ts
 */

import { DroidMessageType, createSession } from '@factory/droid-sdk/node';

async function streamText(
  session: Awaited<ReturnType<typeof createSession>>,
  prompt: string
): Promise<string> {
  let text = '';
  for await (const msg of session.stream(prompt)) {
    if (msg.type === DroidMessageType.Assistant) {
      text += msg.text;
    }
  }
  return text;
}

const session = await createSession();

try {
  console.log(await streamText(session, 'What is this project?'));
  console.log(`\n${await streamText(session, 'What should I test first?')}`);
} finally {
  await session.close();
}
