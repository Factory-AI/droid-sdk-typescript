/**
 * List saved sessions example.
 *
 * Reads the droid sessions stored on disk for the current project.
 *
 * Usage:
 *   npx tsx examples/node/list-sessions.ts
 */

import { listSessions } from '@factory/droid-sdk/node';

const sessions = await listSessions({ limit: 5 });

if (sessions.length === 0) {
  console.log('No sessions found for this project.');
}

for (const session of sessions) {
  console.log(`${session.id}: ${session.title || '(untitled)'}`);
}
