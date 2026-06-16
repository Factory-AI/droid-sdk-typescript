/**
 * Initialization metadata example.
 *
 * Demonstrates reading `session.initResult` metadata (model, cwd) from
 * created and resumed sessions.
 *
 * Usage:
 *   npx tsx examples/init-metadata.ts
 *
 * Requirements: droid CLI installed and logged in. FACTORY_API_KEY is
 * optional; stored CLI credentials are used when it is unset.
 */

import { createSession, resumeSession } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});
const resumed = await resumeSession(session.sessionId, {
  apiKey: process.env.FACTORY_API_KEY!,
});

try {
  console.log(`created session: ${session.sessionId}`);
  console.log(`resumed session: ${resumed.sessionId}`);
  console.log(`created model: ${String(session.initResult.settings.modelId)}`);
  console.log(`resumed cwd: ${String(resumed.initResult.cwd)}`);
} finally {
  await resumed.close();
  await session.close();
}
