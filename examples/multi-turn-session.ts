/**
 * Multi-turn session example.
 *
 * Usage:
 *   npx tsx examples/multi-turn-session.ts
 */

import { createSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });

try {
  console.log(`Session: ${session.sessionId}\n`);

  const first = await session.send('What is this project?');
  console.log(first.text);

  const second = await session.send('What should I test first?');
  console.log('\n', second.text);
} finally {
  await session.close();
}
