/**
 * Initialization metadata example.
 *
 * Demonstrates:
 * - `query().sessionId`, `query().initResult`, and `query().initialized`
 * - `session.initResult` from `createSession()`
 * - `resumed.initResult` from `resumeSession()`
 *
 * Usage:
 *   npx tsx examples/init-metadata.ts
 */

import {
  createSession,
  DroidMessageType,
  query,
  resumeSession,
} from '@factory/droid-sdk';

async function main(): Promise<void> {
  const stream = query({
    prompt: 'Reply with "ready" and nothing else.',
    cwd: process.cwd(),
  });

  console.log('=== query() metadata ===');
  console.log(`Before initialization: sessionId=${String(stream.sessionId)}`);
  console.log(`Before initialization: initResult=${String(stream.initResult)}`);

  const initialized = await stream.initialized;
  console.log(`After initialization: sessionId=${initialized.sessionId}`);
  console.log(`Model: ${String(initialized.settings.modelId)}`);
  console.log(
    `Cached initResult matches initialized: ${String(stream.initResult === initialized)}`
  );

  let text = '';
  for await (const msg of stream) {
    if (msg.type === DroidMessageType.AssistantTextDelta) {
      text += msg.text;
    }
  }
  console.log(`Response: ${JSON.stringify(text.trim())}\n`);

  console.log('=== createSession() / resumeSession() metadata ===');
  const session = await createSession({ cwd: process.cwd() });
  let resumed: Awaited<ReturnType<typeof resumeSession>> | null = null;

  try {
    console.log(`Created session: ${session.sessionId}`);
    console.log(
      `createSession().initResult.settings.modelId=${String(session.initResult.settings.modelId)}`
    );

    resumed = await resumeSession(session.sessionId, {
      cwd: process.cwd(),
    });

    console.log(`Resumed session: ${resumed.sessionId}`);
    console.log(
      `resumeSession().initResult.cwd=${String(resumed.initResult.cwd)}`
    );
    console.log(
      `resumeSession().initResult.availableModels=${String(resumed.initResult.availableModels?.length ?? 0)}`
    );
  } finally {
    await resumed?.close();
    await session.close();
    console.log('\nSessions closed.');
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
