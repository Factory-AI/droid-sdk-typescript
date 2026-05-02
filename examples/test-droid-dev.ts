/**
 * SDK smoke test against droid-dev.
 *
 * Usage:
 *   npx tsx examples/test-droid-dev.ts
 *   npx tsx examples/test-droid-dev.ts /path/to/droid-dev
 */

import { createSession, ToolConfirmationOutcome } from '../src/index.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const execPath =
    process.argv[2] ?? process.env.DROID_EXEC_PATH ?? 'droid-dev';
  const cwd = process.cwd();

  console.log(`Using exec: ${execPath}`);
  console.log(`Using cwd: ${cwd}`);

  const session = await createSession({
    execPath,
    cwd,
    permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
  });

  try {
    console.log(`Session created: ${session.sessionId}`);

    const initialStats = await session.getContextStats();
    console.log('Initial context stats:', initialStats);

    let streamedText = '';
    let turnCompleteSeen = false;

    console.log('\n=== Streaming turn ===');
    for await (const msg of session.stream('Reply with exactly: stream ok')) {
      switch (msg.type) {
        case 'assistant_text_delta':
          streamedText += msg.text;
          process.stdout.write(msg.text);
          break;
        case 'turn_complete':
          turnCompleteSeen = true;
          console.log('\n--- streaming turn complete ---');
          break;
      }
    }

    assert(turnCompleteSeen, 'Streaming turn did not complete');
    assert(streamedText.trim().length > 0, 'Streaming turn returned no text');

    console.log('\n=== Non-streaming turn ===');
    const sendResult = await session.send('Reply with exactly: send ok');
    console.log(sendResult.text);

    assert(sendResult.text.trim().length > 0, 'send() returned no text');
    assert(sendResult.messages.length > 0, 'send() returned no messages');

    const renamedTitle = `SDK smoke test ${new Date().toISOString()}`;
    await session.renameSession({
      title: renamedTitle,
    });
    console.log(`Rename requested: ${renamedTitle}`);

    const finalStats = await session.getContextStats();
    console.log('Final context stats:', finalStats);

    assert(finalStats.limit >= finalStats.used, 'Invalid final context stats');
    console.log('\nSDK smoke test passed.');
  } finally {
    await session.close();
  }
}

main().catch((error: unknown) => {
  console.error('SDK smoke test failed:', error);
  process.exit(1);
});
