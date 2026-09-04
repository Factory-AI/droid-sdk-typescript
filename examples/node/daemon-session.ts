/**
 * Connect to a running Droid daemon with a Factory API key and stream one turn.
 *
 * Usage:
 *   FACTORY_API_KEY=... npx tsx examples/node/daemon-session.ts
 *
 * Optional:
 *   DROID_DAEMON_URL=ws://127.0.0.1:37643 DROID_SESSION_CWD=/path/to/repo
 */

import { connectToDaemon, DroidMessageType } from '@factory/droid-sdk';

const apiKey = process.env.FACTORY_API_KEY;
if (!apiKey) {
  throw new Error('Set FACTORY_API_KEY.');
}

const droid = await connectToDaemon({
  url: process.env.DROID_DAEMON_URL ?? 'ws://127.0.0.1:37643',
  auth: { apiKey },
});

const session = await droid.sessions.create({
  cwd: process.env.DROID_SESSION_CWD ?? process.cwd(),
});

try {
  for await (const message of session.stream('Summarize this repository.')) {
    if (message.type === DroidMessageType.Assistant) {
      process.stdout.write(message.text);
    }
  }
} finally {
  await session.close();
  droid.disconnect();
}
