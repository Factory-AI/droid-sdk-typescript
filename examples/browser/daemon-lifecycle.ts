/**
 * Forks, compacts, and rewinds a daemon session.
 *
 * Daemon operations return a new session ID. The source session stays usable,
 * and the successor must be resumed explicitly.
 *
 * Bundle this file with `platform: 'browser'`, serve it with index.html, and
 * click "Run lifecycle operations".
 */

import {
  connectToDaemon,
  DroidMessageType,
  type ConnectedDroidSession,
} from '@factory/droid-sdk';

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

async function send(
  session: ConnectedDroidSession,
  prompt: string
): Promise<string> {
  let messageId: string | undefined;

  for await (const message of session.stream(prompt)) {
    if (
      message.type === DroidMessageType.User &&
      message.message.visibility !== 'llm_only'
    ) {
      messageId ??= message.message.id;
    }
    if (message.type === DroidMessageType.Assistant) {
      report('assistant', message.text);
    }
  }

  if (!messageId) throw new Error('The turn produced no user message ID.');
  return messageId;
}

const sessions: ConnectedDroidSession[] = [];

try {
  const source = await droid.sessions.create({ cwd });
  sessions.push(source);
  report('source session', source.id);

  await send(source, 'Remember this phrase exactly: mango sunrise');
  const secondTurn = await send(
    source,
    'Now forget it and remember: cobalt harbor'
  );

  const { newSessionId: forkedId } = await source.fork();
  const forked = await droid.sessions.resume(forkedId);
  sessions.push(forked);
  report('forked session', forked.id);

  const { newSessionId: compactedId } = await source.compact();
  const compacted = await droid.sessions.resume(compactedId);
  sessions.push(compacted);
  report('compacted session', compacted.id);

  const { newSessionId: rewoundId } = await source.rewind({
    messageId: secondTurn,
    filesToRestore: [],
    filesToDelete: [],
    forkTitle: 'Before the second phrase',
  });
  const rewound = await droid.sessions.resume(rewoundId);
  sessions.push(rewound);
  report('rewound session', rewound.id);

  await send(source, 'Say "source still works" and nothing else.');
  report('status', 'Lifecycle operations completed.');
} finally {
  await Promise.allSettled(sessions.map((session) => session.close()));
  droid.disconnect();
}
