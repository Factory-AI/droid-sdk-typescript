/**
 * Query init metadata example.
 *
 * Demonstrates the `query().initResult` and `query().initialized` APIs.
 *
 * Usage:
 *   npx tsx examples/test-query-init-result.ts
 *
 * Set DROID_EXEC_PATH to point to your local droid-dev binary:
 *   DROID_EXEC_PATH=/path/to/droid-dev npx tsx examples/test-query-init-result.ts
 */

import { query } from '../src/index.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const execPath = process.env.DROID_EXEC_PATH;

  const stream = query({
    prompt: 'Say "hello" and nothing else.',
    cwd: process.cwd(),
    ...(execPath ? { execPath } : {}),
  });

  console.log('Before initialization:');
  console.log(`  sessionId=${String(stream.sessionId)}`);
  console.log(`  initResult=${String(stream.initResult)}`);

  const initialized = await stream.initialized;

  console.log('\nAfter initialization:');
  console.log(`  sessionId=${stream.sessionId}`);
  console.log(`  initResult.sessionId=${initialized.sessionId}`);
  console.log(`  modelId=${initialized.settings.modelId}`);
  if (initialized.gitRepo) {
    console.log(`  gitRepo=${initialized.gitRepo.repoName}`);
  }
  if (initialized.availableModels?.length) {
    const model =
      initialized.availableModels[0]?.modelId ??
      initialized.availableModels[0]?.id;
    console.log(`  firstAvailableModel=${String(model)}`);
  }

  assert(
    stream.initResult === initialized,
    'Expected initResult to be cached.'
  );
  assert(
    stream.sessionId === initialized.sessionId,
    'Expected sessionId to match initialized.sessionId.'
  );

  let text = '';
  for await (const msg of stream) {
    if (msg.type === 'assistant_text_delta') {
      text += msg.text;
    }
  }

  console.log(`\nResponse: ${JSON.stringify(text.trim())}`);
  assert(text.trim().length > 0, 'Expected query() to return some text.');

  console.log('\nquery() init metadata example passed.');
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
