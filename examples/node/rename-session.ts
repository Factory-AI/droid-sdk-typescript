/**
 * Rename session example.
 *
 * Sessions get an auto-generated title from their first prompt.
 * `rename()` overrides it, which is what a host app calls when the user
 * edits a conversation title.
 *
 * Usage:
 *   npx tsx examples/node/rename-session.ts
 */

import { DroidMessageType, createSession } from '@factory/droid-sdk/node';

const session = await createSession();

try {
  // A session needs at least one turn before it has a title to replace.
  for await (const message of session.stream('Reply with exactly: OK')) {
    if (message.type === DroidMessageType.Result && !message.success) {
      throw new Error(
        message.error?.message ?? `Turn ended: ${message.subtype}`
      );
    }
  }

  await session.rename({
    title: 'Quarterly report analysis',
  });

  console.log(`renamed session: ${session.id}`);
} finally {
  await session.close();
}
