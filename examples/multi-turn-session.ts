/**
 * Multi-turn session example.
 *
 * Demonstrates context retention across turns: the first turn states a
 * fact, the second turn asks for it back. Runs in a temporary
 * directory so nothing touches your project.
 *
 * Usage:
 *   npx tsx examples/multi-turn-session.ts
 *
 * Requirements: droid CLI installed and logged in. FACTORY_API_KEY is
 * optional; stored CLI credentials are used when it is unset.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DroidMessageType, createSession } from '@factory/droid-sdk';

async function streamText(
  session: Awaited<ReturnType<typeof createSession>>,
  prompt: string
): Promise<string> {
  let text = '';
  for await (const msg of session.stream(prompt, {
    includePartialMessages: true,
  })) {
    if (msg.type === DroidMessageType.AssistantTextDelta) {
      text += msg.text;
    }
  }
  return text;
}

const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-multi-turn-'));
const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: tempDir,
});

try {
  console.log(`Session: ${session.sessionId}\n`);

  const first = await streamText(
    session,
    'My favorite color is teal. Acknowledge in one short sentence.'
  );
  console.log(first);

  const second = await streamText(
    session,
    'What is my favorite color? Answer in one short sentence.'
  );
  console.log('\n', second);
} finally {
  await session.close();
  await rm(tempDir, { recursive: true, force: true });
}
