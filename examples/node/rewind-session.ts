/**
 * Rewind session example.
 *
 * Runs a turn, inspects the files available at that point, then rewinds into a
 * replacement session handle and continues from there.
 *
 * Usage:
 *   npx tsx examples/node/rewind-session.ts
 */

import { DroidMessageType, createSession } from '@factory/droid-sdk/node';

const session = await createSession();

async function ask(
  activeSession: Awaited<ReturnType<typeof createSession>>,
  prompt: string
): Promise<{ messageId: string; text: string }> {
  let messageId: string | undefined;
  let text = '';

  for await (const message of activeSession.stream(prompt)) {
    if (
      message.type === DroidMessageType.User &&
      message.message.visibility !== 'llm_only'
    ) {
      messageId ??= message.message.id;
    }
    if (message.type === DroidMessageType.Assistant) {
      text += message.text;
      console.log(message.text);
    }
    if (message.type === DroidMessageType.Result && !message.success) {
      throw new Error(
        message.error?.message ?? `Turn ended: ${message.subtype}`
      );
    }
  }

  if (!messageId) throw new Error('The turn produced no user message ID.');
  if (!text.trim()) throw new Error('The turn produced no assistant output.');
  return { messageId, text };
}

try {
  await ask(session, 'Remember this phrase exactly: mango sunrise');
  const { messageId: secondTurn } = await ask(
    session,
    'Now forget it and remember: cobalt harbor'
  );

  const { availableFiles, createdFiles } = await session.getRewindInfo({
    messageId: secondTurn,
  });
  console.log(
    `rewind would restore ${availableFiles.length} file(s) ` +
      `and delete ${createdFiles.length}`
  );

  const { session: successor } = await session.rewind({
    messageId: secondTurn,
    filesToRestore: availableFiles,
    filesToDelete: createdFiles,
    forkTitle: 'Before the second phrase',
  });

  try {
    // `session` is now a retired wrapper. Its persisted ID can still be passed
    // to resumeSession() later if the pre-rewind history is needed again.
    console.log(`rewound into session: ${successor.id}`);

    await ask(successor, 'What phrase did I ask you to remember?');
  } finally {
    await successor.close();
  }
} finally {
  // Closes the active source, or does nothing if it was retired.
  await session.close();
}
