/**
 * Resume session example.
 *
 * Loads a saved session and sends a follow-up prompt with its existing
 * conversation, working directory, and settings.
 *
 * Usage:
 *   npx tsx examples/node/resume-session.ts session-id
 */

import { DroidMessageType, resumeSession } from '@factory/droid-sdk/node';

const sessionId = process.argv[2];
if (!sessionId) {
  throw new Error('Pass a session ID. Use listSessions() to find one.');
}

const session = await resumeSession(sessionId);

try {
  console.log(`cwd: ${String(session.cwd)}`);
  console.log(`model: ${session.settings.modelId}`);

  // Ask about the saved conversation so the answer shows its context carried
  // over. An open-ended "continue" leaves Droid nothing to do, so it may ask
  // the user what to do next. Without an askUserHandler the SDK cancels that
  // question, which ends the turn as interrupted.
  let assistantText = '';
  for await (const message of session.stream(
    'In one sentence, what did I ask you to do earlier in this conversation?'
  )) {
    if (message.type === DroidMessageType.Assistant) {
      assistantText += message.text;
      console.log(message.text);
    }
    if (message.type === DroidMessageType.Result && !message.success) {
      throw new Error(
        message.error?.message ?? `Turn ended: ${message.subtype}`
      );
    }
  }
  if (!assistantText) throw new Error('The turn produced no assistant text.');
} finally {
  await session.close();
}
