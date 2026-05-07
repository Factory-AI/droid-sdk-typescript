/**
 * Initialization metadata example.
 *
 * Usage:
 *   npx tsx examples/init-metadata.ts
 */

import { createSession, query, resumeSession } from '@factory/droid-sdk';

const stream = query({
  prompt: 'Reply with "ready" and nothing else.',
  cwd: process.cwd(),
});

const initialized = await stream.initialized;
console.log(`query session: ${initialized.sessionId}`);

for await (const _msg of stream) {
  // Consume the one-shot stream so the subprocess can clean up.
}

const session = await createSession({ cwd: process.cwd() });
const resumed = await resumeSession(session.sessionId, { cwd: process.cwd() });

console.log(`created model: ${String(session.initResult.settings.modelId)}`);
console.log(`resumed cwd: ${String(resumed.initResult.cwd)}`);

await resumed.close();
await session.close();
