/**
 * Manual smoke test for cancelling `session.stream(..., { abortSignal })`.
 *
 * Starts a long-running streaming turn, aborts it after a short delay, then
 * verifies the stream rejects with the abort reason.
 *
 * Usage:
 *   npx tsx examples/abort-session-send.ts
 *   npx tsx examples/abort-session-send.ts 3000
 */

import { createSession } from '../src/index.js';

async function main(): Promise<void> {
  const abortAfterMs = Number(process.argv[2] ?? 2000);
  if (!Number.isFinite(abortAfterMs) || abortAfterMs <= 0) {
    throw new Error('Abort delay must be a positive number of milliseconds.');
  }

  const controller = new AbortController();
  const session = await createSession({ cwd: process.cwd() });
  let textDeltaCount = 0;
  let receivedText = '';

  const timeout = setTimeout(() => {
    controller.abort(new Error(`Aborted after ${abortAfterMs}ms`));
  }, abortAfterMs);

  try {
    console.log(`Session created: ${session.sessionId}`);
    console.log(`Aborting after ${abortAfterMs}ms\n`);

    const prompt =
      'Write a long, detailed explanation of how compilers work, including ' +
      'lexing, parsing, semantic analysis, optimization, and code generation.';

    for await (const message of session.stream(prompt, {
      abortSignal: controller.signal,
    })) {
      if (message.type === 'assistant_text_delta') {
        textDeltaCount++;
        receivedText += message.text;
        process.stdout.write(message.text);
      }
    }

    throw new Error('Expected stream to abort, but it completed normally.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Aborted after')) {
      console.log('\n\n=== Abort confirmed ===');
      console.log(`Received text deltas before abort: ${textDeltaCount}`);
      console.log(`Received characters before abort: ${receivedText.length}`);
      return;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    await session.close();
    console.log('Session closed.');
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
