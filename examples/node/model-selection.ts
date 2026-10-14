/**
 * Model selection example.
 *
 * Runs one turn with a configured model ID.
 *
 * Usage:
 *   FACTORY_API_KEY=... npx tsx examples/node/model-selection.ts model-id
 */

import { createSession, DroidMessageType } from '@factory/droid-sdk/node';

const modelId = process.argv[2];
if (!modelId) {
  throw new Error('Pass a configured model ID.');
}

const session = await createSession({
  cwd: process.cwd(),
  modelId,
});

try {
  for await (const message of session.stream('Summarize this repository.')) {
    if (message.type === DroidMessageType.Assistant) {
      console.log(message.text);
    }
    if (message.type === DroidMessageType.Result && !message.success) {
      throw new Error(
        message.error?.message ?? `Turn ended: ${message.subtype}`
      );
    }
  }
} finally {
  await session.close();
}
