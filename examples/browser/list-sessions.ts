/**
 * Lists recent daemon sessions and their messages.
 *
 * Bundle this file with `platform: 'browser'`, serve it with index.html, and
 * click "List sessions".
 * Never commit a real API key or deploy it in browser code.
 */

import { connectToDaemon } from '@factory/droid-sdk';

import { readConfig, report, requireConfigValue } from './config.js';

const config = readConfig();
const daemonUrl = config.daemonUrl ?? 'ws://127.0.0.1:37643';
const apiKey = requireConfigValue(config.apiKey, 'apiKey');

report('status', `Connecting to ${daemonUrl}`);
const droid = await connectToDaemon({
  url: daemonUrl,
  auth: { apiKey },
});

try {
  const sessions = await droid.sessions.list({ limit: 10 });
  report('sessions found', sessions.length);

  if (sessions.length === 0) {
    report('status', 'No sessions found.');
  }

  const snapshots = await Promise.all(
    sessions.map(async (session) => ({
      session,
      messages: await droid.sessions.getMessages(session.id, { limit: 20 }),
    }))
  );

  for (const { session, messages } of snapshots) {
    report(session.id, {
      title: session.title ?? '(untitled)',
      messageCount: messages.length,
    });
  }
} finally {
  droid.disconnect();
}
