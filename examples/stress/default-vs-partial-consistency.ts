import assert from 'node:assert/strict';

import { DroidMessageType } from '@factory/droid-sdk';

import {
  PARTIAL_ONLY_TYPES,
  assertAssistantOutput,
  assertDefaultStreamShape,
  assertNoInternalMessages,
  assertPartialStreamShape,
  assertPartialTextConsistency,
  collectPartialStream,
  collectStream,
  createStressSession,
  isDirectRun,
  runStressCase,
} from './_harness.js';

export async function main(): Promise<void> {
  await runStressCase('default vs partial consistency', async () => {
    const prompt = [
      'Answer with a concise paragraph about stream aggregation.',
      'Include the phrase "stream consistency stress".',
    ].join(' ');

    const defaultSession = await createStressSession();
    const partialSession = await createStressSession();
    try {
      const defaultCollected = await collectStream(
        'default-vs-partial-default',
        defaultSession,
        prompt
      );
      const partialCollected = await collectPartialStream(
        'default-vs-partial-partial',
        partialSession,
        prompt
      );

      assertDefaultStreamShape(defaultCollected);
      assertPartialStreamShape(partialCollected);
      assertAssistantOutput(defaultCollected);
      assertAssistantOutput(partialCollected);
      assertPartialTextConsistency(partialCollected);
      assertNoInternalMessages(
        defaultCollected.result.messages,
        'default result'
      );
      assertNoInternalMessages(
        partialCollected.result.messages,
        'partial result'
      );

      assert.equal(defaultCollected.result.isError, false);
      assert.equal(partialCollected.result.isError, false);
      assert.ok(
        partialCollected.events.some((event) =>
          PARTIAL_ONLY_TYPES.has(event.type)
        ),
        'expected partial stream to include at least one partial-only event'
      );
      assert.equal(
        defaultCollected.counts[DroidMessageType.Result],
        1,
        'default stream must emit one result'
      );
      assert.equal(
        partialCollected.counts[DroidMessageType.Result],
        1,
        'partial stream must emit one result'
      );
      assert.ok(
        partialCollected.counts[DroidMessageType.Assistant] ?? 0,
        'partial stream should still include full assistant messages'
      );
    } finally {
      await Promise.all([defaultSession.close(), partialSession.close()]);
    }
  });
}

if (isDirectRun(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
