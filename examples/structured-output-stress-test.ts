/**
 * Structured output stress test.
 *
 * Runs several structured-output schemas against one or more Droid models and
 * verifies both `run(...)` results and streaming `TurnComplete` metadata.
 *
 * Usage:
 *   npx tsx examples/structured-output-stress-test.ts
 *   DROID_EXEC_PATH=droid-dev npx tsx examples/structured-output-stress-test.ts
 *   DROID_STRUCTURED_OUTPUT_MODELS="claude-sonnet-4-5,gpt-5.2" npx tsx examples/structured-output-stress-test.ts
 */

import assert from 'node:assert/strict';

import {
  DroidMessageType,
  OutputFormatType,
  createSession,
  run,
} from '@factory/droid-sdk';
import type {
  DroidMessage,
  DroidResult,
  MessageOptions,
} from '@factory/droid-sdk';
import { z } from 'zod';

type OutputFormat = NonNullable<MessageOptions['outputFormat']>;
type JsonObject = NonNullable<DroidResult['structuredOutput']>;

interface StressCase {
  name: string;
  prompt: string;
  outputFormat: OutputFormat;
  parse: (value: JsonObject) => unknown;
}

const PersonSchema = z.object({
  name: z.literal('Ada Lovelace'),
  language: z.literal('TypeScript'),
  score: z.literal(99),
});

const PlanSchema = z.object({
  title: z.literal('Structured Output SDK Test'),
  priority: z.enum(['low', 'medium', 'high']),
  tasks: z.array(
    z.object({
      id: z.string(),
      done: z.boolean(),
    })
  ),
});

const MetricsSchema = z.object({
  summary: z.object({
    passed: z.literal(3),
    failed: z.literal(0),
  }),
  checks: z.array(
    z.object({
      name: z.enum(['schema', 'stream', 'fallback']),
      ok: z.literal(true),
    })
  ),
});

const stressCases: StressCase[] = [
  {
    name: 'flat-literals',
    prompt: [
      'Return a structured object for Ada Lovelace.',
      'Use exactly name "Ada Lovelace", language "TypeScript", and score 99.',
    ].join(' '),
    outputFormat: {
      type: OutputFormatType.JsonSchema,
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          language: { type: 'string', enum: ['TypeScript'] },
          score: { type: 'number', enum: [99] },
        },
        required: ['name', 'language', 'score'],
        additionalProperties: false,
      },
    },
    parse: (value) => PersonSchema.parse(value),
  },
  {
    name: 'nested-array-enum',
    prompt: [
      'Return a project plan object.',
      'Use title "Structured Output SDK Test", priority "high",',
      'and exactly two tasks with ids "schema" and "stream".',
      'Set both task done values to true.',
    ].join(' '),
    outputFormat: {
      type: OutputFormatType.JsonSchema,
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string', enum: ['Structured Output SDK Test'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          tasks: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', enum: ['schema', 'stream'] },
                done: { type: 'boolean', enum: [true] },
              },
              required: ['id', 'done'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'priority', 'tasks'],
        additionalProperties: false,
      },
    },
    parse: (value) => PlanSchema.parse(value),
  },
  {
    name: 'nested-metrics',
    prompt: [
      'Return validation metrics.',
      'The summary must have passed 3 and failed 0.',
      'The checks array must contain schema, stream, and fallback, each with ok true.',
    ].join(' '),
    outputFormat: {
      type: OutputFormatType.JsonSchema,
      schema: {
        type: 'object',
        properties: {
          summary: {
            type: 'object',
            properties: {
              passed: { type: 'number', enum: [3] },
              failed: { type: 'number', enum: [0] },
            },
            required: ['passed', 'failed'],
            additionalProperties: false,
          },
          checks: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  enum: ['schema', 'stream', 'fallback'],
                },
                ok: { type: 'boolean', enum: [true] },
              },
              required: ['name', 'ok'],
              additionalProperties: false,
            },
          },
        },
        required: ['summary', 'checks'],
        additionalProperties: false,
      },
    },
    parse: (value) => MetricsSchema.parse(value),
  },
];

function parseModels(): Array<string | undefined> {
  const raw = process.env['DROID_STRUCTURED_OUTPUT_MODELS'];
  if (!raw) return [undefined];
  return raw
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

function labelModel(modelId: string | undefined): string {
  return modelId ?? 'default session model';
}

function assertStructuredResult(
  result: DroidResult,
  stressCase: StressCase
): void {
  const diagnostic = JSON.stringify(
    {
      text: result.text,
      error: result.error,
      structuredOutputError: result.structuredOutputError,
      messages: result.messages
        .filter(
          (message) =>
            message.type === DroidMessageType.CreateMessage ||
            message.type === DroidMessageType.Error ||
            message.type === DroidMessageType.StructuredOutput ||
            message.type === DroidMessageType.TurnComplete
        )
        .map((message) => {
          if (message.type !== DroidMessageType.CreateMessage) return message;
          return {
            type: message.type,
            role: message.role,
            content: message.content,
          };
        }),
    },
    null,
    2
  );

  assert.equal(
    result.structuredOutputError,
    null,
    `${stressCase.name}: expected no structured output error\n${diagnostic}`
  );
  assert.ok(
    result.structuredOutput,
    `${stressCase.name}: expected structuredOutput\n${diagnostic}`
  );
  stressCase.parse(result.structuredOutput);
}

function findMessage<T extends DroidMessage['type']>(
  messages: DroidMessage[],
  type: T
): Extract<DroidMessage, { type: T }> | undefined {
  return messages.find(
    (message): message is Extract<DroidMessage, { type: T }> =>
      message.type === type
  );
}

async function runCase(
  modelId: string | undefined,
  stressCase: StressCase
): Promise<void> {
  const result = await run(stressCase.prompt, {
    execPath: process.env['DROID_EXEC_PATH'] ?? 'droid',
    cwd: process.cwd(),
    ...(modelId !== undefined && { modelId }),
    outputFormat: stressCase.outputFormat,
  });

  assertStructuredResult(result, stressCase);

  const notification = findMessage(
    result.messages,
    DroidMessageType.StructuredOutput
  );
  assert.ok(notification, `${stressCase.name}: expected structured_output`);

  console.log(
    `  ✓ ${stressCase.name}: ${JSON.stringify(result.structuredOutput)}`
  );
}

async function runStreamingCase(modelId: string | undefined): Promise<void> {
  const stressCase = stressCases[0];
  const session = await createSession({
    execPath: process.env['DROID_EXEC_PATH'] ?? 'droid',
    cwd: process.cwd(),
    ...(modelId !== undefined && { modelId }),
  });

  try {
    const messages: DroidMessage[] = [];
    for await (const message of (
      await session.send(stressCase.prompt, {
        outputFormat: stressCase.outputFormat,
      })
    ).stream()) {
      messages.push(message);
    }

    const structured = findMessage(messages, DroidMessageType.StructuredOutput);
    const complete = findMessage(messages, DroidMessageType.TurnComplete);

    assert.ok(structured, 'streaming: expected structured_output message');
    assert.ok(complete, 'streaming: expected turn_complete message');
    assert.deepEqual(
      complete.structuredOutput,
      structured.structuredOutput,
      'streaming: TurnComplete should carry structured output'
    );
    assert.equal(complete.structuredOutputError, null);
    assert.ok(complete.structuredOutput);
    stressCase.parse(complete.structuredOutput);

    console.log('  ✓ streaming TurnComplete carries structured output');
  } finally {
    await session.close();
  }
}

for (const modelId of parseModels()) {
  console.log(`\n=== Testing ${labelModel(modelId)} ===`);
  for (const stressCase of stressCases) {
    await runCase(modelId, stressCase);
  }
  await runStreamingCase(modelId);
}

console.log('\nStructured output stress test passed');
