/**
 * Initialization metadata example.
 *
 * Reads direct metadata from a freshly created session: session ID, working
 * directory, model, and settings.
 *
 * Usage:
 *   npx tsx examples/node/init-metadata.ts
 */

import { createSession } from '@factory/droid-sdk/node';

const session = await createSession();

try {
  const { settings } = session;
  console.log(`session:          ${session.id}`);
  console.log(`cwd:              ${String(session.cwd)}`);
  console.log(`model:            ${String(settings.modelId)}`);
  console.log(`interaction mode: ${String(settings.interactionMode)}`);
  console.log(`autonomy level:   ${String(settings.autonomyLevel)}`);

  // Droid fills these in when the session starts, before any prompt.
  if (!settings.modelId || !settings.interactionMode) {
    throw new Error('The session started without a model or a mode.');
  }
} finally {
  await session.close();
}
