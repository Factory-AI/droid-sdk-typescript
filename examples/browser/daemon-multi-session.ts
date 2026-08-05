/**
 * Creates two sessions concurrently over one daemon connection.
 *
 * Bundle this file with `platform: 'browser'`, serve it with index.html, and
 * click "Run two sessions".
 * Never commit a real API key or deploy it in browser code.
 */

import { connectToDaemon } from '@factory/droid-sdk';

import { readConfig, report, requireConfigValue } from './config.js';

const config = readConfig();
const daemonUrl = config.daemonUrl ?? 'ws://127.0.0.1:37643';
const apiKey = requireConfigValue(config.apiKey, 'apiKey');
const cwd = requireConfigValue(config.cwd, 'cwd');

report('status', `Connecting to ${daemonUrl}`);
const droid = await connectToDaemon({
  url: daemonUrl,
  auth: { apiKey },
});

const results = await Promise.allSettled([
  droid.sessions.create({ cwd }),
  droid.sessions.create({ cwd }),
]);
const sessions = results.flatMap((result) =>
  result.status === 'fulfilled' ? [result.value] : []
);

try {
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;

  const [first, second] = sessions;
  if (!first || !second) {
    throw new Error('Expected two daemon sessions.');
  }

  report('first session', first.id);
  report('second session', second.id);
  report('status', 'Both sessions were created successfully.');
} finally {
  await Promise.allSettled(sessions.map((session) => session.close()));
  droid.disconnect();
}
