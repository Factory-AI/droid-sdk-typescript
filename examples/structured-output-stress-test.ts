/**
 * Structured output stress test.
 *
 * Runs several structured-output schemas against one or more Droid models,
 * verifies both `run(...)` results and streaming result metadata, and
 * stress-tests tool use before structured output.
 *
 * Usage:
 *   npx tsx examples/structured-output-stress-test.ts
 *   DROID_EXEC_PATH=droid-dev npx tsx examples/structured-output-stress-test.ts
 *   DROID_STRUCTURED_OUTPUT_MODELS="claude-sonnet-4-5,gpt-5.2" npx tsx examples/structured-output-stress-test.ts
 */

import assert from 'node:assert/strict';

import {
  AutonomyLevel,
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

const PackageSchema = z.object({
  packageName: z.literal('@factory/droid-sdk'),
  tmpDir: z.string().startsWith('/tmp/droid-sdk-structured-output-stress-'),
  createdFile: z.string().endsWith('/notes.txt'),
  finalContent: z.string().includes('edited by structured output stress'),
  filesRead: z.array(z.enum(['package.json', 'notes.txt'])),
  toolsUsed: z.array(z.enum(['read', 'write', 'edit'])),
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
            message.type === DroidMessageType.Assistant ||
            message.type === DroidMessageType.Error ||
            message.type === DroidMessageType.Result
        )
        .map((message) => {
          if (message.type !== DroidMessageType.Assistant) return message;
          return {
            type: message.type,
            role: message.message.role,
            content: message.message.content,
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

function findNormalToolUse(
  messages: DroidMessage[]
): Extract<DroidMessage, { type: 'tool_call' }> | undefined {
  return messages.find(
    (message): message is Extract<DroidMessage, { type: 'tool_call' }> =>
      message.type === DroidMessageType.ToolCall &&
      message.toolUse.name !== 'StructuredOutput'
  );
}

function findToolUses(
  messages: DroidMessage[],
  matches: (toolName: string) => boolean
): Array<Extract<DroidMessage, { type: 'tool_call' }>> {
  return messages.filter(
    (message): message is Extract<DroidMessage, { type: 'tool_call' }> =>
      message.type === DroidMessageType.ToolCall &&
      matches(message.toolUse.name)
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
    for await (const message of session.stream(stressCase.prompt, {
      outputFormat: stressCase.outputFormat,
    })) {
      messages.push(message);
    }

    const result = findMessage(messages, DroidMessageType.Result);

    assert.ok(result, 'streaming: expected result message');
    assert.equal(result.structuredOutputError, null);
    assert.ok(result.structuredOutput);
    stressCase.parse(result.structuredOutput as JsonObject);

    console.log('  ✓ streaming emits structured output on result');
  } finally {
    await session.close();
  }
}

async function runToolUseCase(modelId: string | undefined): Promise<void> {
  const tmpDir = `/tmp/droid-sdk-structured-output-stress-${process.pid}-${Date.now()}`;
  const tmpFile = `${tmpDir}/notes.txt`;
  const outputFormat: OutputFormat = {
    type: OutputFormatType.JsonSchema,
    schema: {
      type: 'object',
      properties: {
        packageName: { type: 'string', enum: ['@factory/droid-sdk'] },
        tmpDir: { type: 'string', enum: [tmpDir] },
        createdFile: { type: 'string', enum: [tmpFile] },
        finalContent: {
          type: 'string',
          enum: [
            [
              'created by structured output stress',
              'edited by structured output stress',
            ].join('\n'),
          ],
        },
        filesRead: {
          type: 'array',
          minItems: 2,
          items: {
            type: 'string',
            enum: ['package.json', 'notes.txt'],
          },
        },
        toolsUsed: {
          type: 'array',
          minItems: 3,
          items: {
            type: 'string',
            enum: ['read', 'write', 'edit'],
          },
        },
      },
      required: [
        'packageName',
        'tmpDir',
        'createdFile',
        'finalContent',
        'filesRead',
        'toolsUsed',
      ],
      additionalProperties: false,
    },
  };
  const session = await createSession({
    execPath: process.env['DROID_EXEC_PATH'] ?? 'droid',
    autonomyLevel: AutonomyLevel.Medium,
    cwd: process.cwd(),
    ...(modelId !== undefined && { modelId }),
  });

  try {
    const messages: DroidMessage[] = [];
    for await (const message of session.stream(
      [
        'You must use multiple tools before producing structured output.',
        'Use the Read tool to read package.json in the current working directory.',
        `Create the directory ${tmpDir}.`,
        `Write ${tmpFile} with exactly this first line: created by structured output stress`,
        `Then use an edit tool to modify ${tmpFile} so its full content is exactly:`,
        'created by structured output stress',
        'edited by structured output stress',
        `Use the Read tool to read ${tmpFile} after editing it.`,
        'Only after all tool calls are done, return the structured object.',
        'Set packageName from package.json name.',
        `Set tmpDir to ${tmpDir} and createdFile to ${tmpFile}.`,
        'Set filesRead to include package.json and notes.txt.',
        'Set toolsUsed to include read, write, and edit.',
      ].join('\n'),
      { outputFormat }
    )) {
      messages.push(message);
    }

    const normalToolUse = findNormalToolUse(messages);
    const readToolUses = findToolUses(
      messages,
      (toolName) => toolName.toLowerCase() === 'read'
    );
    const writeToolUses = findToolUses(messages, (toolName) => {
      const normalized = toolName.toLowerCase();
      return (
        normalized.includes('write') ||
        normalized.includes('create') ||
        normalized.includes('execute')
      );
    });
    const editToolUses = findToolUses(messages, (toolName) => {
      const normalized = toolName.toLowerCase();
      return normalized.includes('edit') || normalized.includes('patch');
    });
    const result = findMessage(messages, DroidMessageType.Result);
    const diagnostic = JSON.stringify(
      messages
        .filter(
          (message) =>
            message.type === DroidMessageType.ToolCall ||
            message.type === DroidMessageType.ToolResult ||
            message.type === DroidMessageType.Result ||
            message.type === DroidMessageType.Error
        )
        .map((message) =>
          message.type === DroidMessageType.ToolCall
            ? {
                type: message.type,
                toolName: message.toolUse.name,
                toolInput: message.toolUse.input,
              }
            : message
        ),
      null,
      2
    );

    assert.ok(
      normalToolUse,
      `tool-use: expected a normal tool call before structured output\n${diagnostic}`
    );
    assert.ok(
      readToolUses.length >= 2,
      `tool-use: expected at least 2 Read tool calls, saw ${readToolUses.length}\n${diagnostic}`
    );
    assert.ok(
      writeToolUses.length >= 1,
      `tool-use: expected at least 1 write/create tool call\n${diagnostic}`
    );
    assert.ok(
      editToolUses.length >= 1,
      `tool-use: expected at least 1 edit tool call\n${diagnostic}`
    );
    assert.ok(result, 'tool-use: expected result message');
    assert.equal(
      result.structuredOutputError,
      null,
      `tool-use: expected no structured output error\n${diagnostic}`
    );
    assert.ok(result.structuredOutput);
    PackageSchema.parse(result.structuredOutput);

    console.log(
      `  ✓ read/write/edit before structured output: ${readToolUses.length}/${writeToolUses.length}/${editToolUses.length} tool calls`
    );
  } finally {
    await session.close();
  }
}

interface Failure {
  model: string;
  step: string;
  error: unknown;
}

const failures: Failure[] = [];

async function runStep(
  modelId: string | undefined,
  step: string,
  callback: () => Promise<void>
): Promise<void> {
  try {
    await callback();
  } catch (error) {
    failures.push({ model: labelModel(modelId), step, error });
    console.error(
      `  ✗ ${step}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

for (const modelId of parseModels()) {
  console.log(`\n=== Testing ${labelModel(modelId)} ===`);
  for (const stressCase of stressCases) {
    await runStep(modelId, stressCase.name, () => runCase(modelId, stressCase));
  }
  await runStep(modelId, 'streaming', () => runStreamingCase(modelId));
  await runStep(modelId, 'read/write/edit tool-use', () =>
    runToolUseCase(modelId)
  );
}

if (failures.length > 0) {
  console.error('\nStructured output stress test failures:');
  for (const failure of failures) {
    console.error(
      `- ${failure.model} / ${failure.step}: ${
        failure.error instanceof Error
          ? (failure.error.stack ?? failure.error.message)
          : String(failure.error)
      }`
    );
  }
  process.exitCode = 1;
} else {
  console.log('\nStructured output stress test passed');
}
