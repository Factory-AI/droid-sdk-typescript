/**
 * Initialization metadata example.
 *
 * Usage:
 *   npx tsx examples/init-metadata.ts
 */

import { createSession, resumeSession } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});
const resumed = await resumeSession(session.sessionId, {
  apiKey: process.env.FACTORY_API_KEY!,
});

console.log(`created session: ${session.sessionId}`);
console.log(`resumed session: ${resumed.sessionId}`);
console.log(`created model: ${String(session.initResult.settings.modelId)}`);
console.log(`resumed cwd: ${String(resumed.initResult.cwd)}`);

await resumed.close();
await session.close();
