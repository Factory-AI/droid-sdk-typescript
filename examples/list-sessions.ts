/**
 * List saved sessions example.
 *
 * Demonstrates `listSessions()` to fetch recent sessions for the
 * current project.
 *
 * Usage:
 *   npx tsx examples/list-sessions.ts
 *
 * Requirements: droid CLI installed and logged in. FACTORY_API_KEY is
 * optional; stored CLI credentials are used when it is unset.
 */

import { listSessions } from '@factory/droid-sdk';

const sessions = await listSessions({ numSessions: 5 });

for (const session of sessions) {
  const title = session.sessionTitle ?? session.title ?? '(untitled)';
  console.log(`${session.id}: ${title}`);
}

if (sessions.length === 0) {
  console.log('No sessions found for this project.');
}
