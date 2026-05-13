import assert from 'node:assert/strict';

import { DroidMessageType } from '@factory/droid-sdk';

import {
  assertAssistantOutput,
  assertPartialStreamShape,
  assertPartialTextConsistency,
  collectPartialStream,
  createStressSession,
  isDirectRun,
  runStressCase,
} from './_harness.js';

export async function main(): Promise<void> {
  await runStressCase('partial streaming text', async () => {
    const session = await createStressSession();
    try {
      const collected = await collectPartialStream(
        'partial-streaming-text',
        session,
        [
          'Reply in exactly two short sentences.',
          'The first sentence must include "partial streaming stress".',
          'The second sentence must include "delta reconstruction".',
        ].join(' ')
      );

      assertPartialStreamShape(collected);
      assertAssistantOutput(collected);
      assert.ok(
        (collected.counts[DroidMessageType.AssistantTextDelta] ?? 0) > 0,
        'expected partial stream to include assistant_text_delta events'
      );
      assertPartialTextConsistency(collected);
    } finally {
      await session.close();
    }
  });
}

if (isDirectRun(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
