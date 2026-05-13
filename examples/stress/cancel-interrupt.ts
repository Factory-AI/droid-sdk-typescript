import assert from 'node:assert/strict';

import { DroidMessageType } from '@factory/droid-sdk';
import type { DroidStreamEvent } from '@factory/droid-sdk';

import {
  assertAssistantOutput,
  assertDefaultStreamShape,
  assertPartialStreamShape,
  collectStream,
  createStressSession,
  isDirectRun,
  lastResult,
  runStressCase,
  writeJsonlArtifact,
} from './_harness.js';

export async function main(): Promise<void> {
  await runStressCase('abort controller lifecycle', async () => {
    const session = await createStressSession();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error('stress abort requested')),
      750
    );

    try {
      await assert.rejects(async () => {
        for await (const event of session.stream(
          'Write a long, detailed essay about compiler construction.',
          { abortSignal: controller.signal, includePartialMessages: true }
        )) {
          void event;
        }
      }, /stress abort requested|Operation aborted/);

      const recovered = await collectStream(
        'abort-controller-recovered',
        session,
        'Reply with exactly: abort recovery complete'
      );
      assertDefaultStreamShape(recovered);
      assertAssistantOutput(recovered);
    } finally {
      clearTimeout(timeout);
      await session.close();
    }
  });

  await runStressCase('session interrupt completion', async () => {
    const session = await createStressSession();
    const events: DroidStreamEvent[] = [];
    let interrupted = false;

    try {
      for await (const event of session.stream(
        'Write a long numbered list about operating systems.',
        { includePartialMessages: true }
      )) {
        events.push(event);
        if (
          !interrupted &&
          event.type !== DroidMessageType.Result &&
          events.length >= 2
        ) {
          interrupted = true;
          await session.interrupt();
        }
      }

      await writeJsonlArtifact('session-interrupt', events);
      const result = lastResult(events);
      assert.ok(interrupted, 'expected to send an interrupt');
      assert.equal(result.type, DroidMessageType.Result);
      assertPartialStreamShape({
        name: 'session-interrupt',
        events,
        counts: {},
        result,
      });
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
