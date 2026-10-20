/**
 * Rename session example.
 *
 * Sessions get an auto-generated title from their first prompt.
 * `rename()` overrides it, which is what a host app calls when the user
 * edits a conversation title. The example then reads the saved title back
 * with `listSessions()`.
 *
 * Usage:
 *   npx tsx examples/node/rename-session.ts
 */

import {
  DroidMessageType,
  createSession,
  listSessions,
} from '@factory/droid-sdk/node';

const title = 'Quarterly report analysis';
const session = await createSession();
const { id, cwd } = session;

try {
  // A session needs at least one turn before it has a title to replace.
  for await (const message of session.stream('Reply with exactly: OK')) {
    if (message.type === DroidMessageType.Result && !message.success) {
      throw new Error(
        message.error?.message ?? `Turn ended: ${message.subtype}`
      );
    }
  }

  await session.rename({ title });
} finally {
  await session.close();
}

// listSessions() reads the session files on disk, so it shows the saved title.
const saved = (await listSessions({ cwd })).find((s) => s.id === id);
if (saved?.title !== title) {
  throw new Error(`Expected title "${title}", got "${String(saved?.title)}".`);
}

console.log(`renamed session: ${id}`);
console.log(`saved title:     ${saved.title}`);
