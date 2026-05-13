import assert from 'node:assert/strict';

import { DroidMessageType, OutputFormatType } from '@factory/droid-sdk';
import type { DroidResult, MessageOptions } from '@factory/droid-sdk';
import { z } from 'zod';

import {
  assertAssistantOutput,
  assertDefaultStreamShape,
  collectStream,
  createStressSession,
  isDirectRun,
  runStress,
  runStressCase,
} from './_harness.js';

type OutputFormat = NonNullable<MessageOptions['outputFormat']>;
type JsonOutput = NonNullable<DroidResult['structuredOutput']>;

interface StructuredCase {
  name: string;
  prompt: string;
  outputFormat: OutputFormat;
  validate: (value: JsonOutput) => void;
}

const cases: StructuredCase[] = [
  {
    name: 'flat-object',
    prompt:
      'Return a JSON object with name "Ada", language "TypeScript", and score 7.',
    outputFormat: {
      type: OutputFormatType.JsonSchema,
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', enum: ['Ada'] },
          language: { type: 'string', enum: ['TypeScript'] },
          score: { type: 'number', minimum: 7, maximum: 7 },
        },
        required: ['name', 'language', 'score'],
        additionalProperties: false,
      },
    },
    validate: (value) =>
      z
        .object({
          name: z.literal('Ada'),
          language: z.literal('TypeScript'),
          score: z.literal(7),
        })
        .parse(value),
  },
  {
    name: 'nested-array-enum',
    prompt:
      'Return a JSON object with summary.status "ok" and two checks named stream and result, both passed true.',
    outputFormat: {
      type: OutputFormatType.JsonSchema,
      schema: {
        type: 'object',
        properties: {
          summary: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok'] },
            },
            required: ['status'],
            additionalProperties: false,
          },
          checks: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', enum: ['stream', 'result'] },
                passed: { type: 'boolean', enum: [true] },
              },
              required: ['name', 'passed'],
              additionalProperties: false,
            },
          },
        },
        required: ['summary', 'checks'],
        additionalProperties: false,
      },
    },
    validate: (value) =>
      z
        .object({
          summary: z.object({ status: z.literal('ok') }),
          checks: z
            .array(
              z.object({
                name: z.enum(['stream', 'result']),
                passed: z.literal(true),
              })
            )
            .length(2),
        })
        .parse(value),
  },
  {
    name: 'optional-pattern-bounds',
    prompt:
      'Return a JSON object with code "stress-123", count 3, tags ["sdk"], and omit notes.',
    outputFormat: {
      type: OutputFormatType.JsonSchema,
      schema: {
        type: 'object',
        properties: {
          code: { type: 'string', pattern: '^stress-[0-9]{3}$' },
          count: { type: 'number', minimum: 1, maximum: 3 },
          tags: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', enum: ['sdk'] },
          },
          notes: { type: 'string' },
        },
        required: ['code', 'count', 'tags'],
        additionalProperties: false,
      },
    },
    validate: (value) =>
      z
        .object({
          code: z.string().regex(/^stress-[0-9]{3}$/),
          count: z.number().min(1).max(3),
          tags: z.array(z.literal('sdk')).min(1),
          notes: z.string().optional(),
        })
        .parse(value),
  },
];

export async function main(): Promise<void> {
  await runStressCase('structured output run()', async () => {
    for (const stressCase of cases) {
      const result = await runStress(stressCase.prompt, {
        outputFormat: stressCase.outputFormat,
      });
      assertStructuredSuccess(result, stressCase);
    }
  });

  await runStressCase('structured output streaming', async () => {
    const session = await createStressSession();
    try {
      for (const stressCase of cases) {
        const collected = await collectStream(
          `structured-output-${stressCase.name}`,
          session,
          stressCase.prompt,
          { outputFormat: stressCase.outputFormat }
        );
        assertDefaultStreamShape(collected);
        assertAssistantOutput(collected);
        assertStructuredSuccess(collected.result, stressCase);
      }
    } finally {
      await session.close();
    }
  });

  await runStressCase('structured output invalid schema', async () => {
    const result = await runStress(
      'Return any object. This schema intentionally cannot be satisfied.',
      {
        outputFormat: {
          type: OutputFormatType.JsonSchema,
          schema: {
            type: 'object',
            properties: {
              impossible: { type: 'string', enum: [] },
            },
            required: ['impossible'],
            additionalProperties: false,
          },
        },
      }
    );

    assert.equal(
      result.isError,
      true,
      'expected invalid structured output to mark result as an error'
    );
    assert.equal(result.structuredOutput ?? null, null);
    assert.ok(
      result.structuredOutputError,
      'expected invalid structured output error details'
    );
  });
}

function assertStructuredSuccess(
  result: DroidResult,
  stressCase: StructuredCase
): void {
  assert.equal(result.type, DroidMessageType.Result);
  assert.equal(result.isError, false, `${stressCase.name}: unexpected error`);
  assert.equal(result.structuredOutputError ?? null, null);
  assert.ok(result.structuredOutput, `${stressCase.name}: missing output`);
  stressCase.validate(result.structuredOutput as JsonOutput);
}

if (isDirectRun(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
