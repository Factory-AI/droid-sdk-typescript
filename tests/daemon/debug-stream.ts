/**
 * Debug script to see what events come through stream().
 */
import * as fs from 'node:fs';

import { connectDaemon, AutonomyLevel, type DroidStreamEvent } from '../../src/index.js';

const TEST_CWD = '/tmp/daemon-sdk-stress-test';
fs.mkdirSync(TEST_CWD, { recursive: true });

async function main() {
  const conn = await connectDaemon();
  const session = await conn.createSession({
    cwd: TEST_CWD,
    autonomyLevel: AutonomyLevel.High,
  });

  console.log('Session:', session.sessionId);
  console.log('Streaming...\n');

  // Also subscribe to raw notifications
  session.onNotification((n) => {
    const params = n['params'] as Record<string, unknown> | undefined;
    const notification = params?.['notification'] as Record<string, unknown> | undefined;
    if (notification) {
      console.log('RAW NOTIFICATION:', JSON.stringify(notification).substring(0, 300));
    }
  });

  const events: DroidStreamEvent[] = [];
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 60_000);

  try {
    for await (const event of session.stream(
      'Reply with exactly "HELLO_WORLD" and nothing else. Do not use any tools.',
      { abortSignal: ac.signal, includePartialMessages: true }
    )) {
      events.push(event);
      console.log('EVENT:', JSON.stringify(event).substring(0, 300));
    }
  } finally {
    clearTimeout(timeout);
  }

  console.log(`\nTotal events: ${events.length}`);
  console.log('Event types:', events.map((e) => e.type));

  await session.close();
  await conn.close();
}

main().catch(console.error);
