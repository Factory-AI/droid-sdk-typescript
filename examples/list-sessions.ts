/**
 * List sessions example.
 *
 * Demonstrates:
 * - creating a real Droid session
 * - scanning ~/.factory/sessions/ for saved droid sessions
 * - filtering by current working directory
 * - including sessions from other projects with a cap
 *
 * Usage:
 *   npx tsx examples/list-sessions.ts
 */

import { createSession, listSessions } from '@factory/droid-sdk';

function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

async function main(): Promise<void> {
  const session = await createSession({ cwd: process.cwd() });
  console.log(`Created Droid session: ${session.sessionId}\n`);
  await session.close();

  console.log(`=== Sessions for ${process.cwd()} ===\n`);

  // Default call: scopes to process.cwd().
  const currentProject = await listSessions({ numSessions: 10 });

  if (currentProject.length === 0) {
    console.log('(no sessions recorded for this directory yet)');
  } else {
    console.log(`10 most recent for this project:\n`);
    for (const session of currentProject) {
      const fav = session.isFavorite ? '*' : ' ';
      const title = session.sessionTitle ?? session.title ?? '(untitled)';
      console.log(
        `  ${fav} [${session.id.slice(0, 8)}] ${formatDate(session.modifiedTime)} ${session.messageCount} msgs — ${title}`
      );
    }
  }

  console.log('\n=== 5 most recent sessions across all projects ===\n');

  const allSessions = await listSessions({
    fetchOutsideCWD: true,
    numSessions: 5,
  });

  if (allSessions.length === 0) {
    console.log('(no sessions found)');
  } else {
    for (const session of allSessions) {
      const title = session.sessionTitle ?? session.title ?? '(untitled)';
      const cwd = session.cwd ?? '(no cwd)';
      console.log(
        `  [${session.id.slice(0, 8)}] ${formatDate(session.modifiedTime)} — ${title}`
      );
      console.log(`      cwd: ${cwd}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
