import assert from 'node:assert/strict';

import { DroidMessageType, OutputFormatType } from '@factory/droid-sdk';

import {
  assertAssistantOutput,
  assertDefaultStreamShape,
  assertPartialStreamShape,
  assertPartialTextConsistency,
  collectPartialStream,
  collectStream,
  createStressSession,
  isDirectRun,
  runStressCase,
} from './_harness.js';

export async function main(): Promise<void> {
  await runStressCase('multi-turn aggregation', async () => {
    const session = await createStressSession();
    let previousNumTurns = 0;
    let previousTurnCount = 0;

    try {
      const first = await collectStream(
        'multi-turn-1',
        session,
        'Remember this phrase for the next turn: multi turn stress anchor.'
      );
      assertDefaultStreamShape(first);
      assertAssistantOutput(first);
      ({ previousNumTurns, previousTurnCount } = assertMonotonicTurns(
        first.result,
        previousNumTurns,
        previousTurnCount
      ));

      const structured = await collectStream(
        'multi-turn-2-structured',
        session,
        'Return a structured object with anchor "multi turn stress anchor" and turn 2.',
        {
          outputFormat: {
            type: OutputFormatType.JsonSchema,
            schema: {
              type: 'object',
              properties: {
                anchor: {
                  type: 'string',
                  enum: ['multi turn stress anchor'],
                },
                turn: { type: 'number', enum: [2] },
              },
              required: ['anchor', 'turn'],
              additionalProperties: false,
            },
          },
        }
      );
      assertDefaultStreamShape(structured);
      assert.equal(structured.result.isError, false);
      assert.ok(structured.result.structuredOutput);
      ({ previousNumTurns, previousTurnCount } = assertMonotonicTurns(
        structured.result,
        previousNumTurns,
        previousTurnCount
      ));

      const third = await collectPartialStream(
        'multi-turn-3-partial',
        session,
        'In one sentence, state the remembered anchor phrase.'
      );
      assertPartialStreamShape(third);
      assertAssistantOutput(third);
      assertPartialTextConsistency(third);
      assert.equal(
        third.result.structuredOutput ?? null,
        null,
        'structured output leaked into later turn'
      );
      assert.equal(
        third.result.structuredOutputError ?? null,
        null,
        'structured output error leaked into later turn'
      );
      ({ previousNumTurns, previousTurnCount } = assertMonotonicTurns(
        third.result,
        previousNumTurns,
        previousTurnCount
      ));

      for (const index of [4, 5]) {
        const collected = await collectStream(
          `multi-turn-${index}`,
          session,
          `Reply with exactly: multi turn stress turn ${index}`
        );
        assertDefaultStreamShape(collected);
        assertAssistantOutput(collected);
        assert.equal(collected.result.type, DroidMessageType.Result);
        ({ previousNumTurns, previousTurnCount } = assertMonotonicTurns(
          collected.result,
          previousNumTurns,
          previousTurnCount
        ));
      }
    } finally {
      await session.close();
    }
  });
}

function assertMonotonicTurns(
  result: { numTurns: number; turnCount: number },
  previousNumTurns: number,
  previousTurnCount: number
): { previousNumTurns: number; previousTurnCount: number } {
  assert.ok(
    result.numTurns >= previousNumTurns,
    `numTurns regressed from ${previousNumTurns} to ${result.numTurns}`
  );
  assert.ok(
    result.turnCount >= previousTurnCount,
    `turnCount regressed from ${previousTurnCount} to ${result.turnCount}`
  );
  return {
    previousNumTurns: result.numTurns,
    previousTurnCount: result.turnCount,
  };
}

if (isDirectRun(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
